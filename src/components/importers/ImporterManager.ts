import { BaseImporter, ImportResult } from './BaseImporter';
import { BMOImporter } from './BMOImporter';
import { BMMCImporter } from './BMMCImporter';
import { Transaction } from '../../db';

export class ImporterManager {
  private importers: BaseImporter[] = [];
  
  constructor() {
    // Register all available importers
    this.registerImporter(new BMOImporter());
    this.registerImporter(new BMMCImporter());
    // Add more importers here as needed
  }
  
  registerImporter(importer: BaseImporter): void {
    this.importers.push(importer);
  }
  
  detectImporter(headers: string[]): BaseImporter | null {
    for (const importer of this.importers) {
      if (importer.detectFormat(headers)) {
        return importer;
      }
    }
    return null;
  }
  
  getAvailableImporters(): BaseImporter[] {
    return this.importers;
  }
  
  async importCSV(content: string, selectedImporter?: BaseImporter): Promise<ImportResult> {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length < 2) {
      return {
        transactions: [],
        errors: ['CSV file is too short or empty'],
        warnings: []
      };
    }
    
    // Try to find headers (skip empty lines and metadata)
    let headerIndex = 0;
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const line = lines[i];
      const fields = this.parseCSVLine(line);
      
      // Check if this looks like a header row
      if (fields.length > 2 && 
          fields.some(field => field.toLowerCase().includes('date')) &&
          fields.some(field => field.toLowerCase().includes('amount'))) {
        headerIndex = i;
        break;
      }
      
              // Special check for BMO format
        if (fields.length > 2 && 
            fields.some(field => field.toLowerCase().includes('first bank card')) &&
            fields.some(field => field.toLowerCase().includes('transaction type'))) {
          headerIndex = i;
          break;
        }
        
        // Special check for BMMC format
        if (fields.length > 2 && 
            fields.some(field => field.toLowerCase().includes('item #')) &&
            fields.some(field => field.toLowerCase().includes('card #'))) {
          headerIndex = i;
          break;
        }
    }
    
    const headers = this.parseCSVLine(lines[headerIndex]);
    
    // Detect or use specified importer
    const importer = selectedImporter || this.detectImporter(headers);
    if (!importer) {
      return {
        transactions: [],
        errors: ['Could not detect CSV format. Please select a specific importer.'],
        warnings: []
      };
    }
    
    console.log(`Using importer: ${importer.name}`);
    
    // Map columns
    const mapping = importer.mapColumns(headers);
    
    // Validate mapping
    if (mapping.date === -1 || mapping.amount === -1 || mapping.payee === -1) {
      return {
        transactions: [],
        errors: [`${importer.name}: Could not map required columns (date, amount, payee)`],
        warnings: []
      };
    }
    
    // Parse transactions
    const transactions: Partial<Transaction>[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      try {
        const fields = this.parseCSVLine(line);
        
        if (fields.length < Math.max(mapping.date, mapping.amount, mapping.payee) + 1) {
          warnings.push(`Line ${i + 1}: Insufficient fields, skipping`);
          continue;
        }
        
        const transaction = importer.parseRow(fields, mapping);
        if (transaction) {
          const validated = importer.validateTransaction(transaction);
          if (validated) {
            transactions.push(validated);
          } else {
            warnings.push(`Line ${i + 1}: Invalid transaction data`);
          }
        } else {
          warnings.push(`Line ${i + 1}: Could not parse transaction`);
        }
      } catch (error) {
        errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return {
      transactions,
      errors,
      warnings
    };
  }
  
  private parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    fields.push(current.trim());
    return fields.map(field => field.replace(/^["']|["']$/g, ''));
  }
} 