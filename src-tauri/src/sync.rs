use std::path::PathBuf;
use std::fs;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::time::interval;

use crate::utils::{get_db_path, get_onedrive_data_dir, get_onedrive_path};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncError {
    OneDriveUnavailable(String),
    NetworkError(String),
    FileSystemError(String),
    DatabaseError(String),
    ConfigurationError(String),
    TimeoutError(String),
}

impl std::fmt::Display for SyncError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncError::OneDriveUnavailable(msg) => write!(f, "OneDrive unavailable: {}", msg),
            SyncError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            SyncError::FileSystemError(msg) => write!(f, "File system error: {}", msg),
            SyncError::DatabaseError(msg) => write!(f, "Database error: {}", msg),
            SyncError::ConfigurationError(msg) => write!(f, "Configuration error: {}", msg),
            SyncError::TimeoutError(msg) => write!(f, "Timeout error: {}", msg),
        }
    }
}

impl std::error::Error for SyncError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_enabled: bool,
    pub last_sync: Option<String>,
    pub sync_in_progress: bool,
    pub error_message: Option<String>,
    pub error_type: Option<String>,
    pub onedrive_available: bool,
    pub retry_count: u32,
    pub last_error_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub auto_sync_enabled: bool,
    pub sync_interval_minutes: u64,
    pub onedrive_path: Option<String>,
    pub fallback_to_local: bool,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            auto_sync_enabled: true,
            sync_interval_minutes: 5,
            onedrive_path: None,
            fallback_to_local: true,
        }
    }
}

pub struct SyncManager {
    app: AppHandle,
    config: Arc<Mutex<SyncConfig>>,
    status: Arc<Mutex<SyncStatus>>,
    sync_task: Option<tokio::task::JoinHandle<()>>,
}

