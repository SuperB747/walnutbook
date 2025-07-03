use rusqlite::{Connection, params, Result};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use serde::{Serialize, Deserialize};
use serde_json::{Value, json};
use std::env;
use std::fs;
use std::collections::HashSet;



/// Helper: get path to SQLite database
fn get_db_path(app: &AppHandle) -> PathBuf {
  // Use OS-specific user data directory to avoid dev watch restarts
  let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")));
  path.push("walnutbook");
  fs::create_dir_all(&path).expect("Failed to create app data directory");
  path.push("walnutbook.db");
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
      description TEXT,
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
    CREATE TABLE IF NOT EXISTS account_import_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      csv_sign_logic TEXT NOT NULL DEFAULT 'standard',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
    );
  "#)?;
  // Migrate: add created_at to accounts if missing
  let _ = conn.execute(
    "ALTER TABLE accounts ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
    [],
  );
  // Migrate: add description to accounts if missing
  let _ = conn.execute(
    "ALTER TABLE accounts ADD COLUMN description TEXT",
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
      ("Add", "adjust"),
      ("Subtract", "adjust"),
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
pub struct Account { pub id: i64, pub name: String, #[serde(rename = "type")] pub account_type: String, pub balance: f64, pub description: Option<String>, pub created_at: String }

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
  #[serde(default)]
  pub created_at: String,
}



#[derive(Serialize, Deserialize)]
pub struct Budget { pub id: i64, pub category: String, pub amount: f64, pub month: String, pub notes: Option<String>, pub created_at: String }

#[derive(Serialize, Deserialize)]
pub struct Category { pub id: i64, pub name: String, #[serde(rename = "type")] pub category_type: String }

#[derive(Serialize, Deserialize)]
pub struct AccountImportSettings { 
  pub id: i64, 
  pub account_id: i64, 
  pub csv_sign_logic: String, 
  pub created_at: String 
}

// Tauri command stubs
#[tauri::command]
pub fn get_accounts(app: AppHandle) -> Result<Vec<Account>, String> {
  // Open SQLite connection
  let path = get_db_path(&app);
  let conn = Connection::open(path).map_err(|e| e.to_string())?;
  // 알파벳 순서로 계좌 조회
  let mut stmt = conn.prepare("SELECT id, name, type, description, created_at FROM accounts ORDER BY name").map_err(|e| e.to_string())?;
  let rows = stmt.query_map([], |row| {
    let id: i64 = row.get(0)?;
    let name: String = row.get(1)?;
    let account_type: String = row.get(2)?;
    let description: Option<String> = row.get(3)?;
    let created_at: String = row.get(4)?;
    // 거래 합계로 잔액 계산
    let sum: f64 = conn.query_row(
      "SELECT IFNULL(SUM(amount), 0) FROM transactions WHERE account_id = ?1",
      params![id],
      |r| r.get(0),
    ).unwrap_or(0.0);
    let balance = sum;
    Ok(Account { id, name, account_type, balance, description, created_at })
  }).map_err(|e| e.to_string())?;
  let mut accounts = Vec::new();
  for account in rows {
    accounts.push(account.map_err(|e| e.to_string())?);
  }
  Ok(accounts)
}

#[tauri::command]
pub fn create_account(app: AppHandle, name: String, account_type: String, balance: Option<f64>) -> Result<Vec<Account>, String> {
    // Open SQLite connection
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Insert new account with initial balance (default to 0 if not provided)
    let initial_balance = balance.unwrap_or(0.0);
    conn.execute(
        "INSERT INTO accounts (name, type, balance, description) VALUES (?1, ?2, ?3, ?4)",
        params![name, account_type, initial_balance, None::<String>],
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
        "UPDATE accounts SET name = ?1, type = ?2, balance = ?3, description = ?4 WHERE id = ?5",
        params![account.name, account.account_type, account.balance, account.description, account.id],
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
        .prepare("SELECT id, date, account_id, type, category, amount, payee, notes, created_at FROM transactions ORDER BY date DESC")
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
                created_at: row.get(8)?,
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
    
    if transaction.transaction_type == "transfer" {
        // Transfer 거래: 출발 계좌에서 도착 계좌로 자금 이동
        // payee 형식: "from_account_id → to_account_id"
        let account_ids: Vec<i64> = transaction.payee
            .split(" → ")
            .filter_map(|s| s.trim().parse::<i64>().ok())
            .collect();
        if account_ids.len() != 2 {
            return Err("Invalid transfer format. Expected 'from_account_id → to_account_id'".to_string());
        }
        let from_account_id = account_ids[0];
        let to_account_id = account_ids[1];
        let transfer_amount = transaction.amount.abs();
        
        // 계좌 이름 조회
        let to_account_name: String = conn.query_row(
            "SELECT name FROM accounts WHERE id = ?1",
            params![to_account_id],
            |r| r.get(0),
        ).map_err(|e| e.to_string())?;
        
        let from_account_name: String = conn.query_row(
            "SELECT name FROM accounts WHERE id = ?1",
            params![from_account_id],
            |r| r.get(0),
        ).map_err(|e| e.to_string())?;
        
        // 출발 계좌 거래: 항상 -amount, payee에는 description만, notes에는 계좌 정보
        let from_note = format!("[To: {}]", to_account_name);
        conn.execute(
            "INSERT INTO transactions (date, account_id, type, category, amount, payee, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                transaction.date,
                from_account_id,
                "transfer",
                "Transfer",
                -transfer_amount,
                transaction.notes.clone().unwrap_or_default(), // description만
                from_note
            ],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![-transfer_amount, from_account_id],
        ).map_err(|e| e.to_string())?;
        // 도착 계좌 거래: 항상 +amount, payee에는 description만, notes에는 계좌 정보
        let to_note = format!("[From: {}]", from_account_name);
        conn.execute(
            "INSERT INTO transactions (date, account_id, type, category, amount, payee, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                transaction.date,
                to_account_id,
                "transfer",
                "Transfer",
                transfer_amount,
                transaction.notes.unwrap_or_default(), // description만
                to_note
            ],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![transfer_amount, to_account_id],
        ).map_err(|e| e.to_string())?;
    } else {
        // 일반 거래 처리
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
        ).map_err(|e| e.to_string())?;
        // 계좌 타입에 따른 잔액 변화 계산
        let account_type: String = conn.query_row(
            "SELECT type FROM accounts WHERE id = ?1",
            params![transaction.account_id],
            |r| r.get(0),
        ).map_err(|e| e.to_string())?;
        
        let balance_change = if account_type == "credit" {
            // Credit 계좌: 빚이 늘어나면 양수, 줄어들면 음수
            if transaction.transaction_type == "expense" {
                transaction.amount  // 빚 증가
            } else if transaction.transaction_type == "adjust" {
                if transaction.category == "Subtract" {
                    transaction.amount  // 빚 증가
                } else {
                    -transaction.amount  // 빚 감소
                }
            } else {
                -transaction.amount  // 빚 감소
            }
        } else {
            // 일반 계좌: 기존 로직
            if transaction.transaction_type == "expense" {
                -transaction.amount
            } else if transaction.transaction_type == "adjust" {
                if transaction.category == "Subtract" {
                    -transaction.amount
                } else {
                    transaction.amount
                }
            } else {
                transaction.amount
            }
        };
        conn.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![balance_change, transaction.account_id],
        ).map_err(|e| e.to_string())?;
    }
    get_transactions(app)
}

