import low from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import { join } from 'path';
import { app } from 'electron';

// Define data interfaces
export interface Account {
  id: number;
  name: string;
  type: string;
  category: string;
  balance: number;
  created_at: string;
}

export interface Category { id: number; name: string; parent_id?: number; }
export interface Payee { id: number; name: string; }
export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  amount: number;
  payee: string;
  category: string;
  memo?: string;
  created_at: string;
  type: 'income' | 'expense' | 'transfer';
  notes?: string;
  status: 'cleared' | 'uncleared' | 'reconciled';
}

export interface Transfer { id: number; from_transaction_id: number; to_transaction_id: number; }

export interface Budget {
  id: number;
  category: string;
  amount: number;
  month: string;
  notes?: string;
}

export interface ScheduledTransaction {
  id: number;
  account_id: number;
  payee: string;
  category: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  next_date: string;
  notes?: string;
}

interface DbSchema {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  scheduledTransactions: ScheduledTransaction[];
  lastIds: {
    account: number;
    transaction: number;
    budget: number;
    scheduledTransaction: number;
  };
}

const defaultData: DbSchema = {
  accounts: [],
  transactions: [],
  budgets: [],
  scheduledTransactions: [],
  lastIds: {
    account: 0,
    transaction: 0,
    budget: 0,
    scheduledTransaction: 0
  }
};

class Database {
  private db: any;
  private static instance: Database;
  private initialized: boolean = false;

