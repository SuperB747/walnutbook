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
pub fn add_budget(app: AppHandle, category_id: i64, amount: f64, month: String, notes: Option<String>) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    match conn.execute(
        "INSERT INTO budgets (category_id, amount, month, notes) VALUES (?1, ?2, ?3, ?4)",
        params![category_id, amount, month, notes],
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
pub fn delete_budget(app: AppHandle, id: i64, current_month: String) -> Result<Vec<Budget>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    // Check if budget exists before deleting
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM budgets WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    
    if !exists {
        return Err(format!("Budget with id {} not found", id));
    }
    
    // Get budget info for logging
    let budget_info: Result<(i64, String), _> = conn.query_row(
        "SELECT category_id, month FROM budgets WHERE id = ?1",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );
    
    // Delete the budget
    let rows_affected = conn.execute(
        "DELETE FROM budgets WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    
    if rows_affected == 0 {
        return Err(format!("Failed to delete budget with id {}", id));
    }
    
    // Log successful deletion
    if let Ok((category_id, month)) = budget_info {
        println!("Successfully deleted budget: id={}, category_id={}, month={}", id, category_id, month);
    }
    
    get_budgets(app, current_month)
} 