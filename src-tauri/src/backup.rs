use rusqlite::Connection;
use std::fs;
use tauri::AppHandle;
use chrono::Utc;

use crate::utils::get_db_path;

#[tauri::command]
pub fn backup_database(app: AppHandle, save_path: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    
    // Verify database integrity before backup
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    // Check if all required tables exist
    let tables = ["accounts", "transactions", "categories", "budgets", "account_import_settings"];
    for table in tables.iter() {
        if let Err(_) = conn.prepare(&format!("SELECT 1 FROM {} LIMIT 1", table)) {
            return Err(format!("Database is missing {} table", table));
        }
    }
    
    // Check foreign key constraints
    let integrity_check = conn.query_row("PRAGMA foreign_key_check", [], |_| Ok(()));
    if let Err(_) = integrity_check {
        return Err("Database has foreign key constraint violations".to_string());
    }
    
    // Create backup
    fs::copy(&db_path, save_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_database(app: AppHandle, file_path: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    
    // Create backup of current database
    let backup_path = format!("{}.backup_{}", db_path.to_string_lossy(), Utc::now().format("%Y%m%d_%H%M%S"));
    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;
    
    // Try to restore
    match fs::copy(&file_path, &db_path) {
        Ok(_) => {
            // Verify restored database
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            
            // Check if required tables exist
            let tables = ["accounts", "transactions", "categories", "budgets", "account_import_settings"];
            for table in tables.iter() {
                if let Err(_) = conn.prepare(&format!("SELECT 1 FROM {} LIMIT 1", table)) {
                    // Restore from backup if verification fails
                    let _ = fs::copy(&backup_path, &db_path);
                    return Err(format!("Restored database is missing {} table", table));
                }
            }
            
            // Verify data integrity - check foreign key constraints
            let integrity_check = conn.query_row("PRAGMA foreign_key_check", [], |_| Ok(()));
            if let Err(_) = integrity_check {
                let _ = fs::copy(&backup_path, &db_path);
                return Err("Restored database has foreign key constraint violations".to_string());
            }
            
            // Delete backup if verification succeeds
            fs::remove_file(backup_path).map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            // Restore from backup if copy fails
            let _ = fs::copy(&backup_path, &db_path);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn export_database(app: AppHandle) -> Result<Vec<u8>, String> {
    let path = get_db_path(&app);
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_database(app: AppHandle, data: Vec<u8>) -> Result<(), String> {
    let db_path = get_db_path(&app);
    
    // Create backup
    let backup_path = format!("{}.backup_{}", db_path.to_string_lossy(), Utc::now().format("%Y%m%d_%H%M%S"));
    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;
    
    // Write new database
    if let Err(e) = fs::write(&db_path, &data) {
        let _ = fs::copy(&backup_path, &db_path);
        return Err(e.to_string());
    }
    
    // Verify new database
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => {
            let _ = fs::copy(&backup_path, &db_path);
            return Err(e.to_string());
        }
    };
    
    // Check required tables
    let tables = ["accounts", "transactions", "categories", "budgets", "account_import_settings"];
    for table in tables.iter() {
        if let Err(_) = conn.prepare(&format!("SELECT 1 FROM {} LIMIT 1", table)) {
            let _ = fs::copy(&backup_path, &db_path);
            return Err(format!("Imported database is missing {} table", table));
        }
    }
    
    // Verify data integrity - check foreign key constraints
    let integrity_check = conn.query_row("PRAGMA foreign_key_check", [], |_| Ok(()));
    if let Err(_) = integrity_check {
        let _ = fs::copy(&backup_path, &db_path);
        return Err("Imported database has foreign key constraint violations".to_string());
    }
    
    // Delete backup if all checks pass
    fs::remove_file(backup_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_backup_folder(folder_path: String) -> Result<(), String> {
    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;
    Ok(())
} 