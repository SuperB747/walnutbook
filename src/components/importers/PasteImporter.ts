import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class PasteImporter extends BaseImporter {
  name = 'Paste';
  description = 'Paste online banking transactions';
  supportedFormats = ['Pasted Banking Data'];

  detectFormat(headers: string[]): boolean {
    // Paste format detection - look for common banking data patterns
    const text = headers.join(' ').toLowerCase();
    
    // Common patterns in online banking data
    const patterns = [
      /\d{1,2}\/\d{1,2}\/\d{4}/, // MM/DD/YYYY date
      /\d{4}-\d{1,2}-\d{1,2}/, // YYYY-MM-DD date
      /\$\d+\.\d{2}/, // Dollar amounts
      /debit|credit|withdrawal|deposit/i, // Transaction types
      /balance|amount/i, // Amount indicators
      /\d{1,2}\/\d{1,2}\/\d{2}/, // MM/DD/YY date
      /\d{1,2}-\d{1,2}-\d{4}/, // MM-DD-YYYY date
    ];
    
    // Check if at least 2 patterns match (more lenient for paste data)
    const matches = patterns.filter(pattern => pattern.test(text));
    return matches.length >= 2;
  }

  mapColumns(headers: string[]): ColumnMapping {
    // For pasted data, we'll try to auto-detect columns
    const headerText = headers.join(' ').toLowerCase();
    
    // Try to find date column
    let dateIndex = -1;
    for (let i = 0; i < headers.length; i++) {
      const field = headers[i].toLowerCase();
      if (field.includes('date') || /\d{1,2}\/\d{1,2}\/\d{4}/.test(field) || /\d{4}-\d{1,2}-\d{1,2}/.test(field)) {
        dateIndex = i;
        break;
      }
    }
    
    // Try to find amount column
    let amountIndex = -1;
    for (let i = 0; i < headers.length; i++) {
      const field = headers[i].toLowerCase();
      if (field.includes('amount') || field.includes('balance') || /\$\d+\.\d{2}/.test(field)) {
        amountIndex = i;
        break;
      }
    }
    
    // Try to find description/payee column
    let payeeIndex = -1;
    for (let i = 0; i < headers.length; i++) {
      const field = headers[i].toLowerCase();
      if (field.includes('description') || field.includes('payee') || field.includes('merchant') || field.includes('transaction')) {
        payeeIndex = i;
        break;
      }
    }
    
    // If we couldn't find specific columns, use common positions
    if (dateIndex === -1) dateIndex = 0;
    if (amountIndex === -1) amountIndex = headers.length > 2 ? 2 : 1;
    if (payeeIndex === -1) payeeIndex = headers.length > 1 ? 1 : 0;
    
    return {
      date: dateIndex,
      amount: amountIndex,
      payee: payeeIndex,
      type: undefined,
      notes: undefined,
    };
  }

  // Parse multi-line transaction data
  parseMultiLineData(content: string): Partial<Transaction>[] {
    const transactions: Partial<Transaction>[] = [];
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let currentDate: string | null = null;
    let currentPayee: string | null = null;
    let currentAmount: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (this.isDateLine(line)) {
        if (currentDate && currentPayee && currentAmount !== null) {
          const transaction = this.createTransaction(currentDate, currentPayee, currentAmount);
          if (transaction) {
            transactions.push(transaction);
          }
        }
        currentDate = this.parseDate(line);
        currentPayee = null;
        currentAmount = null;
      } else if (this.isAmountLine(line)) {
        currentAmount = this.parseAmount(line);
      } else if (this.isPayeeLine(line)) {
        currentPayee = this.parsePayee(line);
      }
    }

    if (currentDate && currentPayee && currentAmount !== null) {
      const transaction = this.createTransaction(currentDate, currentPayee, currentAmount);
      if (transaction) {
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  private isDateLine(line: string): boolean {
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{4}/, // MM/DD/YYYY
      /\d{4}-\d{1,2}-\d{1,2}/, // YYYY-MM-DD
      /\d{1,2}\/\d{1,2}\/\d{2}/, // MM/DD/YY
      /\d{1,2}-\d{1,2}-\d{4}/, // MM-DD-YYYY
    ];
    return datePatterns.some(pattern => pattern.test(line));
  }

  private isAmountLine(line: string): boolean {
    const amountPattern = /\$?\d+,?\d*\.?\d*/;
    return amountPattern.test(line);
  }

  private isPayeeLine(line: string): boolean {
    // A line is considered a payee line if it's not a date or amount line
    // and contains at least 2 characters
    return !this.isDateLine(line) && !this.isAmountLine(line) && line.trim().length >= 2;
  }

  private parsePayee(line: string): string {
    return line.trim()
      .replace(/^"|"$/g, '') // Remove surrounding quotes
      .replace(/\s+$/, '') // Remove trailing spaces
      .replace(/^\s+/, '') // Remove leading spaces
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\s+#\d+$/, '') // Remove #1, #2, etc.
      .replace(/\s+\d{4}$/, '') // Remove trailing 4-digit numbers
      .replace(/\s+[A-Z]{2,}\s+\d{4}$/, '') // Remove card type and last 4 digits
      .replace(/\*[A-Z0-9]+/, '') // Remove transaction IDs
      .replace(/\s+WWW\.AMAZON\.CAON$/, '') // Remove Amazon website suffix
      .replace(/\s+AMAZON\.CA ON$/, ''); // Remove Amazon.ca ON suffix
  }

  private createTransaction(dateStr: string, payeeStr: string, amountStr: string | number): Partial<Transaction> | null {
    const amount = typeof amountStr === 'number' ? amountStr : this.parseAmount(amountStr);
    const date = this.parseDate(dateStr);
    
    if (!date) {
      console.warn(`Invalid date format: ${dateStr}`);
      return null;
    }
    
    const payeeLower = payeeStr.toLowerCase();
    let type: TransactionType = 'Expense';

    // Determine transaction type based on keywords and amount
    if (payeeLower.includes('payment') || payeeLower.includes('deposit')) {
      type = amount < 0 ? 'Income' : 'Expense';
    } else if (
      payeeLower.includes('salary') ||
      payeeLower.includes('income') ||
      payeeLower.includes('interest') ||
      amount > 0
    ) {
      type = 'Income';
    }

    const transaction: Partial<Transaction> = {
      date,
      payee: payeeStr,
      amount: Math.abs(amount),
      type,
      notes: '',
    };

    return this.validateTransaction(transaction);
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    try {
      const dateStr = row[mapping.date]?.trim() || '';
      const amountStr = row[mapping.amount]?.trim() || '';
      const payeeStr = row[mapping.payee]?.trim() || '';
      
      if (!dateStr || !amountStr || !payeeStr) {
        return null;
      }
      
      // Parse date - handle various formats
      const date = this.parseDate(dateStr);
      if (!date) {
        console.warn(`Paste: Invalid date format: ${dateStr}`);
        return null;
      }
      
      // Parse amount - handle various formats
      let amount = 0;
      const cleanAmountStr = amountStr.replace(/[$,]/g, '').replace(/[^\d.-]/g, '');
      amount = parseFloat(cleanAmountStr);
      
      if (isNaN(amount)) {
        console.warn(`Paste: Invalid amount: ${amountStr}`);
        return null;
      }
      
      // Determine transaction type based on amount sign and context
      let transactionType: 'Income' | 'Expense' = 'Expense';
      
      // Check for keywords in payee that indicate income
      const payeeLower = payeeStr.toLowerCase();
      if (payeeLower.includes('deposit') || 
          payeeLower.includes('credit') || 
          payeeLower.includes('payment') ||
          payeeLower.includes('refund') ||
          payeeLower.includes('interest') ||
          payeeLower.includes('transfer in') ||
          payeeLower.includes('direct deposit') ||
          amount > 0) {
        transactionType = 'Income';
      }
      
      // Check for keywords that indicate expense
      if (payeeLower.includes('withdrawal') ||
          payeeLower.includes('debit') ||
          payeeLower.includes('purchase') ||
          payeeLower.includes('atm') ||
          payeeLower.includes('fee') ||
          amount < 0) {
        transactionType = 'Expense';
      }
      
      // Clean payee name
      let payee = payeeStr
        .replace(/^"|"$/g, '') // Remove surrounding quotes
        .replace(/\s+$/, '') // Remove trailing spaces
        .replace(/^\s+/, '') // Remove leading spaces
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/\s+#\d+$/, '') // Remove #1, #2, etc.
        .replace(/\s+\d{4}$/, '') // Remove trailing 4-digit numbers
        .replace(/\s+[A-Z]{2,}\s+\d{4}$/, '') // Remove card type and last 4 digits
        .replace(/\*[A-Z0-9]+/, '') // Remove transaction IDs like *N30XQ1P31
        .replace(/\s+WWW\.AMAZON\.CAON$/, '') // Remove Amazon website suffix
        .replace(/\s+AMAZON\.CA ON$/, ''); // Remove Amazon.ca ON suffix
      
      // Handle amount based on account type
      let finalAmount = amount;
      
      if (accountType === 'Credit') {
        // Credit 계좌: BMMC와 동일한 로직 적용
        // - Positive amounts (expenses) should be negative
        // - Negative amounts (income) should be positive
        if (transactionType === 'Expense') {
          finalAmount = -Math.abs(amount); // Expenses are negative
        } else {
          finalAmount = Math.abs(amount); // Income is positive
        }
      } else {
        // 다른 계좌들: 부호 변환 적용
        if (transactionType === 'Expense') {
          finalAmount = -Math.abs(amount);
        } else {
          finalAmount = Math.abs(amount);
        }
      }
      
      return {
        date,
        type: transactionType,
        amount: finalAmount,
        payee,
        notes: undefined,
      };
      
    } catch (error) {
      console.error('Paste: Error parsing row:', error, row);
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