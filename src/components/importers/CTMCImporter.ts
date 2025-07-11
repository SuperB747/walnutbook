import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class CTMCImporter extends BaseImporter {
  name = 'CTMC';
  description = 'CSV format';
  supportedFormats = ['CTMC CSV'];

  detectFormat(headers: string[]): boolean {
    // CTMC format has headers with specific column names
    if (headers.length < 7) return false; // Should have 7 columns
    
    // Check for CTMC specific headers
    const hasRef = headers.some(header => 
      header.replace(/['"]/g, '').trim().toLowerCase() === 'ref'
    );
    const hasTransactionDate = headers.some(header => 
      header.replace(/['"]/g, '').trim().toLowerCase() === 'transaction date'
    );
    const hasPostedDate = headers.some(header => 
      header.replace(/['"]/g, '').trim().toLowerCase() === 'posted date'
    );
    const hasType = headers.some(header => 
      header.replace(/['"]/g, '').trim().toLowerCase() === 'type'
    );
    const hasDescription = headers.some(header => 
      header.replace(/['"]/g, '').trim().toLowerCase() === 'description'
    );
    const hasCategory = headers.some(header => 
      header.replace(/['"]/g, '').trim().toLowerCase() === 'category'
    );
    const hasAmount = headers.some(header => 
      header.replace(/['"]/g, '').trim().toLowerCase() === 'amount'
    );
    
    console.log('CTMC format detection:', {
      headers: headers,
      hasRef,
      hasTransactionDate,
      hasPostedDate,
      hasType,
      hasDescription,
      hasCategory,
      hasAmount,
      totalHeaders: headers.length
    });

    // Must have all required headers
    return hasRef && hasTransactionDate && hasPostedDate && hasType && hasDescription && hasCategory && hasAmount;
  }

  mapColumns(headers: string[]): ColumnMapping {
    // CTMC format: REF, TRANSACTION DATE, POSTED DATE, TYPE, DESCRIPTION, Category, AMOUNT
    const refIndex = headers.findIndex(h => h.replace(/['"]/g, '').trim().toLowerCase() === 'ref');
    const transactionDateIndex = headers.findIndex(h => h.replace(/['"]/g, '').trim().toLowerCase() === 'transaction date');
    const postedDateIndex = headers.findIndex(h => h.replace(/['"]/g, '').trim().toLowerCase() === 'posted date');
    const typeIndex = headers.findIndex(h => h.replace(/['"]/g, '').trim().toLowerCase() === 'type');
    const descriptionIndex = headers.findIndex(h => h.replace(/['"]/g, '').trim().toLowerCase() === 'description');
    const categoryIndex = headers.findIndex(h => h.replace(/['"]/g, '').trim().toLowerCase() === 'category');
    const amountIndex = headers.findIndex(h => h.replace(/['"]/g, '').trim().toLowerCase() === 'amount');

    return {
      date: transactionDateIndex,
      payee: descriptionIndex,
      amount: amountIndex,
      type: typeIndex,
      notes: -1, // Don't store card number
    };
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    try {
      // Extract values from the row
      const dateStr = row[mapping.date]?.trim() || '';
      const payeeStr = row[mapping.payee]?.trim() || '';
      const amountStr = row[mapping.amount]?.trim() || '';
      const typeStr = mapping.type !== undefined ? row[mapping.type]?.trim() || '' : '';
      const cardNumber = mapping.notes !== undefined ? row[mapping.notes]?.trim() || '' : '';

      // Debug log the extracted values
      console.log('CTMC Raw Row:', row);
      console.log('CTMC Extracted Values:', { dateStr, payeeStr, amountStr, typeStr, cardNumber });

      // Check for required fields
      if (!dateStr || !payeeStr || !amountStr) {
        console.warn('CTMC: Missing required fields:', { dateStr, payeeStr, amountStr });
        return null;
      }

      // Parse date (YYYY-MM-DD format)
      let parsedDate = dateStr;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
        // Try to parse other date formats
        const dateMatch = parsedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (dateMatch) {
          const [, year, month, day] = dateMatch;
          parsedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else {
          console.warn('CTMC: Invalid date format:', dateStr);
          return null;
        }
      }

      console.log('CTMC Parsed Date:', parsedDate);

      // Parse amount
      let rawAmount = 0;
      if (amountStr && amountStr !== '') {
        // Remove any currency symbols and commas
        const cleanAmountStr = amountStr.replace(/[$,]/g, '').trim();
        rawAmount = parseFloat(cleanAmountStr);
        
        if (isNaN(rawAmount)) {
          console.warn('CTMC: Invalid amount:', amountStr);
          return null;
        }
      } else {
        console.warn('CTMC: No amount found:', { dateStr, payeeStr, amountStr });
        return null;
      }

      // Determine transaction type based on amount sign
      // Positive amount = Expense, Negative amount = Income
      const type: TransactionType = rawAmount >= 0 ? 'Expense' : 'Income';
      const amount = this.normalizeAmount(Math.abs(rawAmount), type, accountType);

      // Clean payee name
      const payee = payeeStr
        .replace(/^"|"$/g, '') // Remove surrounding quotes
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      // Skip if payee is empty after cleaning
      if (!payee) {
        console.warn('CTMC: Empty payee after cleaning:', { dateStr, payeeStr, amountStr });
        return null;
      }

      const transaction: Partial<Transaction> = {
        date: parsedDate,
        payee: payee,
        amount: amount,
        type: type,
        notes: undefined
      };

      console.log('CTMC Final Transaction:', transaction);
      return transaction;

    } catch (error) {
      console.error('CTMC: Error parsing row:', error);
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