use rusqlite::{Connection, params, Result};
use std::path::PathBuf;
use tauri::AppHandle;
use serde::{Serialize, Deserialize};
use serde_json::{Value, json};
use std::env;
use std::fs;
use tauri_api::path::data_dir;
use std::collections::HashSet;

/// Helper: get path to SQLite database
fn get_db_path(_app: &AppHandle) -> PathBuf {
  // Use OS-specific user data directory to avoid dev watch restarts
  let mut path = data_dir().unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")));
  path.push("superbudget");
  fs::create_dir_all(&path).expect("Failed to create app data directory");
  path.push("superbudget.db");
  path
}

/// Initialize database schema if not exists
pub fn init_db(app: &AppHandle) -> Result<()> {
  let path = get_db_path(app);
  let conn = Connection::open(path)?;
  conn.execute_batch(r#"
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense'
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      category TEXT NOT NULL,
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
  "#)?;
  // Migrate: add created_at to accounts if missing
  let _ = conn.execute(
    "ALTER TABLE accounts ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
    [],
  );
  // Migrate: add created_at to budgets if missing
  let _ = conn.execute(
    "ALTER TABLE budgets ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
    [],
  );
  // Migrate: add type column to categories if missing
  let _ = conn.execute(
    "ALTER TABLE categories ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'",
    [],
  );
  // Migrate: set correct type for initial income categories
  let _ = conn.execute(
    "UPDATE categories SET type = 'income' WHERE name IN ('Salary','Business Income','Investment') AND type = 'expense'",
    [],
  );
  // Insert initial categories if empty, with correct types
  let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
  if count == 0 {
    let initial_categories: &[(&str, &str)] = &[
      ("Salary", "income"),
      ("Business Income", "income"),
      ("Investment", "income"),
      ("Food & Dining", "expense"),
      ("Housing", "expense"),
      ("Transportation", "expense"),
      ("Shopping", "expense"),
      ("Entertainment", "expense"),
      ("Healthcare", "expense"),
      ("Education", "expense"),
      ("Insurance", "expense"),
      ("Utilities", "expense"),
      ("Other", "expense"),
    ];
    for (name, cat_type) in initial_categories {
      conn.execute("INSERT INTO categories (name, type) VALUES (?1, ?2)", params![name, cat_type])?;
    }
  }
  // Insert initial accounts if empty
  let account_count: i64 = conn.query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))?;
  if account_count == 0 {
    let default_accounts = [
      ("Checking", "checking"),
      ("Savings", "savings"),
      ("Credit Card", "credit"),
    ];
    for (name, acc_type) in default_accounts {
      conn.execute(
        "INSERT INTO accounts (name, type, balance) VALUES (?1, ?2, 0)",
        params![name, acc_type],
      )?;
    }
  }
  Ok(())
}

