import { BaseImporter, ImportResult } from './BaseImporter';
import { BMOImporter } from './BMOImporter';
import { BMMCImporter } from './BMMCImporter';
import { PCMCImporter } from './PCMCImporter';
import { CIMCImporter } from './CIMCImporter';
import { PasteImporter } from './PasteImporter';
import { AMMCImporter } from './AMMCImporter';
import { Transaction } from '../../db';

export class ImporterManager {
  private importers: BaseImporter[] = [];
  
  constructor() {
    // Register all available importers
    this.registerImporter(new BMOImporter());
    this.registerImporter(new BMMCImporter());
    this.registerImporter(new PCMCImporter());
    this.registerImporter(new CIMCImporter());
    this.registerImporter(new PasteImporter());
    this.registerImporter(new AMMCImporter());
    // Add more importers here as needed
  }
  
  registerImporter(importer: BaseImporter): void {
    this.importers.push(importer);
  }
  
  private detectImporter(headers: string[]): BaseImporter | null {
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
  
  async importCSV(content: string, selectedImporter?: BaseImporter, accountType?: string): Promise<ImportResult> {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length < 2) {
      return {
        transactions: [],
        errors: ['CSV file is too short or empty'],
        warnings: []
      };
    }
    
    // Check if this looks like multi-line paste data (not CSV format)
    const isMultiLinePaste = this.isMultiLinePasteData(lines);
    
    if (isMultiLinePaste) {
      // Use PasteImporter for multi-line data
      const pasteImporter = this.importers.find(imp => imp.name === 'Paste') as any;
      if (pasteImporter && pasteImporter.parseMultiLineTransactions) {
        const transactions = pasteImporter.parseMultiLineTransactions(content);
        return {
          transactions,
          errors: [],
          warnings: []
        };
      }
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
        
        // Special check for PCMC format
        if (fields.length > 2 && 
            fields.some(field => field.toLowerCase().includes('description')) &&
            fields.some(field => field.toLowerCase().includes('type')) &&
            fields.some(field => field.toLowerCase().includes('card holder name'))) {
          headerIndex = i;
          break;
        }
        
        // Special check for CIMC format (no headers, date in first column)
        if (fields.length >= 3 && 
            /^\d{4}-\d{1,2}-\d{1,2}$/.test(fields[0]) && // YYYY-MM-DD format
            !isNaN(parseFloat(fields[2]))) { // Third column is numeric
          headerIndex = i;
          break;
        }
        
        // Special check for AMMC format
        if (fields.length >= 4 && 
            fields.some(field => field.toLowerCase().includes('posted date')) &&
            fields.some(field => field.toLowerCase().includes('payee')) &&
            fields.some(field => field.toLowerCase().includes('amount'))) {
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
    
    // For CIMC format (no headers), start from the first line
    // For other formats, skip header row and process data rows
    const startIndex = importer.name === 'CIMC' ? headerIndex : headerIndex + 1;
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
        const fields = this.parseCSVLine(line);
      if (fields.length < 2) {
        warnings.push(`Line ${i + 1}: Skipped - insufficient data`);
          continue;
        }
        
      try {
        const transaction = importer.parseRow(fields, mapping, accountType);
        if (transaction) {
          const validated = importer.validateTransaction(transaction);
          if (validated) {
            transactions.push(validated);
          } else {
            warnings.push(`Line ${i + 1}: Skipped - validation failed`);
          }
        } else {
          warnings.push(`Line ${i + 1}: Skipped - could not parse`);
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

  private isMultiLinePasteData(lines: string[]): boolean {
    // Check if this looks like multi-line paste data
    // Look for patterns like: date on one line, description on next, amount on next
    let dateCount = 0;
    let amountCount = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Check for date pattern
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmedLine)) {
        dateCount++;
      }
      
      // Check for amount pattern
      if (/^\$[\d,.-]+$/.test(trimmedLine)) {
        amountCount++;
      }
    }
    
    // If we have multiple dates and amounts, it's likely multi-line paste data
    return dateCount > 1 && amountCount > 1;
  }
} 