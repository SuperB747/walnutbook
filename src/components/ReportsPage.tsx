import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Select,
  MenuItem,
  TextField,
  Grid,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableFooter,
  Popper,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Snackbar,
  Alert
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import RemoveIcon from '@mui/icons-material/Remove';
import { useTheme } from '@mui/material/styles';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Transaction, Category, Budget, Account, RecurringItem } from '../db';
import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';
import { safeFormatCurrency, parseLocalDate, createLocalDate } from '../utils';

// Register Chart.js core components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend, ArcElement, PointElement, LineElement);

// Add Ghibli palette
const ghibliColors = [
  '#6A8D73', '#A7C7E7', '#E6B89C', '#B4656F', '#F6E2B3',
  '#7A9D96', '#C3B299', '#A26769', '#D4A5A5', '#6C4F77',
  '#B6C9A9', '#8C8A93', '#F7C59F', '#A3C6C4', '#7B6D8D',
  '#E2CFC3', '#A9A9A9', '#C9BBCF', '#B7B5E4', '#8B7E74',
  '#8E9AAF', '#B8B8D1', '#D6C6B9', '#FAE3D9', '#B5EAD7',
  '#C7CEEA', '#FFDAC1', '#FFB7B2', '#FF9AA2', '#B5EAD7',
  '#E2F0CB', '#BFD8B8', '#B8B8FF', '#B2F7EF', '#B2A4FF',
  '#B5B2FF', '#B2B2B2', '#B2D7FF', '#B2FFC2', '#B2FFF7',
  '#B2E2FF', '#B2B2E2', '#B2C2FF', '#B2D2FF', '#B2E2C2',
  '#B2F2D2', '#B2E2B2', '#B2D2B2', '#B2C2B2', '#B2B2C2'
];