// Data model definitions
#[derive(Serialize, Deserialize)]
pub struct Account { pub id: i64, pub name: String, #[serde(rename = "type")] pub account_type: String, pub balance: f64, pub created_at: String }

#[derive(Serialize, Deserialize, Clone)]
pub struct Transaction {
  #[serde(default)]
  pub id: i64,
  pub date: String,
  pub account_id: i64,
  #[serde(rename = "type")]
  pub transaction_type: String,
  pub category: String,
  pub amount: f64,
  pub payee: String,
  pub notes: Option<String>,
  pub status: String,
  #[serde(default)]
  pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct CategoryRule { pub id: i64, pub pattern: String, pub category: String, pub created_at: String }

#[derive(Serialize, Deserialize)]
pub struct Budget { pub id: i64, pub category: String, pub amount: f64, pub month: String, pub notes: Option<String>, pub created_at: String }

#[derive(Serialize, Deserialize)]
pub struct Category { pub id: i64, pub name: String, #[serde(rename = "type")] pub category_type: String }

// Tauri command stubs
#[tauri::command]
pub fn get_accounts(app: AppHandle) -> Result<Vec<Account>, String> {
  // Open SQLite connection
  let path = get_db_path(&app);
  let conn = Connection::open(path).map_err(|e| e.to_string())?;
  // Attempt to include created_at; fallback if column missing
  let (mut stmt, has_created) = match conn.prepare("SELECT id, name, type, balance, created_at FROM accounts ORDER BY id") {
    Ok(s) => (s, true),
    Err(_) => {
      let s = conn.prepare("SELECT id, name, type, balance FROM accounts ORDER BY id").map_err(|e| e.to_string())?;
      (s, false)
    }
  };
  let rows = stmt.query_map([], move |row| {
    if has_created {
      Ok(Account { id: row.get(0)?, name: row.get(1)?, account_type: row.get(2)?, balance: row.get(3)?, created_at: row.get(4)? })
    } else {
      Ok(Account { id: row.get(0)?, name: row.get(1)?, account_type: row.get(2)?, balance: row.get(3)?, created_at: String::new() })
    }
  }).map_err(|e| e.to_string())?;
  // Collect results
  let mut accounts = Vec::new();
  for account in rows {
      accounts.push(account.map_err(|e| e.to_string())?);
  }
  Ok(accounts)
}

#[tauri::command]
pub fn create_account(app: AppHandle, name: String, account_type: String, balance: f64) -> Result<Vec<Account>, String> {
    // Open SQLite connection
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Insert new account with initial balance
    conn.execute(
        "INSERT INTO accounts (name, type, balance) VALUES (?1, ?2, ?3)",
        params![name, account_type, balance],
    )
    .map_err(|e| e.to_string())?;
    // Return updated account list
    get_accounts(app)
}

#[tauri::command]
pub fn update_account(app: AppHandle, account: Account) -> Result<Vec<Account>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE accounts SET name = ?1, type = ?2, balance = ?3 WHERE id = ?4",
        params![account.name, account.account_type, account.balance, account.id],
    )
    .map_err(|e| e.to_string())?;
    get_accounts(app)
}

#[tauri::command]
pub fn delete_account(app: AppHandle, id: i64) -> Result<Vec<Account>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM accounts WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    get_accounts(app)
}

#[tauri::command]
pub fn get_transactions(app: AppHandle) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, date, account_id, type, category, amount, payee, notes, status, created_at FROM transactions ORDER BY date DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Transaction {
                id: row.get(0)?,
                date: row.get(1)?,
                account_id: row.get(2)?,
                transaction_type: row.get(3)?,
                category: row.get(4)?,
                amount: row.get(5)?,
                payee: row.get(6)?,
                notes: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut transactions = Vec::new();
    for tr in rows {
        transactions.push(tr.map_err(|e| e.to_string())?);
    }
    Ok(transactions)
}

#[tauri::command]
pub fn create_transaction(app: AppHandle, transaction: Transaction) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO transactions (date, account_id, type, category, amount, payee, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            transaction.date,
            transaction.account_id,
            transaction.transaction_type,
            transaction.category,
            transaction.amount,
            transaction.payee,
            transaction.notes.clone().unwrap_or_default()
        ],
    )
    .map_err(|e| e.to_string())?;
    let balance_change = if transaction.transaction_type == "expense" {
        -transaction.amount
    } else {
        transaction.amount
    };
    conn.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![balance_change, transaction.account_id],
    )
    .map_err(|e| e.to_string())?;
    get_transactions(app)
}

#[tauri::command]
pub fn update_transaction(app: AppHandle, transaction: Transaction) -> Result<Vec<Transaction>, String> {
    // Open connection
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Retrieve old transaction to adjust balance
    let mut sel = conn.prepare("SELECT type, amount FROM transactions WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = sel.query_map(params![transaction.id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    }).map_err(|e| e.to_string())?;
    let (old_type, old_amount) = rows.next().ok_or("Transaction not found".to_string())?.map_err(|e| e.to_string())?;
    let old_effect = if old_type == "expense" { -old_amount } else { old_amount };
    let new_effect = if transaction.transaction_type == "expense" { -transaction.amount } else { transaction.amount };
    let net = new_effect - old_effect;
    // Update transaction record
    conn.execute(
        "UPDATE transactions SET date = ?1, account_id = ?2, type = ?3, category = ?4, amount = ?5, payee = ?6, notes = ?7, status = ?8 WHERE id = ?9",
        params![
            transaction.date,
            transaction.account_id,
            transaction.transaction_type,
            transaction.category,
            transaction.amount,
            transaction.payee,
            transaction.notes.clone().unwrap_or_default(),
            transaction.status,
            transaction.id
        ],
    ).map_err(|e| e.to_string())?;
    // Adjust account balance if needed
    if net.abs() > 0.0 {
        conn.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![net, transaction.account_id],
        ).map_err(|e| e.to_string())?;
    }
    // Return updated transactions
    get_transactions(app)
}

