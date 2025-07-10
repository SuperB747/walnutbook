import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class CIMCImporter extends BaseImporter {
  name = 'CIMC';
  description = 'CIMC Credit Card CSV format';
  supportedFormats = ['CIMC Credit Card CSV'];

  detectFormat(headers: string[]): boolean {
    // CIMC format doesn't have headers, just check if we have enough columns
    return headers.length >= 4;
  }

  mapColumns(headers: string[]): ColumnMapping {
    // CIMC format: Date, Payee, Expense, Income, [Ignored]
    return {
      date: 0,
      payee: 1,
      amount: 2, // We'll handle both expense and income columns in parseRow
      type: undefined,
      notes: undefined,
    };
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    try {
      // Extract values from the row
      const dateStr = row[0]?.trim() || '';
      const payeeStr = row[1]?.trim() || '';
      const expenseStr = row[2]?.trim() || '';
      const incomeStr = row[3]?.trim() || '';

      // Debug log the extracted values
      console.log('CIMC Raw Row:', row);
      console.log('CIMC Extracted Values:', { dateStr, payeeStr, expenseStr, incomeStr });

      // Check for required fields
      if (!dateStr || !payeeStr) {
        console.warn('CIMC: Missing date or payee:', { dateStr, payeeStr, expenseStr, incomeStr });
        return null;
      }

      // Parse date (supports both YYYY-MM-DD and M/D/YYYY formats)
      let parsedDate = dateStr;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // If not YYYY-MM-DD, assume M/D/YYYY and convert
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const month = parts[0].padStart(2, '0');
          const day = parts[1].padStart(2, '0');
          const year = parts[2];
          parsedDate = `${year}-${month}-${day}`;
        }
      }

      console.log('CIMC Parsed Date:', parsedDate);

      // Parse amount and determine transaction type
      let amount: number | undefined;
      let type: TransactionType | undefined;

      if (expenseStr) {
        const parsedAmount = this.parseAmount(expenseStr);
        amount = this.normalizeAmount(parsedAmount, 'Expense', accountType);
        type = 'Expense';
      } else if (incomeStr) {
        const parsedAmount = this.parseAmount(incomeStr);
        amount = this.normalizeAmount(parsedAmount, 'Income', accountType);
        type = 'Income';
      }

      // If neither expense nor income is present, skip the transaction
      if (amount === undefined || type === undefined) {
        console.warn('CIMC: Missing amount:', { dateStr, payeeStr, expenseStr, incomeStr });
        return null;
      }

      const transaction: Partial<Transaction> = {
        date: parsedDate,
        payee: payeeStr,
        amount: amount,
        type: type,
      };

      console.log('CIMC Final Transaction:', transaction);
      return transaction;

    } catch (error) {
      console.error('CIMC: Error parsing row:', error);
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