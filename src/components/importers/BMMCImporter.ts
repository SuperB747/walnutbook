import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class BMMCImporter extends BaseImporter {
  name = 'BMMC';
  description = 'CSV format';
  supportedFormats = ['BMMC CSV'];
  
  detectFormat(headers: string[]): boolean {
    // BMMC CSV has headers like: Item #, Card #, Transaction Date, Posting Date, Transaction Amount, Description
    const headerText = headers.join(' ').toLowerCase();
    return headerText.includes('item #') && 
           headerText.includes('card #') &&
           headerText.includes('transaction date') &&
           headerText.includes('posting date') &&
           headerText.includes('transaction amount') &&
           headerText.includes('description');
  }
  
  mapColumns(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {
      date: -1,
      amount: -1,
      payee: -1,
      type: undefined,
      notes: undefined
    };
    
    headers.forEach((header, index) => {
      const lowerHeader = header.toLowerCase().trim();
      
      if (lowerHeader.includes('transaction date')) {
        mapping.date = index;
      } else if (lowerHeader.includes('posting date')) {
        mapping.date = index; // Use posting date if transaction date not found
      } else if (lowerHeader.includes('transaction amount')) {
        mapping.amount = index;
      } else if (lowerHeader.includes('description')) {
        mapping.payee = index;
      } else if (lowerHeader.includes('card #')) {
        // Card number can be used as notes
        mapping.notes = index;
      }
    });
    
    console.log('BMMC: Headers:', headers);
    console.log('BMMC: Mapping:', mapping);
    
    return mapping;
  }
  
  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    try {
      // Extract data from row
      const dateStr = row[mapping.date]?.trim() || '';
      const amountStr = row[mapping.amount]?.trim() || '0';
      const payeeStr = row[mapping.payee]?.trim() || '';
      const cardNumber = mapping.notes !== undefined && mapping.notes >= 0 ? row[mapping.notes]?.trim() : '';
      
      // Parse date (BMMC uses YYYYMMDD format)
      const date = this.parseDate(dateStr);
      if (!date) {
        console.warn(`BMMC: Invalid date format: ${dateStr}`);
        return null;
      }
      
      // Parse amount
      const rawAmount = this.parseAmount(amountStr);
      if (rawAmount === 0) {
        console.warn(`BMMC: Invalid amount: ${amountStr}`);
        return null;
      }
      
      // Determine transaction type (credit card transactions are typically expenses)
      const type = 'Expense' as TransactionType;
      const amount = this.normalizeAmount(rawAmount, type);
      
      // Clean payee name
      const payee = this.cleanPayeeName(payeeStr);
      
      // Don't include card number in notes
      const notes = undefined;
      
      return {
        date,
        type,
        amount,
        payee,
        notes
      };
    } catch (error) {
      console.error('BMMC: Error parsing row:', error, row);
      return null;
    }
  }
  
  validateTransaction(transaction: Partial<Transaction>): Partial<Transaction> | null {
    if (!transaction.date || !transaction.payee || transaction.amount === undefined) {
      return null;
    }
    
    if (transaction.amount === 0) {
      return null;
    }
    
    return transaction;
  }
  
  private cleanPayeeName(payeeStr: string): string {
    // Remove BMMC-specific prefixes and clean up the payee name
    return payeeStr
      .replace(/^TRSF\s+FROM\/DE\s+ACCT\/CPT\s+/i, 'Transfer: ') // Clean up transfer descriptions
      .replace(/^PREAUTH\s+/i, '') // Remove PREAUTH prefix
      .replace(/\s+$/g, '') // Remove trailing spaces
      .replace(/^\s+/g, ''); // Remove leading spaces
  }
} 