import Database from 'better-sqlite3';
import path from 'path';

export type TransactionType = 'income' | 'expense' | 'adjust' | 'transfer';
export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'other';
export type CategoryType = 'income' | 'expense' | 'adjust' | 'transfer';

export interface Transaction {
  id: number;
  date: string;
  account_id: number;
  type: TransactionType;
  category: string;
  amount: number;
  payee: string;
  notes?: string;
  status: 'cleared' | 'uncleared' | 'reconciled';
  created_at: string;
}

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
}

export interface CategoryRule {
  id: number;
  pattern: string;
  category: string;
  created_at: string;
}

export interface Budget {
  id: number;
  category: string;
  amount: number;
  month: string;
  notes?: string;
}

let database: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    payee TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'uncleared',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts (id)
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    month TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

// Add initial data
const INITIAL_DATA = `
  -- Initial categories
  INSERT INTO categories (name) VALUES
    ('Salary'),
    ('Business Income'),
    ('Investment'),
    ('Food & Dining'),
    ('Housing'),
    ('Transportation'),
    ('Shopping'),
    ('Entertainment'),
    ('Healthcare'),
    ('Education'),
    ('Insurance'),
    ('Utilities'),
    ('Other');

  -- Initial accounts
  INSERT INTO accounts (name, type, balance) VALUES
    ('Checking Account', 'checking', 0),
    ('Savings Account', 'savings', 0),
    ('Credit Card', 'credit', 0);
`;

