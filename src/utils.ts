import { Category } from './db';

// Currency formatting
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-CA', { 
    style: 'currency', 
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Safely format currency values, fallback to 0 on invalid input
export const safeFormatCurrency = (amount: number): string => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    console.warn('Invalid amount:', amount);
    return formatCurrency(0);
  }
  // Treat near-zero values as exactly zero to avoid "-$0.00"
  if (Math.abs(amount) < 0.005) {
    return formatCurrency(0);
  }
  return formatCurrency(amount);
};

// Get category name from category ID
export const getCategoryName = (categories: Category[], categoryId: number | undefined): string => {
  if (!categoryId) return 'Undefined';
  const category = categories.find(cat => cat.id === categoryId);
  return category?.name || 'Undefined';
};

// Fix amount sign based on transaction type and category
export const fixAmountSign = (amount: number, type: string, categoryName?: string): number => {
  if (!amount) return 0;
  
  const absAmount = Math.abs(amount);
  
  switch (type) {
    case 'Income':
      return absAmount;
    case 'Expense':
      return -absAmount;
    case 'Transfer':
      return amount; // Keep original sign for transfers
    case 'Adjust':
      // Adjust는 Add는 양수, Subtract는 음수로 일관되게 처리
      return categoryName === 'Subtract' ? -absAmount : absAmount;
    default:
      return amount;
  }
}; 

/**
 * Create a local date without timezone conversion
 * @param year - Year
 * @param month - Month (1-12)
 * @param day - Day (1-31)
 * @returns Date object in local timezone
 */
export function createLocalDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day); // month is 0-based in JavaScript
}

/**
 * Parse a date string (YYYY-MM-DD) as local date
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object in local timezone
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return createLocalDate(year, month, day);
}

/**
 * Get current date in local timezone
 * @returns Current date without time
 */
export function getCurrentLocalDate(): Date {
  const now = new Date();
  return createLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Format date as YYYY-MM-DD string
 * @param date - Date object
 * @returns Formatted date string
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
} 