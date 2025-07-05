use rusqlite::{Connection, params, Result};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use serde::{Serialize, Deserialize};
use serde_json::{Value, json};
use std::env;
use std::fs;
use std::collections::HashSet;
use chrono::Utc;



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
    CREATE TABLE IF NOT EXISTS transfer_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT
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
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
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
  // Migrate: add transfer_id column to transactions if missing
  let _ = conn.execute(
    "ALTER TABLE transactions ADD COLUMN transfer_id INTEGER",
    [],
  );
  
  // Migrate: add category_id column to transactions if missing
  let _ = conn.execute(
    "ALTER TABLE transactions ADD COLUMN category_id INTEGER",
    [],
  );
  
  // Migrate: update existing transactions to use category_id
  let _ = conn.execute(
    "UPDATE transactions SET category_id = (SELECT id FROM categories WHERE name = transactions.category LIMIT 1) WHERE category_id IS NULL",
    [],
  );
  
  // Migrate: add category_id column to budgets if missing
  let _ = conn.execute(
    "ALTER TABLE budgets ADD COLUMN category_id INTEGER",
    [],
  );
  
  // Migrate: update existing budgets to use category_id
  let _ = conn.execute(
    "UPDATE budgets SET category_id = (SELECT id FROM categories WHERE name = budgets.category LIMIT 1) WHERE category_id IS NULL",
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
  pub category_id: i64,
  pub amount: f64,
  pub payee: String,
  pub notes: Option<String>,
  pub transfer_id: Option<i64>,
  #[serde(default)]
  pub created_at: String,
}



