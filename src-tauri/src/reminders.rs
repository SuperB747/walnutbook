use rusqlite::{params, Connection};
use tauri::AppHandle;
use crate::models::Reminder;
use crate::utils::get_db_path;
use serde_json;
use crate::models::ReminderPaymentHistory;

#[tauri::command]
pub fn get_reminders(app: AppHandle) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, account_id, account_name, payment_day, next_payment_date, is_checked, notes, created_at, statement_date FROM reminders ORDER BY is_checked ASC, next_payment_date ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let notes_str: Option<String> = row.get(6)?;
        let notes: Option<Vec<String>> = match notes_str {
            Some(s) => serde_json::from_str(&s).ok(),
            None => None,
        };
        Ok(Reminder {
            id: row.get(0)?,
            account_id: row.get(1)?,
            account_name: row.get(2)?,
            payment_day: row.get(3)?,
            next_payment_date: row.get(4)?,
            is_checked: row.get(5)?,
            notes,
            created_at: row.get(7)?,
            statement_date: row.get(8)?,
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
    let notes_json = reminder.notes.as_ref().map(|n| serde_json::to_string(n).unwrap_or_default());
    conn.execute(
        "INSERT INTO reminders (account_id, account_name, payment_day, next_payment_date, is_checked, notes, statement_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            reminder.account_id,
            reminder.account_name,
            reminder.payment_day,
            reminder.next_payment_date,
            reminder.is_checked,
            notes_json,
            reminder.statement_date,
        ],
    ).map_err(|e| e.to_string())?;
    get_reminders(app)
}

#[tauri::command]
pub fn update_reminder(app: AppHandle, reminder: Reminder) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let notes_json = reminder.notes.as_ref().map(|n| serde_json::to_string(n).unwrap_or_default());
    conn.execute(
        "UPDATE reminders SET account_id = ?1, account_name = ?2, payment_day = ?3, next_payment_date = ?4, is_checked = ?5, notes = ?6, statement_date = ?7 WHERE id = ?8",
        params![
            reminder.account_id,
            reminder.account_name,
            reminder.payment_day,
            reminder.next_payment_date,
            reminder.is_checked,
            notes_json,
            reminder.statement_date,
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
pub fn check_reminder(app: AppHandle, id: i64, next_payment_date: String, next_statement_date: String) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE reminders SET is_checked = 1, next_payment_date = ?1, statement_date = ?2 WHERE id = ?3",
        params![next_payment_date, next_statement_date, id],
    ).map_err(|e| e.to_string())?;
    get_reminders(app)
}

#[tauri::command]
pub fn add_note_to_reminder(app: AppHandle, id: i64, note: String) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    let mut notes: Vec<String> = {
        let mut stmt = conn.prepare("SELECT notes FROM reminders WHERE id = ?1").map_err(|e| e.to_string())?;
        let notes_str: Option<String> = stmt.query_row(params![id], |row| row.get(0)).ok();
        match notes_str {
            Some(s) => serde_json::from_str(&s).unwrap_or_else(|_| vec![]),
            None => vec![],
        }
    };
    notes.insert(0, note); // 최신순
    let notes_json = serde_json::to_string(&notes).unwrap_or_default();
    conn.execute("UPDATE reminders SET notes = ?1 WHERE id = ?2", params![notes_json, id]).map_err(|e| e.to_string())?;
    get_reminders(app)
}

#[tauri::command]
pub fn delete_note_from_reminder(app: AppHandle, id: i64, note_index: usize) -> Result<Vec<Reminder>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    let mut notes: Vec<String> = {
        let mut stmt = conn.prepare("SELECT notes FROM reminders WHERE id = ?1").map_err(|e| e.to_string())?;
        let notes_str: Option<String> = stmt.query_row(params![id], |row| row.get(0)).ok();
        match notes_str {
            Some(s) => serde_json::from_str(&s).unwrap_or_else(|_| vec![]),
            None => vec![],
        }
    };
    if note_index < notes.len() {
        notes.remove(note_index);
    }
    let notes_json = serde_json::to_string(&notes).unwrap_or_default();
    conn.execute("UPDATE reminders SET notes = ?1 WHERE id = ?2", params![notes_json, id]).map_err(|e| e.to_string())?;
    get_reminders(app)
}

