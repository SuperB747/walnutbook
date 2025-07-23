use rusqlite::{params, Connection};
use tauri::AppHandle;
use crate::models::Reminder;
use crate::utils::get_db_path;

#[tauri::command]
pub fn get_reminders(app: AppHandle) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, account_id, account_name, payment_day, next_payment_date, is_checked, notes, created_at FROM reminders ORDER BY next_payment_date ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Reminder {
            id: row.get(0)?,
            account_id: row.get(1)?,
            account_name: row.get(2)?,
            payment_day: row.get(3)?,
            next_payment_date: row.get(4)?,
            is_checked: row.get(5)?,
            notes: row.get(6).ok(),
            created_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut reminders = Vec::new();
    for r in rows {
        reminders.push(r.map_err(|e| e.to_string())?);
    }
    Ok(reminders)
}

#[tauri::command]
pub fn add_reminder(app: AppHandle, reminder: Reminder) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO reminders (account_id, account_name, payment_day, next_payment_date, is_checked, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            reminder.account_id,
            reminder.account_name,
            reminder.payment_day,
            reminder.next_payment_date,
            reminder.is_checked,
            reminder.notes,
        ],
    ).map_err(|e| e.to_string())?;
    get_reminders(app)
}

#[tauri::command]
pub fn update_reminder(app: AppHandle, reminder: Reminder) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE reminders SET account_id = ?1, account_name = ?2, payment_day = ?3, next_payment_date = ?4, is_checked = ?5, notes = ?6 WHERE id = ?7",
        params![
            reminder.account_id,
            reminder.account_name,
            reminder.payment_day,
            reminder.next_payment_date,
            reminder.is_checked,
            reminder.notes,
            reminder.id,
        ],
    ).map_err(|e| e.to_string())?;
    get_reminders(app)
}

#[tauri::command]
pub fn delete_reminder(app: AppHandle, id: i64) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM reminders WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    get_reminders(app)
}

#[tauri::command]
pub fn check_reminder(app: AppHandle, id: i64, next_payment_date: String) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    // 체크 처리: is_checked true로, 다음 결제일 갱신
    conn.execute(
        "UPDATE reminders SET is_checked = 1, next_payment_date = ?1 WHERE id = ?2",
        params![next_payment_date, id],
    ).map_err(|e| e.to_string())?;
    get_reminders(app)
} 