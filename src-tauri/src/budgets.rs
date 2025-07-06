use rusqlite::{params, Connection};
use tauri::AppHandle;

use crate::models::Budget;
use crate::utils::get_db_path;

#[tauri::command]
pub fn get_budgets(app: AppHandle, month: String) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, category_id, amount, month, notes, created_at FROM budgets WHERE month = ?1"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![month], |row| {
        Ok(Budget {
            id: row.get(0)?,
            category_id: row.get(1)?,
            amount: row.get(2)?,
            month: row.get(3)?,
            notes: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut budgets = Vec::new();
    for budget in rows {
        budgets.push(budget.map_err(|e| e.to_string())?);
    }
    Ok(budgets)
}

#[tauri::command]
pub fn add_budget(app: AppHandle, categoryId: i64, amount: f64, month: String, notes: Option<String>) -> Result<Vec<Budget>, String> {
    println!(
        "[DEBUG] add_budget called with: categoryId={:?}, amount={:?}, month={:?}, notes={:?}",
        categoryId, amount, month, notes
    );
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    match conn.execute(
        "INSERT INTO budgets (category_id, amount, month, notes) VALUES (?1, ?2, ?3, ?4)",
        params![categoryId, amount, month, notes],
    ) {
        Ok(_) => {},
        Err(e) => {
            let msg = e.to_string();
            // Ignore unique constraint failure (duplicate budget)
            if msg.contains("UNIQUE constraint failed") {
                // Skip duplicate entry
            } else {
                return Err(msg);
            }
        }
    }
    
    get_budgets(app, month)
}

#[tauri::command]
pub fn update_budget(app: AppHandle, budget: Budget) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE budgets SET category_id = ?1, amount = ?2, notes = ?3 WHERE id = ?4",
        params![budget.category_id, budget.amount, budget.notes, budget.id],
    )
    .map_err(|e| e.to_string())?;
    get_budgets(app, budget.month)
}

#[tauri::command]
pub fn delete_budget(app: AppHandle, id: i64) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    // Get month before deleting
    let month: String = conn.query_row(
        "SELECT month FROM budgets WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "DELETE FROM budgets WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    
    get_budgets(app, month)
} 