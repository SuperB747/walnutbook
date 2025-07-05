use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::collections::HashSet;
use tauri::AppHandle;

use crate::models::Transaction;
use crate::utils::get_db_path;

#[derive(Debug)]
enum TransactionKey {
    Regular(String, i64, String),
    Transfer(String, i64),
}

#[tauri::command]
pub fn get_transactions(app: AppHandle) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT t.id, t.date, t.account_id, t.type, t.category_id, t.amount, t.payee, t.notes, t.transfer_id, t.created_at FROM transactions t ORDER BY t.date DESC")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt
        .query_map([], |row| {
            let date: Option<String> = row.get(1)?;
            let date = date.unwrap_or_else(|| {
                Utc::now().format("%Y-%m-%d").to_string()
            });
            
            Ok(Transaction {
                id: row.get(0)?,
                date,
                account_id: row.get(2)?,
                transaction_type: row.get(3)?,
                category_id: row.get(4)?,
                amount: row.get(5)?,
                payee: row.get(6)?,
                notes: row.get(7)?,
                transfer_id: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    
    let mut transactions = Vec::new();
    for tr in rows {
        transactions.push(tr.map_err(|e| e.to_string())?);
    }
    Ok(transactions)
}

#[tauri::command]
pub fn create_transaction(app: AppHandle, transaction: Transaction) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    // Insert new transaction
    conn.execute(
        "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            transaction.date,
            transaction.account_id,
            transaction.transaction_type,
            transaction.category_id,
            transaction.amount,
            transaction.payee,
            transaction.notes.clone().unwrap_or_default(),
            transaction.transfer_id
        ],
    ).map_err(|e| e.to_string())?;
    
    get_transactions(app)
}

#[tauri::command]
pub fn update_transaction(app: AppHandle, transaction: Transaction) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    if transaction.transaction_type == "transfer" {
        return Err("Cannot update transfer transactions".to_string());
    }
    
    conn.execute(
        "UPDATE transactions SET date = ?1, account_id = ?2, type = ?3, category_id = ?4, amount = ?5, payee = ?6, notes = ?7 WHERE id = ?8",
        params![
            transaction.date,
            transaction.account_id,
            transaction.transaction_type,
            transaction.category_id,
            transaction.amount,
            transaction.payee,
            transaction.notes.clone().unwrap_or_default(),
            transaction.id
        ],
    ).map_err(|e| e.to_string())?;
    
    get_transactions(app)
}

#[tauri::command]
pub fn delete_transaction(app: AppHandle, id: i64) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let mut conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    // Retrieve transaction info
    let (old_type, old_amount, acct_id, _old_category_id, _old_date, _old_payee) = {
        let mut sel = conn.prepare("SELECT type, amount, account_id, category_id, date, payee FROM transactions WHERE id = ?1").map_err(|e| e.to_string())?;
        let mut rows = sel.query_map(params![id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, i64>(2)?, row.get::<_, Option<i64>>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?))
        }).map_err(|e| e.to_string())?;
        rows.next().ok_or("Transaction not found".to_string())?.map_err(|e| e.to_string())?
    };
    
    // Handle transfer transaction deletion
    if old_type == "transfer" {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        
        // Find and delete both sides of the transfer
        let transfer_id: Option<i64> = tx.query_row(
            "SELECT transfer_id FROM transactions WHERE id = ?1",
            params![id],
            |r| r.get(0),
        ).ok();
        
        if let Some(transfer_id) = transfer_id {
            // Delete both transactions with the same transfer_id
            tx.execute("DELETE FROM transactions WHERE transfer_id = ?1", params![transfer_id]).map_err(|e| e.to_string())?;
        } else {
            // Legacy transfer handling
            let other_transaction = if old_amount < 0.0 {
                tx.query_row(
                    "SELECT id FROM transactions WHERE type = 'transfer' AND date = ?1 AND ABS(amount) = ?2 AND account_id != ?3 AND notes = ?4 AND payee = ?5 LIMIT 1",
                    params![_old_date, old_amount.abs(), acct_id, format!("[To: {}]", acct_id), _old_payee],
                    |row| row.get::<_, i64>(0)
                ).ok()
            } else {
                tx.query_row(
                    "SELECT id FROM transactions WHERE type = 'transfer' AND date = ?1 AND ABS(amount) = ?2 AND account_id != ?3 AND notes = ?4 AND payee = ?5 LIMIT 1",
                    params![_old_date, old_amount.abs(), acct_id, format!("[From: {}]", acct_id), _old_payee],
                    |row| row.get::<_, i64>(0)
                ).ok()
            };
            
            // Delete both transactions
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
            if let Some(other_id) = other_transaction {
                tx.execute("DELETE FROM transactions WHERE id = ?1", params![other_id]).map_err(|e| e.to_string())?;
            }
        }
        
        tx.commit().map_err(|e| e.to_string())?;
    } else {
        // Delete single transaction
        conn.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    }
    
    get_transactions(app)
}