#[tauri::command]
pub fn update_transaction(app: AppHandle, transaction: Transaction) -> Result<Vec<Transaction>, String> {
    // Open connection
    let path = get_db_path(&app);
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Retrieve old transaction to adjust balance
    let mut sel = conn.prepare("SELECT type, amount, category FROM transactions WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = sel.query_map(params![transaction.id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, String>(2)?))
    }).map_err(|e| e.to_string())?;
    let (old_type, _old_amount, _old_category) = rows.next().ok_or("Transaction not found".to_string())?.map_err(|e| e.to_string())?;

    // Transfer 거래의 경우 특별한 처리
    if transaction.transaction_type == "transfer" {
        if old_type != "transfer" {
            // 기존 거래가 transfer가 아닌 경우, transfer로 변경
            drop(rows);
            drop(sel);
            
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![transaction.id]).map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            return create_transaction(app, transaction);
        } else {
            // 기존 거래가 transfer인 경우, 쌍을 찾아서 함께 업데이트
            drop(rows);
            drop(sel);
            
            // 같은 날짜, 같은 금액(절댓값), 같은 계좌에서 transfer 거래를 찾아서 쌍을 업데이트
            let transfer_amount = transaction.amount.abs();
            let transfer_pairs: Vec<(i64, i64, f64)> = {
                let mut stmt = conn.prepare("SELECT id, account_id, amount FROM transactions WHERE type = 'transfer' AND date = ?1 AND ABS(amount) = ?2 AND (account_id = ?3 OR account_id IN (SELECT account_id FROM transactions WHERE type = 'transfer' AND date = ?1 AND ABS(amount) = ?2 AND account_id != ?3))").map_err(|e| e.to_string())?;
                let rows = stmt.query_map(params![transaction.date, transfer_amount, transaction.account_id, transaction.date, transfer_amount, transaction.account_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, f64>(2)?))
                }).map_err(|e| e.to_string())?;
                
                let mut pairs: Vec<(i64, i64, f64)> = Vec::new();
                for row in rows {
                    pairs.push(row.map_err(|e| e.to_string())?);
                }
                pairs
            };
            
            if transfer_pairs.len() == 2 {
                // Transfer 쌍을 찾았으므로 함께 업데이트
                let tx = conn.transaction().map_err(|e| e.to_string())?;
                
                // 계좌 이름 조회
                let from_account_name: String = tx.query_row(
                    "SELECT name FROM accounts WHERE id = ?1",
                    params![transaction.account_id],
                    |r| r.get(0),
                ).map_err(|e| e.to_string())?;
                
                let to_account_id = if transfer_pairs[0].1 == transaction.account_id {
                    transfer_pairs[1].1
                } else {
                    transfer_pairs[0].1
                };
                
                let to_account_name: String = tx.query_row(
                    "SELECT name FROM accounts WHERE id = ?1",
                    params![to_account_id],
                    |r| r.get(0),
                ).map_err(|e| e.to_string())?;
                
                // 출발 계좌 거래 업데이트
                let from_note = format!("[To: {}]", to_account_name);
                tx.execute(
                    "UPDATE transactions SET payee = ?1, notes = ?2 WHERE id = ?3",
                    params![transaction.notes.clone().unwrap_or_default(), from_note, transaction.id],
                ).map_err(|e| e.to_string())?;
                
                // 도착 계좌 거래 업데이트
                let to_note = format!("[From: {}]", from_account_name);
                let to_transaction_id = if transfer_pairs[0].0 == transaction.id {
                    transfer_pairs[1].0
                } else {
                    transfer_pairs[0].0
                };
                tx.execute(
                    "UPDATE transactions SET payee = ?1, notes = ?2 WHERE id = ?3",
                    params![transaction.notes.unwrap_or_default(), to_note, to_transaction_id],
                ).map_err(|e| e.to_string())?;
                
                tx.commit().map_err(|e| e.to_string())?;
                return get_transactions(app);
            }
        }
    }

    // 계좌 타입 조회
    let account_type: String = conn.query_row(
        "SELECT type FROM accounts WHERE id = ?1",
        params![transaction.account_id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;
    
    // Compute old_effect based on existing transaction
    let old_effect = match (account_type.as_str(), old_type.as_str(), _old_category.as_str()) {
        ("credit", "expense", _) => _old_amount,
        ("credit", "transfer", _) => _old_amount,
        ("credit", "adjust", "Subtract") => _old_amount,
        ("credit", "adjust", _) => -_old_amount,
        ("credit", _, _) => -_old_amount,
        (_, "expense", _) => _old_amount,
        (_, "transfer", _) => -_old_amount,
        (_, "adjust", "Subtract") => _old_amount,
        (_, "adjust", _) => -_old_amount,
        _ => _old_amount,
    };
    
    // Compute new_effect based on transaction and account type
    let new_effect = match (account_type.as_str(), transaction.transaction_type.as_str(), transaction.category.as_str()) {
        ("credit", "expense", _) => transaction.amount,
        ("credit", "transfer", _) => transaction.amount,
        ("credit", "adjust", "Subtract") => transaction.amount,
        ("credit", "adjust", _) => -transaction.amount,
        ("credit", _, _) => -transaction.amount,
        (_, "expense", _) => -transaction.amount,
        (_, "transfer", _) => transaction.amount,
        (_, "adjust", "Subtract") => -transaction.amount,
        (_, "adjust", _) => transaction.amount,
        _ => transaction.amount,
    };
    let net = new_effect - old_effect;
    // Update transaction record
    conn.execute(
        "UPDATE transactions SET date = ?1, account_id = ?2, type = ?3, category = ?4, amount = ?5, payee = ?6, notes = ?7 WHERE id = ?8",
        params![
            transaction.date,
            transaction.account_id,
            transaction.transaction_type,
            transaction.category,
            transaction.amount,
            transaction.payee,
            transaction.notes.clone().unwrap_or_default(),
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
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Retrieve transaction to adjust balance
    let mut sel = conn.prepare("SELECT type, amount, account_id, category, date FROM transactions WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = sel.query_map(params![id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, i64>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?))
    }).map_err(|e| e.to_string())?;
    let (old_type, old_amount, acct_id, _old_category, old_date) = rows.next().ok_or("Transaction not found".to_string())?.map_err(|e| e.to_string())?;
    
    // Transfer 거래의 경우 쌍을 함께 삭제
    if old_type == "transfer" {
        drop(rows);
        drop(sel);
        
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        
        // 같은 날짜, 같은 금액(절댓값)의 transfer 거래 쌍을 찾기
        let transfer_amount = old_amount.abs();
        let transfer_pairs: Vec<(i64, i64, f64)> = {
            let mut stmt = tx.prepare("SELECT id, account_id, amount FROM transactions WHERE type = 'transfer' AND date = ?1 AND ABS(amount) = ?2").map_err(|e| e.to_string())?;
            let transfer_rows = stmt.query_map(params![old_date, transfer_amount], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, f64>(2)?))
            }).map_err(|e| e.to_string())?;
            
            let mut pairs: Vec<(i64, i64, f64)> = Vec::new();
            for row in transfer_rows {
                pairs.push(row.map_err(|e| e.to_string())?);
            }
            pairs
        };
        
        // Transfer 쌍을 모두 삭제하고 잔액 조정
        for (pair_id, pair_account_id, pair_amount) in &transfer_pairs {
            // 계좌 타입 조회
            let account_type: String = tx.query_row(
                "SELECT type FROM accounts WHERE id = ?1",
                params![pair_account_id],
                |r| r.get(0),
            ).map_err(|e| e.to_string())?;
            
            let balance_change = if account_type == "credit" {
                -pair_amount  // Credit 계좌: Transfer 삭제 시 반대 부호
            } else {
                -pair_amount  // 일반 계좌: Transfer 삭제 시 반대 부호
            };
            
            // 거래 삭제
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![pair_id]).map_err(|e| e.to_string())?;
            // 잔액 조정
            tx.execute(
                "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
                params![balance_change, pair_account_id],
            ).map_err(|e| e.to_string())?;
        }
        
        tx.commit().map_err(|e| e.to_string())?;
        return get_transactions(app);
    }
    
    // 일반 거래 삭제 (기존 로직)
    // 계좌 타입 조회
    let account_type: String = conn.query_row(
        "SELECT type FROM accounts WHERE id = ?1",
        params![acct_id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;
    
    let balance_change = if account_type == "credit" {
        // Credit 계좌: 삭제 시 반대 효과
        if old_type == "expense" { 
            -old_amount  // 빚 감소
        } else if old_type == "adjust" {
            if _old_category == "Subtract" {
                -old_amount  // 빚 감소
            } else {
                old_amount  // 빚 증가
            }
        } else { 
            old_amount  // 빚 증가
        }
    } else {
        // 일반 계좌: 기존 로직
        if old_type == "expense" { 
            old_amount 
        } else if old_type == "adjust" {
            if _old_category == "Subtract" {
                old_amount
            } else {
                -old_amount
            }
        } else { 
            -old_amount 
        }
    };
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
            "SELECT id, date, account_id, type, category, amount, payee, notes, created_at FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok(Transaction {
                id: row.get(0)?, date: row.get(1)?, account_id: row.get(2)?,
                transaction_type: row.get(3)?, category: row.get(4)?, amount: row.get(5)?,
                payee: row.get(6)?, notes: row.get(7)?, created_at: row.get(8)?,
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
        // Apply update
        update_transaction(app.clone(), updated)?;
    }
    get_transactions(app)
}