  private constructor() {
    const dbPath = join(app.getPath('userData'), 'db.json');
    const adapter = new FileSync<DbSchema>(dbPath);
    this.db = low(adapter);
    this.db.defaults(defaultData).write();
    this.initialized = true;
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async initDB(): Promise<void> {
    if (!this.initialized) {
      this.db.defaults(defaultData).write();
      this.initialized = true;
    }
  }

  // Account operations
  async getAccounts(): Promise<Account[]> {
    return this.db.get('accounts').value() || [];
  }

  async createAccount(account: Omit<Account, 'id' | 'created_at'>): Promise<Account> {
    const newAccount: Account = {
      ...account,
      id: Date.now(),
      created_at: new Date().toISOString(),
    };
    await this.db.get('accounts').push(newAccount).write();
    return newAccount;
  }

  async updateAccount(account: Account): Promise<Account> {
    const accounts = this.db.get('accounts');
    const index = accounts.findIndex((a: Account) => a.id === account.id).value();
    if (index === -1) {
      throw new Error('Account not found');
    }
    await accounts.splice(index, 1, account).write();
    return account;
  }

  async deleteAccount(accountId: number): Promise<void> {
    await this.db.get('accounts')
      .remove((a: Account) => a.id === accountId)
      .write();
  }

  // Transaction operations
  async getTransactions(accountId?: number): Promise<Transaction[]> {
    const transactions = this.db.get('transactions').value() || [];
    return accountId
      ? transactions.filter((t: Transaction) => t.account_id === accountId)
      : transactions;
  }

  async createTransaction(transaction: Partial<Transaction>): Promise<Transaction> {
    if (!transaction.account_id || !transaction.date || !transaction.payee || 
        !transaction.category || !transaction.amount || !transaction.type) {
      throw new Error('Missing required transaction fields');
    }

    const newId = (this.db.get('lastIds.transaction').value() || 0) + 1;

    const newTransaction: Transaction = {
      id: newId,
      account_id: transaction.account_id,
      date: transaction.date,
      payee: transaction.payee,
      category: transaction.category,
      amount: transaction.amount,
      type: transaction.type,
      notes: transaction.notes,
      status: transaction.status || 'uncleared',
      created_at: new Date().toISOString(),
      memo: transaction.memo
    };

    // Update account balance
    const balanceChange = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
    const accounts = this.db.get('accounts');
    const account = accounts.find((a: Account) => a.id === transaction.account_id).value();
    if (account) {
      account.balance = (account.balance || 0) + balanceChange;
      await accounts.find((a: Account) => a.id === transaction.account_id)
        .assign({ balance: account.balance })
        .write();
    }

    await this.db.get('transactions').push(newTransaction).write();
    await this.db.set('lastIds.transaction', newId).write();

    return newTransaction;
  }

  // Budget operations
  async getBudgets(month: string): Promise<Budget[]> {
    return this.db.get('budgets').filter((b: Budget) => b.month === month).value() || [];
  }

  async setBudget(budget: Partial<Budget>): Promise<void> {
    if (!budget.category || !budget.amount || !budget.month) {
      throw new Error('Missing required budget fields');
    }

    const budgets = this.db.get('budgets');
    const existingBudget = budgets.find((b: Budget) => b.category === budget.category && b.month === budget.month).value();

    if (existingBudget) {
      existingBudget.amount = budget.amount;
      existingBudget.notes = budget.notes;
      await budgets.find((b: Budget) => b.id === existingBudget.id)
        .assign(existingBudget)
        .write();
    } else {
      const newId = (this.db.get('lastIds.budget').value() || 0) + 1;
      this.db.get('budgets').push({
        id: newId,
        category: budget.category,
        amount: budget.amount,
        month: budget.month,
        notes: budget.notes
      }).write();
      this.db.set('lastIds.budget', newId).write();
    }
  }

  // Scheduled transaction operations
  async getScheduledTransactions(): Promise<ScheduledTransaction[]> {
    return this.db.get('scheduledTransactions').value() || [];
  }

  async createScheduledTransaction(scheduled: Partial<ScheduledTransaction>): Promise<void> {
    if (!scheduled.account_id || !scheduled.payee || !scheduled.category || 
        !scheduled.amount || !scheduled.type || !scheduled.frequency || !scheduled.next_date) {
      throw new Error('Missing required scheduled transaction fields');
    }

    const newId = (this.db.get('lastIds.scheduledTransaction').value() || 0) + 1;

    this.db.get('scheduledTransactions').push({
      id: newId,
      account_id: scheduled.account_id,
      payee: scheduled.payee,
      category: scheduled.category,
      amount: scheduled.amount,
      type: scheduled.type,
      frequency: scheduled.frequency,
      next_date: scheduled.next_date,
      notes: scheduled.notes
    }).write();

    this.db.set('lastIds.scheduledTransaction', newId).write();
  }

  // Report operations
  async getSpendingByCategory(startDate: string, endDate: string): Promise<any[]> {
    const transactions = this.db.get('transactions').filter((t: Transaction) => t.type === 'expense' && t.date >= startDate && t.date <= endDate).value() || [];

    const spendingByCategory = transactions.reduce((acc: { [key: string]: number }, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {});

    return Object.entries(spendingByCategory).map(([category, total]) => ({
      category,
      total
    }));
  }

  async getIncomeVsExpenses(startDate: string, endDate: string): Promise<any> {
    const transactions = this.db.get('transactions').filter((t: Transaction) => t.date >= startDate && t.date <= endDate).value() || [];

    return transactions.reduce((acc: any, t) => {
      acc[t.type] = (acc[t.type] || 0) + t.amount;
      return acc;
    }, { income: 0, expense: 0 });
  }

  async getNetWorthHistory(startDate: string, endDate: string): Promise<any[]> {
    const transactions = this.db.get('transactions').filter((t: Transaction) => t.date >= startDate && t.date <= endDate).value() || [];

    const netWorthByDate = transactions.reduce((acc: { [key: string]: number }, t) => {
      const amount = t.type === 'expense' ? -t.amount : t.amount;
      acc[t.date] = (acc[t.date] || 0) + amount;
      return acc;
    }, {});

    return Object.entries(netWorthByDate).map(([date, net_change]) => ({
      date,
      net_change
    }));
  }
}

const database = Database.getInstance();
export default database;
export type { Transaction, Budget, ScheduledTransaction }; 