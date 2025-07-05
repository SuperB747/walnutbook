mod models;
mod utils;
mod accounts;
mod transactions;
mod categories;
mod budgets;
mod backup;

// Re-export specific types and functions from models
pub use models::{Account, Transaction, Category, Budget, AccountImportSettings};

// Re-export utility functions
pub use utils::{init_db, home_dir, get_onedrive_path, reset_database};

// Re-export account functions
pub use accounts::{get_accounts, create_account, update_account, delete_account};

// Re-export transaction functions
pub use transactions::{
    get_transactions, create_transaction, update_transaction, delete_transaction,
    bulk_update_transactions, import_transactions
};

// Re-export category functions
pub use categories::{
    get_categories, get_categories_full, add_category, update_category, delete_category,
    get_spending_by_category, get_income_vs_expenses, get_net_worth_history
};

// Re-export budget functions
pub use budgets::{get_budgets, add_budget, update_budget, delete_budget};

// Re-export backup functions
pub use backup::{backup_database, restore_database, export_database, import_database, create_backup_folder};

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
            // Initialize SQLite database schema
            utils::init_db(&app.handle()).map_err(|e| e.to_string())?;
            // Enable logging plugin in development
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
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
            get_budgets,
            add_budget,
            update_budget,
            delete_budget,
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
            get_spending_by_category,
            get_income_vs_expenses,
            get_net_worth_history,
            get_account_import_settings,
            update_account_import_settings,
            get_csv_sign_logic_for_account,
            home_dir,
            get_onedrive_path,
            reset_database,
        ])
        .run(context)
        .expect("error while running tauri application");
    Ok(())
} 