#[tauri::command]
pub fn delete_transaction(app: AppHandle, id: i64) -> Result<Vec<Transaction>, String> {
    // Open connection
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Retrieve transaction to adjust balance
    let mut sel = conn.prepare("SELECT type, amount, account_id FROM transactions WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = sel.query_map(params![id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, i64>(2)?))
    }).map_err(|e| e.to_string())?;
    let (old_type, old_amount, acct_id) = rows.next().ok_or("Transaction not found".to_string())?.map_err(|e| e.to_string())?;
    let balance_change = if old_type == "expense" { old_amount } else { -old_amount };
    // Delete and adjust balance
    conn.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![balance_change, acct_id],
    ).map_err(|e| e.to_string())?;
    // Return updated transactions
    get_transactions(app)
}

#[tauri::command]
pub fn bulk_update_transactions(app: AppHandle, updates: Vec<(i64, Value)>) -> Result<Vec<Transaction>, String> {
    for (id, changes) in updates {
        // Fetch existing transaction
        let path = get_db_path(&app);
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        let existing: Transaction = conn.query_row(
            "SELECT id, date, account_id, type, category, amount, payee, notes, status, created_at FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok(Transaction {
                id: row.get(0)?, date: row.get(1)?, account_id: row.get(2)?,
                transaction_type: row.get(3)?, category: row.get(4)?, amount: row.get(5)?,
                payee: row.get(6)?, notes: row.get(7)?, status: row.get(8)?, created_at: row.get(9)?,
            }),
        ).map_err(|e| e.to_string())?;
        // Merge partial changes
        let mut updated = existing.clone();
        if let Some(v) = changes.get("date").and_then(|v| v.as_str()) { updated.date = v.to_string(); }
        if let Some(v) = changes.get("account_id").and_then(|v| v.as_i64()) { updated.account_id = v; }
        if let Some(v) = changes.get("type").and_then(|v| v.as_str()) { updated.transaction_type = v.to_string(); }
        if let Some(v) = changes.get("category").and_then(|v| v.as_str()) { updated.category = v.to_string(); }
        if let Some(v) = changes.get("amount").and_then(|v| v.as_f64()) { updated.amount = v; }
        if let Some(v) = changes.get("payee").and_then(|v| v.as_str()) { updated.payee = v.to_string(); }
        if let Some(v) = changes.get("notes").and_then(|v| v.as_str()) { updated.notes = Some(v.to_string()); }
        if let Some(v) = changes.get("status").and_then(|v| v.as_str()) { updated.status = v.to_string(); }
        // Apply update
        update_transaction(app.clone(), updated)?;
    }
    get_transactions(app)
}

#[tauri::command]
pub fn get_category_rules(app: AppHandle) -> Result<Vec<CategoryRule>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, pattern, category, created_at FROM category_rules ORDER BY id").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(CategoryRule {
        id: row.get(0)?, pattern: row.get(1)?, category: row.get(2)?, created_at: row.get(3)?,
    })).map_err(|e| e.to_string())?;
    let mut rules = Vec::new(); for r in rows { rules.push(r.map_err(|e| e.to_string())?); }
    Ok(rules)
}

#[tauri::command]
pub fn add_category_rule(app: AppHandle, pattern: String, category: String) -> Result<Vec<CategoryRule>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO category_rules (pattern, category) VALUES (?1, ?2)", params![pattern, category]).map_err(|e| e.to_string())?;
    get_category_rules(app)
}

#[tauri::command]
pub fn delete_category_rule(app: AppHandle, id: i64) -> Result<Vec<CategoryRule>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM category_rules WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    get_category_rules(app)
}

