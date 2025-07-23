export type TransactionType = 'Income' | 'Expense' | 'Adjust' | 'Transfer';
export type AccountType = 'Checking' | 'Savings' | 'Credit' | 'Investment' | 'Other';
export type CategoryType = 'Income' | 'Expense' | 'Adjust' | 'Transfer';

export interface Transaction {
  id: number;
  date: string;
  account_id: number;
  type: TransactionType;
  category_id: number | undefined;
  amount: number;
  payee: string;
  notes?: string;
  transfer_id?: number;
  to_account_id?: number;
  created_at: string;
}

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  description?: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  is_reimbursement?: boolean;
  reimbursement_target_category_id?: number;
}

export interface Budget {
  id: number;
  category_id: number;
  amount: number;
  month: string;
  notes?: string;
  created_at: string;
}

export interface RecurringItem {
  id: number;
  name: string;
  amount: number;
  type: 'Income' | 'Expense';
  category_id: number;
  account_id: number;
  day_of_month: string | number; // Allow both string (new format) and number (old format) for backward compatibility
  is_active: boolean;
  notes?: string;
  created_at: string;
  repeat_type?: 'monthly_date' | 'interval';
  start_date?: string;
  interval_value?: number;
  interval_unit?: 'day' | 'week' | 'month';
}

export interface Reminder {
  id: number;
  account_id: number;
  account_name: string;
  payment_day: number;
  next_payment_date: string;
  is_checked: boolean;
  notes?: string;
  created_at: string;
}

// Reminder API helpers (to be implemented in the frontend)
// export async function getReminders(): Promise<Reminder[]> { ... }
// export async function addReminder(reminder: Reminder): Promise<Reminder[]> { ... }
// export async function updateReminder(reminder: Reminder): Promise<Reminder[]> { ... }
// export async function deleteReminder(id: number): Promise<Reminder[]> { ... }
// export async function checkReminder(id: number, next_payment_date: string): Promise<Reminder[]> { ... }