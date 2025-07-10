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