#[tauri::command]
pub fn import_transactions(app: AppHandle, transactions: Vec<Transaction>) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let mut conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    // Collect existing transactions for duplicate checking
    let (existing_keys, transfer_keys) = {
        let mut existing_keys = HashSet::new();
        let mut transfer_keys = HashSet::new();
        let mut stmt = conn.prepare("SELECT date, amount, payee, type FROM transactions").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            let date: String = row.get(0)?;
            let amount: f64 = row.get(1)?;
            let payee: String = row.get(2)?;
            let ttype: String = row.get(3)?;
            let cents = (amount * 100.0).round() as i64;
            Ok(if ttype == "transfer" {
                TransactionKey::Transfer(date, cents)
            } else {
                TransactionKey::Regular(date, cents, payee)
            })
        }).map_err(|e| e.to_string())?;
        
        for row in rows {
            match row.map_err(|e| e.to_string())? {
                TransactionKey::Regular(date, cents, payee) => {
                    existing_keys.insert((date, cents, payee));
                },
                TransactionKey::Transfer(date, cents) => {
                    transfer_keys.insert((date, cents));
                }
            }
        }
        (existing_keys, transfer_keys)
    };
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Import new transactions
    for t in transactions {
        if t.date.is_empty() { return Err("Missing date".into()); }
        
        let cents = (t.amount * 100.0).round() as i64;
        let key = (t.date.clone(), cents, t.payee.clone());
        
        // Skip if duplicate
        if existing_keys.contains(&key) { continue; }
        
        // Skip if duplicate transfer
        let transfer_key = (t.date.clone(), cents);
        if transfer_keys.contains(&transfer_key) { continue; }
        
        // Insert new transaction
        tx.execute(
            "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                t.date,
                t.account_id,
                t.transaction_type,
                t.category_id,
                t.amount,
                t.payee,
                t.notes.clone().unwrap_or_default(),
                None::<i64>
            ],
        ).map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    get_transactions(app)
}

#[tauri::command]
pub fn bulk_update_transactions(app: AppHandle, updates: Vec<(i64, Value)>) -> Result<Vec<Transaction>, String> {
    for (id, changes) in updates {
        // Fetch existing transaction
        let path = get_db_path(&app);
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        let existing: Transaction = conn.query_row(
            "SELECT id, date, account_id, type, category_id, amount, payee, notes, transfer_id, created_at FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok(Transaction {
                id: row.get(0)?, date: row.get(1)?, account_id: row.get(2)?,
                transaction_type: row.get(3)?, category_id: row.get(4)?, amount: row.get(5)?,
                payee: row.get(6)?, notes: row.get(7)?, transfer_id: row.get(8)?, created_at: row.get(9)?,
            }),
        ).map_err(|e| e.to_string())?;
        
        // Merge changes
        let mut updated = existing.clone();
        if let Some(v) = changes.get("date").and_then(|v| v.as_str()) { updated.date = v.to_string(); }
        if let Some(v) = changes.get("account_id").and_then(|v| v.as_i64()) { updated.account_id = v; }
        if let Some(v) = changes.get("type").and_then(|v| v.as_str()) { updated.transaction_type = v.to_string(); }
        if let Some(v) = changes.get("category_id").and_then(|v| v.as_i64()) { updated.category_id = Some(v); }
        if let Some(v) = changes.get("amount").and_then(|v| v.as_f64()) { updated.amount = v; }
        if let Some(v) = changes.get("payee").and_then(|v| v.as_str()) { updated.payee = v.to_string(); }
        if let Some(v) = changes.get("notes").and_then(|v| v.as_str()) { updated.notes = Some(v.to_string()); }
        
        // Apply update
        update_transaction(app.clone(), updated)?;
    }
    get_transactions(app)
} 