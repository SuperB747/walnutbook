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

// Recurring item의 Next Transaction Date 계산을 위한 유틸리티 함수들
export interface RecurringItem {
  id: number;
  name: string;
  amount: number;
  type: 'Income' | 'Expense';
  category_id: number;
  account_id: number;
  day_of_month: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
  repeat_type?: string;
  start_date?: string;
  interval_value?: number;
  interval_unit?: string;
}

/**
 * Recurring item의 모든 발생일을 계산합니다.
 * @param item Recurring item
 * @param maxOccurrences 최대 발생일 수 (기본값: 100)
 * @returns 발생일 배열 (날짜 문자열과 occurrenceId 포함)
 */
export function calculateRecurringOccurrences(
  item: RecurringItem, 
  maxOccurrences: number = 100
): Array<{ date: string; occurrenceId: string; occurrenceCount: number }> {
  const occurrences: Array<{ date: string; occurrenceId: string; occurrenceCount: number }> = [];
  
  if (item.repeat_type === 'interval') {
    if (!item.start_date) {
      return occurrences; // start_date가 없으면 발생일 계산 불가
    }
    
    const startDate = parseLocalDate(item.start_date);
    let currentDate = new Date(startDate);
    let occurrenceCount = 0;
    
    while (occurrenceCount < maxOccurrences) {
      const occurrenceId = `${item.id}_${occurrenceCount}`;
      const dateStr = formatLocalDate(currentDate); // Changed from format to formatLocalDate
      
      occurrences.push({
        date: dateStr,
        occurrenceId,
        occurrenceCount
      });
      
      // 다음 발생일 계산
      if (item.interval_unit === 'day') {
        currentDate = new Date(currentDate.getTime() + (item.interval_value || 1) * 24 * 60 * 60 * 1000);
      } else if (item.interval_unit === 'week') {
        currentDate = new Date(currentDate.getTime() + (item.interval_value || 1) * 7 * 24 * 60 * 60 * 1000);
      } else if (item.interval_unit === 'month') {
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + (item.interval_value || 1), currentDate.getDate());
      }
      occurrenceCount++;
    }
  } else {
    // monthly_date 타입
    const dayOfMonth = item.day_of_month || 1;
    let occurrenceCount = 0;
    
    // 시작일부터 계산
    let baseDate = item.start_date ? parseLocalDate(item.start_date) : new Date();
    
    while (occurrenceCount < maxOccurrences) {
      const occurrenceId = `${item.id}_${occurrenceCount}`;
      const currentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + occurrenceCount, dayOfMonth);
      const dateStr = formatLocalDate(currentDate); // Changed from format to formatLocalDate
      
      occurrences.push({
        date: dateStr,
        occurrenceId,
        occurrenceCount
      });
      
      occurrenceCount++;
    }
  }
  
  return occurrences;
}

/**
 * Recurring item의 Next Transaction Date를 계산합니다.
 * @param item Recurring item
 * @param checkedOccurrenceIds 체크된 occurrenceId들의 Set
 * @returns Next Transaction Date (날짜 문자열)
 */
export function calculateNextTransactionDate(
  item: RecurringItem,
  checkedOccurrenceIds: Set<string>
): string {
  const occurrences = calculateRecurringOccurrences(item);
  
  // 체크되지 않은 첫 번째 발생일을 찾습니다
  for (const occurrence of occurrences) {
    if (!checkedOccurrenceIds.has(occurrence.occurrenceId)) {
      return occurrence.date;
    }
  }
  
  // 모든 발생일이 체크되었다면 마지막 발생일의 다음 날짜를 반환
  if (occurrences.length > 0) {
    const lastOccurrence = occurrences[occurrences.length - 1];
    const lastDate = parseLocalDate(lastOccurrence.date);
    
    if (item.repeat_type === 'interval') {
      // interval 타입: 마지막 발생일 + interval
      if (item.interval_unit === 'day') {
        const nextDate = new Date(lastDate.getTime() + (item.interval_value || 1) * 24 * 60 * 60 * 1000);
        return formatLocalDate(nextDate); // Changed from format to formatLocalDate
      } else if (item.interval_unit === 'week') {
        const nextDate = new Date(lastDate.getTime() + (item.interval_value || 1) * 7 * 24 * 60 * 60 * 1000);
        return formatLocalDate(nextDate); // Changed from format to formatLocalDate
      } else if (item.interval_unit === 'month') {
        const nextDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + (item.interval_value || 1), lastDate.getDate());
        return formatLocalDate(nextDate); // Changed from format to formatLocalDate
      }
    } else {
      // monthly_date 타입: 다음 달의 같은 날짜
      const nextDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, lastDate.getDate());
      return formatLocalDate(nextDate); // Changed from format to formatLocalDate
    }
  }
  
  // fallback: 현재 날짜
  return formatLocalDate(new Date()); // Changed from format to formatLocalDate
}

/**
 * 특정 월의 Recurring item 발생일들을 계산합니다.
 * @param item Recurring item
 * @param yearMonth "YYYY-MM" 형식의 년월
 * @returns 해당 월의 발생일들
 */
export function calculateMonthlyOccurrences(
  item: RecurringItem,
  yearMonth: string
): Array<{ date: string; occurrenceId: string; occurrenceCount: number }> {
  const [yearStr, monthStr] = yearMonth.split('-');
  const selectedYear = parseInt(yearStr);
  const selectedMonthNum = parseInt(monthStr) - 1; // 0-based index
  
  const monthStart = new Date(selectedYear, selectedMonthNum, 1);
  const monthEnd = new Date(selectedYear, selectedMonthNum + 1, 0);
  
  const allOccurrences = calculateRecurringOccurrences(item);
  
  return allOccurrences.filter(occurrence => {
    const occurrenceDate = parseLocalDate(occurrence.date);
    return occurrenceDate >= monthStart && occurrenceDate <= monthEnd;
  });
} 