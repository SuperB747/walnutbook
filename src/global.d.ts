interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
  description?: string;
  created_at: string;
}

interface Category {
  id: number;
  name: string;
  type: string;
}

interface Transaction {
  id: number;
  account_id: number;
  date: string;
  payee: string;
  category_id: number;
  amount: number;
  type: 'income' | 'expense' | 'transfer' | 'adjust';
  notes?: string;
  transfer_id?: number;
  created_at: string;
}

interface Budget {
  id: number;
  category_id: number;
  amount: number;
  month: string;
  notes?: string;
  created_at: string;
}

interface ScheduledTransaction {
  id: number;
  account_id: number;
  payee: string;
  category_id: number;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  frequency: string;
  next_date: string;
  notes?: string;
}

interface Window {
  api: {
    // Account operations
    getAccounts: () => Promise<Account[]>;
    createAccount: (account: Partial<Account>) => Promise<Account[]>;
    updateAccount: (account: Account) => Promise<Account[]>;
    deleteAccount: (id: number) => Promise<Account[]>;

    // Transaction operations
    getTransactions: () => Promise<Transaction[]>;
    createTransaction: (transaction: Partial<Transaction>) => Promise<Transaction[]>;
    updateTransaction: (transaction: Transaction) => Promise<Transaction[]>;
    deleteTransaction: (id: number) => Promise<Transaction[]>;
    bulkUpdateTransactions: (updates: Array<[number, any]>) => Promise<Transaction[]>;
    importTransactions: (transactions: Partial<Transaction>[]) => Promise<Transaction[]>;

    // Budget operations
    getBudgets: (month: string) => Promise<Budget[]>;
    addBudget: (category: string, amount: number, month: string, notes?: string) => Promise<Budget[]>;
    updateBudget: (budget: Budget) => Promise<Budget[]>;
    deleteBudget: (id: number) => Promise<Budget[]>;

    // Category operations
    getCategories: () => Promise<string[]>;
    getCategoriesFull: () => Promise<Category[]>;
    addCategory: (name: string, type: string) => Promise<Category[]>;
    updateCategory: (id: number, name: string, type: string) => Promise<Category[]>;
    deleteCategory: (id: number) => Promise<Category[]>;

    // Report operations
    getSpendingByCategory: (startDate: string, endDate: string) => Promise<any[]>;
    getIncomeVsExpenses: (startDate: string, endDate: string) => Promise<any>;
    getNetWorthHistory: (startDate: string, endDate: string) => Promise<any[]>;
  };
  electron: {
    ipcRenderer: {
      invoke(channel: string, ...args: any[]): Promise<any>;
    };
  };
}

declare module 'lowdb/adapters/FileSync' {
  import { AdapterSync } from 'lowdb';
  export default class FileSync<T> implements AdapterSync<T> {
    constructor(source: string);
    read(): T;
    write(data: T): void;
  }
}

declare global {
  interface Window {
    electron: {
      invoke(channel: string, ...args: any[]): Promise<any>;
    };
  }
}







export {}; 