#[tauri::command]
pub fn get_reminder_payment_history(app: AppHandle, reminder_id: i64) -> Result<Vec<ReminderPaymentHistory>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, reminder_id, paid_date, is_paid, created_at, statement_date, note
         FROM reminder_payment_history
         WHERE reminder_id = ?1 AND paid_date >= date('now', '-6 months')
         ORDER BY paid_date DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![reminder_id], |row| {
        Ok(ReminderPaymentHistory {
            id: row.get(0)?,
            reminder_id: row.get(1)?,
            paid_date: row.get(2)?,
            is_paid: row.get(3)?,
            created_at: row.get(4)?,
            statement_date: row.get(5)?,
            note: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut history = Vec::new();
    for r in rows {
        history.push(r.map_err(|e| e.to_string())?);
    }
    Ok(history)
}

#[tauri::command]
pub fn add_reminder_payment_history(app: AppHandle, reminder_id: i64, paid_date: String, statement_date: Option<String>, note: Option<String>) -> Result<(), String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    if let Some(statement_date) = statement_date {
        conn.execute(
            "INSERT INTO reminder_payment_history (reminder_id, paid_date, is_paid, statement_date, note) VALUES (?1, ?2, 1, ?3, ?4)",
            params![reminder_id, paid_date, statement_date, note],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO reminder_payment_history (reminder_id, paid_date, is_paid, note) VALUES (?1, ?2, 1, ?3)",
            params![reminder_id, paid_date, note],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn uncheck_reminder_payment_history(app: AppHandle, id: i64) -> Result<(), String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE reminder_payment_history SET is_paid = 0 WHERE id = ?1",
        params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_reminder_payment_history(app: AppHandle, id: i64) -> Result<(), String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Get reminder_id, paid_date, and statement_date before deleting
    let mut stmt = conn.prepare("SELECT reminder_id, paid_date, statement_date FROM reminder_payment_history WHERE id = ?1").map_err(|e| e.to_string())?;
    let (reminder_id, paid_date, statement_date): (i64, String, Option<String>) = stmt.query_row(params![id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).map_err(|e| e.to_string())?;
    // Delete payment history
    conn.execute("DELETE FROM reminder_payment_history WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    // Rollback next_payment_date and statement_date
    if let Some(statement_date) = statement_date {
        conn.execute("UPDATE reminders SET next_payment_date = ?1, statement_date = ?2, is_checked = 0 WHERE id = ?3", params![paid_date, statement_date, reminder_id]).map_err(|e| e.to_string())?;
    } else {
        conn.execute("UPDATE reminders SET next_payment_date = ?1, is_checked = 0 WHERE id = ?2", params![paid_date, reminder_id]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_reminder_payment_history_note(app: AppHandle, id: i64, note: String) -> Result<(), String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE reminder_payment_history SET note = ?1 WHERE id = ?2",
        params![note, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_statement_balance(app: AppHandle, accountId: i64, startDate: String, endDate: String) -> Result<f64, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    

    
         // Statement Balance 계산: Transfer가 아닌 모든 트랜잭션 포함 (Reimbursement 카테고리 포함)
     let mut stmt = conn.prepare(
         "SELECT SUM(t.amount) 
          FROM transactions t 
          WHERE t.account_id = ?1 
          AND t.date >= ?2 
          AND t.date <= ?3 
          AND t.type != 'Transfer'"
     ).map_err(|e| e.to_string())?;
    
    let sum: f64 = stmt.query_row(params![accountId, startDate, endDate], |row| row.get(0)).unwrap_or(0.0);
    
         // 디버깅: Reimbursement 카테고리 트랜잭션도 확인
     let mut reimbursement_stmt = conn.prepare(
         "SELECT SUM(t.amount), COUNT(*) 
          FROM transactions t 
          LEFT JOIN categories c ON t.category_id = c.id 
          WHERE t.account_id = ?1 
          AND t.date >= ?2 
          AND t.date <= ?3 
          AND t.type != 'Transfer' 
          AND c.is_reimbursement = 1"
     ).map_err(|e| e.to_string())?;
    
    let _reimbursement_result: (f64, i64) = reimbursement_stmt.query_row(
        params![accountId, startDate, endDate], 
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((0.0, 0));
    
         // 디버깅: 해당 기간의 모든 트랜잭션 세부 정보 출력
     let mut detail_stmt = conn.prepare(
         "SELECT t.date, t.type, t.amount, c.name as category_name, c.is_reimbursement
          FROM transactions t 
          LEFT JOIN categories c ON t.category_id = c.id 
          WHERE t.account_id = ?1 
          AND t.date >= ?2 
          AND t.date <= ?3 
          AND t.type != 'Transfer'
          ORDER BY t.date DESC"
     ).map_err(|e| e.to_string())?;
     
     let _rows = detail_stmt.query_map(params![accountId, startDate, endDate], |row| {
         Ok((
             row.get::<_, String>(0)?,
             row.get::<_, String>(1)?,
             row.get::<_, Option<String>>(3)?,
             row.get::<_, Option<bool>>(4)?
         ))
     }).map_err(|e| e.to_string())?;
     

     
     // 트랜잭션 목록을 다시 조회 (count()로 인해 iterator가 소비됨)
     let mut detail_stmt2 = conn.prepare(
         "SELECT t.date, t.type, t.amount, c.name as category_name, c.is_reimbursement
          FROM transactions t 
          LEFT JOIN categories c ON t.category_id = c.id 
          WHERE t.account_id = ?1 
          AND t.date >= ?2 
          AND t.date <= ?3 
          AND t.type != 'Transfer'
          ORDER BY t.date DESC"
     ).map_err(|e| e.to_string())?;
     
     let rows2 = detail_stmt2.query_map(params![accountId, startDate, endDate], |row| {
         Ok((
             row.get::<_, String>(0)?,
             row.get::<_, String>(1)?,
             row.get::<_, f64>(2)?,
             row.get::<_, Option<String>>(3)?,
             row.get::<_, Option<bool>>(4)?
         ))
     }).map_err(|e| e.to_string())?;
     
     let mut _total_amount = 0.0;
     let mut _transaction_count = 0;
     
     for row in rows2 {
         if let Ok((_date, _tx_type, amount, category_name, is_reimbursement)) = row {
             let _category_info = category_name.unwrap_or_else(|| "Unknown".to_string());
             let _reimbursement_flag = is_reimbursement.unwrap_or(false);
             
             _total_amount += amount;
             _transaction_count += 1;
             

         }
     }
    

    
    Ok(sum)
} 