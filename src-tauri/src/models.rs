use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub account_type: String,
    pub balance: f64,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transaction {
    #[serde(default)]
    pub id: i64,
    pub date: String,
    pub account_id: i64,
    #[serde(rename = "type")]
    pub transaction_type: String,
    pub category_id: Option<i64>,
    pub amount: f64,
    pub payee: String,
    pub notes: Option<String>,
    pub transfer_id: Option<i64>,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Budget {
    pub id: i64,
    pub category_id: i64,
    pub amount: f64,
    pub month: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub category_type: String,
    #[serde(default)]
    pub is_reimbursement: bool,
    #[serde(default)]
    pub reimbursement_target_category_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountImportSettings {
    pub id: i64,
    pub account_id: i64,
    pub csv_sign_logic: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecurringItem {
    pub id: i64,
    pub name: String,
    pub amount: f64,
    #[serde(rename = "type")]
    pub item_type: String,
    pub category_id: i64,
    pub account_id: i64,
    pub day_of_month: String, // JSON array of integers, e.g. "[1,15]" or "[1]"
    pub is_active: bool,
    pub notes: Option<String>,
    pub created_at: String,
    #[serde(default = "default_repeat_type")]
    pub repeat_type: String,
    pub start_date: Option<String>,
    #[serde(default = "default_interval_value")]
    pub interval_value: i32,
    #[serde(default = "default_interval_unit")]
    pub interval_unit: String,
}

fn default_repeat_type() -> String {
    "monthly_date".to_string()
}

fn default_interval_value() -> i32 {
    1
}

fn default_interval_unit() -> String {
    "month".to_string()
}

 