impl SyncManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            config: Arc::new(Mutex::new(SyncConfig::default())),
            status: Arc::new(Mutex::new(SyncStatus {
                is_enabled: false,
                last_sync: None,
                sync_in_progress: false,
                error_message: None,
                error_type: None,
                onedrive_available: false,
                retry_count: 0,
                last_error_time: None,
            })),
            sync_task: None,
        }
    }

    pub async fn initialize(&mut self) -> Result<(), String> {
        // Check OneDrive availability
        let onedrive_available = self.check_onedrive_availability().await;
        
        // Load configuration
        let config = self.load_config().await;
        
        // Update status
        {
            let mut status = self.status.lock().await;
            status.onedrive_available = onedrive_available;
            status.is_enabled = config.auto_sync_enabled && onedrive_available;
        }

        // Try to load latest data from OneDrive on startup (only if local DB is empty or older)
        if onedrive_available && config.auto_sync_enabled {
            match self.load_from_onedrive().await {
                Ok(_) => {
                    // Successfully loaded latest data from OneDrive
                }
                Err(e) => {
                    // Failed to load from OneDrive on startup - don't fail initialization
                    eprintln!("Failed to load from OneDrive on startup: {}", e);
                }
            }
        }

        // Start sync task if enabled
        if config.auto_sync_enabled && onedrive_available {
            self.start_auto_sync().await?;
        }

        Ok(())
    }

    async fn check_onedrive_availability(&self) -> bool {
        match get_onedrive_path() {
            Ok(_path) => {
                let data_dir = match get_onedrive_data_dir() {
                    Ok(dir) => dir,
                    Err(_) => return false,
                };
                
                // Check if we can write to the directory
                let test_file = data_dir.join(".walnutbook_test");
                match fs::write(&test_file, "test") {
                    Ok(_) => {
                        let _ = fs::remove_file(&test_file);
                        true
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    }

    async fn load_config(&self) -> SyncConfig {
        // Try to load from OneDrive first
        if let Ok(onedrive_data_dir) = get_onedrive_data_dir() {
            let config_file = onedrive_data_dir.join("sync_config.json");
            if let Ok(config_data) = fs::read_to_string(&config_file) {
                if let Ok(config) = serde_json::from_str::<SyncConfig>(&config_data) {
                    return config;
                }
            }
        }

        // Fallback to local config
        let local_config_path = self.get_local_config_path();
        if let Ok(config_data) = fs::read_to_string(&local_config_path) {
            if let Ok(config) = serde_json::from_str::<SyncConfig>(&config_data) {
                return config;
            }
        }

        // Return default config
        SyncConfig::default()
    }

    async fn save_config(&self, config: &SyncConfig) -> Result<(), String> {
        let config_json = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        // Try to save to OneDrive first
        if let Ok(onedrive_data_dir) = get_onedrive_data_dir() {
            let config_file = onedrive_data_dir.join("sync_config.json");
            if fs::write(&config_file, &config_json).is_ok() {
                return Ok(());
            }
        }

        // Fallback to local storage
        let local_config_path = self.get_local_config_path();
        fs::write(&local_config_path, &config_json)
            .map_err(|e| format!("Failed to save config: {}", e))?;

        Ok(())
    }

    fn get_local_config_path(&self) -> PathBuf {
        let app_data_dir = dirs::data_dir().expect("Failed to get data dir").join("WalnutBook");
        fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
        app_data_dir.join("sync_config.json")
    }

    pub async fn start_auto_sync(&mut self) -> Result<(), String> {
        if self.sync_task.is_some() {
            return Ok(()); // Already running
        }

        let config = self.config.clone();
        let status = self.status.clone();
        let app = self.app.clone();

        let task = tokio::spawn(async move {
            let mut interval_timer = interval(Duration::from_secs(60)); // Check every minute
            
            loop {
                interval_timer.tick().await;
                
                let config_guard = config.lock().await;
                let sync_interval = Duration::from_secs(config_guard.sync_interval_minutes * 60);
                drop(config_guard);

                // Check if we should sync
                let should_sync = {
                    let status_guard = status.lock().await;
                    let last_sync = status_guard.last_sync.as_ref()
                        .and_then(|s| SystemTime::UNIX_EPOCH.checked_add(Duration::from_secs(s.parse().unwrap_or(0))));
                    
                    let now = SystemTime::now();
                    match last_sync {
                        Some(last) => now.duration_since(last).unwrap_or_default() >= sync_interval,
                        None => true, // Never synced
                    }
                };

                if should_sync {
                    let mut status_guard = status.lock().await;
                    if !status_guard.sync_in_progress {
                        status_guard.sync_in_progress = true;
                        drop(status_guard);

                        // Perform sync
                        match Self::perform_sync(&app).await {
                            Ok(_) => {
                                let mut status_guard = status.lock().await;
                                status_guard.last_sync = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs().to_string());
                                status_guard.error_message = None;
                                status_guard.error_type = None;
                                status_guard.retry_count = 0;
                                status_guard.last_error_time = None;
                                status_guard.sync_in_progress = false;
                            }
                            Err(e) => {
                                let mut status_guard = status.lock().await;
                                status_guard.error_message = Some(e.clone());
                                status_guard.error_type = Some("sync_failed".to_string());
                                status_guard.retry_count += 1;
                                status_guard.last_error_time = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs().to_string());
                                status_guard.sync_in_progress = false;
                                
                                // If retry count is too high, disable auto sync temporarily
                                if status_guard.retry_count >= 5 {
                                    status_guard.is_enabled = false;
                                    status_guard.error_message = Some("Auto sync disabled due to repeated failures".to_string());
                                }
                            }
                        }
                    }
                }
            }
        });

        self.sync_task = Some(task);
        Ok(())
    }

    pub async fn stop_auto_sync(&mut self) {
        if let Some(task) = self.sync_task.take() {
            task.abort();
        }
    }

    pub async fn manual_sync(&self) -> Result<(), String> {
        // Set sync in progress
        {
            let mut status = self.status.lock().await;
            status.sync_in_progress = true;
        }
        
        // Perform sync
        let result = Self::perform_sync(&self.app).await;
        
        // Update status based on result
        {
            let mut status = self.status.lock().await;
            match &result {
                Ok(_) => {
                    status.last_sync = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs().to_string());
                    status.error_message = None;
                    status.error_type = None;
                    status.retry_count = 0;
                    status.last_error_time = None;
                }
                Err(e) => {
                    status.error_message = Some(e.clone());
                    status.error_type = Some("sync_failed".to_string());
                    status.retry_count += 1;
                    status.last_error_time = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs().to_string());
                }
            }
            status.sync_in_progress = false;
        }
        
        result
    }

    async fn perform_sync(app: &AppHandle) -> Result<(), String> {
        // Get database path
        let db_path = get_db_path(app);
        
        // First, try to load latest data from OneDrive (if it's newer)
        match Self::load_from_onedrive_static(&db_path).await {
            Ok(_) => {
                // Successfully loaded newer data from OneDrive, now sync it back
            }
            Err(e) => {
                if !e.contains("No sync data found") && !e.contains("Local database is newer") {
                    eprintln!("Failed to load from OneDrive during sync: {}", e);
                }
            }
        }
        
        // Now sync current data to OneDrive
        match Self::try_onedrive_sync(&db_path).await {
            Ok(_) => return Ok(()),
            Err(onedrive_error) => {
                // OneDrive sync failed, try local storage fallback
                match Self::try_local_sync(&db_path).await {
                    Ok(_) => {
                        return Ok(());
                    }
                    Err(local_error) => {
                        return Err(format!("Both OneDrive and local sync failed. OneDrive: {}, Local: {}", onedrive_error, local_error));
                    }
                }
            }
        }
    }

    async fn try_onedrive_sync(db_path: &std::path::Path) -> Result<(), String> {
        // Get OneDrive data directory
        let onedrive_data_dir = get_onedrive_data_dir()
            .map_err(|e| format!("OneDrive not available: {}", e))?;

        // Create sync directory if it doesn't exist
        let sync_dir = onedrive_data_dir.join("sync");
        fs::create_dir_all(&sync_dir)
            .map_err(|e| format!("Failed to create sync directory: {}", e))?;

        // Copy database to OneDrive
        let sync_db_path = sync_dir.join("walnutbook_sync.db");
        fs::copy(db_path, &sync_db_path)
            .map_err(|e| format!("Failed to copy database to OneDrive: {}", e))?;

        // Create metadata file
        let metadata = SyncMetadata {
            last_modified: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            file_size: fs::metadata(&sync_db_path).map_err(|e| e.to_string())?.len(),
            version: "1.0".to_string(),
        };

        let metadata_json = serde_json::to_string_pretty(&metadata)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

        let metadata_path = sync_dir.join("sync_metadata.json");
        fs::write(&metadata_path, &metadata_json)
            .map_err(|e| format!("Failed to write metadata: {}", e))?;

        Ok(())
    }

    async fn try_local_sync(db_path: &std::path::Path) -> Result<(), String> {
        // Get local data directory
        let local_data_dir = dirs::data_dir()
            .ok_or_else(|| "Failed to get local data directory".to_string())?
            .join("WalnutBook")
            .join("sync_backup");
        
        fs::create_dir_all(&local_data_dir)
            .map_err(|e| format!("Failed to create local sync directory: {}", e))?;

        // Copy database to local backup
        let sync_db_path = local_data_dir.join("walnutbook_sync.db");
        fs::copy(db_path, &sync_db_path)
            .map_err(|e| format!("Failed to copy database to local backup: {}", e))?;

        // Create metadata file
        let metadata = SyncMetadata {
            last_modified: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            file_size: fs::metadata(&sync_db_path).map_err(|e| e.to_string())?.len(),
            version: "1.0".to_string(),
        };

        let metadata_json = serde_json::to_string_pretty(&metadata)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

        let metadata_path = local_data_dir.join("sync_metadata.json");
        fs::write(&metadata_path, &metadata_json)
            .map_err(|e| format!("Failed to write local metadata: {}", e))?;

        Ok(())
    }

    async fn load_from_onedrive_static(db_path: &std::path::Path) -> Result<(), String> {
        // Get OneDrive data directory
        let onedrive_data_dir = get_onedrive_data_dir()
            .map_err(|e| format!("OneDrive not available: {}", e))?;

        let sync_dir = onedrive_data_dir.join("sync");
        let sync_db_path = sync_dir.join("walnutbook_sync.db");
        let metadata_path = sync_dir.join("sync_metadata.json");

        // Check if sync files exist
        if !sync_db_path.exists() || !metadata_path.exists() {
            return Err("No sync data found in OneDrive".to_string());
        }

        // Read metadata
        let metadata_json = fs::read_to_string(&metadata_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        let metadata: SyncMetadata = serde_json::from_str(&metadata_json)
            .map_err(|e| format!("Failed to parse metadata: {}", e))?;

        // Get local database path and check its modification time
        let local_metadata = fs::metadata(db_path)
            .map_err(|e| format!("Failed to get local database metadata: {}", e))?;
        
        let local_modified = local_metadata.modified()
            .map_err(|e| format!("Failed to get local modification time: {}", e))?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("Failed to convert local time: {}", e))?
            .as_secs();

        // Compare timestamps - only load from OneDrive if it's newer
        if metadata.last_modified <= local_modified {
            // Local database is newer or same age, don't overwrite
            return Err("Local database is newer or same age".to_string());
        }

        // Create backup of local database
        let backup_path = format!("{}.backup_{}", 
            db_path.to_string_lossy(), 
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
        );
        fs::copy(db_path, &backup_path)
            .map_err(|e| format!("Failed to backup local database: {}", e))?;

        // Copy OneDrive database to local
        fs::copy(&sync_db_path, db_path)
            .map_err(|e| format!("Failed to copy OneDrive database: {}", e))?;

        // Verify the copied database
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open copied database: {}", e))?;

        // Check if required tables exist
        let tables = ["accounts", "transactions", "categories", "budgets"];
        for table in tables.iter() {
            if let Err(_) = conn.prepare(&format!("SELECT 1 FROM {} LIMIT 1", table)) {
                // Restore from backup if verification fails
                let _ = fs::copy(&backup_path, db_path);
                return Err(format!("OneDrive database is missing {} table", table));
            }
        }

        // Delete backup if verification succeeds
        fs::remove_file(&backup_path)
            .map_err(|e| format!("Failed to remove backup: {}", e))?;

        Ok(())
    }

    pub async fn load_from_onedrive(&self) -> Result<(), String> {
        let db_path = get_db_path(&self.app);
        Self::load_from_onedrive_static(&db_path).await
    }

    pub async fn get_status(&mut self) -> SyncStatus {
        // Initialize if not already done (lazy initialization)
        let needs_init = {
            let status = self.status.lock().await;
            !status.onedrive_available
        };
        
        if needs_init {
            // Initialize synchronously without spawning new tasks
            self.initialize_sync().await;
        }
        
        self.status.lock().await.clone()
    }

    async fn initialize_sync(&mut self) {
        // Check OneDrive availability
        let onedrive_available = self.check_onedrive_availability().await;
        
        // Load configuration
        let config = self.load_config().await;
        
        // Update status
        {
            let mut status = self.status.lock().await;
            status.onedrive_available = onedrive_available;
            status.is_enabled = config.auto_sync_enabled && onedrive_available;
        }

        // Try to load latest data from OneDrive on startup (only if local DB is empty or older)
        if onedrive_available && config.auto_sync_enabled {
            match self.load_from_onedrive().await {
                Ok(_) => {
                    // Successfully loaded latest data from OneDrive
                }
                Err(e) => {
                    // Only perform initial sync if it's "no sync data found", otherwise it's a real error
                    if e.contains("No sync data found") {
                        // Perform initial sync to create sync data
                        match self.manual_sync().await {
                            Ok(_) => {
                                // Initial sync completed successfully
                            }
                            Err(sync_err) => {
                                // Failed to perform initial sync
                                eprintln!("Failed to perform initial sync: {}", sync_err);
                            }
                        }
                    } else {
                        // Failed to load from OneDrive on startup
                        eprintln!("Failed to load from OneDrive on startup: {}", e);
                    }
                }
            }
        }
    }

    pub async fn get_config(&self) -> SyncConfig {
        self.config.lock().await.clone()
    }

    pub async fn update_config(&self, new_config: SyncConfig) -> Result<(), String> {
        // Save config
        self.save_config(&new_config).await?;

        // Update internal config
        {
            let mut config = self.config.lock().await;
            *config = new_config;
        }

        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct SyncMetadata {
    last_modified: u64,
    file_size: u64,
    version: String,
}

// Helper function to trigger sync after data changes
pub async fn trigger_data_change_sync(app: &AppHandle) {
    let sync_manager = app.state::<Arc<Mutex<SyncManager>>>();
    let manager = sync_manager.lock().await;
    
    // Check if auto sync is enabled
    let config = manager.get_config().await;
    if config.auto_sync_enabled {
        // Trigger immediate sync for data changes
        if let Err(_e) = manager.manual_sync().await {
            // Failed to sync after data change - silently continue
        }
    }
}

// Tauri commands
#[tauri::command]
pub async fn get_sync_status(app: AppHandle) -> Result<SyncStatus, String> {
    let sync_manager = app.state::<Arc<Mutex<SyncManager>>>();
    let mut manager = sync_manager.lock().await;
    Ok(manager.get_status().await)
}

#[tauri::command]
pub async fn get_sync_config(app: AppHandle) -> Result<SyncConfig, String> {
    let sync_manager = app.state::<Arc<Mutex<SyncManager>>>();
    let manager = sync_manager.lock().await;
    Ok(manager.get_config().await)
}

#[tauri::command]
pub async fn update_sync_config(app: AppHandle, config: SyncConfig) -> Result<(), String> {
    let sync_manager = app.state::<Arc<Mutex<SyncManager>>>();
    let manager = sync_manager.lock().await;
    manager.update_config(config).await
}

#[tauri::command]
pub async fn manual_sync(app: AppHandle) -> Result<(), String> {
    let sync_manager = app.state::<Arc<Mutex<SyncManager>>>();
    let manager = sync_manager.lock().await;
    manager.manual_sync().await
}

#[tauri::command]
pub async fn load_from_onedrive(app: AppHandle) -> Result<(), String> {
    let sync_manager = app.state::<Arc<Mutex<SyncManager>>>();
    let manager = sync_manager.lock().await;
    manager.load_from_onedrive().await
}

#[tauri::command]
pub async fn start_auto_sync(app: AppHandle) -> Result<(), String> {
    let sync_manager = app.state::<Arc<Mutex<SyncManager>>>();
    let mut manager = sync_manager.lock().await;
    manager.start_auto_sync().await
}

#[tauri::command]
pub async fn stop_auto_sync(app: AppHandle) -> Result<(), String> {
    let sync_manager = app.state::<Arc<Mutex<SyncManager>>>();
    let mut manager = sync_manager.lock().await;
    manager.stop_auto_sync().await;
    Ok(())
}
