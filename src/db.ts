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
  category_id: number | undefined;
  amount: number;
  payee: string;
  notes?: string;
  transfer_id?: number;
  created_at: string;
}

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  description?: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  is_reimbursement?: boolean;
  reimbursement_target_category_id?: number;
}

export interface Budget {
  id: number;
  category_id: number;
  amount: number;
  month: string;
  notes?: string;
  created_at: string;
}

let database: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense'
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payee TEXT NOT NULL,
    notes TEXT,
    transfer_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts (id),
    FOREIGN KEY (category_id) REFERENCES categories (id)
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    month TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

// Add initial data
const INITIAL_DATA = `
  -- Initial categories
  INSERT INTO categories (name, type) VALUES
    -- Income Categories
    ('Bonus', 'income'),
    ('CRA', 'income'),
    ('Interest', 'income'),
    ('Other Income', 'income'),
    ('Reimbursement', 'income'),
    ('Reimbursement [E]', 'income'),
    ('Reimbursement [G]', 'income'),
    ('Reimbursement [U]', 'income'),
    ('Salary [OHCC]', 'income'),
    ('Salery [WCST]', 'income'),
    
    -- Expense Categories
    ('Auto [Gas]', 'expense'),
    ('Auto [ICBC]', 'expense'),
    ('Auto [Repair]', 'expense'),
    ('Beauty & Personal Care', 'expense'),
    ('Communication', 'expense'),
    ('Eating Out', 'expense'),
    ('Education', 'expense'),
    ('Entertainment', 'expense'),
    ('Exercise', 'expense'),
    ('Gifts', 'expense'),
    ('Groceries', 'expense'),
    ('Home [Mortgage]', 'expense'),
    ('Home [UpKeep]', 'expense'),
    ('Insurance', 'expense'),
    ('Living', 'expense'),
    ('Offering', 'expense'),
    ('Other', 'expense'),
    ('Shopping', 'expense'),
    ('Subscriptions', 'expense'),
    ('Taxes', 'expense'),
    ('Travel', 'expense'),
    ('Utilities', 'expense'),
    ('Uncategorized', 'expense'),
    
    -- Adjust Categories
    ('Add', 'adjust'),
    ('Subtract', 'adjust'),
    
    -- Transfer Category
    ('Transfer', 'transfer');

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
    
    // Migration: ensure transactions table has a created_at column
    const cols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
    if (!cols.some(c => c.name === 'created_at')) {
      db.prepare("ALTER TABLE transactions ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP").run();
    }
    
    // Migration: ensure transactions table has a transfer_id column
    if (!cols.some(c => c.name === 'transfer_id')) {
      db.prepare("ALTER TABLE transactions ADD COLUMN transfer_id INTEGER").run();
    }

    // Migration: handle transition from category to category_id
    if (cols.some(c => c.name === 'category') && !cols.some(c => c.name === 'category_id')) {
      // Add category_id column
      db.prepare("ALTER TABLE transactions ADD COLUMN category_id INTEGER").run();
      
      // Update existing transactions to use default category_id (1)
      db.prepare("UPDATE transactions SET category_id = 1 WHERE category_id IS NULL").run();
      
      // Remove old category column (SQLite doesn't support DROP COLUMN, so we'll recreate the table)
      // This is a simplified approach - in production you'd want a more robust migration
    }

    // Migration: ensure categories table has type column
    const categoryCols = db.prepare("PRAGMA table_info(categories)").all() as { name: string }[];
    if (!categoryCols.some(c => c.name === 'type')) {
      db.prepare("ALTER TABLE categories ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'").run();
      // Update existing categories to have appropriate types
      db.prepare("UPDATE categories SET type = 'income' WHERE name IN ('Salary', 'Business Income', 'Investment')").run();
      db.prepare("UPDATE categories SET type = 'adjust' WHERE name IN ('Add', 'Subtract')").run();
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
  return db.prepare('SELECT id, date, account_id, type, category_id, amount, payee, notes, transfer_id, created_at FROM transactions ORDER BY date DESC').all() as Transaction[];
}

export async function getTransaction(id: number): Promise<Transaction | null> {
  const db = getDatabase();
  return db.prepare('SELECT id, date, account_id, type, category_id, amount, payee, notes, transfer_id, created_at FROM transactions WHERE id = ?').get(id) as Transaction | null;
}

export async function addTransaction(transaction: Omit<Transaction, 'id'>): Promise<void> {
  const db = getDatabase();

  try {
    db.prepare(`
      INSERT INTO transactions (
        date, account_id, type, category_id, amount, payee, notes, transfer_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transaction.date,
      transaction.account_id,
      transaction.type,
      transaction.category_id,
      transaction.amount,
      transaction.payee,
      transaction.notes || '',
      transaction.transfer_id || null
    );

    // Update account balance based on transaction type and category
    let balanceChange = 0;
    if (transaction.type === 'expense') {
      balanceChange = -transaction.amount;
    } else if (transaction.type === 'income') {
      balanceChange = transaction.amount;
    } else if (transaction.type === 'adjust') {
      // Get category name from database
      const categoryName = db.prepare('SELECT name FROM categories WHERE id = ?').get(transaction.category_id) as { name: string } | undefined;
      const isAdd = categoryName?.name === 'Add';
      balanceChange = isAdd ? transaction.amount : -transaction.amount;
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
      // Get category name from database for old transaction
      const oldCategoryName = db.prepare('SELECT name FROM categories WHERE id = ?').get(oldTransaction.category_id) as { name: string } | undefined;
      const oldIsAdd = oldCategoryName?.name === 'Add';
      oldBalanceEffect = oldIsAdd ? oldTransaction.amount : -oldTransaction.amount;
    }

    if (transaction.type === 'expense') {
      newBalanceEffect = -transaction.amount;
    } else if (transaction.type === 'income') {
      newBalanceEffect = transaction.amount;
    } else if (transaction.type === 'adjust') {
      // Get category name from database for new transaction
      const newCategoryName = db.prepare('SELECT name FROM categories WHERE id = ?').get(transaction.category_id) as { name: string } | undefined;
      const newIsAdd = newCategoryName?.name === 'Add';
      newBalanceEffect = newIsAdd ? transaction.amount : -transaction.amount;
    }

    const balanceChange = newBalanceEffect - oldBalanceEffect;

    db.transaction(() => {
      db.prepare(`
        UPDATE transactions 
        SET date = ?, account_id = ?, type = ?, category_id = ?, amount = ?, payee = ?, notes = ?, transfer_id = ?
        WHERE id = ?
      `).run(
        transaction.date,
        transaction.account_id,
        transaction.type,
        transaction.category_id,
        transaction.amount,
        transaction.payee,
        transaction.notes || '',
        transaction.transfer_id || null,
        transaction.id
      );

      if (balanceChange !== 0) {
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
          .run(balanceChange, transaction.account_id);
      }
    });
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
    });
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
    `