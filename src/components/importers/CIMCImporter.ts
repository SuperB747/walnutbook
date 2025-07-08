import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction } from '../../db';

export class CIMCImporter extends BaseImporter {
  name = 'CIMC';
  description = 'CSV format';
  supportedFormats = ['CIMC Credit Card CSV'];

  detectFormat(headers: string[]): boolean {
    // CIMC format doesn't have headers, so we detect by content pattern
    // First line should be a date in YYYY-MM-DD format
    if (headers.length >= 3) {
      const firstField = headers[0];
      const thirdField = headers[2];
      // Check if first field is a date and third field is numeric
      return /^\d{4}-\d{2}-\d{2}$/.test(firstField) && !isNaN(parseFloat(thirdField));
    }
    return false;
  }

  mapColumns(headers: string[]): ColumnMapping {
    // CIMC format: Date,Description,Expense,Income,CardNumber
    return {
      date: 0,
      payee: 1,
      amount: 2, // Will be determined dynamically
      type: undefined,
      notes: undefined,
    };
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    const dateStr = row[0]?.trim();
    const description = row[1]?.trim();
    const expenseStr = row[2]?.trim();
    const incomeStr = row[3]?.trim();

    console.log('CIMC parsing row:', { dateStr, description, expenseStr, incomeStr, row, accountType });

    if (!dateStr || !description) {
      console.log('CIMC: Missing date or description');
      return null;
    }

    // Parse date (YYYY-MM-DD format)
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;

    // Determine transaction type and amount
    let transactionType: 'Income' | 'Expense' = 'Expense';
    let amount = 0;

    // Check if this is an expense (third column has value)
    if (expenseStr && expenseStr !== '') {
      // This is an expense transaction
      amount = parseFloat(expenseStr.replace(/[^\d.-]/g, ''));
      if (isNaN(amount)) return null;
      transactionType = 'Expense';
    } else if (incomeStr && incomeStr !== '') {
      // This is an income transaction (fourth column has value)
      amount = parseFloat(incomeStr.replace(/[^\d.-]/g, ''));
      if (isNaN(amount)) return null;
      transactionType = 'Income';
    } else {
      console.log('CIMC: No valid amount found');
      return null;
    }

    // Clean payee name
    let payee = description;
    if (description.toUpperCase().includes('PAYMENT')) {
      payee = 'Payment - Credit Card';
    } else {
      // Remove quotes and clean up
      payee = payee
        .replace(/^"|"$/g, '') // Remove surrounding quotes
        .replace(/\s+$/, '') // Remove trailing spaces
        .replace(/^\s+/, ''); // Remove leading spaces
    }

    // 금액 처리 로직:
    // CIMC는 신용카드 거래이므로 Credit 계좌로 처리
    // Credit 계좌: Expense는 음수, Income은 양수로 변환
    let finalAmount = amount;
    
    if (transactionType === 'Expense') {
      finalAmount = -Math.abs(amount); // 지출은 음수로
    } else {
      finalAmount = Math.abs(amount); // 수입은 양수로
    }

    return {
      date: date.toISOString().split('T')[0],
      payee: payee,
      amount: finalAmount,
      type: transactionType,
    };
  }

  validateTransaction(transaction: Partial<Transaction>): Partial<Transaction> | null {
    if (!transaction.date || !transaction.payee || transaction.amount === undefined) {
      return null;
    }
    return transaction;
  }
} 