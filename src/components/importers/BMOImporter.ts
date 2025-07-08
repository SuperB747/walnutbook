import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class BMOImporter extends BaseImporter {
  name = 'BMO Checking';
  description = 'CSV format';
  supportedFormats = ['BMO CSV'];
  
  detectFormat(headers: string[]): boolean {
    // BMO CSV has headers like: First Bank Card, Transaction Type, Date Posted, Transaction Amount, Description
    const headerText = headers.join(' ').toLowerCase();
    return headerText.includes('first bank card') && 
           headerText.includes('transaction type') &&
           headerText.includes('date posted') &&
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
      
      if (lowerHeader.includes('date posted')) {
        mapping.date = index;
      } else if (lowerHeader.includes('transaction amount')) {
        mapping.amount = index;
      } else if (lowerHeader.includes('description')) {
        mapping.payee = index;
      } else if (lowerHeader.includes('transaction type')) {
        mapping.type = index;
      } else if (lowerHeader.includes('first bank card')) {
        // Card number can be used as notes
        mapping.notes = index;
      }
    });
    
    return mapping;
  }
  
  parseRow(row: string[], mapping: ColumnMapping): Partial<Transaction> | null {
    try {
      // Extract data from row
      const dateStr = row[mapping.date]?.trim() || '';
      const amountStr = row[mapping.amount]?.trim() || '0';
      const payeeStr = row[mapping.payee]?.trim() || '';
      const typeStr = mapping.type !== undefined && mapping.type >= 0 ? row[mapping.type]?.trim() : undefined;
      const cardNumber = mapping.notes !== undefined && mapping.notes >= 0 ? row[mapping.notes]?.trim() : '';
      
      // Parse date (BMO uses YYYYMMDD format)
      const date = this.parseDate(dateStr);
      if (!date) {
        console.warn(`BMO: Invalid date format: ${dateStr}`);
        return null;
      }
      
      // Parse amount
      const rawAmount = this.parseAmount(amountStr);
      if (rawAmount === 0) {
        console.warn(`BMO: Invalid amount: ${amountStr}`);
        return null;
      }
      
      // Determine transaction type
      const type = this.determineTransactionType(rawAmount, typeStr);
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
      console.error('BMO: Error parsing row:', error, row);
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
    // Remove BMO-specific prefixes and clean up the payee name
    return payeeStr
      .replace(/^\[DS\]/i, '') // Remove [DS] prefix
      .replace(/^\[CW\]/i, '') // Remove [CW] prefix
      .replace(/^\[M\/C\]/i, '') // Remove [M/C] prefix
      .replace(/^B\.C\.\s+HYDRO-PAP\s+BPY\/FAC/i, 'B.C. Hydro') // Clean up B.C. Hydro
      .replace(/^INTERAC\s+ETRNSFR\s+SENT\s+/i, '') // Remove INTERAC ETRNSFR SENT prefix
      .replace(/^MOBILE\s+CHEQUE\s+DEPOSIT/i, 'Mobile Cheque Deposit') // Clean up mobile deposit
      .replace(/^M\/C-/i, '') // Remove M/C- prefix
      .replace(/\s+$/g, '') // Remove trailing spaces
      .replace(/^\s+/g, ''); // Remove leading spaces
  }
} 