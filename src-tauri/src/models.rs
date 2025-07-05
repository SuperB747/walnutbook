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