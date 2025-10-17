use rusqlite::{params, Connection};
use tauri::AppHandle;
use crate::models::Account;
use crate::utils::get_db_path;
use crate::trigger_data_change_sync;

#[derive(serde::Serialize)]
pub struct AccountImportSettings {
    pub id: i64,
    pub account_id: i64,
    pub csv_sign_logic: String,
    pub created_at: String,
}

#[tauri::command]
pub fn get_accounts(app: AppHandle) -> Result<Vec<Account>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, name, type, description, created_at FROM accounts ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let account_type: String = row.get(2)?;
        let description: Option<String> = row.get(3)?;
        let created_at: String = row.get(4)?;
        
        // 실시간 잔액 계산 (계좌 타입과 거래 타입에 따라)
        // 
        // BALANCE CALCULATION LOGIC:
        // =========================
        // 
        // CREDIT CARDS:
        // - Expense transactions are stored as NEGATIVE amounts (e.g., -$1000)
        // - Credit card debt should be NEGATIVE (you owe money)
        // - We use the amount AS-IS (no ABS conversion) to preserve the sign
        // - Example: $1000 expense = -$1000 stored = -$1000 balance (debt)
        // 
        // OTHER ACCOUNTS (Checking, Savings, Investment, Other):
        // - Expense transactions are stored as NEGATIVE amounts (e.g., -$1000)
        // - We convert to positive for display using -ABS(amount)
        // - Example: $1000 expense = -$1000 stored = -$1000 balance (money spent)
        // 
        // TRANSFER transactions:
        // - Use amount AS-IS for all account types
        // - Backend handles sign conversion based on departure/arrival accounts
        // 
        // ADJUST transactions:
        // - For Credit: use amount AS-IS
        // - For Others: use ABS(amount) with proper sign based on category
        // 
        let balance: f64 = conn.query_row(
            "SELECT IFNULL(SUM(CASE 
                WHEN a.type = 'Credit' THEN
                    CASE
                        WHEN t.type = 'Expense' THEN amount
                        WHEN t.type = 'Income' THEN amount
                        WHEN t.type = 'Adjust' AND c.name = 'Add' THEN ABS(amount)
                        WHEN t.type = 'Adjust' AND c.name = 'Subtract' THEN -ABS(amount)
                        WHEN t.type = 'Transfer' THEN amount
                        ELSE 0
                    END
                ELSE
                    -- Checking, Savings, Investment, Other 계좌는 모두 동일하게 처리
                    CASE
                        WHEN t.type = 'Expense' THEN -ABS(amount)
                        WHEN t.type = 'Income' THEN ABS(amount)
                        WHEN t.type = 'Adjust' AND c.name = 'Add' THEN ABS(amount)
                        WHEN t.type = 'Adjust' AND c.name = 'Subtract' THEN -ABS(amount)
                        WHEN t.type = 'Transfer' THEN amount
                        ELSE 0
                    END
                END), 0) 
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE t.account_id = ?1",
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
pub async fn create_account(app: AppHandle, name: String, account_type: String, balance: Option<f64>, description: Option<String>) -> Result<Vec<Account>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let initial_balance = balance.unwrap_or(0.0);
    conn.execute(
        "INSERT INTO accounts (name, type, balance, description) VALUES (?1, ?2, ?3, ?4)",
        params![name, account_type, initial_balance, description],
    )
    .map_err(|e| e.to_string())?;
    
    // Trigger sync after data change
    trigger_data_change_sync(&app).await;
    
    get_accounts(app)
}

#[tauri::command]
pub async fn update_account(app: AppHandle, account: Account) -> Result<Vec<Account>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE accounts SET name = ?1, type = ?2, description = ?3 WHERE id = ?4",
        params![account.name, account.account_type, account.description, account.id],
    )
    .map_err(|e| e.to_string())?;
    
    // Trigger sync after data change
    trigger_data_change_sync(&app).await;
    
    get_accounts(app)
}

#[tauri::command]
pub async fn delete_account(app: AppHandle, id: i64) -> Result<Vec<Account>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "DELETE FROM accounts WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    
    // Trigger sync after data change
    trigger_data_change_sync(&app).await;
    
    get_accounts(app)
}

#[tauri::command]
pub fn get_account_import_settings(app: AppHandle, account_id: i64) -> Result<AccountImportSettings, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, account_id, csv_sign_logic, created_at FROM account_import_settings WHERE account_id = ?1"
    ).map_err(|e| e.to_string())?;
    
    let settings = stmt.query_row(params![account_id], |row| {
        Ok(AccountImportSettings {
            id: row.get(0)?,
            account_id: row.get(1)?,
            csv_sign_logic: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    Ok(settings)
}

#[tauri::command]
pub fn update_account_import_settings(app: AppHandle, account_id: i64, csv_sign_logic: String) -> Result<AccountImportSettings, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO account_import_settings (account_id, csv_sign_logic) VALUES (?1, ?2)
         ON CONFLICT(account_id) DO UPDATE SET csv_sign_logic = ?2",
        params![account_id, csv_sign_logic],
    ).map_err(|e| e.to_string())?;
    
    get_account_import_settings(app, account_id)
}

#[tauri::command]
pub fn get_csv_sign_logic_for_account(app: AppHandle, account_id: i64) -> Result<String, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let csv_sign_logic: String = conn.query_row(
        "SELECT csv_sign_logic FROM account_import_settings WHERE account_id = ?1",
        params![account_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "standard".to_string());
    
    Ok(csv_sign_logic)
} 