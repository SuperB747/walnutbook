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
    let mut conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    println!("[DEBUG] Creating transaction: type={}, account_id={}, amount={}, payee={}, notes={:?}", 
             transaction.transaction_type, transaction.account_id, transaction.amount, transaction.payee, transaction.notes);
    
    // Transfer 거래 특별 처리
    if transaction.transaction_type == "Transfer" {
        println!("[DEBUG] Processing Transfer transaction");
        let tx = conn.transaction().map_err(|e| {
            println!("[DEBUG] Failed to start transaction: {}", e);
            e.to_string()
        })?;
        
        // Transfer ID 생성
        let transfer_id = tx.query_row(
            "SELECT COALESCE(MAX(transfer_id), 0) + 1 FROM transactions",
            [],
            |r| r.get::<_, i64>(0)
        ).map_err(|e| {
            println!("[DEBUG] Failed to get transfer_id: {}", e);
            e.to_string()
        })?;
        
        println!("[DEBUG] Generated transfer_id: {}", transfer_id);
        
        // 출발 계좌 트랜잭션 (음수)
        let departure_amount = -transaction.amount.abs();
        println!("[DEBUG] Creating departure transaction: account_id={}, amount={}", transaction.account_id, departure_amount);
        
        tx.execute(
            "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                transaction.date,
                transaction.account_id,
                transaction.transaction_type,
                None::<i64>,
                departure_amount,
                transaction.payee,
                transaction.notes.clone().unwrap_or_default(),
                transfer_id
            ],
        ).map_err(|e| {
            println!("[DEBUG] Failed to insert departure transaction: {}", e);
            e.to_string()
        })?;
        
        println!("[DEBUG] Departure transaction inserted successfully");
        
        // 도착 계좌 ID 추출 (notes에서)
        let to_account_id = if let Some(notes) = &transaction.notes {
            println!("[DEBUG] Processing notes: {}", notes);
            
            // 새로운 형식: [TO_ACCOUNT_ID:계좌ID] 패턴 확인
            if notes.contains("[TO_ACCOUNT_ID:") {
                if let Some(start) = notes.find("[TO_ACCOUNT_ID:") {
                    if let Some(end) = notes[start..].find("]") {
                        let account_id_str = &notes[start + 15..start + end];
                        if let Ok(account_id) = account_id_str.parse::<i64>() {
                            println!("[DEBUG] Found to_account_id from new format: {}", account_id);
                            Some(account_id)
                        } else {
                            println!("[DEBUG] Failed to parse account_id from: {}", account_id_str);
                            None
                        }
                    } else {
                        println!("[DEBUG] No closing bracket found in new format");
                        None
                    }
                } else {
                    println!("[DEBUG] No '[TO_ACCOUNT_ID:' pattern found");
                    None
                }
            }
            // 레거시 형식: [To: 계좌명] 패턴 확인
            else if notes.contains("[To:") {
                // [To: 계좌명] 패턴에서 계좌명만 추출
                let account_name = if let Some(start) = notes.find("[To:") {
                    if let Some(end) = notes[start..].find("]") {
                        let extracted = &notes[start + 4..start + end].trim();
                        println!("[DEBUG] Extracted account name: '{}'", extracted);
                        extracted.to_string()
                    } else {
                        println!("[DEBUG] No closing bracket found");
                        String::new()
                    }
                } else {
                    println!("[DEBUG] No '[To:' pattern found");
                    String::new()
                };
                
                if !account_name.is_empty() {
                    let to_account_id: Option<i64> = tx.query_row(
                        "SELECT id FROM accounts WHERE name = ?1",
                        params![account_name],
                        |r| r.get(0)
                    ).ok();
                    
                    println!("[DEBUG] Found to_account_id from legacy format: {:?}", to_account_id);
                    to_account_id
                } else {
                    println!("[DEBUG] Empty account name extracted");
                    None
                }
            } else {
                println!("[DEBUG] No transfer pattern found in notes");
                None
            }
        } else {
            println!("[DEBUG] No notes provided");
            None
        };
        
        // 도착 계좌 트랜잭션 (양수)
        if let Some(to_id) = to_account_id {
            let arrival_amount = transaction.amount.abs();
            println!("[DEBUG] Creating arrival transaction: account_id={}, amount={}", to_id, arrival_amount);
            
            // Notes에서 임시 정보 제거하고 사용자 입력만 유지
            let clean_notes = if let Some(notes) = &transaction.notes {
                if notes.contains("[TO_ACCOUNT_ID:") {
                    if let Some(end) = notes.find("]") {
                        let user_notes = &notes[end + 1..].trim();
                        if user_notes.is_empty() {
                            None
                        } else {
                            Some(user_notes.to_string())
                        }
                    } else {
                        None
                    }
                } else {
                    Some(notes.clone())
                }
            } else {
                None
            };
            
            tx.execute(
                "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    transaction.date,
                    to_id,
                    transaction.transaction_type,
                    None::<i64>, // Transfer 거래에서는 category_id를 NULL로 설정
                    arrival_amount,
                    transaction.payee,
                    clean_notes,
                    transfer_id
                ],
            ).map_err(|e| {
                println!("[DEBUG] Failed to insert arrival transaction: {}", e);
                e.to_string()
            })?;
            
            println!("[DEBUG] Arrival transaction inserted successfully");
        } else {
            println!("[DEBUG] No to_account_id found, skipping arrival transaction");
        }
        
        tx.commit().map_err(|e| {
            println!("[DEBUG] Failed to commit transaction: {}", e);
            e.to_string()
        })?;
        
        println!("[DEBUG] Transfer transaction committed successfully");
    } else {
        println!("[DEBUG] Processing regular transaction");
        // 일반 거래 처리
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
        ).map_err(|e| {
            println!("[DEBUG] Failed to insert regular transaction: {}", e);
            e.to_string()
        })?;
        
        println!("[DEBUG] Regular transaction inserted successfully");
    }
    
    println!("[DEBUG] Getting updated transactions list");
    get_transactions(app)
}

