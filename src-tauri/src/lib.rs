mod models;
mod utils;
mod accounts;
mod transactions;
mod categories;
mod budgets;
mod recurring;
mod backup;
mod reminders;


use std::sync::Mutex;
use rusqlite::Connection;
use tauri::Manager;

// Re-export specific types and functions from models
pub use models::{Account, Transaction, Category, Budget, AccountImportSettings, RecurringItem};

// Re-export utility functions
pub use utils::{init_db, home_dir, get_onedrive_path, reset_database};

// Re-export account functions
pub use accounts::{get_accounts, create_account, update_account, delete_account};

// Re-export transaction functions
pub use transactions::{
    get_transactions, create_transaction, update_transaction, delete_transaction,
    bulk_update_transactions, import_transactions, save_transaction_attachment, delete_transaction_attachment, open_transaction_attachment
};

// Re-export category functions
pub use categories::{
    get_categories, get_categories_full, add_category, update_category, delete_category,
    get_spending_by_category, get_income_vs_expenses, get_net_worth_history
};

// Re-export budget functions
pub use budgets::{get_budgets, add_budget, update_budget, delete_budget};

// Re-export recurring functions
pub use recurring::{
    get_recurring_items, add_recurring_item, update_recurring_item, delete_recurring_item,
    update_recurring_check, get_recurring_checks
};

// Re-export backup functions
pub use backup::{
    backup_database, restore_database, export_database, import_database, create_backup_folder,
    manual_backup_to_onedrive, get_backup_history, delete_backup_from_history, restore_backup_from_history, BackupInfo
};

// Re-export settings functions
pub use accounts::{
    get_account_import_settings, update_account_import_settings,
    get_csv_sign_logic_for_account
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let context = tauri::generate_context!();
    tauri::Builder::default()
        .setup(|app| {
            // 앱 시작 시 첨부파일 경로 마이그레이션 자동 실행
            let _ = crate::transactions::migrate_attachment_paths_to_relative(app.handle().clone());
            // Initialize SQLite database schema
            utils::init_db(&app.handle()).map_err(|e| e.to_string())?;
            // Create and manage database connection
            let db_path = utils::get_db_path(&app.handle());
            let conn = Connection::open(&db_path).expect("Failed to open DB");
            app.manage(Mutex::new(conn));
            // Enable logging plugin in development
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Only show main window
            let main_window = app.get_webview_window("main").unwrap();
            main_window.show().unwrap();
            main_window.set_focus().unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_accounts,
            create_account,
            update_account,
            delete_account,
            get_transactions,
            create_transaction,
            update_transaction,
            delete_transaction,
            bulk_update_transactions,
            import_transactions,
            save_transaction_attachment,
            delete_transaction_attachment,
            open_transaction_attachment,
            get_budgets,
            add_budget,
            update_budget,
            delete_budget,
            get_recurring_items,
            add_recurring_item,
            update_recurring_item,
            delete_recurring_item,
            update_recurring_check,
            get_recurring_checks,
            get_categories,
            get_categories_full,
            add_category,
            update_category,
            delete_category,
            backup_database,
            restore_database,
            export_database,
            import_database,
            create_backup_folder,
            manual_backup_to_onedrive,
            get_backup_history,
            delete_backup_from_history,
            restore_backup_from_history,
            get_spending_by_category,
            get_income_vs_expenses,
            get_net_worth_history,
            get_account_import_settings,
            update_account_import_settings,
            get_csv_sign_logic_for_account,
            home_dir,
            get_onedrive_path,
            reset_database,
            reminders::get_reminders,
            reminders::add_reminder,
            reminders::update_reminder,
            reminders::delete_reminder,
            reminders::check_reminder,
            reminders::get_reminder_payment_history,
            reminders::add_reminder_payment_history,
            reminders::uncheck_reminder_payment_history,
            reminders::delete_reminder_payment_history,
            reminders::update_reminder_payment_history_note,
            reminders::get_statement_balance,
            reminders::add_note_to_reminder,
            reminders::delete_note_from_reminder,

        ])
        .run(context)
        .expect("error while running tauri application");
    Ok(())
} 