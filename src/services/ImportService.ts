import { Transaction } from '../db';
import { ImporterManager } from '../components/importers/ImporterManager';
import { BaseImporter } from '../components/importers/BaseImporter';

export interface ImportServiceResult {
  imported: Transaction[];
  imported_count: number;
  duplicate_count: number;
  skipped: Partial<Transaction>[];
  errors: string[];
  warnings: string[];
  detectedImporter?: string; // Add detected importer name
}

export class ImportService {
  private importerManager: ImporterManager;
  
  constructor() {
    this.importerManager = new ImporterManager();
  }
  
  getAvailableImporters(): BaseImporter[] {
    return this.importerManager.getAvailableImporters();
  }
  
  async importCSV(
    content: string, 
    selectedImporter?: BaseImporter,
    existingTransactions: Transaction[] = [],
    accountType?: string
  ): Promise<ImportServiceResult> {
    try {
      // Parse CSV using importer manager
      const parseResult = await this.importerManager.importCSV(content, selectedImporter, accountType);
      
      if (parseResult.transactions.length === 0) {
        return {
          imported: [],
          imported_count: 0,
          duplicate_count: 0,
          skipped: [],
          errors: parseResult.errors,
          warnings: parseResult.warnings,
          detectedImporter: parseResult.detectedImporter
        };
      }
      
      // Remove duplicates
      const { uniqueTransactions, duplicateCount, skippedTransactions } = this.removeDuplicates(
        parseResult.transactions,
        existingTransactions
      );
      
      return {
        imported: uniqueTransactions as Transaction[],
        imported_count: uniqueTransactions.length,
        duplicate_count: duplicateCount,
        skipped: skippedTransactions,
        errors: parseResult.errors,
        warnings: [...parseResult.warnings, ...(duplicateCount > 0 ? [`${duplicateCount} duplicate(s) found and skipped`] : [])],
        detectedImporter: parseResult.detectedImporter
      };
      
    } catch (error) {
      return {
        imported: [],
        imported_count: 0,
        duplicate_count: 0,
        skipped: [],
        errors: [error instanceof Error ? error.message : 'Unknown import error'],
        warnings: []
      };
    }
  }
  
  private removeDuplicates(
    newTransactions: Partial<Transaction>[],
    existingTransactions: Transaction[]
  ): { uniqueTransactions: Partial<Transaction>[]; duplicateCount: number; skippedTransactions: Partial<Transaction>[] } {
    const existingKeys = new Set<string>();
    let duplicateCount = 0;
    const skippedTransactions: Partial<Transaction>[] = [];
    
    // Create keys for existing transactions only
    existingTransactions.forEach(transaction => {
      const key = this.createTransactionKey(transaction);
      if (key) {
        existingKeys.add(key);
      }
    });
    
    // Filter out duplicates from new transactions (only check against existing transactions)
    const uniqueTransactions = newTransactions.filter(transaction => {
      const key = this.createTransactionKey(transaction);
      if (!key) return true; // Keep transactions without valid keys
      
      const isDuplicate = existingKeys.has(key);
      if (isDuplicate) {
        duplicateCount++;
        skippedTransactions.push(transaction);
        console.log(`Duplicate found: ${key}`);
      }
      
      // Don't add new transaction keys to existingKeys - allow duplicates within the same import
      return !isDuplicate;
    });
    
    return { uniqueTransactions, duplicateCount, skippedTransactions };
  }
  
  private createTransactionKey(transaction: Partial<Transaction>): string {
    if (!transaction.date || !transaction.payee || transaction.amount === undefined) {
      return '';
    }
    
    // Normalize the data
    const date = transaction.date.toString();
    // 중복 확인 시에는 원래 payee만 사용 (notes 제외)
    const payee = transaction.payee.trim().toLowerCase();
    const amount = Math.round(transaction.amount * 100); // Convert to cents for exact matching
    
    return `${date}|${payee}|${amount}`;
  }
} 