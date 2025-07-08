import { Transaction, TransactionType } from '../../db';

export interface ImportResult {
  transactions: Partial<Transaction>[];
  errors: string[];
  warnings: string[];
}

export interface ColumnMapping {
  date: number;
  amount: number;
  payee: number;
  type: number | undefined;
  notes: number | undefined;
  category?: number;
}

export abstract class BaseImporter {
  abstract name: string;
  abstract description: string;
  abstract supportedFormats: string[];
  
  abstract detectFormat(headers: string[]): boolean;
  abstract mapColumns(headers: string[]): ColumnMapping;
  abstract parseRow(row: string[], mapping: ColumnMapping, accountType?: string): Partial<Transaction> | null;
  abstract validateTransaction(transaction: Partial<Transaction>): Partial<Transaction> | null;
  
  // Common utility methods
  protected parseAmount(amountStr: string): number {
    // Remove currency symbols, commas, and parse
    const cleanAmount = amountStr.replace(/[$,¥€£]/g, '').replace(/,/g, '');
    return parseFloat(cleanAmount) || 0;
  }
  
  protected parseDate(dateStr: string): string | null {
    if (!dateStr) return null;
    
    const cleanDateStr = dateStr.trim();
    
    // Try yyyyMMdd format first
    if (/^\d{8}$/.test(cleanDateStr)) {
      return `${cleanDateStr.slice(0, 4)}-${cleanDateStr.slice(4, 6)}-${cleanDateStr.slice(6, 8)}`;
    }
    
    // Try MM/dd/yyyy format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanDateStr)) {
      const parts = cleanDateStr.split('/');
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    
    // Try yyyy-MM-dd format
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanDateStr)) {
      const parts = cleanDateStr.split('-');
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Try other common formats
    const formats = [
      { regex: /^\d{1,2}-\d{1,2}-\d{4}$/, format: 'MM-dd-yyyy' },
      { regex: /^\d{4}\/\d{1,2}\/\d{1,2}$/, format: 'yyyy/MM/dd' },
      { regex: /^\d{1,2}\/\d{1,2}\/\d{2}$/, format: 'MM/dd/yy' },
    ];
    
    for (const { regex, format } of formats) {
      if (regex.test(cleanDateStr)) {
        try {
          const date = new Date(cleanDateStr);
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    console.warn(`Could not parse date: ${dateStr}`);
    return null;
  }
  
  protected determineTransactionType(amount: number, typeStr?: string): TransactionType {
    if (typeStr) {
      const upperType = typeStr.toUpperCase();
      if (upperType.includes('CREDIT') || upperType.includes('DEPOSIT') || upperType.includes('INCOME')) {
        return 'Income';
      }
      if (upperType.includes('DEBIT') || upperType.includes('WITHDRAWAL') || upperType.includes('EXPENSE')) {
        return 'Expense';
      }
    }
    
    return amount >= 0 ? 'Income' : 'Expense';
  }
  
  protected normalizeAmount(amount: number, type: TransactionType): number {
    if (type === 'Income') {
      return Math.abs(amount);
    } else {
      return -Math.abs(amount);
    }
  }
} 