mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
      db::get_category_rules,
      db::add_category_rule,
      db::delete_category_rule,
      db::find_matching_category,
      db::import_transactions,
      db::get_budgets,
      db::add_budget,
      db::update_budget,
      db::delete_budget,
      db::get_categories,
      db::get_spending_by_category,
      db::get_income_vs_expenses,
      db::get_net_worth_history
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