#[tauri::command]
pub fn find_matching_category(app: AppHandle, payee: String) -> Result<Option<String>, String> {
    let rules = get_category_rules(app.clone())?;
    for rule in rules { if payee.to_lowercase().contains(&rule.pattern.to_lowercase()) { return Ok(Some(rule.category)); } }
    Ok(None)
}

#[tauri::command]
pub fn import_transactions(app: AppHandle, transactions: Vec<Transaction>) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // Preload existing transaction keys (date, amount in cents, payee) in a scoped block
    let existing_keys: HashSet<(String, i64, String)> = {
        let mut stmt = tx.prepare("SELECT date, amount, payee FROM transactions").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            let date: String = row.get(0)?;
            let amt: f64 = row.get(1)?;
            let payee: String = row.get(2)?;
            let cents = (amt * 100.0).round() as i64;
            Ok((date, cents, payee))
        }).map_err(|e| e.to_string())?;
        let mut set = HashSet::new();
        for entry in rows {
            let key = entry.map_err(|e| e.to_string())?;
            set.insert(key);
        }
        set
    };
    for mut t in transactions {
        if t.date.is_empty() { return Err("Missing date".into()); }
        // Auto-fill category from existing transactions matching description
        if t.category.is_empty() {
            if let Ok(existing_cat) = tx.query_row(
                "SELECT category FROM transactions WHERE payee = ?1 ORDER BY created_at DESC LIMIT 1",
                params![t.payee],
                |row| row.get::<_, String>(0)
            ) {
                t.category = existing_cat;
            }
        }
        // Skip duplicates only if matching a pre-existing record (date, amount, payee)
        let cents = (t.amount * 100.0).round() as i64;
        let key = (t.date.clone(), cents, t.payee.clone());
        if existing_keys.contains(&key) {
            continue;
        }
        // Insert new transaction
        tx.execute(
            "INSERT INTO transactions (date, account_id, type, category, amount, payee, notes, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![t.date, t.account_id, t.transaction_type, t.category, t.amount, t.payee, t.notes.clone().unwrap_or_default(), t.status],
        ).map_err(|e| e.to_string())?;
        let change = if t.transaction_type == "expense" { -t.amount } else { t.amount };
        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![change, t.account_id]
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    get_transactions(app)
}

#[tauri::command]
pub fn get_budgets(app: AppHandle, month: String) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, category, amount, month, notes, created_at FROM budgets WHERE month = ?1 ORDER BY id").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![month], |row| Ok(Budget { id: row.get(0)?, category: row.get(1)?, amount: row.get(2)?, month: row.get(3)?, notes: row.get(4)?, created_at: row.get(5)? })).map_err(|e| e.to_string())?;
    let mut list = Vec::new(); for b in rows { list.push(b.map_err(|e| e.to_string())?); }
    Ok(list)
}

#[tauri::command]
pub fn add_budget(app: AppHandle, category: String, amount: f64, month: String, notes: Option<String>) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO budgets (category, amount, month, notes) VALUES (?1, ?2, ?3, ?4)", params![category, amount, month.clone(), notes.unwrap_or_default()]).map_err(|e| e.to_string())?;
    get_budgets(app, month)
}

#[tauri::command]
pub fn update_budget(app: AppHandle, budget: Budget) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("UPDATE budgets SET category = ?1, amount = ?2, month = ?3, notes = ?4 WHERE id = ?5", params![budget.category, budget.amount, budget.month.clone(), budget.notes.unwrap_or_default(), budget.id]).map_err(|e| e.to_string())?;
    get_budgets(app, budget.month)
}

#[tauri::command]
pub fn delete_budget(app: AppHandle, id: i64) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let month: String = conn.query_row("SELECT month FROM budgets WHERE id = ?1", params![id], |r| r.get(0)).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM budgets WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    get_budgets(app, month)
}

#[tauri::command]
pub fn get_categories(app: AppHandle) -> Result<Vec<String>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT name FROM categories ORDER BY id").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(r.get(0)?)).map_err(|e| e.to_string())?;
    let mut cats = Vec::new(); for c in rows { cats.push(c.map_err(|e| e.to_string())?); }
    Ok(cats)
}

