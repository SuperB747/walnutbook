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

    // Migrate transactions table: add to_account_id if missing
    {
        let mut info_stmt = conn.prepare("PRAGMA table_info(transactions)").map_err(|e| e.to_string())?;
        let existing: Vec<String> = info_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .map(|r| r.unwrap_or_default())
            .collect();
        if !existing.contains(&"to_account_id".to_string()) {
            conn.execute(
                "ALTER TABLE transactions ADD COLUMN to_account_id INTEGER",
                [],
            ).map_err(|e| e.to_string())?;
        }
        // attachment_path 컬럼 추가
        if !existing.contains(&"attachment_path".to_string()) {
            conn.execute(
                "ALTER TABLE transactions ADD COLUMN attachment_path TEXT",
                [],
            ).map_err(|e| e.to_string())?;
        }
    }

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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS recurring_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
            category_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            day_of_month TEXT NOT NULL, -- JSON array of integers, e.g. '[1,15]' or '[1]'
            is_active BOOLEAN NOT NULL DEFAULT 1,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            repeat_type TEXT DEFAULT 'monthly_date' CHECK (repeat_type IN ('monthly_date', 'interval')),
            start_date TEXT,
            interval_value INTEGER DEFAULT 1,
            interval_unit TEXT DEFAULT 'month' CHECK (interval_unit IN ('day', 'week', 'month')),
            FOREIGN KEY (category_id) REFERENCES categories (id),
            FOREIGN KEY (account_id) REFERENCES accounts (id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migrate recurring_items table: add new fields if missing
    {
        let mut info_stmt = conn.prepare("PRAGMA table_info(recurring_items)").map_err(|e| e.to_string())?;
        let existing: Vec<String> = info_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .map(|r| r.unwrap_or_default())
            .collect();
        
        // Check if day_of_month column exists and has the old integer type
        let mut day_of_month_type = String::new();
        if existing.contains(&"day_of_month".to_string()) {
            let mut type_stmt = conn.prepare("SELECT type FROM pragma_table_info('recurring_items') WHERE name = 'day_of_month'").map_err(|e| e.to_string())?;
            if let Ok(row) = type_stmt.query_row([], |row| row.get::<_, String>(0)) {
                day_of_month_type = row;
            }
        }
        
        // If day_of_month is INTEGER, we need to migrate it to TEXT
        if day_of_month_type == "INTEGER" {
            println!("Migrating day_of_month from INTEGER to TEXT...");
            
            // First, backup existing data
            let mut backup_stmt = conn.prepare("SELECT id, day_of_month FROM recurring_items").map_err(|e| e.to_string())?;
            let backup_data: Vec<(i64, i32)> = backup_stmt
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, i32>(1)?))
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            
            // Create temporary table with new schema
            conn.execute(
                "CREATE TABLE recurring_items_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    amount REAL NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
                    category_id INTEGER NOT NULL,
                    account_id INTEGER NOT NULL,
                    day_of_month TEXT NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    notes TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    repeat_type TEXT DEFAULT 'monthly_date' CHECK (repeat_type IN ('monthly_date', 'interval')),
                    start_date TEXT,
                    interval_value INTEGER DEFAULT 1,
                    interval_unit TEXT DEFAULT 'month' CHECK (interval_unit IN ('day', 'week', 'month')),
                    FOREIGN KEY (category_id) REFERENCES categories (id),
                    FOREIGN KEY (account_id) REFERENCES accounts (id)
                )",
                [],
            ).map_err(|e| e.to_string())?;
            
            // Copy data from old table to new table, converting day_of_month to JSON format
            let mut copy_stmt = conn.prepare("INSERT INTO recurring_items_new (id, name, amount, type, category_id, account_id, day_of_month, is_active, notes, created_at, repeat_type, start_date, interval_value, interval_unit) SELECT id, name, amount, type, category_id, account_id, ?, is_active, notes, created_at, repeat_type, start_date, interval_value, interval_unit FROM recurring_items").map_err(|e| e.to_string())?;
            
            for (id, day_of_month) in backup_data {
                let json_array = format!("[{}]", day_of_month);
                copy_stmt.execute(rusqlite::params![json_array]).map_err(|e| e.to_string())?;
                println!("Migrated recurring item {}: {} -> {}", id, day_of_month, json_array);
            }
            
            // Drop old table and rename new table
            conn.execute("DROP TABLE recurring_items", []).map_err(|e| e.to_string())?;
            conn.execute("ALTER TABLE recurring_items_new RENAME TO recurring_items", []).map_err(|e| e.to_string())?;
            
            println!("Successfully migrated day_of_month from INTEGER to TEXT");
        } else {
            // Add missing columns if they don't exist
            if !existing.contains(&"repeat_type".to_string()) {
                conn.execute(
                    "ALTER TABLE recurring_items ADD COLUMN repeat_type TEXT DEFAULT 'monthly_date' CHECK (repeat_type IN ('monthly_date', 'interval'))",
                    [],
                )
                .map_err(|e| e.to_string())?;
            }
            
            if !existing.contains(&"start_date".to_string()) {
                conn.execute(
                    "ALTER TABLE recurring_items ADD COLUMN start_date TEXT",
                    [],
                )
                .map_err(|e| e.to_string())?;
            }
            
            if !existing.contains(&"interval_value".to_string()) {
                conn.execute(
                    "ALTER TABLE recurring_items ADD COLUMN interval_value INTEGER DEFAULT 1",
                    [],
                )
                .map_err(|e| e.to_string())?;
            }
            
            if !existing.contains(&"interval_unit".to_string()) {
                conn.execute(
                    "ALTER TABLE recurring_items ADD COLUMN interval_unit TEXT DEFAULT 'month' CHECK (interval_unit IN ('day', 'week', 'month'))",
                    [],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // Force migrate day_of_month from integer to JSON array format for all existing items
    // This handles cases where the column is TEXT but contains integer values
    {
        let mut stmt = conn.prepare("SELECT id, day_of_month FROM recurring_items").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let day_of_month: String = row.get(1)?;
            Ok((id, day_of_month))
        }).map_err(|e| e.to_string())?;
        
        for row in rows {
            let (id, day_of_month) = row.map_err(|e| e.to_string())?;
            
            // Check if day_of_month is a single number (old format) or not a valid JSON array
            if let Ok(day_num) = day_of_month.parse::<i32>() {
                // Convert single number to JSON array format
                let json_array = format!("[{}]", day_num);
                conn.execute(
                    "UPDATE recurring_items SET day_of_month = ? WHERE id = ?",
                    rusqlite::params![json_array, id],
                ).map_err(|e| e.to_string())?;
                println!("Migrated recurring item {}: {} -> {}", id, day_of_month, json_array);
            } else if !day_of_month.starts_with('[') || !day_of_month.ends_with(']') {
                // If it's not a valid JSON array, convert to default format
                let json_array = "[1]".to_string();
                conn.execute(
                    "UPDATE recurring_items SET day_of_month = ? WHERE id = ?",
                    rusqlite::params![json_array, id],
                ).map_err(|e| e.to_string())?;
                println!("Fixed invalid day_of_month format for item {}: {} -> {}", id, day_of_month, json_array);
            }
        }
    }

    // Create index for better performance
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_recurring_items_type ON recurring_items (type)",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_recurring_items_active ON recurring_items (is_active)",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Create recurring_checks table for monthly check status
    conn.execute(
        "CREATE TABLE IF NOT EXISTS recurring_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            occurrence_id TEXT NOT NULL,
            month TEXT NOT NULL,
            is_checked BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(occurrence_id, month)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // recurring_checks 테이블 마이그레이션: occurrence_id 컬럼 없으면 추가
    {
        let mut info_stmt = conn.prepare("PRAGMA table_info(recurring_checks)").map_err(|e| e.to_string())?;
        let existing: Vec<String> = info_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .map(|r| r.unwrap_or_default())
            .collect();
        if !existing.contains(&"occurrence_id".to_string()) {
            conn.execute(
                "ALTER TABLE recurring_checks ADD COLUMN occurrence_id TEXT",
                [],
            ).map_err(|e| e.to_string())?;
        }
    }

    // Clean up old occurrence_id format (item_id_occurrenceCount) to new format (item_id_occurrenceCount_dayIndex)
    // This migration handles the change from duplicate occurrence IDs to unique ones
    {
        let mut stmt = conn.prepare("SELECT occurrence_id FROM recurring_checks WHERE occurrence_id LIKE '%_%' AND occurrence_id NOT LIKE '%_%_%'").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(row.get::<_, String>(0)?)
        }).map_err(|e| e.to_string())?;
        
        for row in rows {
            if let Ok(old_occurrence_id) = row {
                // Check if this is an old format occurrence_id (item_id_occurrenceCount)
                let parts: Vec<&str> = old_occurrence_id.split('_').collect();
                if parts.len() == 2 {
                    // This is old format, delete it as it's no longer valid
                    conn.execute(
                        "DELETE FROM recurring_checks WHERE occurrence_id = ?",
                        rusqlite::params![old_occurrence_id],
                    ).map_err(|e| e.to_string())?;
                    println!("Cleaned up old occurrence_id format: {}", old_occurrence_id);
                }
            }
        }
    }

    // Create index for better performance
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_recurring_checks_month ON recurring_checks (month)",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Create reminders table if it doesn't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            account_name TEXT NOT NULL,
            payment_day INTEGER NOT NULL,
            next_payment_date TEXT NOT NULL,
            is_checked BOOLEAN NOT NULL DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // Create reminder_payment_history table for payment history
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reminder_payment_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reminder_id INTEGER NOT NULL,
            paid_date TEXT NOT NULL,
            is_paid BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            statement_date TEXT,
            note TEXT,
            FOREIGN KEY (reminder_id) REFERENCES reminders (id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migrate reminders table: add user_email, statement_date if missing
    {
        let mut info_stmt = conn.prepare("PRAGMA table_info(reminders)").map_err(|e| e.to_string())?;
        let existing: Vec<String> = info_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .map(|r| r.unwrap_or_default())
            .collect();
        if !existing.contains(&"statement_date".to_string()) {
            conn.execute(
                "ALTER TABLE reminders ADD COLUMN statement_date TEXT NOT NULL DEFAULT ''",
                [],
            ).map_err(|e| e.to_string())?;
        }
    }

    // notes 컬럼은 TEXT로 두고, Vec<String>을 JSON 문자열로 저장/불러오기 (마이그레이션 필요 없음)

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
pub fn get_onedrive_data_dir() -> Result<std::path::PathBuf, String> {
    let onedrive_path = get_onedrive_path()?;
    let data_dir = std::path::Path::new(&onedrive_path).join("WalnutBook_Data");
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create WalnutBook_Data dir: {}", e))?;
    Ok(data_dir)
}

#[tauri::command]
pub fn get_onedrive_backups_dir() -> Result<std::path::PathBuf, String> {
    let data_dir = get_onedrive_data_dir()?;
    let backups_dir = data_dir.join("Backups");
    std::fs::create_dir_all(&backups_dir).map_err(|e| format!("Failed to create Backups dir: {}", e))?;
    Ok(backups_dir)
}

#[tauri::command]
pub fn get_onedrive_attachments_dir() -> Result<std::path::PathBuf, String> {
    let data_dir = get_onedrive_data_dir()?;
    let attachments_dir = data_dir.join("Attachments");
    std::fs::create_dir_all(&attachments_dir).map_err(|e| format!("Failed to create Attachments dir: {}", e))?;
    Ok(attachments_dir)
}

#[tauri::command]
pub fn get_attachments_dir(app: &AppHandle) -> PathBuf {
    let db_path = get_db_path(app);
    let dir = db_path.parent().unwrap().join("attachments");
    fs::create_dir_all(&dir).expect("Failed to create attachments dir");
    dir
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