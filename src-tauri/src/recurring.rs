use crate::models::RecurringItem;
use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::State;

pub type DbState = Mutex<Connection>;

#[tauri::command]
pub fn get_recurring_items(state: State<DbState>) -> Result<Vec<RecurringItem>, String> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, amount, type, category_id, account_id, day_of_month, is_active, notes, created_at, 
                repeat_type, start_date, interval_value, interval_unit
         FROM recurring_items 
         ORDER BY name"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map([], |row| {
        Ok(RecurringItem {
            id: row.get(0)?,
            name: row.get(1)?,
            amount: row.get(2)?,
            item_type: row.get(3)?,
            category_id: row.get(4)?,
            account_id: row.get(5)?,
            day_of_month: row.get(6)?,
            is_active: row.get(7)?,
            notes: row.get(8)?,
            created_at: row.get(9)?,
            repeat_type: row.get(10)?,
            start_date: row.get(11)?,
            interval_value: row.get(12)?,
            interval_unit: row.get(13)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for item in items {
        result.push(item.map_err(|e| e.to_string())?);
    }
    Ok(result)
}



#[tauri::command]
pub fn add_recurring_item(
    state: State<DbState>,
    name: String,
    amount: f64,
    item_type: Option<String>,
    item_type_alt: Option<String>, // For itemType from JS
    category_id: Option<i64>,
    category_id_alt: Option<i64>, // For categoryId from JS
    account_id: Option<i64>,
    account_id_alt: Option<i64>, // For accountId from JS
    day_of_month: Option<String>,
    day_of_month_alt: Option<String>, // For dayOfMonth from JS
    is_active: Option<bool>,
    is_active_alt: Option<bool>, // For isActive from JS
    notes: Option<String>,
    repeat_type: Option<String>,
    repeat_type_alt: Option<String>, // For repeatType from JS
    start_date: Option<String>,
    start_date_alt: Option<String>, // For startDate from JS
    interval_value: Option<i32>,
    interval_value_alt: Option<i32>, // For intervalValue from JS
    interval_unit: Option<String>,
    interval_unit_alt: Option<String>, // For intervalUnit from JS
) -> Result<Vec<RecurringItem>, String> {
    // Use whichever values are provided
    let final_item_type = item_type.or(item_type_alt).unwrap_or_else(|| "Expense".to_string());
    let final_category_id = category_id.or(category_id_alt).unwrap_or(0);
    let final_account_id = account_id.or(account_id_alt).unwrap_or(0);
    let final_day_of_month = day_of_month.or(day_of_month_alt).unwrap_or_else(|| "[1]".to_string());
    let final_is_active = is_active.or(is_active_alt).unwrap_or(true);
    let final_notes = notes.unwrap_or_else(String::new);
    let final_repeat_type = repeat_type.or(repeat_type_alt).unwrap_or_else(|| "monthly_date".to_string());
    let final_start_date = start_date.or(start_date_alt);
    let final_interval_value = interval_value.or(interval_value_alt).unwrap_or(1);
    let final_interval_unit = interval_unit.or(interval_unit_alt).unwrap_or_else(|| "month".to_string());
    
    {
        let conn = state.lock().unwrap();
        conn.execute(
            "INSERT INTO recurring_items (name, amount, type, category_id, account_id, day_of_month, is_active, notes, created_at, 
                                       repeat_type, start_date, interval_value, interval_unit) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)",
            rusqlite::params![
                name, amount, final_item_type, final_category_id, final_account_id, final_day_of_month, final_is_active, final_notes,
                final_repeat_type,
                final_start_date,
                final_interval_value,
                final_interval_unit
            ],
        ).map_err(|e| e.to_string())?;
    }

    get_recurring_items(state)
}



#[tauri::command]
pub fn update_recurring_item(
    state: State<DbState>,
    id: i64,
    name: String,
    amount: f64,
    item_type: Option<String>,
    item_type_alt: Option<String>, // For itemType from JS
    category_id: Option<i64>,
    category_id_alt: Option<i64>, // For categoryId from JS
    account_id: Option<i64>,
    account_id_alt: Option<i64>, // For accountId from JS
    day_of_month: Option<String>,
    day_of_month_alt: Option<String>, // For dayOfMonth from JS
    is_active: Option<bool>,
    is_active_alt: Option<bool>, // For isActive from JS
    notes: Option<String>,
    repeat_type: Option<String>,
    repeat_type_alt: Option<String>, // For repeatType from JS
    start_date: Option<String>,
    start_date_alt: Option<String>, // For startDate from JS
    interval_value: Option<i32>,
    interval_value_alt: Option<i32>, // For intervalValue from JS
    interval_unit: Option<String>,
    interval_unit_alt: Option<String>, // For intervalUnit from JS
) -> Result<Vec<RecurringItem>, String> {
    // Use whichever values are provided
    let final_item_type = item_type.or(item_type_alt).unwrap_or_else(|| "Expense".to_string());
    let final_category_id = category_id.or(category_id_alt).unwrap_or(0);
    let final_account_id = account_id.or(account_id_alt).unwrap_or(0);
    let final_day_of_month = day_of_month.or(day_of_month_alt).unwrap_or_else(|| "[1]".to_string());
    let final_is_active = is_active.or(is_active_alt).unwrap_or(true);
    let final_notes = notes.unwrap_or_else(String::new);
    let final_repeat_type = repeat_type.or(repeat_type_alt).unwrap_or_else(|| "monthly_date".to_string());
    let final_start_date = start_date.or(start_date_alt);
    let final_interval_value = interval_value.or(interval_value_alt).unwrap_or(1);
    let final_interval_unit = interval_unit.or(interval_unit_alt).unwrap_or_else(|| "month".to_string());
    
    {
        let conn = state.lock().unwrap();
        conn.execute(
            "UPDATE recurring_items 
             SET name = ?, amount = ?, type = ?, category_id = ?, account_id = ?, day_of_month = ?, is_active = ?, notes = ?,
                 repeat_type = ?, start_date = ?, interval_value = ?, interval_unit = ?
             WHERE id = ?",
            rusqlite::params![
                name, amount, final_item_type, final_category_id, final_account_id, final_day_of_month, final_is_active, final_notes,
                final_repeat_type,
                final_start_date,
                final_interval_value,
                final_interval_unit,
                id
            ],
        ).map_err(|e| e.to_string())?;
    }

    get_recurring_items(state)
}

#[tauri::command]
pub fn delete_recurring_item(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.lock().unwrap();
    
    conn.execute("DELETE FROM recurring_items WHERE id = ?", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
} 

#[tauri::command]
pub fn update_recurring_check(
    state: State<DbState>,
    occurrence_id: String,
    month: String,
    is_checked: bool,
) -> Result<(), String> {
    let conn = state.lock().unwrap();
    
    // Insert or replace the check status for the specific occurrence and month
    conn.execute(
        "INSERT OR REPLACE INTO recurring_checks (occurrence_id, month, is_checked, updated_at) 
         VALUES (?, ?, ?, datetime('now'))",
        rusqlite::params![occurrence_id, month, is_checked],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn get_recurring_checks(
    state: State<DbState>,
    month: String,
) -> Result<Vec<String>, String> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT occurrence_id FROM recurring_checks 
         WHERE month = ? AND is_checked = 1"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map([month], |row| {
        Ok(row.get(0)?)
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for item in items {
        result.push(item.map_err(|e| e.to_string())?);
    }
    Ok(result)
} 