export function connect(dbPath: string): void {
  try {
    database = new Database(path.resolve(dbPath));
    database.pragma('foreign_keys = ON');
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
}

export function disconnect(): void {
  if (database) {
    database.close();
    database = null;
  }
}

export function getDatabase(): Database.Database {
  if (!database) {
    throw new Error('Database not initialized');
    }
  return database;
  }

// Initialize database
export async function initializeDatabase(): Promise<void> {
  const db = getDatabase();

  try {
    // Create tables
    db.exec(SCHEMA);
    
    // Migration: ensure transactions table has a status column
    const cols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
    if (!cols.some(c => c.name === 'status')) {
      db.prepare("ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'uncleared'").run();
  }

    // Migration: ensure transactions table has a created_at column
    if (!cols.some(c => c.name === 'created_at')) {
      db.prepare("ALTER TABLE transactions ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP").run();
    }

    // Check if we need to insert initial data
    const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number };
    if (accountCount.count === 0) {
      db.exec(INITIAL_DATA);
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
  const db = getDatabase();
  return db.prepare('SELECT * FROM transactions ORDER BY date DESC').all() as Transaction[];
}

export async function getTransaction(id: number): Promise<Transaction | null> {
  const db = getDatabase();
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | null;
  }

export async function addTransaction(transaction: Omit<Transaction, 'id'>): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare(`
      INSERT INTO transactions (
        date, account_id, type, category, amount, payee, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      transaction.date,
      transaction.account_id,
      transaction.type,
      transaction.category,
      transaction.amount,
      transaction.payee,
      transaction.notes || ''
    );

    // Update account balance based on transaction type and category
    let balanceChange = 0;
    if (transaction.type === 'expense') {
      balanceChange = -transaction.amount;
    } else if (transaction.type === 'income') {
      balanceChange = transaction.amount;
    } else if (transaction.type === 'adjust') {
      balanceChange = transaction.category === 'Add' ? transaction.amount : -transaction.amount;
    }

    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
      .run(balanceChange, transaction.account_id);
  } catch (error) {
    console.error('Error adding transaction:', error);
    throw error;
  }
}

export async function updateTransaction(transaction: Transaction): Promise<void> {
  const db = getDatabase();
  
  try {
    const oldTransaction = await getTransaction(transaction.id);
    if (!oldTransaction) {
      throw new Error(`Transaction ${transaction.id} not found`);
    }

    // Calculate balance change considering Adjust type
    let oldBalanceEffect = 0;
    let newBalanceEffect = 0;

    if (oldTransaction.type === 'expense') {
      oldBalanceEffect = -oldTransaction.amount;
    } else if (oldTransaction.type === 'income') {
      oldBalanceEffect = oldTransaction.amount;
    } else if (oldTransaction.type === 'adjust') {
      oldBalanceEffect = oldTransaction.category === 'Add' ? oldTransaction.amount : -oldTransaction.amount;
    }

    if (transaction.type === 'expense') {
      newBalanceEffect = -transaction.amount;
    } else if (transaction.type === 'income') {
      newBalanceEffect = transaction.amount;
    } else if (transaction.type === 'adjust') {
      newBalanceEffect = transaction.category === 'Add' ? transaction.amount : -transaction.amount;
    }

    const balanceChange = newBalanceEffect - oldBalanceEffect;

    db.transaction(() => {
      db.prepare(`
        UPDATE transactions 
        SET date = ?, account_id = ?, type = ?, category = ?, amount = ?, payee = ?, notes = ?, status = ?
        WHERE id = ?
      `).run(
        transaction.date,
        transaction.account_id,
        transaction.type,
        transaction.category,
        transaction.amount,
        transaction.payee,
        transaction.notes || '',
        transaction.status,
        transaction.id
      );

      if (balanceChange !== 0) {
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
          .run(balanceChange, transaction.account_id);
      }
    })();
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = getDatabase();

  try {
    const transaction = await getTransaction(id);
    if (!transaction) {
      throw new Error(`Transaction ${id} not found`);
    }

    const balanceChange = transaction.type === 'expense' ? transaction.amount : -transaction.amount;

    db.transaction(() => {
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
        .run(balanceChange, transaction.account_id);
    })();
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
}

// Accounts
export async function getAccounts(): Promise<Account[]> {
  const db = getDatabase();
  // Fetch basic account info (excluding balance and created_at)
  const accountsInfo = db.prepare(
    'SELECT id, name, type FROM accounts'
  ).all() as { id: number; name: string; type: string }[];
  
  // Compute dynamic balances from transactions, handling Adjust type
  const sums = db.prepare(
    `SELECT account_id, 
      SUM(CASE 
        WHEN type = 'expense' THEN -amount
        WHEN type = 'income' THEN amount
        WHEN type = 'adjust' AND category = 'Add' THEN amount
        WHEN type = 'adjust' AND category = 'Subtract' THEN -amount
        ELSE 0
      END) as sum_amount
     FROM transactions
     GROUP BY account_id`
  ).all() as { account_id: number; sum_amount: number }[];
  
  const balanceMap = new Map(sums.map(r => [r.account_id, r.sum_amount]));
  
  // Build Account objects, defaulting created_at to empty string (not shown in UI)
  return accountsInfo.map(acc => ({
    id: acc.id,
    name: acc.name,
    type: acc.type as any,
    balance: balanceMap.get(acc.id) ?? 0,
    created_at: ''
  }));
}

export async function addAccount(account: Omit<Account, 'id'>): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare(
      'INSERT INTO accounts (name, type, balance) VALUES (?, ?, ?)'
    ).run(account.name, account.type, account.balance);
  } catch (error) {
    console.error('Error adding account:', error);
    throw error;
  }
}

export async function updateAccount(account: Account): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare(
      'UPDATE accounts SET name = ?, type = ?, balance = ? WHERE id = ?'
    ).run(account.name, account.type, account.balance, account.id);
  } catch (error) {
    console.error('Error updating account:', error);
    throw error;
  }
}

export async function deleteAccount(id: number): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  } catch (error) {
    console.error('Error deleting account:', error);
    throw error;
  }
}

// Category rules
export async function getCategoryRules(): Promise<CategoryRule[]> {
  const db = getDatabase();
  return db.prepare('SELECT * FROM category_rules').all() as CategoryRule[];
}

export async function addCategoryRule(rule: Omit<CategoryRule, 'id' | 'created_at'>): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare(`
      INSERT INTO category_rules (pattern, category, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(rule.pattern, rule.category);
  } catch (error) {
    console.error('Error adding category rule:', error);
    throw error;
  }
}

export async function deleteCategoryRule(id: number): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare('DELETE FROM category_rules WHERE id = ?').run(id);
  } catch (error) {
    console.error('Error deleting category rule:', error);
    throw error;
  }
}

