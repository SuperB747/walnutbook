use std::path::PathBuf;
use rusqlite::Connection;
use std::fs;
use tauri::AppHandle;
// Use dirs crate for platform data_dir

pub fn get_db_path(_app: &AppHandle) -> PathBuf {
    // Use OS data directory and the product name to unify the DB location
    let base_dir = dirs::data_dir().expect("Failed to get data dir");
    let app_dir = base_dir.join("WalnutBook");
    // Ensure directory exists
    fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
    app_dir.join("walnutbook.db")
}

pub fn init_db(app: &AppHandle) -> Result<(), String> {
    let path = get_db_path(app);
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;

    // Create tables if they don't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            balance REAL NOT NULL DEFAULT 0,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Add default Adjust categories if they don't exist
    conn.execute(
        "INSERT OR IGNORE INTO categories (name, type) VALUES ('Add', 'Adjust')",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO categories (name, type) VALUES ('Subtract', 'Adjust')",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migrate categories table: add reimbursement fields if missing
    {
        // Check existing columns
        let mut info_stmt = conn.prepare("PRAGMA table_info(categories)").map_err(|e| e.to_string())?;
        let existing: Vec<String> = info_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .map(|r| r.unwrap_or_default())
            .collect();
        // Add is_reimbursement column
        if !existing.contains(&"is_reimbursement".to_string()) {
            conn.execute(
                "ALTER TABLE categories ADD COLUMN is_reimbursement BOOLEAN NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        // Add reimbursement_target_category_id column
        if !existing.contains(&"reimbursement_target_category_id".to_string()) {
            conn.execute(
                "ALTER TABLE categories ADD COLUMN reimbursement_target_category_id INTEGER",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            account_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            category_id INTEGER,
            amount REAL NOT NULL,
            payee TEXT NOT NULL,
            notes TEXT,
            transfer_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            month TEXT NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
            UNIQUE(category_id, month)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Remove account_import_settings table if it exists (migration)
    conn.execute("DROP TABLE IF EXISTS account_import_settings", []).ok();


    Ok(())
}

#[tauri::command]
pub fn home_dir() -> Result<String, String> {
    dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?
        .to_str()
        .ok_or_else(|| "Invalid home directory path".to_string())
        .map(|s| s.to_string())
}

#[tauri::command]
pub fn get_onedrive_path() -> Result<String, String> {
    let home = home_dir()?;
    let onedrive_path = if cfg!(target_os = "windows") {
        format!("{}\\OneDrive", home)
    } else if cfg!(target_os = "macos") {
        format!("{}/OneDrive", home)
    } else {
        format!("{}/OneDrive", home)
    };
    Ok(onedrive_path)
}

#[tauri::command]
pub fn reset_database(app: AppHandle) -> Result<(), String> {
    let path = get_db_path(&app);
    // Delete existing database file, ignore error if not present
    let _ = fs::remove_file(&path);
    // Re-initialize database schema and defaults
    init_db(&app)?;
    Ok(())
} 