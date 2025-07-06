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