export async function findMatchingCategory(payee: string): Promise<string | null> {
  const db = getDatabase();

  try {
    const rules = await getCategoryRules();
    for (const rule of rules) {
      if (payee.toLowerCase().includes(rule.pattern.toLowerCase())) {
        return rule.category;
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding matching category:', error);
    throw error;
  }
}

// Bulk operations
export async function bulkUpdateTransactions(updates: { id: number; changes: Partial<Transaction> }[]): Promise<void> {
  const db = getDatabase();

  try {
    for (const update of updates) {
      const transaction = await getTransaction(update.id);
      if (!transaction) {
        throw new Error(`Transaction ${update.id} not found`);
      }
      
      const updatedTransaction: Transaction = { ...transaction, ...update.changes };
      await updateTransaction(updatedTransaction);
    }
  } catch (error) {
    console.error('Error bulk updating transactions:', error);
    throw error;
  }
}

export async function importTransactions(transactions: Partial<Transaction>[]): Promise<void> {
  const db = getDatabase();

  try {
    db.transaction(() => {
      // Use only the existing columns; created_at will default if present
      const stmt = db.prepare(`
        INSERT INTO transactions (
          date, account_id, type, category, amount, payee, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      transactions.forEach(transaction => {
        if (!transaction.date || transaction.account_id == null || !transaction.type || transaction.amount == null) {
          throw new Error('Missing required transaction fields');
        }

        stmt.run(
          transaction.date,
          transaction.account_id,
          transaction.type,
          transaction.category || 'Uncategorized',
          transaction.amount,
          transaction.payee || 'Unknown',
          transaction.notes || '',
          transaction.status || 'uncleared'
        );
        // Update account balance for imported transaction
        const balanceChange = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
          .run(balanceChange, transaction.account_id);
      });
    })();
  } catch (error) {
    console.error('Error importing transactions:', error);
    throw error;
  }
}

// Budget operations
export async function getBudgets(month?: string): Promise<Budget[]> {
  const db = getDatabase();

  try {
    if (month) {
      return db.prepare('SELECT * FROM budgets WHERE month = ?').all(month) as Budget[];
    } else {
      return db.prepare('SELECT * FROM budgets').all() as Budget[];
    }
  } catch (error) {
    console.error('Error getting budgets:', error);
    throw error;
  }
}

export async function addBudget(budget: Omit<Budget, 'id'>): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare(`
      INSERT INTO budgets (category, amount, month, notes)
      VALUES (?, ?, ?, ?)
    `).run(
      budget.category,
      budget.amount,
      budget.month,
      budget.notes || ''
    );
  } catch (error) {
    console.error('Error adding budget:', error);
    throw error;
    }
  }

export async function updateBudget(budget: Budget): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare(`
      UPDATE budgets
      SET category = ?,
          amount = ?,
          month = ?,
          notes = ?
      WHERE id = ?
    `).run(
      budget.category,
      budget.amount,
      budget.month,
      budget.notes || '',
      budget.id
    );
  } catch (error) {
    console.error('Error updating budget:', error);
    throw error;
  }
}

export async function deleteBudget(id: number): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare('DELETE FROM budgets WHERE id = ?').run(id);
  } catch (error) {
    console.error('Error deleting budget:', error);
    throw error;
  }
}

export async function getNetWorthHistory(startDate: string, endDate: string): Promise<any[]> {
  const db = getDatabase();

  try {
    // Get all transactions within the date range
    const transactions = db.prepare(`
      SELECT date, type, category, amount
      FROM transactions
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC
    `).all(startDate, endDate) as { date: string; type: string; category: string; amount: number }[];

    // Get initial account balances
    const accounts = db.prepare('SELECT balance FROM accounts').all() as { balance: number }[];
    const initialNetWorth = accounts.reduce((sum: number, account: { balance: number }) => sum + account.balance, 0);

    // Calculate net worth over time
    let currentNetWorth = initialNetWorth;
    const history: { date: string; netWorth: number }[] = [];
    let currentDate = startDate;

    transactions.forEach(transaction => {
      if (transaction.date !== currentDate && currentDate !== startDate) {
        history.push({ date: currentDate, netWorth: currentNetWorth });
      }
      
      currentDate = transaction.date;
      
      // Handle different transaction types
      if (transaction.type === 'expense') {
        currentNetWorth -= transaction.amount;
      } else if (transaction.type === 'income') {
        currentNetWorth += transaction.amount;
      } else if (transaction.type === 'adjust') {
        if (transaction.category === 'Add') {
          currentNetWorth += transaction.amount;
        } else if (transaction.category === 'Subtract') {
          currentNetWorth -= transaction.amount;
        }
      }
    });

    // Add final entry
    history.push({ date: currentDate, netWorth: currentNetWorth });

    return history;
  } catch (error) {
    console.error('Error getting net worth history:', error);
    throw error;
  }
}

export async function findDuplicateTransactions(transactions: Transaction[]): Promise<Transaction[]> {
  const db = getDatabase();

  try {
    const existingTransactions = db.prepare(`
      SELECT * FROM transactions
      WHERE date >= date('now', '-2 days')
    `).all() as Transaction[];

    const duplicates: Transaction[] = [];

    for (const transaction of transactions) {
      const isDuplicate = existingTransactions.some(oldTransaction => {
        // For credit card payments, check within 2-day window
        if (isCardPayment(transaction) && isCardPayment(oldTransaction)) {
          return Math.abs(transaction.amount - oldTransaction.amount) < 0.01;
        }

        // For regular transactions, check exact match
        return (
          transaction.date === oldTransaction.date &&
          Math.abs(transaction.amount - oldTransaction.amount) < 0.01 &&
          transaction.type === oldTransaction.type &&
          transaction.payee === oldTransaction.payee
        );
      });

      if (isDuplicate) {
        duplicates.push(transaction);
      }
    }

    return duplicates;
  } catch (error) {
    console.error('Error finding duplicate transactions:', error);
    throw error;
  }
}

export async function getSpendingByCategory(startDate: string, endDate: string): Promise<any[]> {
  const db = getDatabase();

  try {
    const result = db.prepare(`
      SELECT category, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense'
      AND date BETWEEN ? AND ?
      GROUP BY category
      ORDER BY total DESC
    `).all(startDate, endDate) as { category: string; total: number }[];

    return result;
  } catch (error) {
    console.error('Error getting spending by category:', error);
    throw error;
  }
}

export async function getIncomeVsExpenses(startDate: string, endDate: string): Promise<any> {
  const db = getDatabase();

  try {
    const income = db.prepare(`
      SELECT SUM(amount) as total
      FROM transactions
      WHERE type = 'income'
      AND date BETWEEN ? AND ?
    `).get(startDate, endDate) as { total: number };

    const expenses = db.prepare(`
      SELECT SUM(amount) as total
      FROM transactions
      WHERE type = 'expense'
      AND date BETWEEN ? AND ?
    `).get(startDate, endDate) as { total: number };

    return {
      income: income.total || 0,
      expenses: expenses.total || 0,
      net: (income.total || 0) - (expenses.total || 0)
    };
  } catch (error) {
    console.error('Error getting income vs expenses:', error);
    throw error;
  }
}

function isCardPayment(transaction: Transaction): boolean {
  return transaction.payee.toLowerCase().includes('card') || 
         transaction.notes?.toLowerCase().includes('card') || 
         transaction.category.toLowerCase().includes('card');
  }

// Add a function to get the list of categories
export async function getCategories(): Promise<string[]> {
  const db = getDatabase();
  const rows = db.prepare('SELECT name FROM categories').all() as { name: string }[];
  return rows.map(r => r.name);
} 