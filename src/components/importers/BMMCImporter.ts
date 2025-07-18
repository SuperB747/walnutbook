import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class BMMCImporter extends BaseImporter {
  name = 'BMMC';
  description = 'CSV format';
  supportedFormats = ['BMMC CSV'];
  
  detectFormat(headers: string[]): boolean {
    // BMMC CSV has headers: Item #,Card #,Transaction Date,Posting Date,Transaction Amount,Description
    if (headers.length < 6) return false;
    
    // Clean headers by removing quotes and extra spaces
    const cleanHeaders = headers.map(h => h.replace(/['"]/g, '').trim().toLowerCase());
    
    console.log('BMMC format detection - clean headers:', cleanHeaders);
    
    // Check for specific BMMC headers
    const hasItemNumber = cleanHeaders.some(h => h === 'item #');
    const hasCardNumber = cleanHeaders.some(h => h === 'card #');
    const hasTransactionDate = cleanHeaders.some(h => h === 'transaction date');
    const hasPostingDate = cleanHeaders.some(h => h === 'posting date');
    const hasTransactionAmount = cleanHeaders.some(h => h === 'transaction amount');
    const hasDescription = cleanHeaders.some(h => h === 'description');
    
    console.log('BMMC format detection:', {
      originalHeaders: headers,
      cleanHeaders: cleanHeaders,
      hasItemNumber,
      hasCardNumber,
      hasTransactionDate,
      hasPostingDate,
      hasTransactionAmount,
      hasDescription,
      totalHeaders: headers.length
    });

    // Must have all required headers for BMMC format
    return hasItemNumber && hasCardNumber && hasTransactionDate && hasPostingDate && hasTransactionAmount && hasDescription;
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
      
      // Determine transaction type based on amount sign
      // Positive amounts are expenses, negative amounts are income (transfers, refunds, etc.)
      const type = rawAmount > 0 ? 'Expense' : 'Income' as TransactionType;
      
      // For BMMC (credit card), normalize amounts using base importer
      const amount = this.normalizeAmount(rawAmount, type, 'Credit');
      
      // Clean payee name
      const payee = this.cleanPayeeName(payeeStr);
      
      // Don't include card number in notes
      const notes = undefined;
      
      return {
        date,
        payee,
        amount,
        type,
        category_id: undefined, // Let the system assign default category
        notes: '', // Default empty notes
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