#[tauri::command]
pub fn import_transactions(app: AppHandle, transactions: Vec<Transaction>) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let mut conn = Connection::open(&path).map_err(|e| e.to_string())?;
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
    
    // Transfer 거래 정보를 추적하기 위한 추가 키셋
    let transfer_keys: HashSet<(String, i64)> = {
        let mut stmt = tx.prepare("SELECT date, amount FROM transactions WHERE type = 'transfer'").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            let date: String = row.get(0)?;
            let amt: f64 = row.get(1)?;
            let cents = (amt * 100.0).round() as i64;
            Ok((date, cents))
        }).map_err(|e| e.to_string())?;
        let mut set = HashSet::new();
        for entry in rows {
            let key = entry.map_err(|e| e.to_string())?;
            set.insert(key);
        }
        set
    };

    // Track which transactions were actually inserted
    let mut inserted_transactions = Vec::new();

    for t in &transactions {
        if t.date.is_empty() { return Err("Missing date".into()); }
        
        // Create a copy for processing
        let t_copy = t.clone();
        
        // Skip duplicates only if matching a pre-existing record (date, amount, payee)
        let cents = (t_copy.amount * 100.0).round() as i64;
        let key = (t_copy.date.clone(), cents, t_copy.payee.clone());
        
        // 일반 중복 체크
        if existing_keys.contains(&key) {
            continue;
        }
        
        // Transfer 거래와의 중복 체크 (같은 날짜, 같은 금액)
        let transfer_key = (t_copy.date.clone(), cents);
        if transfer_keys.contains(&transfer_key) {
            // Transfer 거래가 이미 있는 경우, 사용자에게 경고를 주기 위해 특별한 처리
            // 여기서는 건너뛰지만, 실제로는 사용자가 선택할 수 있도록 UI에서 처리하는 것이 좋음
            continue;
        }
        
        // Insert new transaction
        tx.execute(
            "INSERT INTO transactions (date, account_id, type, category, amount, payee, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![t_copy.date, t_copy.account_id, t_copy.transaction_type, t_copy.category, t_copy.amount, t_copy.payee, t_copy.notes.clone().unwrap_or_default()],
        ).map_err(|e| e.to_string())?;
        
        let balance_change = if t_copy.transaction_type == "expense" {
            -t_copy.amount
        } else if t_copy.transaction_type == "transfer" {
            // Transfer 거래는 이미 올바른 부호로 저장되어 있음
            // Transfer Out: 음수 금액 (잔액 차감)
            // Transfer In: 양수 금액 (잔액 증가)
            t_copy.amount
        } else if t_copy.transaction_type == "adjust" {
            // Adjust 거래는 category에 따라 부호 결정
            if t_copy.category == "Subtract" {
                -t_copy.amount
            } else {
                t_copy.amount
            }
        } else {
            t_copy.amount
        };
        
        tx.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![balance_change, t_copy.account_id]
        ).map_err(|e| e.to_string())?;
        
        // Track this transaction as successfully inserted
        inserted_transactions.push(t_copy);
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Return only the newly created transactions
    let mut newly_created = Vec::new();
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    for t in &inserted_transactions {
        // Find the newly created transaction by matching its properties
        let mut stmt = conn.prepare("SELECT id, date, account_id, type, category, amount, payee, notes, created_at FROM transactions WHERE date = ?1 AND account_id = ?2 AND type = ?3 AND category = ?4 AND amount = ?5 AND payee = ?6 ORDER BY id DESC LIMIT 1").map_err(|e| e.to_string())?;
        if let Ok(row) = stmt.query_row(params![t.date, t.account_id, t.transaction_type, t.category, t.amount, t.payee], |row| {
            Ok(Transaction {
                id: row.get(0)?,
                date: row.get(1)?,
                account_id: row.get(2)?,
                transaction_type: row.get(3)?,
                category: row.get(4)?,
                amount: row.get(5)?,
                payee: row.get(6)?,
                notes: row.get(7)?,
                created_at: row.get(8)?,
            })
        }) {
            newly_created.push(row);
        }
    }
    
    Ok(newly_created)
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
    
    // Debug: Log the date range and query parameters
    println!("get_spending_by_category: start_date={}, end_date={}", start_date, end_date);
    
    // First, let's see what transactions exist in the date range
    let mut debug_stmt = conn.prepare("SELECT date, category, amount, type FROM transactions WHERE date BETWEEN ?1 AND ?2 ORDER BY date").map_err(|e| e.to_string())?;
    let debug_rows = debug_stmt.query_map(params![start_date, end_date], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, f64>(2)?, r.get::<_, String>(3)?))
    }).map_err(|e| e.to_string())?;
    
    println!("All transactions in date range:");
    for row in debug_rows {
        let (date, category, amount, ttype) = row.map_err(|e| e.to_string())?;
        println!("  {} | {} | {} | {}", date, category, amount, ttype);
    }
    
    // Now get expense transactions specifically
    let mut expense_stmt = conn.prepare("SELECT date, category, amount FROM transactions WHERE type = 'expense' AND date BETWEEN ?1 AND ?2 ORDER BY date").map_err(|e| e.to_string())?;
    let expense_rows = expense_stmt.query_map(params![start_date, end_date], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, f64>(2)?))
    }).map_err(|e| e.to_string())?;
    
    println!("Expense transactions in date range:");
    for row in expense_rows {
        let (date, category, amount) = row.map_err(|e| e.to_string())?;
        println!("  {} | {} | {}", date, category, amount);
    }
    
    // Use ABS(amount) to handle negative expense amounts correctly
    let mut stmt = conn.prepare("SELECT category, SUM(ABS(amount)) as total FROM transactions WHERE type = 'expense' AND date BETWEEN ?1 AND ?2 GROUP BY category ORDER BY total DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![start_date, end_date], |r| {
        let category: String = r.get(0)?;
        let total: f64 = r.get(1)?;
        println!("Found spending: category='{}', total={}", category, total);
        Ok(json!({ "category": category, "total": total }))
    }).map_err(|e| e.to_string())?;
    
    let mut out = Vec::new(); 
    for r in rows { 
        out.push(r.map_err(|e| e.to_string())?); 
    }
    
    println!("get_spending_by_category: returning {} results", out.len());
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
    
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    // Check source database tables and data
    let _tables: Vec<String> = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>().map_err(|e| e.to_string())?;
    
    // Check categories in source
    let _category_count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    
    let mut dest = rusqlite::Connection::open(&save_path).map_err(|e| e.to_string())?;
    {
        let backup = rusqlite::backup::Backup::new(&conn, &mut dest).map_err(|e| e.to_string())?;
        backup.step(-1).map_err(|e| e.to_string())?;
        // backup은 여기서 drop됨
    }
    
    // Verify backup was successful
    let _dest_tables: Vec<String> = dest.prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>().map_err(|e| e.to_string())?;
    
    let _dest_category_count: i64 = dest.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    
    match dest.close() {
        Ok(_) => Ok(()),
        Err((_, e)) => Err(format!("Failed to close backup DB: {}", e)),
    }
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
  
  // 파일 쓰기 전 권한 체크 (cross-platform)
  match std::fs::metadata(&db_path) {
    Ok(meta) => {
      if meta.permissions().readonly() {
        return Err("Database file is read-only. Please check permissions.".to_string());
      }
    },
    Err(_) => {
      // Ignore metadata errors
    }
  }
  
  match std::fs::write(&db_path, data) {
    Ok(_) => {
      // Verify the imported database
      let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
      let _tables: Vec<String> = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .map_err(|e| e.to_string())?
          .query_map([], |row| row.get(0))
          .map_err(|e| e.to_string())?
          .collect::<Result<Vec<String>, _>>().map_err(|e| e.to_string())?;
      
      let _category_count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
          .map_err(|e| e.to_string())?;
      
      Ok(())
    },
    Err(e) => {
      Err(format!("Failed to write database file: {}", e))
    }
  }
}

