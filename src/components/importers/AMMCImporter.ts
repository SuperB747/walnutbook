import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction } from '../../db';

export class AMMCImporter extends BaseImporter {
  name = 'AMMC';
  description = 'CSV format';
  supportedFormats = ['AMMC CSV'];

  detectFormat(headers: string[]): boolean {
    // AMMC CSV has headers like: Posted Date,Payee,Address,Amount
    return headers.length >= 4;
  }

  mapColumns(headers: string[]): ColumnMapping {
    // AMMC format: Posted Date,Payee,Address,Amount
    // Fixed column positions
    return {
      date: 0,    // First column
      payee: 1,   // Second column
      amount: 3,  // Fourth column
      type: undefined,
      notes: undefined,
    };
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    try {
      // Check if we have enough columns
      if (row.length < 4) {
        console.warn('AMMC: Row has less than 4 columns:', row);
        return null;
      }

      // Get values from fixed positions
      const dateStr = row[0]?.trim() || '';
      const payeeStr = row[1]?.trim() || '';
      const amountStr = row[3]?.trim() || '';

      if (!dateStr || !payeeStr || !amountStr) {
        console.warn('AMMC: Missing required fields:', { dateStr, payeeStr, amountStr });
        return null;
      }

      // Parse date (MM/DD/YYYY format)
      const dateParts = dateStr.split('/');
      if (dateParts.length !== 3) {
        console.warn(`AMMC: Invalid date format: ${dateStr}`);
        return null;
      }

      const month = dateParts[0].padStart(2, '0');
      const day = dateParts[1].padStart(2, '0');
      const year = dateParts[2];
      const date = `${year}-${month}-${day}`;

      // Parse amount - handle negative amounts
      let amount = 0;
      const cleanAmountStr = amountStr.replace(/[$,]/g, '').trim();
      amount = parseFloat(cleanAmountStr);

      if (isNaN(amount)) {
        console.warn(`AMMC: Invalid amount: ${amountStr}`);
        return null;
      }

      // Determine transaction type based on amount sign only
      // Negative amount -> Expense
      // Positive amount -> Income
      const transactionType = amount < 0 ? 'Expense' : 'Income';

      // Clean payee name
      let payee = payeeStr
        .replace(/^"|"$/g, '') // Remove surrounding quotes
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      // Handle amount based on account type
      let finalAmount = this.normalizeAmount(amount, transactionType, accountType);

      return {
        date,
        payee,
        amount: finalAmount,
        type: transactionType,
        category_id: undefined,
        notes: '',
      };

    } catch (error) {
      console.error('AMMC: Error parsing row:', error, row);
      return null;
    }
  }

  validateTransaction(transaction: Partial<Transaction>): Partial<Transaction> | null {
    if (!transaction.date || !transaction.payee || transaction.amount === undefined) {
      return null;
    }
    return transaction;
  }
} 