const ReportsPage: React.FC = () => {
  const theme = useTheme();
  const currentDate = new Date();
  const [activeTab, setActiveTab] = useState<number>(0);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  // Move checkedRecurringItems state here, before any useMemo/useEffect that uses it
  const [checkedRecurringItems, setCheckedRecurringItems] = useState<Set<string>>(new Set());
  
  // Snackbar state for database update confirmation
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  

  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => 2020 + i);
  const months = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];
  // Removed activeTab state as no tab selector is needed
  // Month names for Yearly Summary tooltip
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  // Tooltip state for Category Details
  const [tooltipAnchorEl, setTooltipAnchorEl] = useState<HTMLElement | null>(null);
  const [tooltipTxns, setTooltipTxns] = useState<Transaction[]>([]);
  const [tooltipPlacement, setTooltipPlacement] = useState<'top-start' | 'top' | 'top-end' | 'right-start' | 'right' | 'right-end' | 'bottom-start' | 'bottom' | 'bottom-end' | 'left-start' | 'left' | 'left-end'>('right-start');
  
  // Tooltip state for Category Total Progress
  const [progressTooltipAnchorEl, setProgressTooltipAnchorEl] = useState<HTMLElement | null>(null);
  const [progressTooltipData, setProgressTooltipData] = useState<{
    categoryName: string;
    monthlyAmounts: number[];
    cumulativeAmounts: number[];
    total: number;
  } | null>(null);
  const [progressTooltipPlacement, setProgressTooltipPlacement] = useState<'top-start' | 'top' | 'top-end' | 'right-start' | 'right' | 'right-end' | 'bottom-start' | 'bottom' | 'bottom-end' | 'left-start' | 'left' | 'left-end'>('top');
  // Helper to display notes same as TransactionList
  const getDisplayNotes = (notes?: string): string | null => {
    if (!notes) return null;
    let n = notes;
    if (n.includes('[TO_ACCOUNT_ID:')) {
      const endIdx = n.indexOf(']');
      if (endIdx !== -1) {
        n = n.substring(endIdx + 1).trim();
      }
    }
    n = n.replace(/\[(To|From):\s*[^\]]+\]/, '').trim();
    return n || null;
  };
  const [selectedMonth, setSelectedMonth] = useState<string>(() => format(currentDate, 'yyyy-MM'));
  // Year and month state for selector
  const [year, setYear] = useState<string>(() => format(currentDate, 'yyyy'));
  const [month, setMonth] = useState<string>(() => format(currentDate, 'MM'));
  useEffect(() => {
    setYear(selectedMonth.slice(0, 4));
    setMonth(selectedMonth.slice(5, 7));
  }, [selectedMonth]);
  const handleMonthSelect = (newYear: string, newMonth: string) => {
    setYear(newYear);
    setMonth(newMonth);
    setSelectedMonth(`${newYear}-${newMonth}`);
  };

  // Fetch budgets for the selected month
  useEffect(() => {
    const loadBudgets = async () => {
      try {
        const result = await invoke<Budget[]>('get_budgets', { month: selectedMonth });
        setBudgets(result || []);
      } catch (err) {
        console.error('Failed to load budgets:', err);
        setBudgets([]);
      }
    };
    loadBudgets();
  }, [selectedMonth]);

  // Map category IDs to colors inside the component
  const categoryIds = useMemo<number[]>(() => {
    return Array.from(
      new Set(allTransactions.map(tx => tx.category_id).filter((id): id is number => id != null))
    ).sort((a, b) => a - b);
  }, [allTransactions]);

  const categoryIdToColor = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    categoryIds.forEach((id, idx) => {
      map.set(id, ghibliColors[idx % ghibliColors.length]);
    });
    return map;
  }, [categoryIds]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [txns, cats, accts, recurring] = await Promise.all([
          invoke<Transaction[]>('get_transactions'),
          invoke<Category[]>('get_categories_full'),
          invoke<Account[]>('get_accounts'),
          invoke<RecurringItem[]>('get_recurring_items')
        ]);
        setAllTransactions(txns || []);
        setCategories(cats || []);
        setAccounts(accts || []);
        setRecurringItems(recurring || []);
      } catch (error) {
        console.error('Failed to load report data:', error);
        console.error('Error details:', error);
        // Set empty arrays as fallback
        setAllTransactions([]);
        setCategories([]);
        setAccounts([]);
        setRecurringItems([]);
      }
    };
    loadData();
  }, []);

  // Monthly data
  const monthlyTransactions = useMemo(() =>
    allTransactions.filter(tx => tx.date.startsWith(selectedMonth)),
    [allTransactions, selectedMonth]
  );

  // Compute summary (income and signed expense) for a list of transactions
  function summarizeTxns(txns: Transaction[]) {
    // Create category map for efficient lookups
    const categoryMap = new Map<number, Category>();
    categories.forEach(c => categoryMap.set(c.id, c));

    let income = 0;
    
    // 순수 수입만 계산 (환급 제외)
    txns.forEach(tx => {
      if (tx.type === 'Income') {
        const cat = categoryMap.get(tx.category_id ?? -1);
        if (!cat?.is_reimbursement) {
          // 순수 수입만 포함
          income += tx.amount;
        }
      }
    });

    // 순수 지출 계산 (환급 적용 전)
    const rawExpenses = txns
      .filter(tx => tx.type === 'Expense')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    // 환급 총액 계산
    const totalReimbursed = txns
      .filter(tx => tx.type === 'Income' && tx.category_id != null)
      .reduce((sum, tx) => {
        const cat = categoryMap.get(tx.category_id!);
        if (cat?.is_reimbursement) {
          return sum + tx.amount;
        }
        return sum;
      }, 0);

    // Net Expense: 순수 지출 - 환급
    const expense = -(rawExpenses - totalReimbursed);

    return { income, expense };
  }



  // Recurring items for current month with dates
  const monthlyRecurringItems = useMemo(() => {
    // Parse year and month from selectedMonth (format: "YYYY-MM")
    const [yearStr, monthStr] = selectedMonth.split('-');
    const selectedYear = parseInt(yearStr);
    const selectedMonthNum = parseInt(monthStr) - 1; // Convert to 0-based index
    

    
    const result: Array<RecurringItem & { occurrenceDate: Date; shouldInclude: boolean; occurrenceId: string }> = [];
    
    // Calculate all occurrences for each active item in the selected month
    recurringItems
      .filter(item => item.is_active)
      .forEach(item => {
        
        if (item.repeat_type === 'interval') {
          // For interval items, calculate all occurrences from start_date
          
          if (item.start_date) {
            // Parse start_date as local date to avoid timezone issues
            const startDate = parseLocalDate(item.start_date);
            const monthStart = new Date(selectedYear, selectedMonthNum, 1);
            const monthEnd = new Date(selectedYear, selectedMonthNum + 1, 0);
            

            
            let currentDate = new Date(startDate);
            let occurrenceCount = 0;
            
            // Find the first occurrence that's >= month start
            while (currentDate < monthStart) {
              if (item.interval_unit === 'day') {
                currentDate = new Date(currentDate.getTime() + (item.interval_value || 1) * 24 * 60 * 60 * 1000);
              } else if (item.interval_unit === 'week') {
                currentDate = new Date(currentDate.getTime() + (item.interval_value || 1) * 7 * 24 * 60 * 60 * 1000);
              } else if (item.interval_unit === 'month') {
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + (item.interval_value || 1), currentDate.getDate());
              }

            }
            
            // Add all occurrences within the month
            while (currentDate <= monthEnd) {
              result.push({
                ...item,
                occurrenceDate: new Date(currentDate),
                shouldInclude: true,
                occurrenceId: `${item.id}_${occurrenceCount}`
              });
              
              // Calculate next occurrence
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
            // If no start_date, don't include the item (it needs a start_date to be valid)
            // This prevents items without start_date from appearing in all months
          }
        } else {
          // For monthly_date items, use day_of_month
          const dayOfMonth = item.day_of_month || 1;
          const occurrenceDate = new Date(selectedYear, selectedMonthNum, dayOfMonth);
          
          // Check if start_date exists and if the occurrence date is after start_date
          let shouldInclude = occurrenceDate.getMonth() === selectedMonthNum;
          
          if (item.start_date) {
            const startDate = parseLocalDate(item.start_date);
            // Only include if occurrence date is on or after start_date
            shouldInclude = shouldInclude && occurrenceDate >= startDate;
          }
          
          if (shouldInclude) {
            result.push({
              ...item,
              occurrenceDate,
              shouldInclude: true,
              occurrenceId: `${item.id}_0`
            });
          }
        }
      });
    
    return result;
  }, [recurringItems, selectedMonth]);

  // Separate recurring income and expense items
  const recurringIncomeItems = useMemo(() => {
    const items = monthlyRecurringItems.filter(item => item.type === 'Income');
    return items;
  }, [monthlyRecurringItems]);
  
  const recurringExpenseItems = useMemo(() => {
    const items = monthlyRecurringItems.filter(item => item.type === 'Expense');
    return items;
  }, [monthlyRecurringItems]);

  // Load checked recurring items from database for the current month
  useEffect(() => {
    const loadCheckedItems = async () => {
      try {
        const checkedOccurrenceIds = await invoke<string[]>('get_recurring_checks', { month: selectedMonth });
        setCheckedRecurringItems(new Set(checkedOccurrenceIds));

      } catch (error) {
        console.error('Failed to load checked items:', error);
        setCheckedRecurringItems(new Set());
      }
    };
    loadCheckedItems();
  }, [selectedMonth, monthlyRecurringItems]);

  // Clear checked items for inactive recurring items
  useEffect(() => {
    const activeItemIds = new Set(recurringItems.filter(item => item.is_active).map(item => item.id));
    const newChecked = new Set<string>();
    
    // Only keep checked occurrences for active items
    checkedRecurringItems.forEach(occurrenceId => {
      const item = monthlyRecurringItems.find(occurrence => occurrence.occurrenceId === occurrenceId);
      if (item && activeItemIds.has(item.id)) {
        newChecked.add(occurrenceId);
      }
    });
    
    if (newChecked.size !== checkedRecurringItems.size) {
      setCheckedRecurringItems(newChecked);
    }
  }, [recurringItems, checkedRecurringItems, monthlyRecurringItems]);

  const handleRecurringItemCheck = async (occurrenceId: string, checked: boolean) => {
    try {
      // Find the item by occurrenceId
      const item = monthlyRecurringItems.find(item => item.occurrenceId === occurrenceId);
      if (!item) {
        console.error('Item not found for occurrenceId:', occurrenceId);
        setSnackbarMessage('Item not found');
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
        return;
      }

      // Update check status in database first
      await invoke('update_recurring_check', {
        occurrenceId: occurrenceId,
        month: selectedMonth,
        isChecked: checked
      });
      
      // Update local state
      const newChecked = new Set(checkedRecurringItems);
      if (checked) {
        newChecked.add(occurrenceId);
      } else {
        newChecked.delete(occurrenceId);
      }
      setCheckedRecurringItems(newChecked);
      
      // Show success message
      setSnackbarMessage('Database updated');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      
      // No transaction or recurring item update here!
    } catch (error) {
      console.error('Failed to update check status:', error);
      setSnackbarMessage('Database update failed');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Calculate recurring amounts excluding checked items (as they're considered "processed")
  const monthlyRecurringAmount = useMemo(() => {
    return monthlyRecurringItems
      .filter(item => !checkedRecurringItems.has(item.occurrenceId))
      .reduce((total, item) => {
        return total + (item.type === 'Income' ? item.amount : -item.amount);
      }, 0);
  }, [monthlyRecurringItems, checkedRecurringItems]);

  // Auto-uncheck items whose next transaction date has passed
  useEffect(() => {
    const autoUncheckExpiredItems = async () => {
      const today = new Date();
      const currentMonth = today.getFullYear() * 100 + today.getMonth() + 1; // YYYYMM format
      
      const itemsToUncheck: string[] = [];
      
      for (const item of recurringItems) {
        // Check if any occurrence of this item is checked
        const checkedOccurrences = monthlyRecurringItems
          .filter(occurrence => occurrence.id === item.id)
          .filter(occurrence => checkedRecurringItems.has(occurrence.occurrenceId));
        
        if (checkedOccurrences.length > 0) {
          let nextDate: Date;
          
          if (item.repeat_type === 'interval') {
            if (item.start_date) {
              // Parse start_date as local date to avoid timezone issues
              const startDate = parseLocalDate(item.start_date);
              let currentDate = new Date(startDate);
              
              while (currentDate <= today) {
                if (item.interval_unit === 'day') {
                  currentDate = new Date(currentDate.getTime() + (item.interval_value || 1) * 24 * 60 * 60 * 1000);
                } else if (item.interval_unit === 'week') {
                  currentDate = new Date(currentDate.getTime() + (item.interval_value || 1) * 7 * 24 * 60 * 60 * 1000);
                } else if (item.interval_unit === 'month') {
                  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + (item.interval_value || 1), currentDate.getDate());
                }
              }
              nextDate = currentDate;
            } else {
              nextDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
            }
          } else {
            const dayOfMonth = item.day_of_month || 1;
            const currentMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
            
            if (currentMonth > today) {
              nextDate = currentMonth;
            } else {
              nextDate = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
            }
          }
          
          const nextMonth = nextDate.getFullYear() * 100 + nextDate.getMonth() + 1;
          if (nextMonth > currentMonth) {
            // Next transaction date is in the future, uncheck all occurrences of this item
            const itemOccurrences = monthlyRecurringItems.filter(occurrence => occurrence.id === item.id);
            for (const occurrence of itemOccurrences) {
              if (checkedRecurringItems.has(occurrence.occurrenceId)) {
                itemsToUncheck.push(occurrence.occurrenceId);
              }
            }
          }
        }
      }
      
      if (itemsToUncheck.length > 0) {
        const newChecked = new Set(checkedRecurringItems);
        for (const occurrenceId of itemsToUncheck) {
          newChecked.delete(occurrenceId);
          // Find the item by occurrenceId for database update
          const item = monthlyRecurringItems.find(occurrence => occurrence.occurrenceId === occurrenceId);
          if (item) {
            await invoke('update_recurring_check', {
              occurrenceId: occurrenceId,
              month: selectedMonth,
              isChecked: false
            });
          }
        }
        setCheckedRecurringItems(newChecked);
      }
    };
    
    autoUncheckExpiredItems();
  }, [recurringItems, checkedRecurringItems, selectedMonth]);



  // Monthly raw category expenses with reimbursements applied
  const monthlyCategoryRaw = useMemo<{ id: number; amount: number }[]>(() => {
    // Create category map for efficient lookups
    const categoryMap = new Map<number, Category>();
    categories.forEach(c => categoryMap.set(c.id, c));

    // Find Reimbursable category ID (case insensitive)
    const reimbursableCategory = categories.find(c => 
      c.name.toLowerCase() === 'reimbursable' || 
      c.name.toLowerCase().includes('reimbursable')
    );
    const reimbursableId = reimbursableCategory?.id;

    // First calculate raw expenses by category
    const expensesByCategory: Record<number, number> = {};
    monthlyTransactions.forEach(tx => {
      if (tx.type === 'Expense') {
        const id = tx.category_id ?? -1;
        expensesByCategory[id] = (expensesByCategory[id] || 0) + tx.amount;
      }
    });



    // Then calculate reimbursements, but only apply what can be used
    monthlyTransactions.forEach(tx => {
      if (tx.type === 'Income' && tx.category_id != null) {
        const cat = categoryMap.get(tx.category_id);
        if (cat?.is_reimbursement && cat.reimbursement_target_category_id != null) {
          const targetId = cat.reimbursement_target_category_id;
          const targetExpense = expensesByCategory[targetId] || 0;
          if (targetExpense < 0) {
            // If reimbursement exceeds or equals expense, set to 0
            if (tx.amount >= Math.abs(targetExpense)) {
              expensesByCategory[targetId] = 0;
            } else {
              // Otherwise, reduce the expense by the reimbursement amount
              expensesByCategory[targetId] += tx.amount;
            }
          }
        }
      }
    });



    // Include all categories that have expenses or reimbursements (including positive amounts)
    const result = Object.entries(expensesByCategory)
      .filter(([, amount]) => amount !== 0) // 0이 아닌 모든 카테고리 포함
      .map(([id, amount]) => ({ 
        id: Number(id), 
        amount: amount
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    
    // Also include Reimbursable category if it has positive reimbursements
    if (reimbursableId) {
      const reimbursableAmount = monthlyTransactions
        .filter(tx => tx.type === 'Income' && tx.category_id === reimbursableId)
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      if (reimbursableAmount > 0) {
        result.push({
          id: reimbursableId,
          amount: reimbursableAmount
        });
      }
    }
    

    
    return result;
  }, [monthlyTransactions, categories]);
  // Filter out undefined (id === -1) for Category Breakdown
  const filteredMonthlyCategoryRaw = useMemo(
    () => monthlyCategoryRaw.filter(item => item.id !== -1),
    [monthlyCategoryRaw]
  );
  const monthlyCategoryLabels = filteredMonthlyCategoryRaw.map(
    item => categories.find(c => c.id === item.id)?.name || ''
  );
  const monthlyCategoryData = filteredMonthlyCategoryRaw.map(item => item.amount);
  const monthlyCategoryColors = filteredMonthlyCategoryRaw.map(
    item => categoryIdToColor.get(item.id) || '#E0E0E0'
  );
  // Custom legend for Doughnut chart
  const legendCount = monthlyCategoryLabels.length;
  const legendMid = Math.ceil(legendCount / 2);
  const leftLabels = monthlyCategoryLabels.slice(0, legendMid);
  const leftColors = monthlyCategoryColors.slice(0, legendMid);
  const rightLabels = monthlyCategoryLabels.slice(legendMid);
  const rightColors = monthlyCategoryColors.slice(legendMid);
  const doughnutRef = useRef<any>(null);
  const handleLegendHover = (label: string) => {
    const chart = doughnutRef.current;
    if (!chart) return;
    const idx = monthlyDoughnutData.labels.indexOf(label);
    if (idx === -1) return;
    chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
    chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
    chart.update();
  };
  const handleLegendLeave = () => {
    const chart = doughnutRef.current;
    if (!chart) return;
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update();
  };
  // Category Details tooltip handlers (hover)
  const handleCategoryRowEnter = (event: React.MouseEvent<HTMLElement>, txns: Transaction[]) => {
    const placement = getTooltipPlacement(event);
    setTooltipPlacement(placement);
    setTooltipAnchorEl(event.currentTarget);
    setTooltipTxns(txns);
  };
  const handleTooltipClose = () => {
    setTooltipAnchorEl(null);
    setTooltipTxns([]);
  };

  const handleProgressTooltipClose = () => {
    setProgressTooltipAnchorEl(null);
    setProgressTooltipData(null);
  };

  // 툴팁 위치를 자동으로 계산하는 함수 - 8방향 모두 고려
  const getTooltipPlacement = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 툴팁의 예상 크기
    const tooltipWidth = 320;
    const tooltipHeight = 250;
    
    // 각 방향의 사용 가능한 공간 계산
    const spaces = {
      'top-start': rect.top >= tooltipHeight && rect.left >= tooltipWidth * 0.5,
      'top': rect.top >= tooltipHeight,
      'top-end': rect.top >= tooltipHeight && (viewportWidth - rect.right) >= tooltipWidth * 0.5,
      'right-start': (viewportWidth - rect.right) >= tooltipWidth && rect.top >= tooltipHeight * 0.5,
      'right': (viewportWidth - rect.right) >= tooltipWidth,
      'right-end': (viewportWidth - rect.right) >= tooltipWidth && (viewportHeight - rect.bottom) >= tooltipHeight * 0.5,
      'bottom-start': (viewportHeight - rect.bottom) >= tooltipHeight && rect.left >= tooltipWidth * 0.5,
      'bottom': (viewportHeight - rect.bottom) >= tooltipHeight,
      'bottom-end': (viewportHeight - rect.bottom) >= tooltipHeight && (viewportWidth - rect.right) >= tooltipWidth * 0.5,
      'left-start': rect.left >= tooltipWidth && rect.top >= tooltipHeight * 0.5,
      'left': rect.left >= tooltipWidth,
      'left-end': rect.left >= tooltipWidth && (viewportHeight - rect.bottom) >= tooltipHeight * 0.5
    };
    
    // 각 방향의 공간 점수 계산 (더 많은 공간일수록 높은 점수)
    const scores = {
      'top-start': rect.top + rect.left,
      'top': rect.top * 2,
      'top-end': rect.top + (viewportWidth - rect.right),
      'right-start': (viewportWidth - rect.right) + rect.top,
      'right': (viewportWidth - rect.right) * 2,
      'right-end': (viewportWidth - rect.right) + (viewportHeight - rect.bottom),
      'bottom-start': (viewportHeight - rect.bottom) + rect.left,
      'bottom': (viewportHeight - rect.bottom) * 2,
      'bottom-end': (viewportHeight - rect.bottom) + (viewportWidth - rect.right),
      'left-start': rect.left + rect.top,
      'left': rect.left * 2,
      'left-end': rect.left + (viewportHeight - rect.bottom)
    };
    
    // 사용 가능한 방향 중 가장 높은 점수를 가진 방향 선택
    let bestPlacement = 'right-start'; // 기본값
    let bestScore = 0;
    
    Object.entries(spaces).forEach(([placement, available]) => {
      if (available && scores[placement as keyof typeof scores] > bestScore) {
        bestScore = scores[placement as keyof typeof scores];
        bestPlacement = placement;
      }
    });
    
    // 사용 가능한 방향이 없으면 가장 많은 공간이 있는 방향 선택
    if (bestScore === 0) {
      const fallbackScores = {
        'right': viewportWidth - rect.right,
        'left': rect.left,
        'bottom': viewportHeight - rect.bottom,
        'top': rect.top
      };
      
      const fallbackPlacement = Object.entries(fallbackScores).reduce((a, b) => 
        a[1] > b[1] ? a : b
      )[0];
      
      bestPlacement = fallbackPlacement;
    }
    
    return bestPlacement as 'top-start' | 'top' | 'top-end' | 'right-start' | 'right' | 'right-end' | 'bottom-start' | 'bottom' | 'bottom-end' | 'left-start' | 'left' | 'left-end';
  };

  const getProgressTooltipPlacement = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    return rect.top < viewportHeight / 2 ? 'bottom' : 'top';
  };
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const raw = ctx.raw as number;
            return ` ${safeFormatCurrency(Math.abs(raw))}`;
          }
        }
      },
      datalabels: { display: false }
    }
  };

  // Actual monthly summary based only on real transactions (for other sections)
  const actualMonthlySummary = useMemo(() => {
    return summarizeTxns(monthlyTransactions);
  }, [monthlyTransactions, categories]);

  // Predicted monthly summary including unchecked recurring items (for Progress section only)
  const predictedMonthlySummary = useMemo(() => {
    const currentNet = actualMonthlySummary.income + actualMonthlySummary.expense;
    const predictedNet = currentNet + monthlyRecurringAmount;
    
    // Calculate the difference to add to income or expense
    const netDifference = predictedNet - currentNet;
    
    if (netDifference >= 0) {
      // If positive, add to income
      return {
        income: actualMonthlySummary.income + netDifference,
        expense: actualMonthlySummary.expense
      };
    } else {
      // If negative, add to expense (make it more negative)
      return {
        income: actualMonthlySummary.income,
        expense: actualMonthlySummary.expense + netDifference
      };
    }
  }, [actualMonthlySummary, monthlyRecurringAmount]);

  // Bar chart data
  const monthlyBarData = {
    labels: ['Income', 'Expense'],
    datasets: [{
      label: 'Amount',
      data: [actualMonthlySummary.income, Math.abs(actualMonthlySummary.expense)],
      backgroundColor: [theme.palette.primary.main, theme.palette.error.main]
    }]
  };

  const monthlyDoughnutData = {
    labels: monthlyCategoryLabels,
    datasets: [{
      data: monthlyCategoryData,
      backgroundColor: monthlyCategoryColors
    }]
  };

  // Budget overage alerts
  const overBudgetCategories = useMemo(() => {
    const ids = new Set<number>([
      ...monthlyCategoryRaw.map(i => i.id).filter(id => id !== -1),
      ...budgets.map(b => b.category_id)
    ]);
    return Array.from(ids)
      .map(id => {
        const spent = monthlyCategoryRaw.find(i => i.id === id)?.amount || 0;
        const budgetAmount = budgets.find(b => b.category_id === id)?.amount || 0;
        const diff = budgetAmount + spent;
        return { id, name: id === -1 ? 'Undefined' : categories.find(c => c.id === id)?.name || 'Undefined', over: Math.abs(diff), isOver: diff < 0 };
      })
      .filter(item => item.isOver)
      .map(({ id, name, over }) => ({ id, name, over }));
  }, [monthlyCategoryRaw, budgets, categories]);

  // Yearly data - calculate monthly summaries using the same logic as summarizeTxns
  const monthlyAggregates = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
    
    // Group transactions by month
    const monthlyTransactions = Array.from({ length: 12 }, (_, idx) => {
      const monthKey = `${year}-${String(idx + 1).padStart(2, '0')}`;
      return allTransactions.filter(tx => tx.date.startsWith(monthKey));
    });
    
    // Calculate summary for each month using summarizeTxns
    monthlyTransactions.forEach((monthTxns, idx) => {
      const summary = summarizeTxns(monthTxns);
      arr[idx] = summary;
    });
    
    return arr;
  }, [allTransactions, year, categories]);

  const yearlyBarData = {
    labels: monthNames,
    datasets: [
      {
        label: 'Income',
        data: monthlyAggregates.map(m => m.income),
        backgroundColor: theme.palette.primary.main
      },
      {
        label: 'Expense',
        data: monthlyAggregates.map(m => Math.abs(m.expense)),
        backgroundColor: theme.palette.error.main
      }
    ]
  };

  // Yearly data hooks
  const yearlyTransactions = useMemo(() =>
    allTransactions.filter(tx => tx.date.startsWith(`${year}-`)),
    [allTransactions, year]
  );
  const yearlySummary = useMemo(() => summarizeTxns(yearlyTransactions), [yearlyTransactions, categories]);
  const yearlyCategoryRaw = useMemo(() => {
    // Create category map for efficient lookups
    const categoryMap = new Map<number, Category>();
    categories.forEach(c => categoryMap.set(c.id, c));
    // First calculate raw expenses by category (including undefined category as -1)
    const expensesByCategory: Record<number, number> = {};
    yearlyTransactions.forEach(tx => {
      if (tx.type === 'Expense') {
        const id = tx.category_id ?? -1;
        expensesByCategory[id] = (expensesByCategory[id] || 0) + tx.amount;
      }
    });

    // Apply reimbursements directly to categories (same as monthlyCategoryRaw)
    yearlyTransactions.forEach(tx => {
      if (tx.type === 'Income' && tx.category_id != null) {
        const cat = categoryMap.get(tx.category_id);
        if (cat?.is_reimbursement && cat.reimbursement_target_category_id != null) {
          const targetId = cat.reimbursement_target_category_id;
          const targetExpense = expensesByCategory[targetId] || 0;
          if (targetExpense < 0) {
            // If reimbursement exceeds or equals expense, set to 0
            if (tx.amount >= Math.abs(targetExpense)) {
              expensesByCategory[targetId] = 0;
            } else {
              // Otherwise, reduce the expense by the reimbursement amount
              expensesByCategory[targetId] += tx.amount;
            }
          }
        }
      }
    });

    // Only include categories that have negative net expenses (exclude positive/income categories)
    return Object.entries(expensesByCategory)
      .filter(([, amount]) => amount < 0)
      .map(([id, amount]) => ({ 
        id: Number(id), 
        amount: amount
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [yearlyTransactions, categories]);
  // Filter out undefined (id === -1) for Category Breakdown
  const filteredYearlyCategoryRaw = useMemo(
    () => yearlyCategoryRaw.filter(item => item.id !== -1),
    [yearlyCategoryRaw]
  );
  const yearlyCategoryLabels = filteredYearlyCategoryRaw.map(
    item => categories.find(c => c.id === item.id)?.name || ''
  );
  const yearlyCategoryData = filteredYearlyCategoryRaw.map(item => item.amount);
  const yearlyCategoryColors = yearlyCategoryRaw.map(i => categoryIdToColor.get(i.id) || '#E0E0E0');
  const yearlyDoughnutRef = useRef<any>(null);
  // Prepare yearly doughnut data and legend
  const yearlyDoughnutData = useMemo(() => ({
    labels: yearlyCategoryLabels,
    datasets: [{ data: yearlyCategoryData, backgroundColor: yearlyCategoryColors }]
  }), [yearlyCategoryLabels, yearlyCategoryData, yearlyCategoryColors]);
  const yearlyLegendCount = yearlyCategoryLabels.length;
  const yearlyLegendMid = Math.ceil(yearlyLegendCount / 2);
  const yearlyLeftLabels = yearlyCategoryLabels.slice(0, yearlyLegendMid);
  const yearlyLeftColors = yearlyCategoryColors.slice(0, yearlyLegendMid);
  const yearlyRightLabels = yearlyCategoryLabels.slice(yearlyLegendMid);
  const yearlyRightColors = yearlyCategoryColors.slice(yearlyLegendMid);
  const handleYearlyLegendHover = (label: string) => {
    const chart = yearlyDoughnutRef.current;
    if (!chart) return;
    const idx = yearlyDoughnutData.labels.indexOf(label);
    if (idx === -1) return;
    chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
    chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
    chart.update();
  };
  const handleYearlyLegendLeave = () => {
    const chart = yearlyDoughnutRef.current;
    if (!chart) return;
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update();
  };
  // Yearly category matrix: rows per category, columns per month
  const yearlyCategoryMatrix = useMemo(() => {
    return categories.map(cat => {
      const name = cat.id === -1 ? 'Undefined' : cat.name;
      const monthlyAmounts = Array.from({ length: 12 }, (_v, idx) => {
        const monthKey = `${year}-${String(idx + 1).padStart(2, '0')}`;
        // compute reimbursements for this month
        const reimburseMap: Record<number, number> = {};
        yearlyTransactions.filter(tx => tx.date.startsWith(monthKey) && tx.type === 'Income').forEach(tx => {
          const rc = categories.find(c => c.id === tx.category_id);
          if (rc?.is_reimbursement && rc.reimbursement_target_category_id != null) {
            reimburseMap[rc.reimbursement_target_category_id] = (reimburseMap[rc.reimbursement_target_category_id] || 0) + tx.amount;
          }
        });
        // sum net expense for category
        const amt = yearlyTransactions.filter(tx => tx.date.startsWith(monthKey) && tx.type === 'Expense' && tx.category_id === cat.id)
          .reduce((sum, tx) => sum + tx.amount + (reimburseMap[cat.id] || 0), 0);
        return amt < 0 ? Math.abs(amt) : 0;
      });
      return { id: cat.id, name, monthlyAmounts };
    });
  }, [yearlyTransactions, categories, year]);

  // Calculate previous month's data for comparison
  const getPreviousMonthData = useMemo(() => {
    const prevMonthData = new Map<number, number[]>();
    
    categories.forEach(cat => {
      const monthlyAmounts = Array.from({ length: 12 }, (_, monthIndex) => {
        // 같은 해의 이전 월 데이터를 가져옴
        const prevMonthIndex = monthIndex - 1;
        if (prevMonthIndex < 0) {
          // 1월의 경우 이전 해 12월 데이터를 가져옴
          const prevYear = parseInt(year) - 1;
          const prevYearTransactions = allTransactions.filter(tx => tx.date.startsWith(`${prevYear}-`));
          const monthKey = `${prevYear}-12`;
          const monthTransactions = prevYearTransactions.filter(tx => tx.date.startsWith(monthKey));
          
          // Calculate raw expenses for this category in this month
          const rawExpenses = monthTransactions
            .filter(tx => tx.type === 'Expense' && tx.category_id === cat.id)
            .reduce((sum, tx) => sum + tx.amount, 0);
          
          // Calculate reimbursements for this category in this month
          const reimbursements = monthTransactions
            .filter(tx => tx.type === 'Income' && tx.category_id != null)
            .reduce((sum, tx) => {
              const category = categories.find(c => c.id === tx.category_id);
              if (category?.is_reimbursement && category.reimbursement_target_category_id === cat.id) {
                return sum + tx.amount;
              }
              return sum;
            }, 0);
          
          return rawExpenses + reimbursements;
        } else {
          // 같은 해의 이전 월
          const monthKey = `${year}-${String(prevMonthIndex + 1).padStart(2, '0')}`;
          const monthTransactions = yearlyTransactions.filter(tx => tx.date.startsWith(monthKey));
          
          // Calculate raw expenses for this category in this month
          const rawExpenses = monthTransactions
            .filter(tx => tx.type === 'Expense' && tx.category_id === cat.id)
            .reduce((sum, tx) => sum + tx.amount, 0);
          
          // Calculate reimbursements for this category in this month
          const reimbursements = monthTransactions
            .filter(tx => tx.type === 'Income' && tx.category_id != null)
            .reduce((sum, tx) => {
              const category = categories.find(c => c.id === tx.category_id);
              if (category?.is_reimbursement && category.reimbursement_target_category_id === cat.id) {
                return sum + tx.amount;
              }
              return sum;
            }, 0);
          
          return rawExpenses + reimbursements;
        }
      });
      
      prevMonthData.set(cat.id, monthlyAmounts);
    });
    
    return prevMonthData;
  }, [allTransactions, categories, year, yearlyTransactions]);

  // Yearly category monthly breakdown table data
  const yearlyCategoryMonthlyData = useMemo(() => {
    // Create category map for efficient lookups
    const categoryMap = new Map<number, Category>();
    categories.forEach(c => categoryMap.set(c.id, c));

    // Get all categories that have expenses in the year, sorted alphabetically
    const categoryIds = new Set<number>();
    yearlyTransactions.forEach(tx => {
      if (tx.type === 'Expense' && tx.category_id != null) {
        categoryIds.add(tx.category_id);
      }
    });

    const sortedCategories = Array.from(categoryIds)
      .map(id => categories.find(c => c.id === id))
      .filter(cat => cat != null)
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));

    // Calculate monthly data for each category
    const monthlyData = sortedCategories.map(category => {
      const monthlyAmounts = Array.from({ length: 12 }, (_, monthIndex) => {
        const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
        const monthTransactions = yearlyTransactions.filter(tx => tx.date.startsWith(monthKey));
        
        // First calculate raw expenses for this category in this month
        const rawExpenses = monthTransactions
          .filter(tx => tx.type === 'Expense' && tx.category_id === category?.id)
          .reduce((sum, tx) => sum + tx.amount, 0);
        
        // Then apply reimbursements using the same logic as other calculations
        let netExpense = rawExpenses;
        monthTransactions
          .filter(tx => tx.type === 'Income' && tx.category_id != null)
          .forEach(tx => {
            const cat = categoryMap.get(tx.category_id!);
            if (cat?.is_reimbursement && cat.reimbursement_target_category_id === category?.id) {
              // Apply reimbursement directly (same as TransactionSummary and Monthly Income vs Expense)
              netExpense += tx.amount;
            }
          });
        
        return netExpense;
      });
      const total = monthlyAmounts.reduce((sum, amount) => sum + amount, 0);
      // Only include if total is negative (actual expense)
      if (total < 0) {
        return {
          category: category!,
          monthlyAmounts,
          total
        };
      }
      return null;
    }).filter(Boolean) as { category: Category; monthlyAmounts: number[]; total: number }[];

    return monthlyData;
  }, [yearlyTransactions, categories, year]);

  // Calculate yearly progress for each category (cumulative monthly amounts)
  const yearlyCategoryProgress = useMemo(() => {
    return yearlyCategoryMonthlyData.map(row => {
      const cumulativeAmounts = row.monthlyAmounts.reduce((acc, amount, index) => {
        const prevTotal = index > 0 ? acc[index - 1] : 0;
        acc.push(prevTotal + Math.abs(amount));
        return acc;
      }, [] as number[]);
      
      return {
        categoryId: row.category.id,
        categoryName: row.category.name,
        monthlyAmounts: row.monthlyAmounts,
        cumulativeAmounts,
        total: row.total
      };
    });
  }, [yearlyCategoryMonthlyData]);

  // Calculate monthly account balances (as of 1st of each month) for the selected year
  const monthlyAccountBalances = useMemo(() => {
    const checkingAccounts = accounts.filter(acc => acc.type === 'Checking');
    const savingsAccounts = accounts.filter(acc => acc.type === 'Savings');
    
    // Get current date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    // Calculate cumulative balances for each month
    const monthlyData = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      const monthNumber = monthIndex + 1;
      
      // Check if this month is in the future
      const isFutureMonth = parseInt(year) > currentYear || 
                           (parseInt(year) === currentYear && monthNumber > currentMonth);
      
      if (isFutureMonth) {
        return {
          month: monthNumber,
          monthName: monthNames[monthIndex],
          checking: null,
          savings: null,
          total: null,
          isFuture: true
        };
      }
      
      // Get all transactions up to the end of this month (cumulative balance)
      const transactionsUpToMonth = yearlyTransactions.filter(tx => {
        const txDate = tx.date;
        const txYear = txDate.substring(0, 4);
        const txMonth = txDate.substring(5, 7);
        const currentYear = parseInt(year);
        const currentMonth = monthNumber;
        
        // 현재 달인 경우: 모든 거래 포함 (실시간 잔액)
        if (parseInt(txYear) === currentYear && parseInt(txMonth) === currentMonth) {
          return true;
        }
        
        // 과거 달인 경우: 해당 월까지의 거래만 포함 (1일 잔액)
        return parseInt(txYear) < currentYear || 
               (parseInt(txYear) === currentYear && parseInt(txMonth) < currentMonth);
      });
      
      // Calculate checking account balance as of end of this month
      const checkingBalance = checkingAccounts.reduce((total, account) => {
        const accountTransactions = transactionsUpToMonth.filter(tx => tx.account_id === account.id);
        const balance = accountTransactions.reduce((sum, tx) => {
          if (tx.type === 'Expense') return sum + tx.amount;
          if (tx.type === 'Income') return sum + tx.amount;
          if (tx.type === 'Transfer') return sum + tx.amount;
          if (tx.type === 'Adjust') {
            const category = categories.find(c => c.id === tx.category_id);
            if (category?.name === 'Add') return sum + Math.abs(tx.amount);
            if (category?.name === 'Subtract') return sum - Math.abs(tx.amount);
            return sum + tx.amount;
          }
          return sum;
        }, 0);
        return total + balance;
      }, 0);
      
      // Calculate savings account balance as of end of this month
      const savingsBalance = savingsAccounts.reduce((total, account) => {
        const accountTransactions = transactionsUpToMonth.filter(tx => tx.account_id === account.id);
        const balance = accountTransactions.reduce((sum, tx) => {
          if (tx.type === 'Expense') return sum + tx.amount;
          if (tx.type === 'Income') return sum + tx.amount;
          if (tx.type === 'Transfer') return sum + tx.amount;
          if (tx.type === 'Adjust') {
            const category = categories.find(c => c.id === tx.category_id);
            if (category?.name === 'Add') return sum + Math.abs(tx.amount);
            if (category?.name === 'Subtract') return sum - Math.abs(tx.amount);
            return sum + tx.amount;
          }
          return sum;
        }, 0);
        return total + balance;
      }, 0);
      
      return {
        month: monthNumber,
        monthName: monthNames[monthIndex],
        checking: checkingBalance,
        savings: savingsBalance,
        total: checkingBalance + savingsBalance,
        isFuture: false
      };
    });
    
    return monthlyData;
  }, [yearlyTransactions, accounts, categories, year]);

  // Account balance chart data
  const accountBalanceChartData = useMemo(() => {
    // Filter out future months for chart
    const availableData = monthlyAccountBalances.filter(m => !m.isFuture);
    
    return {
      labels: availableData.map(m => m.monthName),
      datasets: [
        {
          label: 'Checking',
          data: availableData.map(m => m.checking),
          borderColor: theme.palette.primary.main,
          backgroundColor: theme.palette.primary.main,
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointBackgroundColor: theme.palette.primary.main,
          pointBorderColor: theme.palette.primary.main,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Savings',
          data: availableData.map(m => m.savings),
          borderColor: theme.palette.success.main,
          backgroundColor: theme.palette.success.main,
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointBackgroundColor: theme.palette.success.main,
          pointBorderColor: theme.palette.success.main,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Total Assets',
          data: availableData.map(m => m.total),
          borderColor: theme.palette.info.main,
          backgroundColor: theme.palette.info.main,
          borderWidth: 3,
          fill: false,
          tension: 0.1,
          pointBackgroundColor: theme.palette.info.main,
          pointBorderColor: theme.palette.info.main,
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    };
  }, [monthlyAccountBalances, theme.palette]);

  // Total breakdown expense for Monthly summary - should match Income vs Expense calculation
  const monthlyBreakdownTotal = useMemo(() => {
    // Calculate using the same logic as summarizeTxns for consistency
    const rawExpenses = monthlyTransactions
      .filter(tx => tx.type === 'Expense')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    const totalReimbursed = monthlyTransactions
      .filter(tx => tx.type === 'Income' && tx.category_id != null)
      .reduce((sum, tx) => {
        const cat = categories.find(c => c.id === tx.category_id);
        if (cat?.is_reimbursement) {
          return sum + tx.amount;
        }
        return sum;
      }, 0);

    return -(rawExpenses - totalReimbursed);
  }, [monthlyTransactions, categories]);
  // Total breakdown expense for Yearly summary - should match Income vs Expense calculation
  const yearlyBreakdownTotal = useMemo(() => {
    // Calculate using the same logic as summarizeTxns for consistency
    const rawExpenses = yearlyTransactions
      .filter(tx => tx.type === 'Expense')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    const totalReimbursed = yearlyTransactions
      .filter(tx => tx.type === 'Income' && tx.category_id != null)
      .reduce((sum, tx) => {
        const cat = categories.find(c => c.id === tx.category_id);
        if (cat?.is_reimbursement) {
          return sum + tx.amount;
        }
        return sum;
      }, 0);

    return -(rawExpenses - totalReimbursed);
  }, [yearlyTransactions, categories]);





  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Summary Report</Typography>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 3,
          minHeight: 48,
          '& .MuiTabs-indicator': { display: 'none' },
          '& .MuiTab-root': {
            color: 'text.primary',
            fontWeight: 700,
            fontSize: '1rem',
            letterSpacing: '0.15px',
            textTransform: 'none',
            minHeight: '48px',
            padding: '12px 28px',
            borderRadius: '12px 12px 0 0',
            margin: '0 4px',
            transition: 'background-color 0.2s, color 0.2s',
            backgroundColor: 'rgba(0,0,0,0)',
            '&:hover': {
              backgroundColor: 'rgba(0,0,0,0.08)',
              color: 'text.primary',
            },
            '&.Mui-selected': {
              backgroundColor: '#1976d2',
              color: 'white',
              boxShadow: '0 2px 12px rgba(35, 64, 117, 0.10)',
              zIndex: 1,
            },
          },
          borderBottom: '2px solid #1976d2',
        }}
      >
        <Tab label="Monthly" />
        <Tab label="Yearly" />
      </Tabs>
      {activeTab === 0 && (
        <>
        {/* Month selector styled like TransactionSummary */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <Select
            value={year}
            size="small"
            onChange={e => handleMonthSelect(e.target.value as string, month)}
            sx={{
              width: 90,
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: 'none' },
              backgroundColor: 'transparent',
              '& .MuiSelect-icon': { color: 'text.secondary' }
            }}
          >
            {years.map(y => (
              <MenuItem key={y} value={String(y)}>{y}</MenuItem>
            ))}
          </Select>
          <Select
            value={month}
            size="small"
            onChange={e => handleMonthSelect(year, e.target.value as string)}
            sx={{
              width: 120,
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: 'none' },
              backgroundColor: 'transparent',
              '& .MuiSelect-icon': { color: 'text.secondary' }
            }}
          >
            {months.map(m => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </Select>
        </Box>
        <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
                <Paper sx={{ p: 2, minHeight: 360, flex: '1 1 25%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom>Income vs Expense</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: theme.palette.success.main, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                      Income: {safeFormatCurrency(actualMonthlySummary.income)}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: theme.palette.error.main, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                                              Expense: {safeFormatCurrency(actualMonthlySummary.expense)}
                    </Typography>
                                          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: (actualMonthlySummary.income + actualMonthlySummary.expense) >= 0 ? theme.palette.primary.main : theme.palette.error.main, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                        Net: {safeFormatCurrency(actualMonthlySummary.income + actualMonthlySummary.expense)}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', '& canvas': { touchAction: 'none !important', userSelect: 'none' } }}>
                    <Bar
                      data={{
                        labels: ['Income', 'Expense'],
                        datasets: [{
                          data: [actualMonthlySummary.income, Math.abs(actualMonthlySummary.expense)],
                          backgroundColor: [theme.palette.primary.main, theme.palette.error.main]
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { enabled: true, position: 'nearest', mode: 'index', intersect: false }
                        },
                        scales: {
                          x: { grid: { display: false }, ticks: { color: theme.palette.text.secondary } },
                          y: { beginAtZero: true, ticks: { color: theme.palette.text.secondary } }
                        }
                      }}
                    />
                  </Box>
                </Paper>
                <Paper sx={{ p: 2, minHeight: 360, flex: '1 1 37.5%' }}>
                  <Typography variant="h6" gutterBottom>Category Breakdown</Typography>
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', justifyContent: 'center' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mr: 2 }}>
                      {leftLabels.map((label, i) => (
                        <Box
                          key={label}
                          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 0.5 }}
                          onMouseEnter={() => handleLegendHover(label)}
                          onMouseLeave={handleLegendLeave}
                        >
                          <Box sx={{ width: 10, height: 10, bgcolor: leftColors[i], mr: 1, borderRadius: '2px' }} />
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: '0.75rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '120px'
                            }}
                            title={label}
                          >
                            {label}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    <Box sx={{ mx: 2, height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Doughnut
                        ref={doughnutRef}
                        data={monthlyDoughnutData}
                        options={{ ...doughnutOptions, maintainAspectRatio: false }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, ml: 2 }}>
                      {rightLabels.map((label, i) => (
                        <Box
                          key={label}
                          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 0.5 }}
                          onMouseEnter={() => handleLegendHover(label)}
                          onMouseLeave={handleLegendLeave}
                        >
                          <Box sx={{ width: 10, height: 10, bgcolor: rightColors[i], mr: 1, borderRadius: '2px' }} />
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: '0.75rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '120px'
                            }}
                            title={label}
                          >
                            {label}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Paper>
                <Paper sx={{ p: 2, minHeight: 360, flex: '1 1 37.5%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom>Yearly Summary</Typography>
                  <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', '& canvas': { touchAction: 'none !important', userSelect: 'none' } }}>
                    <Bar
                      data={yearlyBarData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true } },
                        plugins: {
                          tooltip: {
                            callbacks: {
                              title: (tooltipItems) => {
                                const label = tooltipItems[0].label || '';
                                const monthIndex = parseInt(label, 10) - 1;
                                return monthNames[monthIndex] || label;
                              },
                              label: (ctx) => {
                                const label = ctx.dataset.label || '';
                                const raw = ctx.parsed?.y ?? 0;
                                return ` ${label}: ${safeFormatCurrency(Number(raw))}`;
                              }
                            }
                          }
                        }
                      }}
                    />
                  </Box>
                </Paper>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Category Details</Typography>
                <TableContainer sx={{ width: '100%' }}>
                  <Table
                    size="small"
                    sx={{
                      width: '100%',
                      tableLayout: 'auto',
                      '& tbody tr:hover': { backgroundColor: theme.palette.action.hover },
                      '& .MuiTableCell-root': { backgroundColor: 'transparent' }
                    }}
                  >
                    <TableHead>
                      <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>Category</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Spent</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Budget</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Difference</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(() => {
                        // Show categories that have budgets OR have spending (including positive amounts from reimbursements)
                        const budgetedCategoryIds = budgets.map(b => b.category_id);
                        const spendingCategoryIds = monthlyCategoryRaw.map(i => i.id);
                        const allIds = [...new Set([...budgetedCategoryIds, ...spendingCategoryIds])].filter(id => id !== -1);
                        

                        let totalSpent = 0;
                        let totalBudget = 0;
                        
                        const rows = allIds.map(id => {
                          const label = id === -1 ? 'Undefined' : categories.find(c => c.id === id)?.name || 'Undefined';
                          // Spent: 해당 카테고리의 Expense 합 + 해당 카테고리로 들어온 환급(Incomes) 합
                          const expense = monthlyTransactions
                            .filter(tx => tx.type === 'Expense' && tx.category_id === id)
                            .reduce((sum, tx) => sum + tx.amount, 0);
                          const reimbursement = monthlyTransactions
                            .filter(tx => tx.type === 'Income' && tx.category_id != null)
                            .reduce((sum, tx) => {
                              const cat = categories.find(c => c.id === tx.category_id);
                              if (cat?.is_reimbursement && cat.reimbursement_target_category_id === id) {
                                return sum + tx.amount;
                              }
                              return sum;
                            }, 0);
                          // Reimbursable 카테고리 자체는 해당 카테고리로 들어온 Income(환급)만 합산
                          const cat = categories.find(c => c.id === id);
                          let spent = 0;
                          if (cat?.is_reimbursement) {
                            spent = monthlyTransactions
                              .filter(tx => tx.type === 'Income' && tx.category_id === id)
                              .reduce((sum, tx) => sum + tx.amount, 0);
                          } else {
                            spent = expense + reimbursement;
                          }
                          const budgetAmount = budgets.find(b => b.category_id === id)?.amount || 0;
                          const diff = budgetAmount + spent; // Expense는 음수이므로 더하기
                          // Handle near-zero diff values as exactly zero
                          const normalizedDiff = Math.abs(diff) < 0.005 ? 0 : diff;
                          totalSpent += spent;
                          totalBudget += budgetAmount;
                          // Prepare detail list for tooltip: date, payee, amount
                          const txnsForCat = monthlyTransactions
                            .filter(tx => {
                              if (tx.category_id === id) return true;
                              const cat = categories.find(c => c.id === tx.category_id);
                              return cat?.is_reimbursement && cat.reimbursement_target_category_id === id;
                            })
                            .sort((a, b) => a.date.localeCompare(b.date));
                          return (
                            <TableRow
                              hover
                              key={id}
                              onMouseEnter={(e) => handleCategoryRowEnter(e, txnsForCat)}
                              onMouseLeave={handleTooltipClose}
                              sx={{ cursor: 'pointer' }}
                            >
                              <TableCell>{label}</TableCell>
                              <TableCell align="right">
                                {spent < 0 ? (
                                  <Typography color="error.main">-{safeFormatCurrency(Math.abs(spent))}</Typography>
                                ) : spent > 0 ? (
                                  <Typography color="success.main">+{safeFormatCurrency(spent)}</Typography>
                                ) : (
                                  safeFormatCurrency(0)
                                )}
                              </TableCell>
                              <TableCell align="right">{safeFormatCurrency(budgetAmount)}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 'bold', color: normalizedDiff < 0 ? theme.palette.error.main : normalizedDiff === 0 ? theme.palette.text.primary : theme.palette.success.main }}>
                                {safeFormatCurrency(normalizedDiff)}
                              </TableCell>
                            </TableRow>
                          );
                        });
                        
                        return rows;
                      })()}
                    </TableBody>
                    <TableFooter>
                      <TableRow sx={{ backgroundColor: theme.palette.action.selected }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{safeFormatCurrency((() => {
                          const budgetedCategoryIds = budgets.map(b => b.category_id);
                          const spendingCategoryIds = monthlyCategoryRaw.map(i => i.id);
                          const allIds = [...new Set([...budgetedCategoryIds, ...spendingCategoryIds])].filter(id => id !== -1);
                          return allIds.reduce((sum, id) => {
                            const spent = monthlyCategoryRaw.find(i => i.id === id)?.amount || 0;
                            return sum + spent;
                          }, 0);
                        })())}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{safeFormatCurrency(budgets.reduce((sum, b) => sum + b.amount, 0))}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: (() => {
                          const totalSpent = (() => {
                            const budgetedCategoryIds = budgets.map(b => b.category_id);
                            const spendingCategoryIds = monthlyCategoryRaw.map(i => i.id);
                            const allIds = [...new Set([...budgetedCategoryIds, ...spendingCategoryIds])].filter(id => id !== -1);
                            return allIds.reduce((sum, id) => {
                              const spent = monthlyCategoryRaw.find(i => i.id === id)?.amount || 0;
                              return sum + spent;
                            }, 0);
                          })();
                          const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
                          const totalDiff = totalBudget + totalSpent;
                          const normalizedTotalDiff = Math.abs(totalDiff) < 0.005 ? 0 : totalDiff;
                          return normalizedTotalDiff < 0 ? theme.palette.error.main : normalizedTotalDiff === 0 ? theme.palette.text.primary : theme.palette.success.main;
                        })() }}>
                          {safeFormatCurrency((() => {
                            const totalSpent = (() => {
                              const budgetedCategoryIds = budgets.map(b => b.category_id);
                              const spendingCategoryIds = monthlyCategoryRaw.map(i => i.id);
                              const allIds = [...new Set([...budgetedCategoryIds, ...spendingCategoryIds])].filter(id => id !== -1);
                              return allIds.reduce((sum, id) => {
                                const spent = monthlyCategoryRaw.find(i => i.id === id)?.amount || 0;
                                return sum + spent;
                              }, 0);
                            })();
                            const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
                            const totalDiff = totalBudget + totalSpent;
                            return Math.abs(totalDiff) < 0.005 ? 0 : totalDiff;
                          })())}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
                <Popper 
                  open={Boolean(tooltipAnchorEl)} 
                  anchorEl={tooltipAnchorEl} 
                  placement={tooltipPlacement}
                  modifiers={[{ name: 'flip', enabled: true }, { name: 'preventOverflow', enabled: true, options: { boundary: 'viewport' } }]}
                  sx={{ zIndex: 3000 }}
                >
                   <Paper elevation={3} sx={{ p: 1.2, bgcolor: theme => theme.palette.mode === 'light' ? theme.palette.grey[50] : theme.palette.grey[800] }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold', fontSize: '0.8rem' }}>Transaction Details</Typography>
                      <Table size="small" sx={{ minWidth: 140, tableLayout: 'auto' }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.68rem', py: 0.3, px: 0.7 }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.68rem', py: 0.3, px: 0.7 }}>Description</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '0.68rem', py: 0.3, px: 0.7 }}>Amount</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {tooltipTxns.map((tx, idx) => {
                            const displayNote = getDisplayNotes(tx.notes);
                            return (
                              <TableRow key={idx}>
                                <TableCell sx={{ fontSize: '0.68rem', py: 0.3, px: 0.7 }}>{tx.date}</TableCell>
                                <TableCell sx={{ py: 0.3, px: 0.7 }}>
                                  <Typography noWrap sx={{ fontSize: '0.68rem' }}>
                                    {tx.payee}
                                    {displayNote && (
                                      <Typography component="span" sx={(theme) => ({
                                        fontSize: '0.68rem',
                                        color: theme.palette.mode === 'light' ? '#0288d1' : '#FFA500',
                                        fontWeight: 500,
                                      })}>
                                        {' '}[{displayNote}]
                                      </Typography>
                                    )}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ color: tx.type === 'Expense' ? theme.palette.error.main : theme.palette.success.main, fontSize: '0.68rem', py: 0.3, px: 0.7 }}>
                                  {safeFormatCurrency(tx.amount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                 </Paper>
                 </Popper>
               </Paper>
             </Grid>
             <Grid item xs={12} md={6}>
               <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                 <Paper sx={{ p: 2 }}>
                   <Typography variant="h6" gutterBottom>Budget Alerts</Typography>
                   <Typography variant="body2" color="text.secondary" sx={{ mb: 1, mt: -1 }}>
                     Overusage: Amount spent over budget for each category.
                   </Typography>
                   {overBudgetCategories.length > 0 ? (
                     <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                       <Typography variant="subtitle2" color="error" sx={{ fontWeight: 'bold', mb: 1 }}>
                         Total Overusage: {safeFormatCurrency(-overBudgetCategories.reduce((sum, c) => sum + c.over, 0))}
                       </Typography>
                       {overBudgetCategories.map(({ name, over }) => (
                         <Box key={name} sx={{ display: 'flex', alignItems: 'center', color: 'error.main', gap: 1 }}>
                           <WarningAmberIcon color="error" />
                           <Typography variant="body2">{name}: {safeFormatCurrency(over)}</Typography>
                         </Box>
                       ))}
                     </Box>
                   ) : (
                     <Typography variant="body2">No budget overages</Typography>
                   )}
                 </Paper>
                 <Paper sx={{ p: 2 }}>
                   <Typography variant="h6" gutterBottom>Monthly Progress</Typography>
                   <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                     {/* Current Net Amount */}
                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                         Current Net: <span style={{ color: (actualMonthlySummary.income + actualMonthlySummary.expense) >= 0 ? '#388e3c' : '#d32f2f' }}>
                           {safeFormatCurrency(actualMonthlySummary.income + actualMonthlySummary.expense)}
                         </span>
                       </Typography>
                       <Typography variant="body2" color="text.secondary">
                         {(() => {
                           const today = new Date();
                           const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                           const remainingDays = lastDay - today.getDate();
                           return `${remainingDays} days remaining`;
                         })()}
                       </Typography>
                     </Box>
                     
                     {/* Recurring Total */}
                     {monthlyRecurringAmount !== 0 && (
                       <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                           Recurring Total: <span style={{ color: monthlyRecurringAmount >= 0 ? '#388e3c' : '#d32f2f' }}>
                             {monthlyRecurringAmount >= 0 ? '+' : ''}{safeFormatCurrency(monthlyRecurringAmount)}
                           </span>
                         </Typography>
                       </Box>
                     )}
                     
                     {/* Predicted Net Amount */}
                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                         Predicted Net: <span style={{ color: (predictedMonthlySummary.income + predictedMonthlySummary.expense) >= 0 ? '#388e3c' : '#d32f2f' }}>
                           {safeFormatCurrency(predictedMonthlySummary.income + predictedMonthlySummary.expense)}
                         </span>
                       </Typography>
                       <Typography variant="body2" color="text.secondary">
                         Including recurring items
                       </Typography>
                     </Box>



                     {/* Recurring Income Items */}
                     {recurringIncomeItems.length > 0 ? (
                       <Box>
                         <Typography variant="subtitle2" color="success.main" sx={{ fontWeight: 'bold', mb: 1 }}>
                           Recurring Income
                         </Typography>
                         <List dense sx={{ maxHeight: 200, overflow: 'auto', bgcolor: 'grey.50', borderRadius: 1 }}>
                           {recurringIncomeItems.map((item) => (
                             <ListItem key={item.occurrenceId} dense sx={{ py: 0.5 }}>
                               <ListItemIcon sx={{ minWidth: 36 }}>
                                 <Checkbox
                                   size="small"
                                   checked={checkedRecurringItems.has(item.occurrenceId)}
                                   onChange={(e) => {
                                     e.stopPropagation();
                                     handleRecurringItemCheck(item.occurrenceId, e.target.checked);
                                   }}
                                   onClick={(e) => {
                                     e.stopPropagation();
                                   }}
                                   sx={{ 
                                     cursor: 'pointer',
                                     '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                                   }}
                                 />
                               </ListItemIcon>
                               <ListItemText
                                 primary={
                                   <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                     <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                       {item.name}
                                     </Typography>
                                     <Typography variant="body2" color="success.main" sx={{ fontWeight: 'bold' }}>
                                       +{safeFormatCurrency(item.amount)}
                                     </Typography>
                                   </Box>
                                 }
                                 secondary={
                                   <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                     <Typography variant="caption" color="text.secondary">
                                       {format(item.occurrenceDate, 'MMM dd')}
                                     </Typography>
                                     <Typography variant="caption" color="text.secondary">
                                       {categories.find(c => c.id === item.category_id)?.name || 'Unknown'}
                                     </Typography>
                                   </Box>
                                 }
                               />
                             </ListItem>
                           ))}
                         </List>
                       </Box>
                     ) : (
                       <Box>
                         <Typography variant="subtitle2" color="text.secondary">
                           No recurring income items
                         </Typography>
                       </Box>
                     )}

                     {/* Recurring Expense Items */}
                     {recurringExpenseItems.length > 0 ? (
                       <Box>
                         <Typography variant="subtitle2" color="error.main" sx={{ fontWeight: 'bold', mb: 1 }}>
                           Recurring Expenses
                         </Typography>
                         <List dense sx={{ maxHeight: 200, overflow: 'auto', bgcolor: 'grey.50', borderRadius: 1 }}>
                           {recurringExpenseItems.map((item) => (
                             <ListItem key={item.occurrenceId} dense sx={{ py: 0.5 }}>
                               <ListItemIcon sx={{ minWidth: 36 }}>
                                 <Checkbox
                                   size="small"
                                   checked={checkedRecurringItems.has(item.occurrenceId)}
                                   onChange={(e) => {
                                     e.stopPropagation();
                                     handleRecurringItemCheck(item.occurrenceId, e.target.checked);
                                   }}
                                   onClick={(e) => {
                                     e.stopPropagation();
                                   }}
                                   sx={{ 
                                     cursor: 'pointer',
                                     '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                                   }}
                                 />
                               </ListItemIcon>
                               <ListItemText
                                 primary={
                                   <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                     <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                       {item.name}
                                     </Typography>
                                     <Typography variant="body2" color="error.main" sx={{ fontWeight: 'bold' }}>
                                       -{safeFormatCurrency(item.amount)}
                                     </Typography>
                                   </Box>
                                 }
                                 secondary={
                                   <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                     <Typography variant="caption" color="text.secondary">
                                       {format(item.occurrenceDate, 'MMM dd')}
                                     </Typography>
                                     <Typography variant="caption" color="text.secondary">
                                       {categories.find(c => c.id === item.category_id)?.name || 'Unknown'}
                                     </Typography>
                                   </Box>
                                 }
                               />
                             </ListItem>
                           ))}
                         </List>
                       </Box>
                     ) : (
                       <Box>
                         <Typography variant="subtitle2" color="text.secondary">
                           No recurring expense items
                         </Typography>
                       </Box>
                     )}
                     
                     {/* Progress Bar */}
                     <Box sx={{ width: '100%' }}>
                       <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                         <Typography variant="body2" color="text.secondary">1st</Typography>
                         <Typography variant="body2" color="text.secondary">
                           {(() => {
                             const today = new Date();
                             const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                             return `${lastDay}th`;
                           })()}
                         </Typography>
                       </Box>
                       <Box sx={{ 
                         width: '100%', 
                         height: 20, 
                         bgcolor: 'grey.200', 
                         borderRadius: 1,
                         position: 'relative',
                         overflow: 'hidden'
                       }}>
                         <Box sx={{
                           width: `${(() => {
                             const today = new Date();
                             const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                             const progress = (today.getDate() / lastDay) * 100;
                             return Math.min(progress, 100);
                           })()}%`,
                           height: '100%',
                           bgcolor: (predictedMonthlySummary.income + predictedMonthlySummary.expense) >= 0 ? '#388e3c' : '#d32f2f',
                           borderRadius: 1,
                           transition: 'width 0.3s ease'
                         }} />
                       </Box>
                     </Box>
                     {/* Motivational Message */}
                     <Box sx={{ mt: 1 }}>
                       <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                         {(() => {
                           const netAmount = predictedMonthlySummary.income + predictedMonthlySummary.expense;
                           const today = new Date();
                           const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                           const remainingDays = lastDay - today.getDate();
                           const progress = (today.getDate() / lastDay) * 100;
                           if (netAmount >= 0) {
                             if (progress >= 80) {
                               return "Great job! You're on track to finish the month strong! 💪";
                             } else if (progress >= 60) {
                               return "You're doing well! Keep up the good financial habits! 📈";
                             } else {
                               return "Good start! Focus on your goals for the rest of the month! 🎯";
                             }
                           } else {
                             if (remainingDays > 10) {
                               return "You still have time to turn things around! Stay focused! 🔄";
                             } else {
                               return "Every day is a new opportunity to improve! 💪";
                             }
                           }
                         })()}
                       </Typography>

                     </Box>
                   </Box>
                 </Paper>
               </Box>
             </Grid>
           </Grid>
        </>
      )}
      {activeTab === 1 && (
        <>
          {/* Year selector styled like Monthly */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <Select
              value={year}
              size="small"
              onChange={e => setYear(e.target.value as string)}
              sx={{
                width: 90,
                '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                backgroundColor: 'transparent',
                '& .MuiSelect-icon': { color: 'text.secondary' }
              }}
            >
              {years.map(y => (
                <MenuItem key={y} value={String(y)}>{y}</MenuItem>
              ))}
            </Select>
          </Box>
          <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
                {/* Income vs Expense */}
                <Paper sx={{ p: 2, minHeight: 360, flex: '1 1 25%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom>Income vs Expense</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: theme.palette.success.main, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                      Income: {safeFormatCurrency(yearlySummary.income)}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: theme.palette.error.main, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                      Expense: {safeFormatCurrency(yearlySummary.expense)}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: (yearlySummary.income + yearlySummary.expense) >= 0 ? theme.palette.primary.main : theme.palette.error.main, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                      Net: {safeFormatCurrency(yearlySummary.income + yearlySummary.expense)}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', '& canvas': { touchAction: 'none !important', userSelect: 'none' } }}>
                    <Bar
                      data={{
                        labels: ['Income', 'Expense'],
                        datasets: [{
                          data: [yearlySummary.income, Math.abs(yearlySummary.expense)],
                          backgroundColor: [theme.palette.primary.main, theme.palette.error.main]
                        }]
                      }}
                      options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }}
                    />
                  </Box>
                </Paper>
                {/* Category Breakdown */}
                <Paper sx={{ p: 2, minHeight: 360, flex: '1 1 37.5%' }}>
                  <Typography variant="h6" gutterBottom>Category Breakdown</Typography>
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', justifyContent: 'center' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mr: 2 }}>
                      {yearlyLeftLabels.map((label, i) => (
                        <Box
                          key={label}
                          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 0.5 }}
                          onMouseEnter={() => handleYearlyLegendHover(label)}
                          onMouseLeave={handleYearlyLegendLeave}
                        >
                          <Box sx={{ width: 10, height: 10, bgcolor: yearlyLeftColors[i], mr: 1, borderRadius: '2px' }} />
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: '0.75rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '120px'
                            }}
                            title={label}
                          >
                            {label}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    <Box sx={{ mx: 2, height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Doughnut
                        ref={yearlyDoughnutRef}
                        data={yearlyDoughnutData}
                        options={{ ...doughnutOptions, maintainAspectRatio: false }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, ml: 2 }}>
                      {yearlyRightLabels.map((label, i) => (
                        <Box
                          key={label}
                          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 0.5 }}
                          onMouseEnter={() => handleYearlyLegendHover(label)}
                          onMouseLeave={handleYearlyLegendLeave}
                        >
                          <Box sx={{ width: 10, height: 10, bgcolor: yearlyRightColors[i], mr: 1, borderRadius: '2px' }} />
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: '0.75rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '120px'
                            }}
                            title={label}
                          >
                            {label}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Paper>
                {/* Monthly Trends */}
                <Paper sx={{ p: 2, minHeight: 360, flex: '1 1 37.5%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom>Monthly Trends</Typography>
                  <Box sx={{ flex: 1, overflow: 'hidden', '& canvas': { touchAction: 'none !important', userSelect: 'none' } }}>
                    <Bar
                      data={yearlyBarData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true } },
                        plugins: {
                          tooltip: {
                            callbacks: {
                              title: tooltipItems => tooltipItems[0].label,
                              label: ctx => ` ${ctx.dataset.label}: ${safeFormatCurrency(ctx.parsed.y)}`
                            }
                          }
                        }
                      }}
                    />
                  </Box>
                </Paper>
              </Box>
            </Grid>
            {/* Yearly Category Monthly Breakdown Table */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Category Monthly Breakdown</Typography>
                <TableContainer>
                  <Table
                    size="small"
                    sx={{
                      width: '100%',
                      tableLayout: 'fixed',
                      '& tbody tr:hover': { backgroundColor: theme.palette.action.hover },
                      '& .MuiTableCell-root': { backgroundColor: 'transparent' }
                    }}
                  >
                    <TableHead>
                      <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                        <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>Category</TableCell>
                        {monthNames.map((monthName, index) => (
                          <TableCell key={index} align="right" sx={{ fontWeight: 'bold', width: '6.5%', fontSize: '0.75rem', px: 0.5 }}>
                            {monthName}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ fontWeight: 'bold', width: '8%' }}>Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {yearlyCategoryMonthlyData.map((row) => (
                        <TableRow 
                          key={row.category.id} 
                          hover
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell sx={{ fontWeight: 'medium', width: '15%', fontSize: '0.8rem' }}>
                            {row.category.name}
                          </TableCell>
                          {row.monthlyAmounts.map((amount, monthIndex) => {
                            const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                            const monthTransactions = yearlyTransactions.filter(tx => 
                              tx.date.startsWith(monthKey) && 
                              (tx.category_id === row.category.id || 
                               (tx.type === 'Income' && tx.category_id != null && 
                                categories.find(c => c.id === tx.category_id)?.reimbursement_target_category_id === row.category.id))
                            );
                            
                            // Get previous month's data for comparison
                            const prevMonthData = getPreviousMonthData.get(row.category.id);
                            const prevMonthAmount = prevMonthData ? prevMonthData[monthIndex] : 0;
                            const currentAmount = Math.abs(amount);
                            const prevAmount = Math.abs(prevMonthAmount);
                            
                            // Determine if expense increased or decreased
                            // Expense는 음수이므로 절대값이 작아지면 지출이 줄어든 것
                            const showArrow = currentAmount > 0; // 현재 월에 지출이 있으면 화살표 표시
                            const isIncrease = showArrow && prevAmount > 0 && currentAmount < prevAmount; // 절대값이 작아지면 지출 증가
                            const isDecrease = showArrow && prevAmount > 0 && currentAmount > prevAmount; // 절대값이 커지면 지출 감소
                            const isNewExpense = showArrow && prevAmount === 0; // 이전 월에 지출이 없었던 경우
                            const isSame = showArrow && prevAmount > 0 && currentAmount === prevAmount;
                            
                            // 디버깅용 로그 (나중에 제거)
                            if (currentAmount > 0 && prevAmount > 0) {
                              console.log(`${row.category.name} ${monthIndex + 1}월:`, {
                                current: currentAmount,
                                prev: prevAmount,
                                isIncrease,
                                isDecrease
                              });
                            }
                            
                            return (
                              <TableCell 
                                key={monthIndex} 
                                align="right" 
                                sx={{ 
                                  color: amount < 0 ? theme.palette.error.main : theme.palette.text.primary,
                                  fontWeight: amount !== 0 ? 'medium' : 'normal',
                                  cursor: monthTransactions.length > 0 ? 'pointer' : 'default',
                                  width: '6.5%',
                                  fontSize: '0.7rem',
                                  px: 0.5
                                }}
                                onMouseEnter={(e) => {
                                  if (monthTransactions.length > 0) {
                                    handleCategoryRowEnter(e, monthTransactions);
                                  }
                                }}
                                onMouseLeave={handleTooltipClose}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                  {monthTransactions.length > 0 ? safeFormatCurrency(amount) : '-'}
                                  {showArrow && (
                                    isIncrease ? (
                                      <KeyboardArrowDownIcon 
                                        sx={{ 
                                          fontSize: '1.2rem', 
                                          fontWeight: 'bold',
                                          color: theme.palette.success.main,
                                          ml: 0.5
                                        }} 
                                      />
                                    ) : isDecrease ? (
                                      <KeyboardArrowUpIcon 
                                        sx={{ 
                                          fontSize: '1.2rem', 
                                          fontWeight: 'bold',
                                          color: theme.palette.error.main,
                                          ml: 0.5
                                        }} 
                                      />
                                    ) : isNewExpense ? (
                                      <KeyboardArrowUpIcon 
                                        sx={{ 
                                          fontSize: '1.2rem', 
                                          fontWeight: 'bold',
                                          color: theme.palette.error.main,
                                          ml: 0.5
                                        }} 
                                      />
                                    ) : isSame ? (
                                      <RemoveIcon 
                                        sx={{ 
                                          fontSize: '1.2rem', 
                                          fontWeight: 'bold',
                                          color: theme.palette.primary.main,
                                          ml: 0.5
                                        }} 
                                      />
                                    ) : null
                                  )}
                                </Box>
                              </TableCell>
                            );
                          })}
                          <TableCell 
                            align="right" 
                            sx={{ 
                              fontWeight: 'bold',
                              color: row.total < 0 ? theme.palette.error.main : theme.palette.text.primary,
                              width: '8%',
                              fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => {
                              const progressData = yearlyCategoryProgress.find(p => p.categoryId === row.category.id);
                              if (progressData && Math.abs(row.total) > 0) {
                                setProgressTooltipAnchorEl(e.currentTarget);
                                setProgressTooltipData({
                                  categoryName: progressData.categoryName,
                                  monthlyAmounts: progressData.monthlyAmounts,
                                  cumulativeAmounts: progressData.cumulativeAmounts,
                                  total: progressData.total
                                });
                                setProgressTooltipPlacement(getProgressTooltipPlacement(e));
                              }
                            }}
                            onMouseLeave={handleProgressTooltipClose}
                          >
                            {row.total !== 0 ? safeFormatCurrency(row.total) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow sx={{ backgroundColor: theme.palette.action.selected }}>
                        <TableCell sx={{ fontWeight: 'bold', width: '15%', fontSize: '0.8rem' }}>Total</TableCell>
                        {Array.from({ length: 12 }, (_, monthIndex) => {
                          // Calculate month total using the same logic as summarizeTxns for consistency
                          const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                          const monthTransactions = yearlyTransactions.filter(tx => tx.date.startsWith(monthKey));
                          
                          // Use the same calculation as summarizeTxns
                          const rawExpenses = monthTransactions
                            .filter(tx => tx.type === 'Expense')
                            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
                          
                          const totalReimbursed = monthTransactions
                            .filter(tx => tx.type === 'Income' && tx.category_id != null)
                            .reduce((sum, tx) => {
                              const cat = categories.find(c => c.id === tx.category_id);
                              if (cat?.is_reimbursement) {
                                return sum + tx.amount;
                              }
                              return sum;
                            }, 0);
                          
                          const monthTotal = -(rawExpenses - totalReimbursed);
                          
                          // Calculate previous month's total for comparison
                          const prevMonthIndex = monthIndex - 1;
                          let prevMonthTotal = 0;
                          
                          if (prevMonthIndex < 0) {
                            // 1월의 경우 이전 해 12월 데이터를 가져옴
                            const prevYear = parseInt(year) - 1;
                            const prevYearTransactions = allTransactions.filter(tx => tx.date.startsWith(`${prevYear}-`));
                            const monthKey = `${prevYear}-12`;
                            const monthTransactions = prevYearTransactions.filter(tx => tx.date.startsWith(monthKey));
                            
                            // Calculate total expenses for all categories in this month using summarizeTxns logic
                            const rawExpenses = monthTransactions
                              .filter(tx => tx.type === 'Expense')
                              .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
                            
                            const totalReimbursed = monthTransactions
                              .filter(tx => tx.type === 'Income' && tx.category_id != null)
                              .reduce((sum, tx) => {
                                const cat = categories.find(c => c.id === tx.category_id);
                                if (cat?.is_reimbursement) {
                                  return sum + tx.amount;
                                }
                                return sum;
                              }, 0);
                            
                            prevMonthTotal = -(rawExpenses - totalReimbursed);
                          } else {
                            // 같은 해의 이전 월
                            const monthKey = `${year}-${String(prevMonthIndex + 1).padStart(2, '0')}`;
                            const monthTransactions = yearlyTransactions.filter(tx => tx.date.startsWith(monthKey));
                            
                            // Calculate total expenses for all categories in this month using summarizeTxns logic
                            const rawExpenses = monthTransactions
                              .filter(tx => tx.type === 'Expense')
                              .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
                            
                            const totalReimbursed = monthTransactions
                              .filter(tx => tx.type === 'Income' && tx.category_id != null)
                              .reduce((sum, tx) => {
                                const cat = categories.find(c => c.id === tx.category_id);
                                if (cat?.is_reimbursement) {
                                  return sum + tx.amount;
                                }
                                return sum;
                              }, 0);
                            
                            prevMonthTotal = -(rawExpenses - totalReimbursed);
                          }
                          
                          // Determine if total expense increased or decreased
                          const currentAmount = Math.abs(monthTotal);
                          const prevAmount = Math.abs(prevMonthTotal);
                          
                          const showArrow = currentAmount > 0; // 현재 월에 지출이 있으면 화살표 표시
                          const isIncrease = showArrow && prevAmount > 0 && currentAmount < prevAmount; // 절대값이 작아지면 지출 증가
                          const isDecrease = showArrow && prevAmount > 0 && currentAmount > prevAmount; // 절대값이 커지면 지출 감소
                          const isNewExpense = showArrow && prevAmount === 0; // 이전 월에 지출이 없었던 경우
                          const isSame = showArrow && prevAmount > 0 && currentAmount === prevAmount;
                          
                          return (
                            <TableCell key={monthIndex} align="right" sx={{ 
                              fontWeight: 'bold',
                              color: monthTotal < 0 ? theme.palette.error.main : theme.palette.text.primary,
                              width: '6.5%',
                              fontSize: '0.7rem',
                              px: 0.5
                            }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                {monthTotal !== 0 ? safeFormatCurrency(monthTotal) : '-'}
                                {showArrow && (
                                  isIncrease ? (
                                    <KeyboardArrowDownIcon 
                                      sx={{ 
                                        fontSize: '1.2rem', 
                                        fontWeight: 'bold',
                                        color: theme.palette.success.main,
                                        ml: 0.5
                                      }} 
                                    />
                                  ) : isDecrease ? (
                                    <KeyboardArrowUpIcon 
                                      sx={{ 
                                        fontSize: '1.2rem', 
                                        fontWeight: 'bold',
                                        color: theme.palette.error.main,
                                        ml: 0.5
                                      }} 
                                    />
                                  ) : isNewExpense ? (
                                    <KeyboardArrowUpIcon 
                                      sx={{ 
                                        fontSize: '1.2rem', 
                                        fontWeight: 'bold',
                                        color: theme.palette.error.main,
                                        ml: 0.5
                                      }} 
                                    />
                                  ) : isSame ? (
                                    <RemoveIcon 
                                      sx={{ 
                                        fontSize: '1.2rem', 
                                        fontWeight: 'bold',
                                        color: theme.palette.primary.main,
                                        ml: 0.5
                                      }} 
                                    />
                                  ) : null
                                )}
                              </Box>
                            </TableCell>
                          );
                        })}
                        <TableCell align="right" sx={{ 
                          fontWeight: 'bold',
                          color: yearlySummary.expense < 0 ? theme.palette.error.main : theme.palette.text.primary,
                          width: '8%',
                          fontSize: '0.8rem'
                        }}>
                          {safeFormatCurrency(yearlySummary.expense)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
                <Popper 
                  open={Boolean(tooltipAnchorEl)} 
                  anchorEl={tooltipAnchorEl} 
                  placement={tooltipPlacement}
                  modifiers={[{ name: 'flip', enabled: true }, { name: 'preventOverflow', enabled: true, options: { boundary: 'viewport' } }]}
                  sx={{ zIndex: 3000 }}
                >
                   <Paper elevation={3} sx={{ p: 1.2, bgcolor: theme => theme.palette.mode === 'light' ? theme.palette.grey[50] : theme.palette.grey[800] }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold', fontSize: '0.8rem' }}>Transaction Details</Typography>
                      <Table size="small" sx={{ minWidth: 140, tableLayout: 'auto' }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.68rem', py: 0.3, px: 0.7 }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.68rem', py: 0.3, px: 0.7 }}>Description</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '0.68rem', py: 0.3, px: 0.7 }}>Amount</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {tooltipTxns.map((tx, idx) => {
                            const displayNote = getDisplayNotes(tx.notes);
                            return (
                              <TableRow key={idx}>
                                <TableCell sx={{ fontSize: '0.68rem', py: 0.3, px: 0.7 }}>{tx.date}</TableCell>
                                <TableCell sx={{ py: 0.3, px: 0.7 }}>
                                  <Typography noWrap sx={{ fontSize: '0.68rem' }}>
                                    {tx.payee}
                                    {displayNote && (
                                      <Typography component="span" sx={(theme) => ({
                                        fontSize: '0.68rem',
                                        color: theme.palette.mode === 'light' ? '#0288d1' : '#FFA500',
                                        fontWeight: 500,
                                      })}>
                                        {' '}[{displayNote}]
                                      </Typography>
                                    )}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ color: tx.type === 'Expense' ? theme.palette.error.main : theme.palette.success.main, fontSize: '0.68rem', py: 0.3, px: 0.7 }}>
                                  {safeFormatCurrency(tx.amount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                 </Paper>
                 </Popper>
                 
                 {/* Progress Tooltip */}
                 <Popper 
                   open={Boolean(progressTooltipAnchorEl)} 
                   anchorEl={progressTooltipAnchorEl} 
                   placement={progressTooltipPlacement}
                   modifiers={[{ name: 'flip', enabled: true }, { name: 'preventOverflow', enabled: true, options: { boundary: 'viewport' } }]}
                   sx={{ zIndex: 3000 }}
                 >
                   <Paper elevation={3} sx={{ p: 1.5, bgcolor: theme => theme.palette.mode === 'light' ? theme.palette.grey[50] : theme.palette.grey[800], minWidth: 300 }}>
                     {progressTooltipData && (
                       <>
                         <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', fontSize: '0.9rem' }}>
                           {progressTooltipData.categoryName} - Monthly Expenses
                         </Typography>
                         <Box sx={{ height: 150, width: '100%' }}>
                           <Line
                             data={{
                               labels: monthNames,
                               datasets: [
                                 {
                                   label: 'Monthly Expense',
                                   data: progressTooltipData.monthlyAmounts,
                                   borderColor: theme.palette.error.main,
                                   backgroundColor: theme.palette.error.main,
                                   borderWidth: 2,
                                   fill: false,
                                   tension: 0.1,
                                   pointBackgroundColor: theme.palette.error.main,
                                   pointBorderColor: theme.palette.error.main,
                                   pointRadius: 4,
                                   pointHoverRadius: 6
                                 }
                               ]
                             }}
                             options={{
                               responsive: true,
                               maintainAspectRatio: false,
                               scales: { 
                                 y: { 
                                   beginAtZero: true,
                                   reverse: true,
                                   ticks: {
                                     callback: function(value) {
                                       return safeFormatCurrency(Number(value));
                                     }
                                   }
                                 } 
                               },
                               plugins: {
                                 legend: {
                                   display: false
                                 },
                                 tooltip: {
                                   callbacks: {
                                     label: function(context) {
                                       const value = context.parsed.y;
                                       return `${safeFormatCurrency(value)}`;
                                     }
                                   }
                                 }
                               }
                             }}
                           />
                         </Box>
                         <Typography variant="body2" sx={{ mt: 1, textAlign: 'center', fontWeight: 'medium', color: theme.palette.error.main }}>
                           Total: {safeFormatCurrency(progressTooltipData.total)}
                         </Typography>
                       </>
                     )}
                   </Paper>
                 </Popper>
              </Paper>
            </Grid>
            
            {/* Account Balance Changes */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Account Balances (as of 1st of each month)</Typography>
                <Box sx={{ height: 300, width: '100%', mb: 2 }}>
                  <Line
                    data={accountBalanceChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: { 
                        y: { 
                          beginAtZero: false,
                          ticks: {
                            callback: function(value) {
                              return safeFormatCurrency(Number(value));
                            }
                          }
                        } 
                      },
                      plugins: {
                        legend: {
                          display: true,
                          position: 'top' as const,
                          labels: {
                            boxWidth: 12,
                            padding: 8,
                            font: { size: 10 }
                          }
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              const label = context.dataset.label || '';
                              const value = context.parsed.y;
                              return `${label}: ${safeFormatCurrency(value)}`;
                            }
                          }
                        }
                      }
                    }}
                  />
                </Box>
                
                {/* Account Balance Table */}
                <TableContainer>
                  <Table
                    size="small"
                    sx={{
                      width: '100%',
                      tableLayout: 'fixed',
                      '& tbody tr:hover': { backgroundColor: theme.palette.action.hover },
                      '& .MuiTableCell-root': { backgroundColor: 'transparent' }
                    }}
                  >
                                         <TableHead>
                       <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                         <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>Month</TableCell>
                         <TableCell align="right" sx={{ fontWeight: 'bold', width: '20%' }}>Checking Balance</TableCell>
                         <TableCell align="right" sx={{ fontWeight: 'bold', width: '20%' }}>Savings Balance</TableCell>
                         <TableCell align="right" sx={{ fontWeight: 'bold', width: '20%' }}>Total Assets</TableCell>
                       </TableRow>
                     </TableHead>
                    <TableBody>
                      {monthlyAccountBalances.map((row) => (
                        <TableRow 
                          key={row.month} 
                          hover
                        >
                          <TableCell sx={{ fontWeight: 'medium', width: '15%', fontSize: '0.8rem' }}>
                            {row.monthName}
                          </TableCell>
                                                   <TableCell align="right" sx={{ 
                           fontWeight: 'medium',
                           color: row.isFuture ? theme.palette.text.secondary : (row.checking && row.checking >= 0 ? theme.palette.success.main : theme.palette.error.main),
                           width: '20%',
                           fontSize: '0.8rem'
                         }}>
                           {row.isFuture ? '-' : (row.checking ? safeFormatCurrency(row.checking) : '-')}
                         </TableCell>
                         <TableCell align="right" sx={{ 
                           fontWeight: 'medium',
                           color: row.isFuture ? theme.palette.text.secondary : (row.savings && row.savings >= 0 ? theme.palette.success.main : theme.palette.error.main),
                           width: '20%',
                           fontSize: '0.8rem'
                         }}>
                           {row.isFuture ? '-' : (row.savings ? safeFormatCurrency(row.savings) : '-')}
                         </TableCell>
                         <TableCell align="right" sx={{ 
                           fontWeight: 'bold',
                           color: row.isFuture ? theme.palette.text.secondary : (row.total && row.total >= 0 ? theme.palette.info.main : theme.palette.error.main),
                           width: '20%',
                           fontSize: '0.8rem'
                         }}>
                           {row.isFuture ? '-' : (row.total ? safeFormatCurrency(row.total) : '-')}
                         </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                                         <TableFooter>
                       <TableRow sx={{ backgroundColor: theme.palette.action.selected }}>
                         <TableCell sx={{ fontWeight: 'bold', width: '15%', fontSize: '0.8rem' }}>Latest Balance</TableCell>
                         <TableCell align="right" sx={{ 
                           fontWeight: 'bold',
                           color: (() => {
                             const lastValidData = monthlyAccountBalances.filter(m => !m.isFuture).pop();
                             return lastValidData?.checking && lastValidData.checking >= 0 ? theme.palette.success.main : theme.palette.error.main;
                           })(),
                           width: '20%',
                           fontSize: '0.8rem'
                         }}>
                           {(() => {
                             const lastValidData = monthlyAccountBalances.filter(m => !m.isFuture).pop();
                             return lastValidData && lastValidData.checking ? safeFormatCurrency(lastValidData.checking) : '-';
                           })()}
                         </TableCell>
                         <TableCell align="right" sx={{ 
                           fontWeight: 'bold',
                           color: (() => {
                             const lastValidData = monthlyAccountBalances.filter(m => !m.isFuture).pop();
                             return lastValidData?.savings && lastValidData.savings >= 0 ? theme.palette.success.main : theme.palette.error.main;
                           })(),
                           width: '20%',
                           fontSize: '0.8rem'
                         }}>
                           {(() => {
                             const lastValidData = monthlyAccountBalances.filter(m => !m.isFuture).pop();
                             return lastValidData && lastValidData.savings ? safeFormatCurrency(lastValidData.savings) : '-';
                           })()}
                         </TableCell>
                         <TableCell align="right" sx={{ 
                           fontWeight: 'bold',
                           color: (() => {
                             const lastValidData = monthlyAccountBalances.filter(m => !m.isFuture).pop();
                             return lastValidData?.total && lastValidData.total >= 0 ? theme.palette.info.main : theme.palette.error.main;
                           })(),
                           width: '20%',
                           fontSize: '0.8rem'
                         }}>
                           {(() => {
                             const lastValidData = monthlyAccountBalances.filter(m => !m.isFuture).pop();
                             return lastValidData && lastValidData.total ? safeFormatCurrency(lastValidData.total) : '-';
                           })()}
                         </TableCell>
                       </TableRow>
                     </TableFooter>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
      {/* Removed extraneous Yearly Category Details outside of tab condition */}
      
      {/* Snackbar for database update confirmation */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiSnackbar-root': {
            bottom: '24px',
          },
        }}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity={snackbarSeverity}
          variant="filled"
          sx={{ 
            width: '100%',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
            padding: '8px 12px',
            minHeight: 'auto',
            '& .MuiAlert-icon': {
              padding: '0',
              marginRight: '8px',
              fontSize: '20px',
            },
            '& .MuiAlert-message': {
              padding: '0',
              fontSize: '14px',
              fontWeight: 500,
            },
            '& .MuiAlert-action': {
              padding: '0',
              marginLeft: '8px',
              '& .MuiIconButton-root': {
                padding: '2px',
                color: 'inherit',
                width: '16px',
                height: '16px',
                '& .MuiSvgIcon-root': {
                  fontSize: '14px',
                },
                '&:hover': {
                  backgroundColor: 'transparent',
                },
              },
            },
          }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ReportsPage; 