#[derive(Serialize, Deserialize)]
pub struct Budget { pub id: i64, pub category_id: i64, pub amount: f64, pub month: String, pub notes: Option<String>, pub created_at: String }

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
    let balance: f64 = conn.query_row(
      "SELECT IFNULL(SUM(amount), 0) FROM transactions WHERE account_id = ?1",
      params![id],
      |r| r.get(0),
    ).unwrap_or(0.0);
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
        .prepare("SELECT t.id, t.date, t.account_id, t.type, t.category_id, t.amount, t.payee, t.notes, t.transfer_id, t.created_at FROM transactions t ORDER BY t.date DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let date: Option<String> = row.get(1)?;
            let date = date.unwrap_or_else(|| {
                // NULL인 경우 현재 날짜를 기본값으로 사용
                Utc::now().format("%Y-%m-%d").to_string()
            });
            
            Ok(Transaction {
                id: row.get(0)?,
                date: date,
                account_id: row.get(2)?,
                transaction_type: row.get(3)?,
                category_id: row.get(4)?,
                amount: row.get(5)?,
                payee: row.get(6)?,
                notes: row.get(7)?,
                transfer_id: row.get(8)?,
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
        
        // Transfer ID 생성 (기존 transfer_id 중 최대값 + 1)
        let transfer_id: i64 = conn.query_row(
            "SELECT COALESCE(MAX(transfer_id), 0) + 1 FROM transactions WHERE transfer_id IS NOT NULL",
            [],
            |r| r.get(0)
        ).unwrap_or(1);
        
        // Transfer 카테고리 ID 조회
        let transfer_category_id: i64 = conn.query_row(
            "SELECT id FROM categories WHERE name = 'Transfer' LIMIT 1",
            [],
            |r| r.get(0)
        ).unwrap_or(1); // 기본값으로 1 사용
        
        // 출발 계좌 거래: 항상 -abs(amount), payee에는 description만, notes에는 계좌 정보
        let from_note = format!("[To: {}]", to_account_name);
        let description = transaction.notes.clone().unwrap_or_default(); // description만
        let from_amount = -transfer_amount.abs();
        conn.execute(
            "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                transaction.date,
                from_account_id,
                "transfer",
                transfer_category_id,
                from_amount,
                description.clone(), // payee: description만
                from_note,           // notes: [To: 도착계좌이름]
                transfer_id
            ],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![from_amount, from_account_id],
        ).map_err(|e| e.to_string())?;
        // 도착 계좌 거래: 항상 +abs(amount), payee에는 description만, notes에는 계좌 정보
        let to_note = format!("[From: {}]", from_account_name);
        let to_amount = transfer_amount.abs();
        conn.execute(
            "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                transaction.date,
                to_account_id,
                "transfer",
                transfer_category_id,
                to_amount,
                description, // payee: description만
                to_note,     // notes: [From: 출발계좌이름]
                transfer_id
            ],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
            params![to_amount, to_account_id],
        ).map_err(|e| e.to_string())?;
    } else {
        // 일반 거래 처리
        let mut amount = transaction.amount;
        let mut final_category_id = transaction.category_id;
        
        if transaction.transaction_type == "expense" {
            amount = -amount.abs();
        } else if transaction.transaction_type == "income" {
            amount = amount.abs();
        } else if transaction.transaction_type == "adjust" {
            // Adjust 카테고리 이름으로 ID 찾기
            let adjust_category_name = if amount < 0.0 { "Subtract" } else { "Add" };
            let adjust_category_id: i64 = conn.query_row(
                "SELECT id FROM categories WHERE name = ?1 LIMIT 1",
                params![adjust_category_name],
                |r| r.get(0)
            ).unwrap_or(1);
            final_category_id = adjust_category_id;
            
            if adjust_category_name == "Subtract" {
                amount = -amount.abs();
            } else {
                amount = amount.abs();
            }
        }
        conn.execute(
            "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                transaction.date,
                transaction.account_id,
                transaction.transaction_type,
                final_category_id,
                amount,
                transaction.payee,
                transaction.notes.clone().unwrap_or_default(),
                None::<i64>
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
                // Get category name from database
                let category_name: String = conn.query_row(
                    "SELECT name FROM categories WHERE id = ?1",
                    params![transaction.category_id],
                    |r| r.get(0)
                ).unwrap_or_else(|_| "Add".to_string());
                
                if category_name == "Subtract" {
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
                // Get category name from database
                let category_name: String = conn.query_row(
                    "SELECT name FROM categories WHERE id = ?1",
                    params![transaction.category_id],
                    |r| r.get(0)
                ).unwrap_or_else(|_| "Add".to_string());
                
                if category_name == "Subtract" {
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
            
            // 새로운 transfer_id 생성
            let new_transfer_id: i64 = conn.query_row(
                "SELECT COALESCE(MAX(transfer_id), 0) + 1 FROM transactions WHERE transfer_id IS NOT NULL",
                [],
                |r| r.get(0)
            ).unwrap_or(1);
            
            // To Account 정보 추출
            let to_account_id = if let Some(notes) = &transaction.notes {
                if let Some(to_match) = notes.strip_prefix("[To: ") {
                    if let Some(to_account_name) = to_match.strip_suffix("]") {
                        // 계좌 이름으로 ID 찾기
                        conn.query_row(
                            "SELECT id FROM accounts WHERE name = ?1",
                            params![to_account_name],
                            |r| r.get::<_, i64>(0)
                        ).ok()
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };
            
            if let Some(to_account_id) = to_account_id {
                // 출발 계좌 이름 조회
                let from_account_name: String = conn.query_row(
                    "SELECT name FROM accounts WHERE id = ?1",
                    params![transaction.account_id],
                    |r| r.get(0),
                ).map_err(|e| e.to_string())?;
                
                // 도착 계좌 이름 조회
                let to_account_name: String = conn.query_row(
                    "SELECT name FROM accounts WHERE id = ?1",
                    params![to_account_id],
                    |r| r.get(0),
                ).map_err(|e| e.to_string())?;
                
                // Transfer 카테고리 ID 조회
                let transfer_category_id: i64 = conn.query_row(
                    "SELECT id FROM categories WHERE name = 'Transfer' LIMIT 1",
                    [],
                    |r| r.get(0)
                ).unwrap_or(1);
                
                let tx = conn.transaction().map_err(|e| e.to_string())?;
                
                // 기존 거래 삭제
                tx.execute("DELETE FROM transactions WHERE id = ?1", params![transaction.id]).map_err(|e| e.to_string())?;
                
                // 출발 계좌 거래 생성 (음수 금액)
                let from_note = format!("[To: {}]", to_account_name);
                tx.execute(
                    "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![transaction.date, transaction.account_id, "transfer", transfer_category_id, -transaction.amount.abs(), transaction.payee, from_note, new_transfer_id],
                ).map_err(|e| e.to_string())?;
                
                // 도착 계좌 거래 생성 (양수 금액)
                let to_note = format!("[From: {}]", from_account_name);
                tx.execute(
                    "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![transaction.date, to_account_id, "transfer", transfer_category_id, transaction.amount.abs(), transaction.payee, to_note, new_transfer_id],
                ).map_err(|e| e.to_string())?;
                
                tx.commit().map_err(|e| e.to_string())?;
                return get_transactions(app);
            } else {
                // To Account를 찾을 수 없는 경우, 일반적인 방식으로 처리
                let tx = conn.transaction().map_err(|e| e.to_string())?;
                tx.execute("DELETE FROM transactions WHERE id = ?1", params![transaction.id]).map_err(|e| e.to_string())?;
                tx.commit().map_err(|e| e.to_string())?;
                return create_transaction(app, transaction);
            }
        } else {
            // 기존 거래가 transfer인 경우, 쌍을 찾아서 함께 업데이트
            drop(rows);
            drop(sel);
            
            // 기존 Transfer ID 찾기
            let transfer_id: Option<i64> = conn.query_row(
                "SELECT transfer_id FROM transactions WHERE id = ?1",
                params![transaction.id],
                |r| r.get(0),
            ).ok();
            
            if let Some(transfer_id) = transfer_id {
                // 도착 거래 찾기: 같은 transfer_id를 가진 다른 계좌의 거래
                let to_transaction: Option<(i64, i64, f64)> = conn.prepare(
                    "SELECT id, account_id, amount FROM transactions WHERE transfer_id = ?1 AND account_id != ?2 LIMIT 1"
                ).ok()
                .and_then(|mut stmt| stmt.query_row(
                    params![transfer_id, transaction.account_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                ).ok());
                // 기존 도착 계좌 ID
                let old_to_account_id = to_transaction.map(|(_, id, _)| id).unwrap_or(transaction.account_id);
                // 새로운 도착 계좌 ID (notes에서 추출)
                let new_to_account_id = if let Some(notes) = &transaction.notes {
                    if let Some(to_match) = notes.strip_prefix("[To: ") {
                        if let Some(to_account_name) = to_match.strip_suffix("]") {
                            // 계좌 이름으로 ID 찾기
                            if let Ok(account_id) = conn.query_row(
                                "SELECT id FROM accounts WHERE name = ?1",
                                params![to_account_name],
                                |r| r.get::<_, i64>(0)
                            ) {
                                account_id
                            } else {
                                old_to_account_id // 찾지 못하면 기존 계좌 유지
                            }
                        } else {
                            old_to_account_id
                        }
                    } else {
                        old_to_account_id
                    }
                } else {
                    old_to_account_id
                };
                
                // 출발 계좌 이름 조회
                let from_account_name: String = conn.query_row(
                    "SELECT name FROM accounts WHERE id = ?1",
                    params![transaction.account_id],
                    |r| r.get(0),
                ).map_err(|e| e.to_string())?;
                
                // 새로운 도착 계좌 이름 조회
                let new_to_account_name: String = conn.query_row(
                    "SELECT name FROM accounts WHERE id = ?1",
                    params![new_to_account_id],
                    |r| r.get(0),
                ).map_err(|e| e.to_string())?;
                
                // To Account가 변경된 경우
                if new_to_account_id != old_to_account_id {
                    // 기존 도착 계좌 거래 삭제
                    if let Some((to_id, _old_to_account_id, _)) = to_transaction {
                        conn.execute("DELETE FROM transactions WHERE id = ?1", params![to_id]).map_err(|e| e.to_string())?;
                    }
                    // Transfer 카테고리 ID 조회
                    let transfer_category_id: i64 = conn.query_row(
                        "SELECT id FROM categories WHERE name = 'Transfer' LIMIT 1",
                        [],
                        |r| r.get(0)
                    ).unwrap_or(1);
                    
                    // 새로운 도착 계좌 거래 생성
                    let new_to_note = format!("[From: {}]", from_account_name);
                    let new_to_amount = transaction.amount.abs();
                    conn.execute(
                        "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![transaction.date, new_to_account_id, "transfer", transfer_category_id, new_to_amount, transaction.payee, new_to_note, transfer_id],
                    ).map_err(|e| e.to_string())?;
                }
                
                // 출발 계좌 거래의 기존 정보 모두 DB에서 읽어온다
                let (from_date, _from_account_id, _): (String, i64, f64) = conn.query_row(
                    "SELECT date, account_id, amount FROM transactions WHERE id = ?1",
                    params![transaction.id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                ).map_err(|e| e.to_string())?;
                
                // 출발 계좌 거래 업데이트 (payee, notes만 변경, account_id/amount/date는 기존 값 유지)
                let from_note = format!("[To: {}]", new_to_account_name);
                conn.execute(
                    "UPDATE transactions SET payee = ?1, notes = ?2 WHERE id = ?3",
                    params![transaction.payee, from_note, transaction.id],
                ).map_err(|e| e.to_string())?;
                
                // To Account가 변경되지 않은 경우에도 도착 계좌 거래의 Description 및 amount(항상 양수) 업데이트
                if new_to_account_id == old_to_account_id {
                    if let Some((to_id, _old_to_account_id, _)) = to_transaction {
                        let to_note = format!("[From: {}]", from_account_name);
                        let new_to_amount = transaction.amount.abs(); // 새로운 금액 사용
                        
                        conn.execute(
                            "UPDATE transactions SET payee = ?1, notes = ?2, amount = ?3, date = ?4 WHERE id = ?5",
                            params![transaction.payee, to_note, new_to_amount, from_date, to_id],
                        ).map_err(|e| e.to_string())?;
                    }
                }
                
                // Transfer 거래는 특별한 처리만 하고 끝
                return get_transactions(app);
            } else {
                // transfer_id가 없는 경우 (기존 방식으로 처리)
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
    
    // Adjust 거래의 경우 카테고리 이름으로 ID 찾기
    let mut category_id = transaction.category_id;
    if transaction.transaction_type == "adjust" {
        let adjust_category_name = if transaction.amount < 0.0 { "Subtract" } else { "Add" };
        category_id = conn.query_row(
            "SELECT id FROM categories WHERE name = ?1 LIMIT 1",
            params![adjust_category_name],
            |r| r.get(0)
        ).unwrap_or(1);
    }
    
    // Compute new_effect based on transaction and account type
    let category_name = if transaction.transaction_type == "adjust" {
        if transaction.amount < 0.0 { "Subtract".to_string() } else { "Add".to_string() } 
    } else {
        // category_id로 카테고리 이름 조회
        conn.query_row(
            "SELECT name FROM categories WHERE id = ?1",
            params![transaction.category_id],
            |r| r.get(0)
        ).unwrap_or_else(|_| "Unknown".to_string())
    };
    
    let new_effect = match (account_type.as_str(), transaction.transaction_type.as_str(), category_name.as_str()) {
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
    let mut new_amount = transaction.amount;
    if transaction.transaction_type == "expense" {
        new_amount = -new_amount.abs();
    } else if transaction.transaction_type == "income" {
        new_amount = new_amount.abs();
    } else if transaction.transaction_type == "adjust" {
                // Adjust 거래의 경우 카테고리 이름으로 ID 찾기
                let adjust_category_name = if transaction.amount < 0.0 { "Subtract" } else { "Add" };
                let _adjust_category_id: i64 = conn.query_row(
                    "SELECT id FROM categories WHERE name = ?1 LIMIT 1",
                    params![adjust_category_name],
                    |r| r.get(0)
                ).unwrap_or(1);
                
                if adjust_category_name == "Subtract" {
            new_amount = -new_amount.abs();
        } else {
            new_amount = new_amount.abs();
        }
    }
    conn.execute(
        "UPDATE transactions SET date = ?1, account_id = ?2, type = ?3, category_id = ?4, amount = ?5, payee = ?6, notes = ?7, transfer_id = ?8 WHERE id = ?9",
        params![
            transaction.date,
            transaction.account_id,
            transaction.transaction_type,
            category_id,
            new_amount,
            transaction.payee,
            transaction.notes.clone().unwrap_or_default(),
            transaction.transfer_id,
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
    let mut sel = conn.prepare("SELECT type, amount, account_id, category_id, date, payee FROM transactions WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = sel.query_map(params![id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, i64>(2)?, row.get::<_, i64>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?))
    }).map_err(|e| e.to_string())?;
    let (old_type, old_amount, acct_id, _old_category_id, _old_date, _old_payee) = rows.next().ok_or("Transaction not found".to_string())?.map_err(|e| e.to_string())?;
    
    // Transfer 거래의 경우 출발 거래(음수)만 페어 삭제
    if old_type == "transfer" && old_amount < 0.0 {
        drop(rows);
        drop(sel);
        
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        
        // Transfer ID 찾기
        let transfer_id: Option<i64> = tx.query_row(
            "SELECT transfer_id FROM transactions WHERE id = ?1",
            params![id],
            |r| r.get(0),
        ).ok();
        
        if let Some(transfer_id) = transfer_id {
            // 도착 거래 찾기: 같은 transfer_id를 가진 다른 계좌의 거래
            let to_transaction: Option<(i64, i64, f64)> = tx.prepare(
                "SELECT id, account_id, amount FROM transactions WHERE transfer_id = ?1 AND account_id != ?2 LIMIT 1"
            ).ok()
            .and_then(|mut stmt| stmt.query_row(
                params![transfer_id, acct_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            ).ok());
            
            // 출발 거래 삭제
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
            // 도착 거래 삭제
            if let Some((to_id, _to_account_id, _)) = to_transaction {
                tx.execute("DELETE FROM transactions WHERE id = ?1", params![to_id]).map_err(|e| e.to_string())?;
            }
            tx.commit().map_err(|e| e.to_string())?;
            return get_transactions(app);
        } else {
            // transfer_id가 없는 경우 기존 방식으로 처리
            let from_account_name: String = tx.query_row(
                "SELECT name FROM accounts WHERE id = ?1",
                params![acct_id],
                |r| r.get(0),
            ).map_err(|e| e.to_string())?;
            // 도착 거래 찾기: 같은 날짜, 같은 금액, type=transfer, account_id 다르고, notes=[From: 출발계좌이름], payee 동일
            let to_transaction: Option<(i64, i64, f64)> = tx.prepare(
                "SELECT id, account_id, amount FROM transactions WHERE type = 'transfer' AND date = ?1 AND ABS(amount) = ?2 AND account_id != ?3 AND notes = ?4 AND payee = ?5 LIMIT 1"
            ).ok()
            .and_then(|mut stmt| stmt.query_row(
                params![_old_date, old_amount.abs(), acct_id, format!("[From: {}]", from_account_name), _old_payee],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            ).ok());
            // 출발 거래 삭제
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
            // 도착 거래 삭제
            if let Some((to_id, _to_account_id, _)) = to_transaction {
                tx.execute("DELETE FROM transactions WHERE id = ?1", params![to_id]).map_err(|e| e.to_string())?;
            }
            tx.commit().map_err(|e| e.to_string())?;
            return get_transactions(app);
        }
    }
    
    // Transfer 거래의 경우 도착 거래(양수) 삭제 시에도 페어 삭제
    if old_type == "transfer" && old_amount > 0.0 {
        drop(rows);
        drop(sel);
        
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        
        // Transfer ID 찾기
        let transfer_id: Option<i64> = tx.query_row(
            "SELECT transfer_id FROM transactions WHERE id = ?1",
            params![id],
            |r| r.get(0),
        ).ok();
        
        if let Some(transfer_id) = transfer_id {
            // 출발 거래 찾기: 같은 transfer_id를 가진 다른 계좌의 거래
            let from_transaction: Option<(i64, i64, f64)> = tx.prepare(
                "SELECT id, account_id, amount FROM transactions WHERE transfer_id = ?1 AND account_id != ?2 LIMIT 1"
            ).ok()
            .and_then(|mut stmt| stmt.query_row(
                params![transfer_id, acct_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            ).ok());
            
            // 도착 거래 삭제
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
            // 출발 거래 삭제
            if let Some((from_id, _from_account_id, _)) = from_transaction {
                tx.execute("DELETE FROM transactions WHERE id = ?1", params![from_id]).map_err(|e| e.to_string())?;
            }
            tx.commit().map_err(|e| e.to_string())?;
            return get_transactions(app);
        } else {
            // transfer_id가 없는 경우 기존 방식으로 처리
            let to_account_name: String = tx.query_row(
                "SELECT name FROM accounts WHERE id = ?1",
                params![acct_id],
                |r| r.get(0),
            ).map_err(|e| e.to_string())?;
            // 출발 거래 찾기: 같은 날짜, 같은 금액, type=transfer, account_id 다르고, notes=[To: 도착계좌이름], payee 동일
            let from_transaction: Option<(i64, i64, f64)> = tx.prepare(
                "SELECT id, account_id, amount FROM transactions WHERE type = 'transfer' AND date = ?1 AND ABS(amount) = ?2 AND account_id != ?3 AND notes = ?4 AND payee = ?5 LIMIT 1"
            ).ok()
            .and_then(|mut stmt| stmt.query_row(
                params![_old_date, old_amount.abs(), acct_id, format!("[To: {}]", to_account_name), _old_payee],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            ).ok());
            // 도착 거래 삭제
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
            // 출발 거래 삭제
            if let Some((from_id, _from_account_id, _)) = from_transaction {
                tx.execute("DELETE FROM transactions WHERE id = ?1", params![from_id]).map_err(|e| e.to_string())?;
            }
            tx.commit().map_err(|e| e.to_string())?;
            return get_transactions(app);
        }
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
            // category_id로 카테고리 이름 조회
            let old_category_name: String = conn.query_row(
                "SELECT name FROM categories WHERE id = ?1",
                params![_old_category_id],
                |r| r.get(0)
            ).unwrap_or_else(|_| "Add".to_string());
            
            if old_category_name == "Subtract" {
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
            if _old_category_id == 2 { // Subtract 카테고리 ID
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
            "SELECT id, date, account_id, type, category_id, amount, payee, notes, transfer_id, created_at FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok(Transaction {
                id: row.get(0)?, date: row.get(1)?, account_id: row.get(2)?,
                transaction_type: row.get(3)?, category_id: row.get(4)?, amount: row.get(5)?,
                payee: row.get(6)?, notes: row.get(7)?, transfer_id: row.get(8)?, created_at: row.get(9)?,
            }),
        ).map_err(|e| e.to_string())?;
        // Merge partial changes
        let mut updated = existing.clone();
        if let Some(v) = changes.get("date").and_then(|v| v.as_str()) { updated.date = v.to_string(); }
        if let Some(v) = changes.get("account_id").and_then(|v| v.as_i64()) { updated.account_id = v; }
        if let Some(v) = changes.get("type").and_then(|v| v.as_str()) { updated.transaction_type = v.to_string(); }
        if let Some(v) = changes.get("category_id").and_then(|v| v.as_i64()) { updated.category_id = v; }
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
            "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![t_copy.date, t_copy.account_id, t_copy.transaction_type, t_copy.category_id, t_copy.amount, t_copy.payee, t_copy.notes.clone().unwrap_or_default(), None::<i64>],
        ).map_err(|e| e.to_string())?;
        
        let balance_change = if t_copy.transaction_type == "expense" {
            -t_copy.amount
        } else if t_copy.transaction_type == "transfer" {
            // Transfer 거래는 이미 올바른 부호로 저장되어 있음
            // Transfer Out: 음수 금액 (잔액 차감)
            // Transfer In: 양수 금액 (잔액 증가)
            t_copy.amount
        } else if t_copy.transaction_type == "adjust" {
            // Adjust 거래는 category_id에 따라 부호 결정
            let category_name: String = tx.query_row(
                "SELECT name FROM categories WHERE id = ?1",
                params![t_copy.category_id],
                |r| r.get(0)
            ).unwrap_or_else(|_| "Add".to_string());
            
            if category_name == "Subtract" {
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
        let mut stmt = conn.prepare("SELECT id, date, account_id, type, category_id, amount, payee, notes, transfer_id, created_at FROM transactions WHERE date = ?1 AND account_id = ?2 AND type = ?3 AND category_id = ?4 AND amount = ?5 AND payee = ?6 ORDER BY id DESC LIMIT 1").map_err(|e| e.to_string())?;
        if let Ok(row) = stmt.query_row(params![t.date, t.account_id, t.transaction_type, t.category_id, t.amount, t.payee], |row| {
            Ok(Transaction {
                id: row.get(0)?,
                date: row.get(1)?,
                account_id: row.get(2)?,
                transaction_type: row.get(3)?,
                category_id: row.get(4)?,
                amount: row.get(5)?,
                payee: row.get(6)?,
                notes: row.get(7)?,
                transfer_id: row.get(8)?,
                created_at: row.get(9)?,
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
    let mut stmt = conn.prepare("SELECT id, category_id, amount, month, notes, created_at FROM budgets WHERE month = ?1 ORDER BY id").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![month], |row| Ok(Budget { id: row.get(0)?, category_id: row.get(1)?, amount: row.get(2)?, month: row.get(3)?, notes: row.get(4)?, created_at: row.get(5)? })).map_err(|e| e.to_string())?;
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
    conn.execute("UPDATE budgets SET category_id = ?1, amount = ?2, month = ?3, notes = ?4 WHERE id = ?5", params![budget.category_id, budget.amount, budget.month.clone(), budget.notes.unwrap_or_default(), budget.id]).map_err(|e| e.to_string())?;
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
    
    // 먼저 해당 카테고리를 사용하는 거래가 있는지 확인
    let transaction_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE category_id = ?1",
        params![id],
        |r| r.get(0)
    ).unwrap_or(0);
    
    let budget_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM budgets WHERE category_id = ?1",
        params![id],
        |r| r.get(0)
    ).unwrap_or(0);
    
    if transaction_count > 0 || budget_count > 0 {
        return Err(format!(
            "Cannot delete category: {} transactions and {} budgets are using this category. Please reassign them first.",
            transaction_count, budget_count
        ));
    }
    
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
    
    // Check if transfer_id column exists in transactions table
    let transfer_id_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('transactions') WHERE name='transfer_id'",
        [],
        |r| r.get(0)
    ).unwrap_or(0);
    
    if transfer_id_exists == 0 {
        return Err("Database schema is missing transfer_id column. Please update your database.".to_string());
    }
    
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
    
    // Verify transfer_id column exists in backup
    let dest_transfer_id_exists: i64 = dest.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('transactions') WHERE name='transfer_id'",
        [],
        |r| r.get(0)
    ).unwrap_or(0);
    
    if dest_transfer_id_exists == 0 {
        return Err("Backup verification failed: transfer_id column is missing in backup database.".to_string());
    }
    
    match dest.close() {
        Ok(_) => Ok(()),
        Err((_, e)) => Err(format!("Failed to close backup DB: {}", e)),
    }
}

#[tauri::command]
pub fn restore_database(app: AppHandle, file_path: String) -> Result<(), String> {
  let db_path = get_db_path(&app);
  
  // 백업 파일이 존재하는지 확인
  if !std::path::Path::new(&file_path).exists() {
    return Err("Backup file does not exist".to_string());
  }
  
  // 백업 파일을 복원
  std::fs::copy(&file_path, &db_path).map_err(|e| e.to_string())?;
  
  // 복원된 데이터베이스 검증
  let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
  
  // 테이블 존재 확인
  let _tables: Vec<String> = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .map_err(|e| e.to_string())?
      .query_map([], |row| row.get(0))
      .map_err(|e| e.to_string())?
      .collect::<Result<Vec<String>, _>>().map_err(|e| e.to_string())?;
  
  // transfer_id 컬럼 존재 확인 및 자동 업그레이드
  let transfer_id_exists: i64 = conn.query_row(
      "SELECT COUNT(*) FROM pragma_table_info('transactions') WHERE name='transfer_id'",
      [],
      |r| r.get(0)
  ).unwrap_or(0);
  
  if transfer_id_exists == 0 {
      // 구버전 데이터베이스 자동 업그레이드
      println!("Upgrading restored database: adding transfer_id column");
      conn.execute(
          "ALTER TABLE transactions ADD COLUMN transfer_id INTEGER",
          []
      ).map_err(|e| format!("Failed to add transfer_id column: {}", e))?;
      
      // 기존 Transfer 거래들에 대해 transfer_id 생성
      let mut stmt = conn.prepare(
          "SELECT id, date, amount, payee, notes FROM transactions WHERE type = 'transfer' ORDER BY date, amount, payee"
      ).map_err(|e| e.to_string())?;
      
      let rows = stmt.query_map([], |row| {
          Ok((
              row.get::<_, i64>(0)?,
              row.get::<_, String>(1)?,
              row.get::<_, f64>(2)?,
              row.get::<_, String>(3)?,
              row.get::<_, Option<String>>(4)?
          ))
      }).map_err(|e| e.to_string())?;
      
      let mut transfer_groups: Vec<Vec<i64>> = Vec::new();
      let mut current_group: Vec<i64> = Vec::new();
      let mut last_key: Option<(String, f64, String, Option<String>)> = None;
      
      for row in rows {
          let (id, date, amount, payee, notes) = row.map_err(|e| e.to_string())?;
          let key = (date, amount, payee, notes);
          
          if let Some(ref last) = last_key {
              if *last == key {
                  // 같은 Transfer 그룹에 속함
                  current_group.push(id);
              } else {
                  // 새로운 Transfer 그룹 시작
                  if current_group.len() > 0 {
                      transfer_groups.push(current_group.clone());
                  }
                  current_group = vec![id];
                  last_key = Some(key);
              }
          } else {
              // 첫 번째 항목
              current_group.push(id);
              last_key = Some(key);
          }
      }
      
      // 마지막 그룹 추가
      if current_group.len() > 0 {
          transfer_groups.push(current_group);
      }
      
      // 각 Transfer 그룹에 고유한 transfer_id 할당
      for (group_index, group) in transfer_groups.iter().enumerate() {
          let transfer_id = (group_index + 1) as i64;
          for &transaction_id in group {
              conn.execute(
                  "UPDATE transactions SET transfer_id = ?1 WHERE id = ?2",
                  params![transfer_id, transaction_id]
              ).map_err(|e| format!("Failed to update transfer_id for transaction {}: {}", transaction_id, e))?;
          }
      }
      
      println!("Database upgrade completed: {} transfer groups processed", transfer_groups.len());
  }
  
  // 카테고리 테이블 확인
  let _category_count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
      .map_err(|e| e.to_string())?;
  
  Ok(())
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
      
      // transfer_id 컬럼 존재 확인 및 자동 업그레이드
      let transfer_id_exists: i64 = conn.query_row(
          "SELECT COUNT(*) FROM pragma_table_info('transactions') WHERE name='transfer_id'",
          [],
          |r| r.get(0)
      ).unwrap_or(0);
      
      if transfer_id_exists == 0 {
          // 구버전 데이터베이스 자동 업그레이드
          println!("Upgrading imported database: adding transfer_id column");
          conn.execute(
              "ALTER TABLE transactions ADD COLUMN transfer_id INTEGER",
              []
          ).map_err(|e| format!("Failed to add transfer_id column: {}", e))?;
          
          // 기존 Transfer 거래들에 대해 transfer_id 생성
          let mut stmt = conn.prepare(
              "SELECT id, date, amount, payee, notes FROM transactions WHERE type = 'transfer' ORDER BY date, amount, payee"
          ).map_err(|e| e.to_string())?;
          
          let rows = stmt.query_map([], |row| {
              Ok((
                  row.get::<_, i64>(0)?,
                  row.get::<_, String>(1)?,
                  row.get::<_, f64>(2)?,
                  row.get::<_, String>(3)?,
                  row.get::<_, Option<String>>(4)?
              ))
          }).map_err(|e| e.to_string())?;
          
          let mut transfer_groups: Vec<Vec<i64>> = Vec::new();
          let mut current_group: Vec<i64> = Vec::new();
          let mut last_key: Option<(String, f64, String, Option<String>)> = None;
          
          for row in rows {
              let (id, date, amount, payee, notes) = row.map_err(|e| e.to_string())?;
              let key = (date, amount, payee, notes);
              
              if let Some(ref last) = last_key {
                  if *last == key {
                      // 같은 Transfer 그룹에 속함
                      current_group.push(id);
                  } else {
                      // 새로운 Transfer 그룹 시작
                      if current_group.len() > 0 {
                          transfer_groups.push(current_group.clone());
                      }
                      current_group = vec![id];
                      last_key = Some(key);
                  }
              } else {
                  // 첫 번째 항목
                  current_group.push(id);
                  last_key = Some(key);
              }
          }
          
          // 마지막 그룹 추가
          if current_group.len() > 0 {
              transfer_groups.push(current_group);
          }
          
          // 각 Transfer 그룹에 고유한 transfer_id 할당
          for (group_index, group) in transfer_groups.iter().enumerate() {
              let transfer_id = (group_index + 1) as i64;
              for &transaction_id in group {
                  conn.execute(
                      "UPDATE transactions SET transfer_id = ?1 WHERE id = ?2",
                      params![transfer_id, transaction_id]
                  ).map_err(|e| format!("Failed to update transfer_id for transaction {}: {}", transaction_id, e))?;
              }
          }
          
          println!("Database upgrade completed: {} transfer groups processed", transfer_groups.len());
      }
      
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

 