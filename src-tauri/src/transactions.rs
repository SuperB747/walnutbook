use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::collections::HashSet;
use tauri::AppHandle;
use serde::Serialize;

use crate::models::Transaction;
use crate::utils::get_db_path;

#[derive(Debug)]
enum TransactionKey {
    Regular(String, i64, String),
    Transfer(String, i64),
}

#[derive(Serialize)]
pub struct ImportResult {
    pub imported: Vec<Transaction>,
    pub imported_count: usize,
    pub duplicate_count: usize,
}

#[tauri::command]
pub fn get_transactions(app: AppHandle) -> Result<Vec<Transaction>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT t.id, t.date, t.account_id, t.type, t.category_id, t.amount, t.payee, t.notes, t.transfer_id, t.to_account_id, t.created_at FROM transactions t ORDER BY t.date DESC")
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
                to_account_id: row.get(9).ok(),
                created_at: row.get(10)?,
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
    
    // Create transaction
    let transaction_type = transaction.transaction_type.to_string();
    let amount = transaction.amount;
    let payee = transaction.payee.to_string();
    let notes = transaction.notes.clone();

    if transaction_type == "Transfer" {
        println!("[DEBUG] [create_transaction] called with transaction: {:?}", transaction);
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        
        // Generate transfer_id if not provided
        let transfer_id = match transaction.transfer_id {
            Some(id) => id,
            None => {
                let mut stmt = tx.prepare("SELECT COALESCE(MAX(transfer_id), 0) + 1 FROM transactions WHERE transfer_id IS NOT NULL")
                    .map_err(|e| e.to_string())?;
                stmt.query_row([], |row| row.get::<_, i64>(0))
                    .map_err(|e| e.to_string())?
            }
        };
        println!("[DEBUG] [create_transaction] generated transfer_id: {}", transfer_id);

        // Use to_account_id directly for arrival transaction
        let to_id = transaction.to_account_id;
        println!("[DEBUG] [create_transaction] parsed to_id: {:?}", to_id);

        // Create departure transaction
        let departure_amount = -amount.abs();
        // notes에서 [TO_ACCOUNT_ID:x] 메타데이터 제거
        let clean_notes = if let Some(notes_str) = &notes {
            if let Some(end) = notes_str.find(']') {
                notes_str[end+1..].trim().to_string()
            } else {
                notes_str.clone()
            }
        } else {
            "".to_string()
        };
        println!("[DEBUG] [create_transaction] departure: account_id={}, amount={}, category_id={:?}, date={}, payee={}, notes='{}', type={}, transfer_id={}",
            transaction.account_id, departure_amount, transaction.category_id, transaction.date, payee, clean_notes, transaction_type, transfer_id);
        let dep_result = tx.execute(
            "INSERT INTO transactions (account_id, category_id, amount, date, payee, notes, type, transfer_id, to_account_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                transaction.account_id,
                transaction.category_id,
                departure_amount,
                transaction.date,
                payee,
                &clean_notes,
                transaction_type,
                transfer_id,
                to_id // departure에만 저장
            ],
        );
        println!("[DEBUG] [create_transaction] departure insert result: {:?}", dep_result);

        // Create arrival transaction if target account found
        if let Some(to_id) = to_id {
            let arrival_amount = amount.abs();
            // notes에서 [TO_ACCOUNT_ID:x] 메타데이터 제거
            let arrival_clean_notes = if let Some(notes_str) = &notes {
                if let Some(end) = notes_str.find(']') {
                    notes_str[end+1..].trim().to_string()
                } else {
                    notes_str.clone()
                }
            } else {
                "".to_string()
            };
            println!("[DEBUG] [create_transaction] Creating arrival transaction: to_id={}, arrival_amount={}, transfer_id={:?}, notes='{}'", to_id, arrival_amount, transfer_id, arrival_clean_notes);
            let result = tx.execute(
                "INSERT INTO transactions (account_id, category_id, amount, date, payee, notes, type, transfer_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    to_id,
                    transaction.category_id,
                    arrival_amount,
                    transaction.date,
                    payee,
                    &arrival_clean_notes,
                    transaction_type,
                    transfer_id
                ],
            );
            println!("[DEBUG] Arrival transaction insert result: {:?}, to_id: {}, amount: {}", result, to_id, arrival_amount);
        } else {
            println!("[DEBUG] [create_transaction] No to_id found, arrival transaction not created");
        }
        let commit_result = tx.commit();
        println!("[DEBUG] Transaction committed: {:?}", commit_result);
        commit_result.map_err(|e| e.to_string())?;
    } else {
        // Regular transaction
        conn.execute(
            "INSERT INTO transactions (account_id, category_id, amount, date, payee, notes, type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                transaction.account_id,
                transaction.category_id,
                amount,
                transaction.date,
                payee,
                notes,
                transaction_type
            ],
        ).map_err(|e| e.to_string())?;
    }

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
    
    // Transfer 거래의 notes만 수정하는 경우 특별 처리
    if old_type == "Transfer" && transaction.transaction_type == "Transfer" {
        println!("[DEBUG] Updating Transfer transaction notes only");
        
        // Transfer 거래의 경우 양쪽 거래 모두 업데이트
        if let Some(transfer_id) = old_transfer_id {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            
            // 같은 transfer_id를 가진 모든 거래의 notes, to_account_id 업데이트
            let to_id = transaction.to_account_id;
            tx.execute(
                "UPDATE transactions SET notes = ?1, to_account_id = ?2 WHERE transfer_id = ?3",
                params![transaction.notes.clone().unwrap_or_default(), to_id, transfer_id]
            ).map_err(|e| e.to_string())?;
            
            tx.commit().map_err(|e| e.to_string())?;
            println!("[DEBUG] Transfer notes updated successfully");
        } else {
            // transfer_id가 없는 경우 해당 거래만 업데이트
            let clean_notes = if let Some(notes_str) = &transaction.notes {
                if let Some(end) = notes_str.find(']') {
                    notes_str[end+1..].trim().to_string()
                } else {
                    notes_str.clone()
                }
            } else {
                "".to_string()
            };
            conn.execute(
                "UPDATE transactions SET notes = ?1 WHERE id = ?2",
                params![clean_notes, transaction.id]
            ).map_err(|e| e.to_string())?;
        }
    }
    // Transfer로 변경하는 경우 특별 처리
    else if old_type != "Transfer" && transaction.transaction_type == "Transfer" {
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
            "INSERT INTO transactions (date, account_id, type, category_id, amount, payee, notes, transfer_id, to_account_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                transaction.date,
                transaction.account_id,
                transaction.transaction_type,
                None::<i64>, // Transfer 거래에서는 category_id를 NULL로 설정
                departure_amount,
                transaction.payee,
                transaction.notes.clone().unwrap_or_default(),
                transfer_id,
                transaction.to_account_id
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
                        let account_id_str = &notes[start + 14..start + end].trim_start_matches(':');
                        println!("[DEBUG] [update_transaction] notes: '{}', start: {}, end: {}, account_id_str: '{}'", notes, start, end, account_id_str);
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
pub fn import_transactions(app: AppHandle, transactions: Vec<Transaction>) -> Result<ImportResult, String> {
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
            // 더 정확한 중복 체크를 위해 센트 단위로 반올림
            let cents = (amount * 100.0).round() as i64;
            // Case-insensitive type check
            Ok(if ttype.to_lowercase() == "transfer" {
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
    let mut imported_count = 0;
    let mut duplicate_count = 0;
    let mut imported_ids = Vec::new();
    
    // Import new transactions
    for t in transactions {
        println!("[IMPORT] Checking transaction: date={}, amount={}, payee={}, type={}", t.date, t.amount, t.payee, t.transaction_type);
        let cents = (t.amount * 100.0).round() as i64;
        let key = (t.date.clone(), cents, t.payee.clone());
        if existing_keys.contains(&key) {
            println!("[IMPORT] Duplicate detected, skipping: {:?}", key);
            duplicate_count += 1;
            continue;
        }
        let transfer_key = (t.date.clone(), cents);
        if transfer_keys.contains(&transfer_key) {
            println!("[IMPORT] Duplicate transfer detected, skipping: {:?}", transfer_key);
            duplicate_count += 1;
            continue;
        }
        println!("[IMPORT] Inserting transaction: date={}, amount={}, payee={}, type={}", t.date, t.amount, t.payee, t.transaction_type);
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
        // Don't add to sets to allow duplicates within the same import batch
        imported_count += 1;
        imported_ids.push(tx.last_insert_rowid());
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Get only the imported transactions using the original connection
    let mut result = Vec::new();
    for id in imported_ids {
        let transaction = conn.query_row(
            "SELECT id, date, account_id, type, category_id, amount, payee, notes, transfer_id, to_account_id, created_at FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok(Transaction {
                id: row.get(0)?, date: row.get(1)?, account_id: row.get(2)?,
                transaction_type: row.get(3)?, category_id: row.get(4)?, amount: row.get(5)?,
                payee: row.get(6)?, notes: row.get(7)?, transfer_id: row.get(8)?,
                to_account_id: row.get(9).ok(),
                created_at: row.get(10)?,
            }),
        ).map_err(|e| e.to_string())?;
        result.push(transaction);
    }
    
    // Add import statistics to the first transaction (temporary storage)
    if !result.is_empty() {
        result[0].notes = Some(format!("IMPORT_STATS: imported={}, duplicates={}", imported_count, duplicate_count));
    }
    
    Ok(ImportResult {
        imported: result,
        imported_count,
        duplicate_count,
    })
}

#[tauri::command]
pub fn bulk_update_transactions(app: AppHandle, updates: Vec<(i64, Value)>) -> Result<Vec<Transaction>, String> {
    for (id, changes) in updates {
        // Fetch existing transaction
        let path = get_db_path(&app);
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        let existing: Transaction = conn.query_row(
            "SELECT id, date, account_id, type, category_id, amount, payee, notes, transfer_id, to_account_id, created_at FROM transactions WHERE id = ?1",
            params![id],
            |row| Ok(Transaction {
                id: row.get(0)?, date: row.get(1)?, account_id: row.get(2)?,
                transaction_type: row.get(3)?, category_id: row.get(4)?, amount: row.get(5)?,
                payee: row.get(6)?, notes: row.get(7)?, transfer_id: row.get(8)?,
                to_account_id: row.get(9).ok(),
                created_at: row.get(10)?,
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