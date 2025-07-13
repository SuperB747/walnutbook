use rusqlite::Connection;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use chrono::Utc;

use crate::utils::{get_db_path, get_onedrive_path};

#[derive(serde::Serialize)]
pub struct BackupInfo {
    pub timestamp: String,
    pub file_size: u64,
    pub version: String,
    pub is_compressed: bool,
}

#[tauri::command]
pub fn backup_database(app: AppHandle, save_path: String) -> Result<BackupInfo, String> {
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
    
    // Create backup with timestamp
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_path = if save_path.ends_with(".db") {
        save_path.replace(".db", &format!("_{}.db", timestamp))
    } else {
        format!("{}_{}.db", save_path, timestamp)
    };
    
    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;
    
    // Get file size
    let metadata = fs::metadata(&backup_path).map_err(|e| e.to_string())?;
    let file_size = metadata.len();
    
    Ok(BackupInfo {
        timestamp: timestamp.to_string(),
        file_size,
        version: "1.0".to_string(),
        is_compressed: false,
    })
}

#[tauri::command]
pub fn auto_backup_to_onedrive(app: AppHandle) -> Result<BackupInfo, String> {
    let onedrive_path = get_onedrive_path()?;
    let backup_folder = format!("{}/WalnutBook_Backups", onedrive_path);
    
    // Create backup folder if it doesn't exist
    fs::create_dir_all(&backup_folder).map_err(|e| e.to_string())?;
    
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("walnutbook_auto_backup_{}.db", timestamp);
    let backup_path = format!("{}/{}", backup_folder, backup_filename);
    
    // Clean old backups (keep only last 10)
    cleanup_old_backups(&backup_folder, 10)?;
    
    backup_database(app, backup_path)
}

#[tauri::command]
pub fn get_backup_history() -> Result<Vec<BackupInfo>, String> {
    let onedrive_path = get_onedrive_path()?;
    let backup_folder = format!("{}/WalnutBook_Backups", onedrive_path);
    
    if !Path::new(&backup_folder).exists() {
        return Ok(vec![]);
    }
    
    let mut backups = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&backup_folder) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if let Some(extension) = path.extension() {
                    if extension == "db" {
                        if let Ok(metadata) = fs::metadata(&path) {
                            if let Some(filename) = path.file_name() {
                                if let Some(filename_str) = filename.to_str() {
                                    // Extract timestamp from filename
                                    if filename_str.starts_with("walnutbook_auto_backup_") {
                                        let timestamp = filename_str
                                            .replace("walnutbook_auto_backup_", "")
                                            .replace(".db", "");
                                        
                                        backups.push(BackupInfo {
                                            timestamp,
                                            file_size: metadata.len(),
                                            version: "1.0".to_string(),
                                            is_compressed: false,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Sort by timestamp (newest first)
    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    
    Ok(backups)
}

fn cleanup_old_backups(backup_folder: &str, keep_count: usize) -> Result<(), String> {
    let mut backups = Vec::new();
    
    if let Ok(entries) = fs::read_dir(backup_folder) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if let Some(extension) = path.extension() {
                    if extension == "db" {
                        if let Some(filename) = path.file_name() {
                            if let Some(filename_str) = filename.to_str() {
                                if filename_str.starts_with("walnutbook_auto_backup_") {
                                    if let Ok(metadata) = fs::metadata(&path) {
                                        if let Ok(modified) = metadata.modified() {
                                            backups.push((path, modified));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Sort by modification time (oldest first)
    backups.sort_by(|a, b| a.1.cmp(&b.1));
    
    // Remove old backups
    if backups.len() > keep_count {
        for (path, _) in backups.iter().take(backups.len() - keep_count) {
            let _ = fs::remove_file(path);
        }
    }
    
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
    
    // Delete backup if all checks pass
    fs::remove_file(backup_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_backup_folder(folder_path: String) -> Result<(), String> {
    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;
    Ok(())
}

 