#[tauri::command]
pub fn get_spending_by_category(app: AppHandle, start_date: String, end_date: String) -> Result<Value, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT category, SUM(amount) as total FROM transactions WHERE type = 'expense' AND date BETWEEN ?1 AND ?2 GROUP BY category ORDER BY total DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![start_date, end_date], |r| Ok(json!({ "category": r.get::<_, String>(0)?, "total": r.get::<_, f64>(1)? }))).map_err(|e| e.to_string())?;
    let mut out = Vec::new(); for r in rows { out.push(r.map_err(|e| e.to_string())?); }
    Ok(json!(out))
}

#[tauri::command]
pub fn get_income_vs_expenses(app: AppHandle, start_date: String, end_date: String) -> Result<Value, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let income: f64 = conn.query_row("SELECT IFNULL(SUM(amount),0) FROM transactions WHERE type = 'income' AND date BETWEEN ?1 AND ?2", params![start_date, end_date], |r| r.get(0)).map_err(|e| e.to_string())?;
    let expenses: f64 = conn.query_row("SELECT IFNULL(SUM(amount),0) FROM transactions WHERE type = 'expense' AND date BETWEEN ?1 AND ?2", params![start_date, end_date], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(json!({ "income": income, "expenses": expenses, "net": income - expenses }))
}

#[tauri::command]
pub fn get_net_worth_history(app: AppHandle, start_date: String, end_date: String) -> Result<Value, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT date, type, amount FROM transactions WHERE date BETWEEN ?1 AND ?2 ORDER BY date ASC").map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![start_date, end_date], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, f64>(2)?))).map_err(|e| e.to_string())?;
    let mut history = Vec::new();
    let mut net: f64 = conn.query_row("SELECT SUM(balance) FROM accounts", [], |r| r.get(0)).unwrap_or(0.0);
    let mut last = start_date.clone();
    for e in entries {
        let (date, ttype, amt) = e.map_err(|e| e.to_string())?;
        if date != last {
            history.push(json!({ "date": last, "netWorth": net }));
            last = date.clone();
        }
        if ttype == "expense" { net -= amt; } else { net += amt; }
    }
    history.push(json!({ "date": last, "netWorth": net }));
    Ok(json!(history))
}

#[tauri::command]
pub fn get_categories_full(app: AppHandle) -> Result<Vec<Category>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, type FROM categories ORDER BY id").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(Category { id: row.get(0)?, name: row.get(1)?, category_type: row.get(2)? })).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for c in rows { categories.push(c.map_err(|e| e.to_string())?); }
    Ok(categories)
}

#[tauri::command]
pub fn add_category(app: AppHandle, name: String, category_type: String) -> Result<Vec<Category>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO categories (name, type) VALUES (?1, ?2)", params![name, category_type]).map_err(|e| e.to_string())?;
    get_categories_full(app)
}

#[tauri::command]
pub fn update_category(app: AppHandle, id: i64, name: String, category_type: String) -> Result<Vec<Category>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("UPDATE categories SET name = ?1, type = ?2 WHERE id = ?3", params![name, category_type, id]).map_err(|e| e.to_string())?;
    get_categories_full(app)
}

#[tauri::command]
pub fn delete_category(app: AppHandle, id: i64) -> Result<Vec<Category>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM categories WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    get_categories_full(app)
}

// Commands for backing up and restoring the entire database
#[tauri::command]
pub fn backup_database(app: AppHandle, save_path: String) -> Result<(), String> {
  let db_path = get_db_path(&app);
  std::fs::copy(&db_path, &save_path).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_database(app: AppHandle, file_path: String) -> Result<(), String> {
  let db_path = get_db_path(&app);
  std::fs::copy(&file_path, &db_path).map(|_| ()).map_err(|e| e.to_string())
}

// Command to export the raw database file as bytes
#[tauri::command]
pub fn export_database(app: AppHandle) -> Result<Vec<u8>, String> {
  let db_path = get_db_path(&app);
  std::fs::read(&db_path).map_err(|e| e.to_string())
}

// Command to import raw database bytes and overwrite the DB file
#[tauri::command]
pub fn import_database(app: AppHandle, data: Vec<u8>) -> Result<(), String> {
  let db_path = get_db_path(&app);
  std::fs::write(&db_path, data).map_err(|e| e.to_string())
} 