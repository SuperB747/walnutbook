import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction } from '../../db';

export class AMMCImporter extends BaseImporter {
  name = 'AMMC';
  description = 'CSV format';
  supportedFormats = ['AMMC CSV'];

  detectFormat(headers: string[]): boolean {
    // AMMC CSV has headers like: Posted Date,Payee,Address,Amount
    const headerText = headers.join(' ').toLowerCase();
    return headerText.includes('posted date') && 
           headerText.includes('payee') &&
           headerText.includes('address') &&
           headerText.includes('amount');
  }

  mapColumns(headers: string[]): ColumnMapping {
    // AMMC format: Posted Date,Payee,Address,Amount
    const headerText = headers.join(' ').toLowerCase();
    
    let dateIndex = -1;
    let payeeIndex = -1;
    let amountIndex = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const field = headers[i].toLowerCase();
      if (field.includes('posted date') || field.includes('date')) {
        dateIndex = i;
      } else if (field.includes('payee')) {
        payeeIndex = i;
      } else if (field.includes('amount')) {
        amountIndex = i;
      }
    }
    
    return {
      date: dateIndex,
      amount: amountIndex,
      payee: payeeIndex,
      type: undefined,
      notes: undefined,
    };
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    try {
      const dateStr = row[mapping.date]?.trim() || '';
      const amountStr = row[mapping.amount]?.trim() || '';
      const payeeStr = row[mapping.payee]?.trim() || '';
      
      if (!dateStr || !amountStr || !payeeStr) {
        return null;
      }
      
      // Parse date (MM/DD/YYYY format)
      const date = this.parseDate(dateStr);
      if (!date) {
        console.warn(`AMMC: Invalid date format: ${dateStr}`);
        return null;
      }
      
      // Parse amount - handle negative amounts
      let amount = 0;
      const cleanAmountStr = amountStr.replace(/[$,]/g, '').replace(/[^\d.-]/g, '');
      amount = parseFloat(cleanAmountStr);
      
      if (isNaN(amount)) {
        console.warn(`AMMC: Invalid amount: ${amountStr}`);
        return null;
      }
      
      // Determine transaction type based on amount sign and context
      let transactionType: 'Income' | 'Expense' = 'Expense';
      
      // Check for keywords in payee that indicate income
      const payeeLower = payeeStr.toLowerCase();
      if (payeeLower.includes('payment') ||
          payeeLower.includes('deposit') || 
          payeeLower.includes('credit') || 
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
          payeeLower.includes('interest charge') ||
          amount < 0) {
        transactionType = 'Expense';
      }
      
      // Special handling for PAYMENT transactions
      if (payeeLower.includes('payment')) {
        if (amount > 0) {
          // Positive payment is typically a credit card payment (reducing debt)
          transactionType = 'Income';
        } else {
          // Negative payment is typically a payment to credit card (increasing debt)
          transactionType = 'Expense';
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
        .replace(/\*[A-Z0-9]+/, '') // Remove transaction IDs like *NW3QM07Q2
        .replace(/\s+WWW\.AMAZON\.CAON$/, '') // Remove Amazon website suffix
        .replace(/\s+AMAZON\.CA ON$/, '') // Remove Amazon.ca ON suffix
        .replace(/\s+WWW\.AMAZON\.CA\s*$/, '') // Remove WWW.AMAZON.CA suffix
        .replace(/\s+AMAZON\.CA\s*$/, ''); // Remove AMAZON.CA suffix
      
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