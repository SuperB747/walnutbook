use rusqlite::Connection;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use chrono::Local;

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
    let tables = ["accounts", "transactions", "categories", "budgets"];
    for table in tables.iter() {
        if let Err(_) = conn.prepare(&format!("SELECT 1 FROM {} LIMIT 1", table)) {
            return Err(format!("Database is missing {} table", table));
        }
    }
    
    // Create backup with timestamp only if not already present
    let (backup_path, timestamp) = if save_path.contains("_202") || save_path.contains("_203") || save_path.contains("_204") || save_path.contains("_205") {
        // Path already contains a timestamp, extract it from the path
        let path_timestamp = save_path.split('_').rev().take(2).collect::<Vec<&str>>().join("_");
        (save_path, path_timestamp)
    } else {
        // Add timestamp to path
        let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let path = if save_path.ends_with(".db") {
            save_path.replace(".db", &format!("_{}.db", timestamp))
        } else {
            format!("{}_{}.db", save_path, timestamp)
        };
        (path, timestamp)
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
pub fn manual_backup_to_onedrive(app: AppHandle) -> Result<BackupInfo, String> {
    let onedrive_path = get_onedrive_path()?;
    let backup_folder = format!("{}/WalnutBook_Backups", onedrive_path);
    
    // Create backup folder if it doesn't exist
    fs::create_dir_all(&backup_folder).map_err(|e| e.to_string())?;
    
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("walnutbook_backup_{}.db", timestamp);
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
    
    // Check main backup folder for backups
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
                                    if filename_str.starts_with("walnutbook_backup_") {
                                        let timestamp = filename_str
                                            .replace("walnutbook_backup_", "")
                                            .replace(".db", "");
                                        
                                        // If timestamp is duplicated (contains underscore twice), take only the first part
                                        let timestamp = if timestamp.matches('_').count() >= 2 {
                                            let parts: Vec<&str> = timestamp.split('_').collect();
                                            if parts.len() >= 6 {
                                                format!("{}_{}_{}_{}_{}_{}", parts[0], parts[1], parts[2], parts[3], parts[4], parts[5])
                                            } else {
                                                timestamp
                                            }
                                        } else {
                                            timestamp
                                        };
                                        
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
    
    // Sort by timestamp (newest first) and limit to 10
    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    backups.truncate(10);
    
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
                                if filename_str.starts_with("walnutbook_backup_") {
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
    let backup_path = format!("{}.backup_{}", db_path.to_string_lossy(), Local::now().format("%Y%m%d_%H%M%S"));
    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;
    
    // Try to restore
    match fs::copy(&file_path, &db_path) {
        Ok(_) => {
            // Verify restored database
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            
            // Check if required tables exist
            let tables = ["accounts", "transactions", "categories", "budgets"];
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
    let backup_path = format!("{}.backup_{}", db_path.to_string_lossy(), Local::now().format("%Y%m%d_%H%M%S"));
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
pub fn delete_backup_from_history(timestamp: String) -> Result<(), String> {
    let onedrive_path = get_onedrive_path()?;
    let backup_folder = format!("{}/WalnutBook_Backups", onedrive_path);
    let backup_filename = format!("walnutbook_backup_{}.db", timestamp);
    let backup_path = format!("{}/{}", backup_folder, backup_filename);
    
    if Path::new(&backup_path).exists() {
        fs::remove_file(&backup_path).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn restore_backup_from_history(app: AppHandle, timestamp: String) -> Result<(), String> {
    let onedrive_path = get_onedrive_path()?;
    let backup_folder = format!("{}/WalnutBook_Backups", onedrive_path);
    let backup_filename = format!("walnutbook_backup_{}.db", timestamp);
    let backup_path = format!("{}/{}", backup_folder, backup_filename);
    
    if !Path::new(&backup_path).exists() {
        return Err("Backup file not found".to_string());
    }
    
    // Use the existing restore function
    restore_database_from_path(app, backup_path)
}

fn restore_database_from_path(app: AppHandle, file_path: String) -> Result<(), String> {
    // This is a helper function for restoring from a specific path
    // We'll use the existing restore logic but without the file dialog
    let db_path = get_db_path(&app);
    
    // Create backup of current database
    let backup_path = format!("{}.backup_{}", db_path.to_string_lossy(), Local::now().format("%Y%m%d_%H%M%S"));
    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;
    
    // Try to restore
    match fs::copy(&file_path, &db_path) {
        Ok(_) => {
            // Verify restored database
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            
            // Check if required tables exist
            let tables = ["accounts", "transactions", "categories", "budgets"];
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
pub fn create_backup_folder(folder_path: String) -> Result<(), String> {
    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;
    Ok(())
}

 