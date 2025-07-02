mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let context = tauri::generate_context!();
  tauri::Builder::default()
    .setup(|app| {
      // Initialize SQLite database schema
      db::init_db(&app.handle()).map_err(|e| e.to_string())?;
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
      db::get_accounts,
      db::create_account,
      db::update_account,
      db::delete_account,
      db::get_transactions,
      db::create_transaction,
      db::update_transaction,
      db::delete_transaction,
      db::bulk_update_transactions,
      db::import_transactions,
      db::get_budgets,
      db::add_budget,
      db::update_budget,
      db::delete_budget,
      db::get_categories,
      db::get_categories_full,
      db::add_category,
      db::update_category,
      db::delete_category,
      db::backup_database,
      db::restore_database,
      db::export_database,
      db::import_database,
      db::get_spending_by_category,
      db::get_income_vs_expenses,
      db::get_net_worth_history,
      db::get_account_import_settings,
      db::update_account_import_settings,
      db::get_csv_sign_logic_for_account,
      db::get_onedrive_path,
      db::create_backup_folder,
    ])
    .run(context)
    .expect("error while running tauri application");
} 