#[tauri::command]
pub fn update_transaction(app: AppHandle, transaction: Transaction) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let mut conn = Connection::open(&path).map_err(|e| e.to_string())?;
    
    // 기존 거래 정보 조회
    let (old_type, old_transfer_id) = {
        let mut sel = conn.prepare("SELECT type, transfer_id FROM transactions WHERE id = ?1").map_err(|e| e.to_string())?;
        let mut rows = sel.query_map(params![transaction.id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        }).map_err(|e| e.to_string())?;
        rows.next().ok_or("Transaction not found".to_string())?.map_err(|e| e.to_string())?
    };
    
    // Transfer로 변경하는 경우 특별 처리
    if old_type != "Transfer" && transaction.transaction_type == "Transfer" {
        println!("[DEBUG] Converting transaction {} from {} to Transfer", transaction.id, old_type);
        
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        
        // 기존 거래 삭제
        tx.execute("DELETE FROM transactions WHERE id = ?1", params![transaction.id]).map_err(|e| e.to_string())?;
        
        // Transfer ID 생성
        let transfer_id = tx.query_row(
            "SELECT COALESCE(MAX(transfer_id), 0) + 1 FROM transactions",
            [],
            |r| r.get::<_, i64>(0)
        ).map_err(|e| e.to_string())?;
        
        println!("[DEBUG] Generated transfer_id: {}", transfer_id);
        
        // 출발 계좌 트랜잭션 (음수)
        let departure_amount = -transaction.amount.abs();
        println!("[DEBUG] Creating departure transaction: account_id={}, amount={}", transaction.account_id, departure_amount);
        
        tx.execute(
            "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                transaction.date,
                transaction.account_id,
                transaction.transaction_type,
                None::<i64>, // Transfer 거래에서는 category_id를 NULL로 설정
                departure_amount,
                transaction.payee,
                transaction.notes.clone().unwrap_or_default(),
                transfer_id
            ],
        ).map_err(|e| e.to_string())?;
        
        println!("[DEBUG] Departure transaction inserted successfully");
        
        // 도착 계좌 ID 추출 (notes에서)
        let to_account_id = if let Some(notes) = &transaction.notes {
            println!("[DEBUG] Processing notes: {}", notes);
            
            // 새로운 형식: [TO_ACCOUNT_ID:계좌ID] 패턴 확인
            if notes.contains("[TO_ACCOUNT_ID:") {
                if let Some(start) = notes.find("[TO_ACCOUNT_ID:") {
                    if let Some(end) = notes[start..].find("]") {
                        let account_id_str = &notes[start + 15..start + end];
                        if let Ok(account_id) = account_id_str.parse::<i64>() {
                            println!("[DEBUG] Found to_account_id from new format: {}", account_id);
                            Some(account_id)
                        } else {
                            println!("[DEBUG] Failed to parse account_id from: {}", account_id_str);
                            None
                        }
                    } else {
                        println!("[DEBUG] No closing bracket found in new format");
                        None
                    }
                } else {
                    println!("[DEBUG] No '[TO_ACCOUNT_ID:' pattern found");
                    None
                }
            }
            // 레거시 형식: [To: 계좌명] 패턴 확인
            else if notes.contains("[To:") {
                // [To: 계좌명] 패턴에서 계좌명만 추출
                let account_name = if let Some(start) = notes.find("[To:") {
                    if let Some(end) = notes[start..].find("]") {
                        let extracted = &notes[start + 4..start + end].trim();
                        println!("[DEBUG] Extracted account name: '{}'", extracted);
                        extracted.to_string()
                    } else {
                        println!("[DEBUG] No closing bracket found");
                        String::new()
                    }
                } else {
                    println!("[DEBUG] No '[To:' pattern found");
                    String::new()
                };
                
                if !account_name.is_empty() {
                    let to_account_id: Option<i64> = tx.query_row(
                        "SELECT id FROM accounts WHERE name = ?1",
                        params![account_name],
                        |r| r.get(0)
                    ).ok();
                    
                    println!("[DEBUG] Found to_account_id from legacy format: {:?}", to_account_id);
                    to_account_id
                } else {
                    println!("[DEBUG] Empty account name extracted");
                    None
                }
            } else {
                println!("[DEBUG] No transfer pattern found in notes");
                None
            }
        } else {
            println!("[DEBUG] No notes provided");
            None
        };
        
        // 도착 계좌 트랜잭션 (양수)
        if let Some(to_id) = to_account_id {
            let arrival_amount = transaction.amount.abs();
            println!("[DEBUG] Creating arrival transaction: account_id={}, amount={}", to_id, arrival_amount);
            
            // Notes에서 임시 정보 제거하고 사용자 입력만 유지
            let clean_notes = if let Some(notes) = &transaction.notes {
                if notes.contains("[TO_ACCOUNT_ID:") {
                    if let Some(end) = notes.find("]") {
                        let user_notes = &notes[end + 1..].trim();
                        if user_notes.is_empty() {
                            None
                        } else {
                            Some(user_notes.to_string())
                        }
                    } else {
                        None
                    }
                } else {
                    Some(notes.clone())
                }
            } else {
                None
            };
            
            tx.execute(
                "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    transaction.date,
                    to_id,
                    transaction.transaction_type,
                    None::<i64>, // Transfer 거래에서는 category_id를 NULL로 설정
                    arrival_amount,
                    transaction.payee,
                    clean_notes,
                    transfer_id
                ],
            ).map_err(|e| {
                println!("[DEBUG] Failed to insert arrival transaction: {}", e);
                e.to_string()
            })?;
            
            println!("[DEBUG] Arrival transaction inserted successfully");
        } else {
            println!("[DEBUG] No to_account_id found, skipping arrival transaction");
        }
        
        tx.commit().map_err(|e| e.to_string())?;
        println!("[DEBUG] Transfer conversion completed successfully");
    }
    // Transfer 거래는 다른 타입으로 변경할 수 없음
    else if old_type == "Transfer" && transaction.transaction_type != "Transfer" {
        return Err("Cannot convert Transfer transactions to other types".to_string());
    }
    // 일반 거래 업데이트
    else {
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
    }
    
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
    if old_type == "Transfer" {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        
        // Find and delete both sides of the transfer using transfer_id
        let transfer_id: Option<i64> = tx.query_row(
            "SELECT transfer_id FROM transactions WHERE id = ?1",
            params![id],
            |r| r.get(0),
        ).ok();
        
        if let Some(transfer_id) = transfer_id {
            println!("[DEBUG] Deleting transfer with transfer_id: {}", transfer_id);
            // Delete both transactions with the same transfer_id
            let deleted_count = tx.execute("DELETE FROM transactions WHERE transfer_id = ?1", params![transfer_id]).map_err(|e| e.to_string())?;
            println!("[DEBUG] Deleted {} transactions with transfer_id {}", deleted_count, transfer_id);
        } else {
            println!("[DEBUG] No transfer_id found, using legacy transfer deletion logic");
            // Legacy transfer handling (for old transfers without transfer_id)
            let other_transaction = if old_amount < 0.0 {
                tx.query_row(
                    "SELECT id FROM transactions WHERE type = 'Transfer' AND date = ?1 AND ABS(amount) = ?2 AND account_id != ?3 AND notes = ?4 AND payee = ?5 LIMIT 1",
                    params![_old_date, old_amount.abs(), acct_id, format!("[To: {}]", acct_id), _old_payee],
                    |row| row.get::<_, i64>(0)
                ).ok()
            } else {
                tx.query_row(
                    "SELECT id FROM transactions WHERE type = 'Transfer' AND date = ?1 AND ABS(amount) = ?2 AND account_id != ?3 AND notes = ?4 AND payee = ?5 LIMIT 1",
                    params![_old_date, old_amount.abs(), acct_id, format!("[From: {}]", acct_id), _old_payee],
                    |row| row.get::<_, i64>(0)
                ).ok()
            };
            
            // Delete both transactions
            tx.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
            if let Some(other_id) = other_transaction {
                tx.execute("DELETE FROM transactions WHERE id = ?1", params![other_id]).map_err(|e| e.to_string())?;
                println!("[DEBUG] Deleted legacy transfer pair: {} and {}", id, other_id);
            } else {
                println!("[DEBUG] Deleted single legacy transfer: {}", id);
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