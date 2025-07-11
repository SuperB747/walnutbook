import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class CIMCImporter extends BaseImporter {
  name = 'CIMC';
  description = 'CSV format';
  supportedFormats = ['CIMC CSV'];

  detectFormat(headers: string[]): boolean {
    // CIMC format has 5 columns: Date, Payee, Expense, Income, Card Number
    // Since CIMC has no headers, this will be called with the first data row
    if (headers.length < 5) return false; // Should have 5 columns
    
    // Check if first column looks like a date (YYYY-MM-DD format)
    const firstColumn = headers[0]?.trim() || '';
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(firstColumn);
    
    // Check if second column looks like a payee (text with possible quotes)
    const secondColumn = headers[1]?.trim() || '';
    const isPayee = secondColumn.length > 0;
    
    // Check if third column looks like an expense amount (numeric)
    const thirdColumn = headers[2]?.trim() || '';
    const isExpense = /^\d+\.?\d*$/.test(thirdColumn) || thirdColumn === '';
    
    // Check if fourth column looks like an income amount (numeric)
    const fourthColumn = headers[3]?.trim() || '';
    const isIncome = /^\d+\.?\d*$/.test(fourthColumn) || fourthColumn === '';
    
    // Check if fifth column looks like a card number (contains asterisks)
    const fifthColumn = headers[4]?.trim() || '';
    const isCardNumber = fifthColumn.includes('*') && fifthColumn.length > 10;
    
    console.log('CIMC format detection:', {
      headers: headers,
      firstColumn,
      secondColumn,
      thirdColumn,
      fourthColumn,
      fifthColumn,
      isDate,
      isPayee,
      isExpense,
      isIncome,
      isCardNumber,
      totalHeaders: headers.length
    });

    // Must have date in first column, payee in second column, and card number in fifth column
    return isDate && isPayee && isCardNumber;
  }

  mapColumns(headers: string[]): ColumnMapping {
    // CIMC format: Date, Payee, Expense, Income, Card Number
    return {
      date: 0,
      payee: 1,
      amount: -1, // We'll handle expense/income separately in parseRow
      type: undefined,
      notes: 4, // Card number is in 5th column (index 4)
    };
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    try {
      // Extract values from the row
      const dateStr = row[0]?.trim() || '';
      const payeeStr = row[1]?.trim() || '';
      const expenseStr = row[2]?.trim() || '';
      const incomeStr = row[3]?.trim() || '';
      const cardNumber = row[4]?.trim() || ''; // Card number is in index 4

      // Debug log the extracted values
      console.log('CIMC Raw Row:', row);
      console.log('CIMC Extracted Values:', { dateStr, payeeStr, expenseStr, incomeStr, cardNumber });

      // Check for required fields - be more lenient
      if (!dateStr || !payeeStr) {
        console.warn('CIMC: Missing date or payee:', { dateStr, payeeStr, expenseStr, incomeStr });
        return null;
      }

      // Parse date (YYYY-MM-DD format) - be more flexible
      let parsedDate = dateStr;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
        // Try to parse other date formats
        const dateMatch = parsedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (dateMatch) {
          const [, year, month, day] = dateMatch;
          parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else {
          console.warn('CIMC: Invalid date format:', dateStr);
          return null;
        }
      }

      console.log('CIMC Parsed Date:', parsedDate);

      // Parse expense and income amounts
      let expenseAmount = 0;
      let incomeAmount = 0;

      if (expenseStr && expenseStr !== '') {
        const cleanExpenseStr = expenseStr.replace(/[$,]/g, '').trim();
        expenseAmount = parseFloat(cleanExpenseStr);
        if (isNaN(expenseAmount)) {
          console.warn('CIMC: Invalid expense amount:', expenseStr);
          return null;
        }
      }

      if (incomeStr && incomeStr !== '') {
        const cleanIncomeStr = incomeStr.replace(/[$,]/g, '').trim();
        incomeAmount = parseFloat(cleanIncomeStr);
        if (isNaN(incomeAmount)) {
          console.warn('CIMC: Invalid income amount:', incomeStr);
          return null;
        }
      }

      // Determine transaction type and amount
      let type: TransactionType;
      let amount: number;

      if (expenseAmount > 0 && incomeAmount === 0) {
        // Expense transaction
        type = 'Expense';
        amount = this.normalizeAmount(expenseAmount, type, accountType);
      } else if (incomeAmount > 0 && expenseAmount === 0) {
        // Income transaction
        type = 'Income';
        amount = this.normalizeAmount(incomeAmount, type, accountType);
      } else if (expenseAmount > 0 && incomeAmount > 0) {
        // Both expense and income - treat as expense (net negative)
        type = 'Expense';
        const netAmount = expenseAmount - incomeAmount;
        amount = this.normalizeAmount(netAmount, type, accountType);
      } else {
        // No valid amounts
        console.warn('CIMC: No valid amounts found:', { dateStr, payeeStr, expenseStr, incomeStr });
        return null;
      }

      // Clean payee name
      const payee = payeeStr
        .replace(/^"|"$/g, '') // Remove surrounding quotes
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      // Skip if payee is empty after cleaning
      if (!payee) {
        console.warn('CIMC: Empty payee after cleaning:', { dateStr, payeeStr, expenseStr, incomeStr });
        return null;
      }

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