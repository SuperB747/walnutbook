import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class CIMCImporter extends BaseImporter {
  name = 'CIMC';
  description = 'CSV format';
  supportedFormats = ['CIMC CSV'];

  detectFormat(headers: string[]): boolean {
    // CIMC format doesn't have headers, check for specific data patterns
    if (headers.length < 4) return false;
    
    // Check if first column looks like a date (YYYY-MM-DD format)
    const firstColumn = headers[0]?.trim() || '';
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(firstColumn);
    
    // Check if second column looks like a payee (text with possible quotes)
    const secondColumn = headers[1]?.trim() || '';
    const isPayee = secondColumn.length > 0 && (secondColumn.includes(' ') || secondColumn.includes('"'));
    
    // Check if third column looks like an amount (numeric)
    const thirdColumn = headers[2]?.trim() || '';
    const isAmount = /^\d+\.?\d*$/.test(thirdColumn) || thirdColumn === '';
    
    // Check if fourth column looks like a card number (contains asterisks)
    const fourthColumn = headers[3]?.trim() || '';
    const isCardNumber = fourthColumn.includes('*') && fourthColumn.length > 10;
    
    console.log('CIMC format detection:', {
      headers: headers,
      firstColumn,
      secondColumn,
      thirdColumn,
      fourthColumn,
      isDate,
      isPayee,
      isAmount,
      isCardNumber,
      totalHeaders: headers.length
    });

    // Must have date in first column and payee in second column
    return isDate && isPayee;
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
      const amountStr = row[2]?.trim() || '';
      const cardNumber = row[3]?.trim() || '';

      // Debug log the extracted values
      console.log('CIMC Raw Row:', row);
      console.log('CIMC Extracted Values:', { dateStr, payeeStr, amountStr, cardNumber });

      // Check for required fields
      if (!dateStr || !payeeStr || !amountStr) {
        console.warn('CIMC: Missing required fields:', { dateStr, payeeStr, amountStr });
        return null;
      }

      // Parse date (YYYY-MM-DD format)
      const parsedDate = dateStr;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
        console.warn('CIMC: Invalid date format:', dateStr);
        return null;
      }

      console.log('CIMC Parsed Date:', parsedDate);

      // Parse amount
      const rawAmount = this.parseAmount(amountStr);
      if (rawAmount === 0) {
        console.warn('CIMC: Invalid amount:', amountStr);
        return null;
      }

      // For CIMC: All amounts are expenses (negative)
      const type: TransactionType = 'Expense';
      const amount = this.normalizeAmount(rawAmount, type, accountType);

      // Clean payee name
      const payee = payeeStr
        .replace(/^"|"$/g, '') // Remove surrounding quotes
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      const transaction: Partial<Transaction> = {
        date: parsedDate,
        payee: payee,
        amount: amount,
        type: type,
        notes: cardNumber || undefined
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