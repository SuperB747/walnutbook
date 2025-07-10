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
  Popper
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTheme } from '@mui/material/styles';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Transaction, Category, Budget } from '../db';
import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';
import { safeFormatCurrency } from '../utils';

// Register Chart.js core components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend, ArcElement);

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
        const [txns, cats] = await Promise.all([
          invoke<Transaction[]>('get_transactions'),
          invoke<Category[]>('get_categories_full')
        ]);
        setAllTransactions(txns || []);
        setCategories(cats || []);
      } catch (error) {
        console.error('Failed to load report data:', error);
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
    
    // First calculate raw expenses by category (including undefined category as -1)
    const expensesByCategory: Record<number, number> = {};
    txns.forEach(tx => {
      if (tx.type === 'Expense') {
        const id = tx.category_id ?? -1;
        expensesByCategory[id] = (expensesByCategory[id] || 0) + tx.amount;
      }
    });

    // Apply reimbursements directly to categories (same as monthlyCategoryRaw)
    txns.forEach(tx => {
      if (tx.type === 'Income' && tx.category_id != null) {
        const cat = categoryMap.get(tx.category_id);
        if (cat?.is_reimbursement && cat.reimbursement_target_category_id != null) {
          const targetId = cat.reimbursement_target_category_id;
          const targetExpense = expensesByCategory[targetId] || 0;
          if (targetExpense < 0) { // Only if there are expenses to reimburse
            // Calculate how much of the reimbursement can be applied
            const applicableAmount = Math.min(tx.amount, Math.abs(targetExpense));
            expensesByCategory[targetId] += applicableAmount;
          }
        } else {
          income += tx.amount; // Non-reimbursement income
        }
      }
    });

    // Calculate total net expenses (after reimbursements applied)
    const expense = Object.values(expensesByCategory).reduce((sum, amount) => sum + amount, 0);

    return { income, expense };
  }
  const monthlySummary = useMemo(() => summarizeTxns(monthlyTransactions), [monthlyTransactions, categories]);

  // Monthly raw category expenses with reimbursements applied
  const monthlyCategoryRaw = useMemo<{ id: number; amount: number }[]>(() => {
    // Create category map for efficient lookups
    const categoryMap = new Map<number, Category>();
    categories.forEach(c => categoryMap.set(c.id, c));

    // First calculate raw expenses by category
    const expensesByCategory: Record<number, number> = {};
    monthlyTransactions.forEach(tx => {
      if (tx.type === 'Expense') {
        const id = tx.category_id ?? -1;
        expensesByCategory[id] = (expensesByCategory[id] || 0) + tx.amount;
      }
    });

    // Then calculate reimbursements, but only apply what can be used
    const originalExpenses = { ...expensesByCategory }; // Keep original expenses for reference
    monthlyTransactions.forEach(tx => {
      if (tx.type === 'Income' && tx.category_id != null) {
        const cat = categoryMap.get(tx.category_id);
        if (cat?.is_reimbursement && cat.reimbursement_target_category_id != null) {
          const targetId = cat.reimbursement_target_category_id;
          const targetExpense = expensesByCategory[targetId] || 0;
          if (targetExpense < 0) { // Only if there are expenses to reimburse
            // Calculate how much of the reimbursement can be applied
            const applicableAmount = Math.min(tx.amount, Math.abs(targetExpense));
            expensesByCategory[targetId] += applicableAmount;
          }
        }
      }
    });

    // Convert to array and sort by absolute amount descending
    // Only include categories that have non-zero net expenses
    return Object.entries(expensesByCategory)
      .filter(([, amount]) => amount !== 0)
      .map(([id, amount]) => ({ 
        id: Number(id), 
        // Keep the signed amount for consistency with Summary Report
        // This will make the total match the Summary Report's expense calculation
        amount: amount
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
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
    setTooltipAnchorEl(event.currentTarget);
    setTooltipTxns(txns);
  };
  const handleTooltipClose = () => {
    setTooltipAnchorEl(null);
    setTooltipTxns([]);
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

  // Bar chart data
  const monthlyBarData = {
    labels: ['Income', 'Expense'],
    datasets: [{
      label: 'Amount',
      data: [monthlySummary.income, Math.abs(monthlySummary.expense)],
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
        const diff = budgetAmount - spent;
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
          if (targetExpense < 0) { // Only if there are expenses to reimburse
            // Calculate how much of the reimbursement can be applied
            const applicableAmount = Math.min(tx.amount, Math.abs(targetExpense));
            expensesByCategory[targetId] += applicableAmount;
          }
        }
      }
    });

    // Convert to array and sort by absolute amount descending
    // Only include categories that have non-zero net expenses
    return Object.entries(expensesByCategory)
      .filter(([, amount]) => amount !== 0)
      .map(([id, amount]) => ({ 
        id: Number(id), 
        // Keep the signed amount for consistency with Summary Report
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

  // Total breakdown expense for Monthly summary
  const monthlyBreakdownTotal = useMemo(
    () => monthlyCategoryRaw.reduce((sum, i) => sum + i.amount, 0),
    [monthlyCategoryRaw]
  );
  // Total breakdown expense for Yearly summary
  const yearlyBreakdownTotal = useMemo(
    () => yearlyCategoryRaw.reduce((sum, i) => sum + i.amount, 0),
    [yearlyCategoryRaw]
  );

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
        
        // Calculate raw expenses for this category in this month
        const rawExpenses = monthTransactions
          .filter(tx => tx.type === 'Expense' && tx.category_id === category?.id)
          .reduce((sum, tx) => sum + tx.amount, 0);

        // Calculate reimbursements for this category in this month
        const reimbursements = monthTransactions
          .filter(tx => tx.type === 'Income' && tx.category_id != null)
          .reduce((sum, tx) => {
            const cat = categoryMap.get(tx.category_id!);
            if (cat?.is_reimbursement && cat.reimbursement_target_category_id === category?.id) {
              return sum + tx.amount;
            }
            return sum;
          }, 0);

        // Apply reimbursements to expenses
        return rawExpenses + reimbursements;
      });

      const total = monthlyAmounts.reduce((sum, amount) => sum + amount, 0);

      return {
        category: category!,
        monthlyAmounts,
        total
      };
    });

    return monthlyData;
  }, [yearlyTransactions, categories, year]);

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Summary Report</Typography>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 3,
          // Remove default indicator to rely on background styling
          '& .MuiTabs-indicator': { display: 'none' },
          // Tab hover effect
          '& .MuiTab-root:hover': { backgroundColor: theme.palette.action.hover },
          // Selected tab styling
          '& .MuiTab-root.Mui-selected': { backgroundColor: theme.palette.primary.main, color: theme.palette.primary.contrastText },
          '& .MuiTab-root.Mui-selected:hover': { backgroundColor: theme.palette.primary.dark },
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
                      Income: {safeFormatCurrency(monthlySummary.income)}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: theme.palette.error.main, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                      Expense: {safeFormatCurrency(monthlySummary.expense)}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: (monthlySummary.income + monthlySummary.expense) >= 0 ? theme.palette.primary.main : theme.palette.error.main, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                      Net: {safeFormatCurrency(monthlySummary.income + monthlySummary.expense)}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minHeight: 0 }}>
                    <Bar
                      data={{
                        labels: ['Income', 'Expense'],
                        datasets: [{
                          data: [monthlySummary.income, Math.abs(monthlySummary.expense)],
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
                  <Box sx={{ flex: 1, minHeight: 0 }}>
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
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Diff</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(() => {
                        // Combine category IDs from expenses and budgets, excluding undefined
                        const ids = new Set<number>([
                          ...monthlyCategoryRaw.map(i => i.id),
                          ...budgets.map(b => b.category_id)
                        ]);
                        const allIds = Array.from(ids).filter(id => id !== -1);
                        let totalSpent = 0;
                        let totalBudget = 0;
                        return allIds.map(id => {
                          const label = id === -1 ? 'Undefined' : categories.find(c => c.id === id)?.name || 'Undefined';
                          const spent = monthlyCategoryRaw.find(i => i.id === id)?.amount || 0;
                          const budgetAmount = budgets.find(b => b.category_id === id)?.amount || 0;
                          const diff = budgetAmount - spent;
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
                              <TableCell align="right">{safeFormatCurrency(spent)}</TableCell>
                              <TableCell align="right">{safeFormatCurrency(budgetAmount)}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 'bold', color: diff < 0 ? theme.palette.error.main : theme.palette.success.main }}>
                                {safeFormatCurrency(diff)}
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                    <TableFooter>
                      <TableRow sx={{ backgroundColor: theme.palette.action.selected }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{safeFormatCurrency(monthlyCategoryRaw.reduce((sum, i) => sum + i.amount, 0))}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{safeFormatCurrency(budgets.reduce((sum, b) => sum + b.amount, 0))}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: (budgets.reduce((sum, b) => sum + b.amount, 0) - monthlyCategoryRaw.reduce((sum, i) => sum + i.amount, 0)) < 0 ? theme.palette.error.main : theme.palette.success.main }}>
                          {safeFormatCurrency(budgets.reduce((sum, b) => sum + b.amount, 0) - monthlyCategoryRaw.reduce((sum, i) => sum + i.amount, 0))}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
                <Popper open={Boolean(tooltipAnchorEl)} anchorEl={tooltipAnchorEl} placement="right-start">
                   <Paper elevation={3} sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'light' ? theme.palette.grey[50] : theme.palette.grey[800] }}>
                      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>Transaction Details</Typography>
                      <Table size="small" sx={{ minWidth: 200, tableLayout: 'auto' }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {tooltipTxns.map((tx, idx) => {
                            const displayNote = getDisplayNotes(tx.notes);
                            return (
                              <TableRow key={idx}>
                                <TableCell>{format(new Date(tx.date), 'yyyy-MM-dd')}</TableCell>
                                <TableCell>
                                  <Typography noWrap sx={{ fontSize: '0.9rem' }}>
                                    {tx.payee}
                                    {displayNote && (
                                      <Typography component="span" sx={(theme) => ({
                                        fontSize: '0.9rem',
                                        color: theme.palette.mode === 'light' ? '#0288d1' : '#FFA500',
                                        fontWeight: 500,
                                      })}>
                                        {' '}[{displayNote}]
                                      </Typography>
                                    )}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ color: tx.type === 'Expense' ? theme.palette.error.main : theme.palette.success.main }}>
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
               <Paper sx={{ p: 2 }}>
                 <Typography variant="h6" gutterBottom>Budget Alerts</Typography>
                 {overBudgetCategories.length > 0 ? (
                   <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  <Box sx={{ flex: 1, minHeight: 0 }}>
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
                  <Box sx={{ flex: 1 }}>
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
                <TableContainer sx={{ maxHeight: 600, overflow: 'auto' }}>
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
                        <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Category</TableCell>
                        {monthNames.map((monthName, index) => (
                          <TableCell key={index} align="right" sx={{ fontWeight: 'bold', minWidth: 100 }}>
                            {monthName}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ fontWeight: 'bold', minWidth: 100 }}>Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {yearlyCategoryMonthlyData.map((row) => (
                        <TableRow 
                          key={row.category.id} 
                          hover
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell sx={{ fontWeight: 'medium' }}>
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
                            
                            return (
                              <TableCell 
                                key={monthIndex} 
                                align="right" 
                                sx={{ 
                                  color: amount < 0 ? theme.palette.error.main : theme.palette.text.primary,
                                  fontWeight: amount !== 0 ? 'medium' : 'normal',
                                  cursor: amount !== 0 ? 'pointer' : 'default'
                                }}
                                onMouseEnter={(e) => {
                                  if (amount !== 0) {
                                    handleCategoryRowEnter(e, monthTransactions);
                                  }
                                }}
                                onMouseLeave={handleTooltipClose}
                              >
                                {amount !== 0 ? safeFormatCurrency(amount) : '-'}
                              </TableCell>
                            );
                          })}
                          <TableCell align="right" sx={{ 
                            fontWeight: 'bold',
                            color: row.total < 0 ? theme.palette.error.main : theme.palette.text.primary
                          }}>
                            {row.total !== 0 ? safeFormatCurrency(row.total) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow sx={{ backgroundColor: theme.palette.action.selected }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                        {Array.from({ length: 12 }, (_, monthIndex) => {
                          const monthTotal = yearlyCategoryMonthlyData.reduce((sum, row) => 
                            sum + row.monthlyAmounts[monthIndex], 0
                          );
                          return (
                            <TableCell key={monthIndex} align="right" sx={{ 
                              fontWeight: 'bold',
                              color: monthTotal < 0 ? theme.palette.error.main : theme.palette.text.primary
                            }}>
                              {monthTotal !== 0 ? safeFormatCurrency(monthTotal) : '-'}
                            </TableCell>
                          );
                        })}
                        <TableCell align="right" sx={{ 
                          fontWeight: 'bold',
                          color: yearlyBreakdownTotal < 0 ? theme.palette.error.main : theme.palette.text.primary
                        }}>
                          {safeFormatCurrency(yearlyBreakdownTotal)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
                <Popper open={Boolean(tooltipAnchorEl)} anchorEl={tooltipAnchorEl} placement="right-start">
                   <Paper elevation={3} sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'light' ? theme.palette.grey[50] : theme.palette.grey[800] }}>
                      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>Transaction Details</Typography>
                      <Table size="small" sx={{ minWidth: 200, tableLayout: 'auto' }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {tooltipTxns.map((tx, idx) => {
                            const displayNote = getDisplayNotes(tx.notes);
                            return (
                              <TableRow key={idx}>
                                <TableCell>{format(new Date(tx.date), 'yyyy-MM-dd')}</TableCell>
                                <TableCell>
                                  <Typography noWrap sx={{ fontSize: '0.9rem' }}>
                                    {tx.payee}
                                    {displayNote && (
                                      <Typography component="span" sx={(theme) => ({
                                        fontSize: '0.9rem',
                                        color: theme.palette.mode === 'light' ? '#0288d1' : '#FFA500',
                                        fontWeight: 500,
                                      })}>
                                        {' '}[{displayNote}]
                                      </Typography>
                                    )}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ color: tx.type === 'Expense' ? theme.palette.error.main : theme.palette.success.main }}>
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
          </Grid>
        </>
      )}
      {/* Removed extraneous Yearly Category Details outside of tab condition */}
    </Box>
  );
};

export default ReportsPage; 