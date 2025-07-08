import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction } from '../../db';

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
  parseMultiLineTransactions(content: string): Partial<Transaction>[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const transactions: Partial<Transaction>[] = [];
    
    let currentDate = '';
    let currentPayee = '';
    let currentAmount = '';
    
    console.log('PasteImporter: Parsing multi-line data with', lines.length, 'lines');
    console.log('Full content:', content);
    console.log('All lines:', lines);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      console.log(`Line ${i}: "${line}"`);
      
      // Check if this line is a date
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(line)) {
        console.log(`Found date: ${line}`);
        // If we have a complete transaction, save it
        if (currentDate && currentPayee && currentAmount) {
          console.log(`Completing transaction: Date=${currentDate}, Payee=${currentPayee}, Amount=${currentAmount}`);
          const transaction = this.parseTransactionFromParts(currentDate, currentPayee, currentAmount);
          if (transaction) {
            transactions.push(transaction);
            console.log(`Added transaction:`, transaction);
          }
        }
        
        // Start new transaction
        currentDate = line;
        currentPayee = '';
        currentAmount = '';
      }
      // Check if this line is an amount (starts with $, can be negative)
      else if (/^\$[\d,.-]+$/.test(line)) {
        console.log(`Found amount: ${line}`);
        currentAmount = line;
      }
      // Check specifically for negative amounts that might not match the above pattern
      else if (/^-\$[\d,]+\.\d{2}$/.test(line)) {
        console.log(`Found negative amount: ${line}`);
        currentAmount = line;
      }
      // Otherwise, this is likely a payee/description
      else {
        console.log(`Found payee: ${line}`);
        currentPayee = line;
      }
    }
    
    // Don't forget the last transaction
    if (currentDate && currentPayee && currentAmount) {
      console.log(`Completing final transaction: Date=${currentDate}, Payee=${currentPayee}, Amount=${currentAmount}`);
      const transaction = this.parseTransactionFromParts(currentDate, currentPayee, currentAmount);
      if (transaction) {
        transactions.push(transaction);
        console.log(`Added final transaction:`, transaction);
      }
    }
    
    console.log(`Total transactions parsed: ${transactions.length}`);
    return transactions;
  }

  private parseTransactionFromParts(dateStr: string, payeeStr: string, amountStr: string): Partial<Transaction> | null {
    try {
      console.log(`Parsing transaction parts: Date="${dateStr}", Payee="${payeeStr}", Amount="${amountStr}"`);
      
      // Parse date
      const date = this.parseDate(dateStr);
      if (!date) {
        console.warn(`Paste: Invalid date format: ${dateStr}`);
        return null;
      }
      
      // Parse amount - handle various formats including negative amounts
      let amount = 0;
      const cleanAmountStr = amountStr.replace(/[$,]/g, '').replace(/[^\d.-]/g, '');
      amount = parseFloat(cleanAmountStr);
      
      if (isNaN(amount)) {
        console.warn(`Paste: Invalid amount: ${amountStr}`);
        return null;
      }
      
      console.log(`Parsed amount: ${amount}`);
      
      // Determine transaction type based on amount sign and context
      let transactionType: 'Income' | 'Expense' = 'Expense';
      
      // Check for keywords in payee that indicate income
      const payeeLower = payeeStr.toLowerCase();
      console.log(`Payee (lowercase): "${payeeLower}"`);
      
      if (payeeLower.includes('deposit') || 
          payeeLower.includes('credit') || 
          payeeLower.includes('refund') ||
          payeeLower.includes('interest') ||
          payeeLower.includes('transfer in') ||
          payeeLower.includes('direct deposit') ||
          (amount > 0 && !payeeLower.includes('payment'))) {
        transactionType = 'Income';
        console.log(`Determined as Income based on keywords or positive amount`);
      }
      
      // Check for keywords that indicate expense
      if (payeeLower.includes('withdrawal') ||
          payeeLower.includes('debit') ||
          payeeLower.includes('purchase') ||
          payeeLower.includes('atm') ||
          payeeLower.includes('fee') ||
          amount < 0) {
        transactionType = 'Expense';
        console.log(`Determined as Expense based on keywords or negative amount`);
      }
      
      // Special handling for PAYMENT transactions
      if (payeeLower.includes('payment')) {
        console.log(`Found PAYMENT transaction with amount: ${amount}`);
        if (amount < 0) {
          // Negative payment is typically a credit card payment (reducing debt)
          transactionType = 'Income';
          console.log(`PAYMENT with negative amount -> Income`);
        } else {
          // Positive payment is typically a payment to credit card (increasing debt)
          transactionType = 'Expense';
          console.log(`PAYMENT with positive amount -> Expense`);
        }
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
      
      console.log(`Cleaned payee: "${payee}"`);
      
      // Handle amount based on account type
      let finalAmount = amount;
      
      // For now, assume this is a credit card (since it's Amazon transactions)
      // Credit 계좌: 거래 금액을 그대로 사용
      finalAmount = amount;
      
      const result = {
        date,
        type: transactionType,
        amount: finalAmount,
        payee,
        notes: undefined,
      };
      
      console.log(`Final transaction:`, result);
      return result;
      
    } catch (error) {
      console.error('Paste: Error parsing transaction parts:', error, { dateStr, payeeStr, amountStr });
      return null;
    }
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
        // Credit 계좌: 거래 금액을 그대로 사용
        finalAmount = amount;
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