// Account import settings management
#[tauri::command]
pub fn get_account_import_settings(app: AppHandle) -> Result<Vec<AccountImportSettings>, String> {
  let path = get_db_path(&app);
  let conn = Connection::open(path).map_err(|e| e.to_string())?;
  let mut stmt = conn.prepare("SELECT id, account_id, csv_sign_logic, created_at FROM account_import_settings ORDER BY account_id").map_err(|e| e.to_string())?;
  let rows = stmt.query_map([], |row| {
    Ok(AccountImportSettings {
      id: row.get(0)?,
      account_id: row.get(1)?,
      csv_sign_logic: row.get(2)?,
      created_at: row.get(3)?,
    })
  }).map_err(|e| e.to_string())?;
  let mut settings = Vec::new();
  for setting in rows {
    settings.push(setting.map_err(|e| e.to_string())?);
  }
  Ok(settings)
}

#[tauri::command]
pub fn update_account_import_settings(app: AppHandle, account_id: i64, csv_sign_logic: String) -> Result<Vec<AccountImportSettings>, String> {
  let path = get_db_path(&app);
  let conn = Connection::open(path).map_err(|e| e.to_string())?;
  
  // Check if settings exist for this account
  let exists: i64 = conn.query_row(
    "SELECT COUNT(*) FROM account_import_settings WHERE account_id = ?1",
    params![account_id],
    |r| r.get(0),
  ).map_err(|e| e.to_string())?;
  
  if exists > 0 {
    // Update existing settings
    conn.execute(
      "UPDATE account_import_settings SET csv_sign_logic = ?1 WHERE account_id = ?2",
      params![csv_sign_logic, account_id],
    ).map_err(|e| e.to_string())?;
  } else {
    // Insert new settings
    conn.execute(
      "INSERT INTO account_import_settings (account_id, csv_sign_logic) VALUES (?1, ?2)",
      params![account_id, csv_sign_logic],
    ).map_err(|e| e.to_string())?;
  }
  
  get_account_import_settings(app)
}

