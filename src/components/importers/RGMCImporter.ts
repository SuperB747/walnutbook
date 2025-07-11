import { BaseImporter, ColumnMapping } from './BaseImporter';
import { Transaction, TransactionType } from '../../db';

export class RGMCImporter extends BaseImporter {
  name = 'RGMC';
  description = 'CSV format';
  supportedFormats = ['RGMC CSV'];

  detectFormat(headers: string[]): boolean {
    // RGMC CSV has specific headers: "Date","Posted Date","Reference Number","Activity Type","Status","Transaction Card Number","Merchant Category","Merchant Name","Merchant City","Merchant State/Province","Merchant Country","Merchant Postal Code/Zip","Amount","Rewards","Name on Card"
    if (headers.length < 13) return false;
    
    // Clean headers by removing quotes and extra spaces
    const cleanHeaders = headers.map(h => h.replace(/['"]/g, '').trim().toLowerCase());
    
    console.log('RGMC format detection - clean headers:', cleanHeaders);
    
    // Check for specific RGMC headers
    const hasDate = cleanHeaders.some(h => h === 'date');
    const hasPostedDate = cleanHeaders.some(h => h === 'posted date');
    const hasMerchantName = cleanHeaders.some(h => h === 'merchant name');
    const hasAmount = cleanHeaders.some(h => h === 'amount');
    const hasReferenceNumber = cleanHeaders.some(h => h === 'reference number');
    
    console.log('RGMC format detection:', {
      originalHeaders: headers,
      cleanHeaders: cleanHeaders,
      hasDate,
      hasPostedDate,
      hasMerchantName,
      hasAmount,
      hasReferenceNumber,
      totalHeaders: headers.length
    });

    // Must have all required headers for RGMC format
    return hasDate && hasPostedDate && hasMerchantName && hasAmount && hasReferenceNumber;
  }

  mapColumns(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {
      date: -1,
      payee: -1,
      amount: -1,
      type: undefined,
      notes: undefined
    };

    headers.forEach((header, index) => {
      const headerLower = header.toLowerCase().trim().replace(/['"]/g, '');
      
      if (headerLower === 'date') {
        mapping.date = index;
      } else if (headerLower === 'merchant name') {
        mapping.payee = index;
      } else if (headerLower === 'amount') {
        mapping.amount = index;
      }
    });

    return mapping;
  }

  parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null {
    try {
      // Extract values from the row
      const dateStr = row[mapping.date]?.trim().replace(/['"]/g, '') || '';
      const payeeStr = row[mapping.payee]?.trim().replace(/['"]/g, '') || '';
      let amountStr = row[mapping.amount]?.trim().replace(/['"]/g, '') || '';

      // Skip if required fields are missing
      if (!dateStr || !payeeStr || !amountStr) {
        console.warn('RGMC: Missing required fields:', { dateStr, payeeStr, amountStr });
        return null;
      }

      // Parse date
      const date = this.parseDate(dateStr);
      if (!date) {
        console.warn('RGMC: Invalid date format:', dateStr);
        return null;
      }

      // Remove currency symbol and commas from amount
      amountStr = amountStr.replace(/[$,]/g, '').trim();

      // Parse amount
      const rawAmount = parseFloat(amountStr);
      if (isNaN(rawAmount)) {
        console.warn('RGMC: Invalid amount:', amountStr);
        return null;
      }

      // RGMC CSV format: 
      // - Negative amount = Income (credit card payment, refund, etc.)
      // - Positive amount = Expense (purchase, fee, etc.)
      // We need to convert to standard format where:
      // - Expense = negative amount
      // - Income = positive amount
      let type: TransactionType;
      let amount: number;

      if (rawAmount < 0) {
        // Negative in CSV = Income (payment, refund)
        type = 'Income';
        amount = Math.abs(rawAmount); // Convert to positive for Income
      } else {
        // Positive in CSV = Expense (purchase, fee)
        type = 'Expense';
        amount = -Math.abs(rawAmount); // Convert to negative for Expense
      }

      // Clean up payee name
      const payee = payeeStr
        .replace(/\s+/g, ' ')    // Normalize spaces
        .trim();                 // Remove leading/trailing spaces

      // Debug log
      console.log('RGMC parsed transaction:', {
        date,
        payee,
        originalAmount: amountStr,
        rawAmount,
        convertedAmount: amount,
        type,
        accountType
      });

      return {
        date,
        payee,
        amount,  // Converted to standard format
        type,
        notes: undefined
      };

    } catch (error) {
      console.error('RGMC: Error parsing row:', error);
      return null;
    }
  }

  validateTransaction(transaction: Partial<Transaction>): Partial<Transaction> | null {
    // Basic validation
    if (!transaction.date || !transaction.payee || transaction.amount === undefined || !transaction.type) {
      return null;
    }

    // Ensure type matches amount sign (standard format)
    if (transaction.type === 'Expense' && transaction.amount >= 0) {
      console.warn('RGMC validate: Converting positive expense to negative:', transaction);
      transaction.amount = -Math.abs(transaction.amount);
    } else if (transaction.type === 'Income' && transaction.amount < 0) {
      console.warn('RGMC validate: Converting negative income to positive:', transaction);
      transaction.amount = Math.abs(transaction.amount);
    }

    return transaction;
  }
} 