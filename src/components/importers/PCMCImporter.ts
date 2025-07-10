import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction } from '../../db';

export class PCMCImporter extends BaseImporter {
  name = 'PCMC';
  description = 'CSV format';
  supportedFormats = ['PCMC Credit Card CSV'];

  detectFormat(headers: string[]): boolean {
    const requiredHeaders = ['Description', 'Type', 'Card Holder Name', 'Date', 'Time', 'Amount'];
    return requiredHeaders.every(header => headers.includes(header));
  }

  mapColumns(headers: string[]): ColumnMapping {
    return {
      date: headers.findIndex(h => h === 'Date'),
      amount: headers.findIndex(h => h === 'Amount'),
      payee: headers.findIndex(h => h === 'Description'),
      type: headers.findIndex(h => h === 'Type'),
      notes: headers.findIndex(h => h === 'Type'),
    };
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    const description = mapping.payee >= 0 ? row[mapping.payee]?.trim() : '';
    const type = mapping.type !== undefined && mapping.type >= 0 ? row[mapping.type]?.trim() : '';
    const dateStr = mapping.date >= 0 ? row[mapping.date]?.trim() : '';
    const amountStr = mapping.amount >= 0 ? row[mapping.amount]?.trim() : '';

    if (!description || !dateStr || !amountStr) {
      return null;
    }

    // Parse date (MM/DD/YYYY format)
    const dateParts = dateStr.split('/');
    if (dateParts.length !== 3) return null;
    
    const month = parseInt(dateParts[0]) - 1; // JavaScript months are 0-based
    const day = parseInt(dateParts[1]);
    const year = parseInt(dateParts[2]);
    
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;

    // Parse amount
    const amount = parseFloat(amountStr.replace(/[^\d.-]/g, ''));
    if (isNaN(amount)) return null;

    // Determine transaction type based on PCMC Type and amount
    let transactionType: 'Income' | 'Expense' = 'Expense';
    if (type === 'PAYMENT' || amount > 0) {
      transactionType = 'Income';
    }

    // For PCMC: Use base importer's credit card amount normalization
    const finalAmount = this.normalizeAmount(amount, transactionType, 'Credit');
    
    // Clean payee name
    let payee = description;
    if (type === 'PAYMENT') {
      payee = 'Payment - Credit Card';
    } else {
      // Remove common suffixes and clean up
      payee = payee
        .replace(/\s+#\d+$/, '') // Remove #1, #2, etc.
        .replace(/\s+$/, '') // Remove trailing spaces
        .replace(/^\s+/, ''); // Remove leading spaces
    }

    return {
      date: date.toISOString().split('T')[0],
      payee,
      amount: finalAmount,
      type: transactionType,
      category_id: undefined, // Let the system assign default category
      notes: '', // Default empty notes
    };
  }

  validateTransaction(transaction: Partial<Transaction>): Partial<Transaction> | null {
    if (!transaction.date || !transaction.payee || transaction.amount === undefined) {
      return null;
    }
    return transaction;
  }
} 