#[tauri::command]
pub fn get_csv_sign_logic_for_account(app: AppHandle, account_id: i64) -> Result<String, String> {
  let path = get_db_path(&app);
  let conn = Connection::open(path).map_err(|e| e.to_string())?;
  
  // Get the CSV sign logic for the account, default to 'standard' if not set
  let csv_sign_logic: String = conn.query_row(
    "SELECT csv_sign_logic FROM account_import_settings WHERE account_id = ?1",
    params![account_id],
    |r| r.get(0),
  ).unwrap_or("standard".to_string());
  
  Ok(csv_sign_logic)
}

// Function to get home directory
#[tauri::command]
pub fn home_dir() -> Result<String, String> {
    if let Ok(home) = env::var("HOME") {
        Ok(home)
    } else {
        Err("Home directory not found".to_string())
    }
}

// Function to find OneDrive path
#[tauri::command]
pub fn get_onedrive_path() -> Result<String, String> {
    // Try to find OneDrive path from environment variables (Windows)
    if let Ok(onedrive) = env::var("ONEDRIVE") {
        return Ok(onedrive);
    }
    
    // Try OneDrive for Business (Windows)
    if let Ok(onedrive_business) = env::var("ONEDRIVECOMMERCIAL") {
        return Ok(onedrive_business);
    }
    
    // Try to find OneDrive in common Windows locations
    if let Ok(user_profile) = env::var("USERPROFILE") {
        let possible_paths = vec![
            format!("{}\\OneDrive", user_profile),
            format!("{}\\OneDrive - Personal", user_profile),
            format!("{}\\OneDrive - Company", user_profile),
        ];
        
        for path in possible_paths {
            if std::path::Path::new(&path).exists() {
                return Ok(path);
            }
        }
    }
    
    // Try to find OneDrive in macOS common locations
    if let Ok(home_dir) = env::var("HOME") {
        let possible_paths = vec![
            format!("{}/OneDrive", home_dir),
            format!("{}/OneDrive - Personal", home_dir),
            format!("{}/OneDrive - Company", home_dir),
            format!("{}/Library/CloudStorage/OneDrive-Personal", home_dir),
            format!("{}/Library/CloudStorage/OneDrive-Business", home_dir),
            format!("{}/Library/CloudStorage/OneDrive", home_dir),
        ];
        
        for path in possible_paths {
            if std::path::Path::new(&path).exists() {
                return Ok(path);
            }
        }
    }
    
    // If OneDrive is not found, return an error
    Err("OneDrive path not found".to_string())
}

// Function to create backup folder
#[tauri::command]
pub fn create_backup_folder(folder_path: String) -> Result<(), String> {
    match std::fs::create_dir_all(&folder_path) {
        Ok(_) => {
              Ok(())
        },
        Err(e) => {
            println!("[create_backup_folder] Failed to create folder: {}", e);
            Err(format!("Failed to create backup folder: {}", e))
        }
    }
}

 