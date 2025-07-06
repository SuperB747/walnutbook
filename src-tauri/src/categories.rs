use rusqlite::{params, Connection};
use serde_json::Value;
use tauri::AppHandle;

use crate::models::Category;
use crate::utils::get_db_path;

#[tauri::command]
pub fn get_categories(app: AppHandle) -> Result<Vec<String>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT name FROM categories ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for category in rows {
        categories.push(category.map_err(|e| e.to_string())?);
    }
    Ok(categories)
}

#[tauri::command]
pub fn get_categories_full(app: AppHandle) -> Result<Vec<Category>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, type, is_reimbursement, reimbursement_target_category_id FROM categories ORDER BY name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            category_type: row.get(2)?,
            is_reimbursement: row.get(3)?,
            reimbursement_target_category_id: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for category in rows {
        categories.push(category.map_err(|e| e.to_string())?);
    }
    Ok(categories)
}

#[tauri::command]
pub fn add_category(
    app: AppHandle,
    name: String,
    category_type: String,
    is_reimbursement: bool,
    reimbursement_target_category_id: Option<i64>
) -> Result<Vec<Category>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO categories (name, type, is_reimbursement, reimbursement_target_category_id) VALUES (?1, ?2, ?3, ?4)",
        params![name, category_type, is_reimbursement, reimbursement_target_category_id],
    )
    .map_err(|e| e.to_string())?;
    get_categories_full(app)
}

#[tauri::command]
pub fn update_category(
    app: AppHandle,
    id: i64,
    name: String,
    category_type: String,
    is_reimbursement: bool,
    reimbursement_target_category_id: Option<i64>
) -> Result<Vec<Category>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE categories SET name = ?1, type = ?2, is_reimbursement = ?3, reimbursement_target_category_id = ?4 WHERE id = ?5",
        params![name, category_type, is_reimbursement, reimbursement_target_category_id, id],
    )
    .map_err(|e| e.to_string())?;
    get_categories_full(app)
}

#[tauri::command]
pub fn delete_category(app: AppHandle, id: i64) -> Result<Vec<Category>, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM categories WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    get_categories_full(app)
}

#[tauri::command]
pub fn get_spending_by_category(app: AppHandle, start_date: String, end_date: String) -> Result<Value, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT c.name, SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0 END) as expense,
         SUM(CASE WHEN t.type = 'Income' THEN t.amount ELSE 0 END) as income
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.date BETWEEN ?1 AND ?2
         AND t.type != 'Transfer'
         GROUP BY c.name
         HAVING expense > 0 OR income > 0"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(params![start_date, end_date], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?,
            row.get::<_, f64>(2)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut categories = Vec::new();
    let mut expenses = Vec::new();
    let mut incomes = Vec::new();
    
    for row in rows {
        let (category, expense, income) = row.map_err(|e| e.to_string())?;
        categories.push(category);
        expenses.push(expense);
        incomes.push(income);
    }
    
    Ok(serde_json::json!({
        "categories": categories,
        "expenses": expenses,
        "incomes": incomes
    }))
}

#[tauri::command]
pub fn get_income_vs_expenses(app: AppHandle, start_date: String, end_date: String) -> Result<Value, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT strftime('%Y-%m', date) as month,
         SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END) as expenses,
         SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END) as income
         FROM transactions
         WHERE date BETWEEN ?1 AND ?2
         AND type != 'Transfer'
         GROUP BY month
         ORDER BY month"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(params![start_date, end_date], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?,
            row.get::<_, f64>(2)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut months = Vec::new();
    let mut expenses = Vec::new();
    let mut incomes = Vec::new();
    
    for row in rows {
        let (month, expense, income) = row.map_err(|e| e.to_string())?;
        months.push(month);
        expenses.push(expense);
        incomes.push(income);
    }
    
    Ok(serde_json::json!({
        "months": months,
        "expenses": expenses,
        "incomes": incomes
    }))
}

#[tauri::command]
pub fn get_net_worth_history(app: AppHandle, start_date: String, end_date: String) -> Result<Value, String> {
    let path = get_db_path(&app);
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "WITH RECURSIVE dates(date) AS (
            SELECT ?1
            UNION ALL
            SELECT date(date, '+1 month')
            FROM dates
            WHERE date < ?2
        ),
        monthly_balances AS (
            SELECT 
                d.date,
                a.id as account_id,
                a.type as account_type,
                COALESCE(SUM(CASE 
                    WHEN a.type = 'Credit' THEN
                        CASE
                            WHEN t.type = 'Expense' THEN ABS(t.amount)
                            WHEN t.type = 'Income' THEN -ABS(t.amount)
                            WHEN t.type = 'Adjust' AND c.name = 'Add' THEN -ABS(t.amount)
                            WHEN t.type = 'Adjust' AND c.name = 'Subtract' THEN ABS(t.amount)
                            WHEN t.type = 'Transfer' THEN t.amount
                            ELSE 0
                        END
                    ELSE
                        CASE
                            WHEN t.type = 'Expense' THEN -ABS(t.amount)
                            WHEN t.type = 'Income' THEN ABS(t.amount)
                            WHEN t.type = 'Adjust' AND c.name = 'Add' THEN ABS(t.amount)
                            WHEN t.type = 'Adjust' AND c.name = 'Subtract' THEN -ABS(t.amount)
                            WHEN t.type = 'Transfer' THEN t.amount
                            ELSE 0
                        END
                    END
                ), 0) as balance
            FROM dates d
            CROSS JOIN accounts a
            LEFT JOIN transactions t ON t.account_id = a.id 
                AND t.date <= d.date
            LEFT JOIN categories c ON t.category_id = c.id
            GROUP BY d.date, a.id
        )
        SELECT 
            date,
            SUM(balance) as net_worth,
            SUM(CASE WHEN account_type != 'Credit' THEN balance ELSE 0 END) as assets,
            SUM(CASE WHEN account_type = 'Credit' THEN balance ELSE 0 END) as liabilities
        FROM monthly_balances
        GROUP BY date
        ORDER BY date"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(params![start_date, end_date], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, f64>(3)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut dates = Vec::new();
    let mut net_worth = Vec::new();
    let mut assets = Vec::new();
    let mut liabilities = Vec::new();
    
    for row in rows {
        let (date, nw, a, l) = row.map_err(|e| e.to_string())?;
        dates.push(date);
        net_worth.push(nw);
        assets.push(a);
        liabilities.push(l);
    }
    
    Ok(serde_json::json!({
        "dates": dates,
        "net_worth": net_worth,
        "assets": assets,
        "liabilities": liabilities
    }))
} 