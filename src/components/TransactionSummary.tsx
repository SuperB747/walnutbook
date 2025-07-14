import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Divider,
  TextField,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Transaction, TransactionType, Category } from '../db';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import enUS from 'date-fns/locale/en-US';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface TransactionSummaryProps {
  monthTransactions: Transaction[];
  allTransactions: Transaction[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  categories: Category[];
}

// 50가지 지브리 스타일 색상 팔레트 (형광색 없음)
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

const TransactionSummary: React.FC<TransactionSummaryProps> = ({ monthTransactions, allTransactions, selectedMonth, onMonthChange, categories }) => {
  // Transactions for summary and category calculations
  const transactionsToSummarize = monthTransactions;

  // 카테고리 ID 기준으로 고정된 색상 매핑
  const allCategoryIds = useMemo(() => {
    // 실제로 사용된 모든 카테고리 ID를 모으고 정렬
    const ids = new Set<number>();
    allTransactions.forEach(tx => {
      if (tx.category_id != null) ids.add(tx.category_id);
    });
    categories.forEach(cat => {
      if (cat.id != null) ids.add(cat.id);
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [allTransactions, categories]);

  // 카테고리 ID → 색상 인덱스 매핑
  const categoryIdToColor = useMemo(() => {
    const map = new Map<number, string>();
    allCategoryIds.forEach((id, idx) => {
      map.set(id, ghibliColors[idx % ghibliColors.length]);
    });
    return map;
  }, [allCategoryIds]);

  const getCategoryColorById = useCallback((category_id: number | undefined | null) => {
    if (category_id == null) return '#E0E0E0'; // Undefined
    return categoryIdToColor.get(category_id) || '#E0E0E0';
  }, [categoryIdToColor]);

  const getCategoryName = (category_id: number | undefined) => {
    if (!category_id) return 'Undefined';
    return categories.find(c => c.id === category_id)?.name || 'Undefined';
  };

  // Map categories by ID for quick lookup
  const categoryMap = useMemo(() => {
    const map = new Map<number, Category>();
    categories.forEach(c => map.set(c.id, c));
    return map;
  }, [categories]);

  // 수입/지출 합계 계산
  const totals = useMemo(() => {
    const result = { income: 0, expense: 0 };
    const expensesByCategory: Record<number, number> = {};

    // 먼저 지출을 계산
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Expense' && tx.category_id != null) {
        expensesByCategory[tx.category_id] = (expensesByCategory[tx.category_id] || 0) + tx.amount;
      }
    });

    // 순수 수입만 계산 (환급 제외)
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Income') {
        const cat = tx.category_id != null ? categoryMap.get(tx.category_id) : undefined;
        if (!cat?.is_reimbursement) {
          // 순수 수입만 포함
          result.income += tx.amount;
        }
      }
    });

    // 환급 처리 (지출에만 적용)
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Income') {
        const cat = tx.category_id != null ? categoryMap.get(tx.category_id) : undefined;
        if (cat?.is_reimbursement && cat.reimbursement_target_category_id) {
          const targetId = cat.reimbursement_target_category_id;
          // 환급을 해당 카테고리의 지출에 적용
          expensesByCategory[targetId] = (expensesByCategory[targetId] || 0) + tx.amount;
        }
      }
    });

    // 지출 계산 (음수 잔액만 포함)
    result.expense = Object.values(expensesByCategory)
      .filter(amount => amount < 0)
      .reduce((sum, amount) => sum + amount, 0);

    return result;
  }, [transactionsToSummarize, categoryMap]);
  // Total reimbursed (sum of all reimbursement incomes)
  const totalReimbursed = useMemo(() => {
    return transactionsToSummarize
      .filter(tx => tx.type === 'Income' && tx.category_id != null)
      .reduce((sum, tx) => {
        const cat = categoryMap.get(tx.category_id!);
        if (cat?.is_reimbursement) {
          return sum + tx.amount;
        }
        return sum;
      }, 0);
  }, [transactionsToSummarize, categoryMap]);

  // Total raw expenses (before reimbursements), signed
  const totalRawExpenses = useMemo(
    () => transactionsToSummarize.reduce((sum, tx) => tx.type === 'Expense' ? sum + tx.amount : sum, 0),
    [transactionsToSummarize]
  );

  // 카테고리별 지출 계산 (리임버스먼트 적용)
  const categoryExpenses = useMemo(() => {
    const expensesByCategory: Record<number, number> = {};

    // 먼저 지출을 계산
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Expense') {
        const id = tx.category_id ?? -1;
        expensesByCategory[id] = (expensesByCategory[id] || 0) + tx.amount;
      }
    });

    // 환급 처리 - expense를 초과하는 경우 0으로 설정
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Income') {
        const cat = tx.category_id != null ? categoryMap.get(tx.category_id) : undefined;
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

    // 음수인 카테고리만 필터링하고 정렬 (절대값이 큰 순)
    const filteredAndSorted = Object.entries(expensesByCategory)
      .filter(([, amount]) => amount < 0)
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));



    return {
      labels: filteredAndSorted.map(([id]) => Number(id)),
      data: filteredAndSorted.map(([, v]) => v)
    };
  }, [transactionsToSummarize, categoryMap]);

  // labelsForDisplay: id 배열을 이름 배열로 변환
  const labelsForDisplay = useMemo(() => {
    return categoryExpenses.labels.map(id => id === -1 ? 'Undefined' : getCategoryName(id));
  }, [categoryExpenses.labels, categories]);

  // 월별 트렌드 계산: Total Income과 Net Expense
  const monthlyTrends = useMemo(() => {
    if (!allTransactions.length) return { labels: [], income: [], expense: [] };
    // group transactions by year-month
    const monthMap = new Map<string, Transaction[]>();
    allTransactions.forEach(tx => {
      if (!tx.date) return;
      const key = tx.date.slice(0, 7);
      if (!monthMap.has(key)) monthMap.set(key, []);
      monthMap.get(key)!.push(tx);
    });
    const monthKeys = Array.from(monthMap.keys()).sort();
    const labels = monthKeys.map(k => {
      const [y, m] = k.split('-').map(Number);
      return format(new Date(y, m - 1), 'MMM yyyy');
    });
    const incomeData: number[] = [];
    const expenseData: number[] = [];
    monthKeys.forEach(key => {
      const txns = monthMap.get(key)!;
      
      // Total Income: 순수 수입만 (환급 제외)
      const totalIncome = txns
        .filter(t => t.type === 'Income' && !(categoryMap.get(t.category_id ?? -1)?.is_reimbursement))
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Total Raw Expenses: 순수 지출만 (환급 적용 전)
      const rawExpenses = txns
        .filter(t => t.type === 'Expense')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      // Total Reimbursed: 모든 환급
      const totalReimbursed = txns
        .filter(t => t.type === 'Income' && categoryMap.get(t.category_id ?? -1)?.is_reimbursement)
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Net Expense: 순수 지출 - 환급 (환급으로 지출을 상쇄)
      const netExpense = rawExpenses - totalReimbursed;
      
      incomeData.push(totalIncome);
      expenseData.push(netExpense);
    });
    return { labels, income: incomeData, expense: expenseData };
  }, [allTransactions, categoryMap]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  // 카테고리별 퍼센테이지 계산
  const categoryPercentages = useMemo(() => {
    // 절대값의 합계를 계산
    const totalExpense = categoryExpenses.data.reduce((sum, amount) => sum + Math.abs(amount), 0);
    if (totalExpense === 0) return {};
    
    const percentages: Record<string, number> = {};
    categoryExpenses.labels.forEach((id, index) => {
      if (id !== null) {
        const amount = Math.abs(categoryExpenses.data[index]);
        percentages[labelsForDisplay[index]] = (amount / totalExpense) * 100;
      }
    });
    
    return percentages;
  }, [categoryExpenses, labelsForDisplay]);

  function calculateSummary(transactionsToSummarize: Transaction[]): { income: number; expense: number; balance: number; categories: { [key: number]: number } } {
    // 먼저 reimbursement 매핑을 계산
    const expenseReimbursements: { [key: number]: number } = {};
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Income') {
        const cat = tx.category_id != null ? categoryMap.get(tx.category_id) : undefined;
        if (cat?.is_reimbursement && cat.reimbursement_target_category_id) {
          expenseReimbursements[cat.reimbursement_target_category_id] = 
            (expenseReimbursements[cat.reimbursement_target_category_id] || 0) + tx.amount;
        }
      }
    });

    const summary = {
      income: 0,
      expense: 0,
      balance: 0,
      categories: {} as { [key: number]: number }
    };

    // 먼저 reimbursement 수입을 계산 (총 수입에는 포함하지 않음)
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Income') {
        const cat = tx.category_id != null ? categoryMap.get(tx.category_id) : undefined;
        if (cat?.is_reimbursement && cat.reimbursement_target_category_id) {
          // Reimbursement는 총 수입에 포함하지 않음
          // 타겟 카테고리의 지출을 상쇄하는 용도로만 사용
        }
      }
    });

    // 지출 계산 (reimbursement 차감)
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Expense') {
        // 지출은 음수로 저장되어 있음
        const reimbursement = tx.category_id ? expenseReimbursements[tx.category_id] || 0 : 0;
        const amount = tx.amount; // 이미 음수로 저장되어 있음
        const netAmount = amount + reimbursement; // reimbursement 더함 (빚을 갚음)
        summary.expense += netAmount;
        summary.balance += netAmount;
        if (tx.category_id) {
          summary.categories[tx.category_id] = (summary.categories[tx.category_id] || 0) + netAmount;
        }
      }
    });

    // 나머지 수입 계산 (reimbursement 제외)
    transactionsToSummarize.forEach(tx => {
      if (tx.type === 'Income') {
        const cat = tx.category_id != null ? categoryMap.get(tx.category_id) : undefined;
        if (!cat?.is_reimbursement) {
          const amount = tx.amount;
          summary.income += amount;
          summary.balance += amount;
          if (tx.category_id) {
            summary.categories[tx.category_id] = (summary.categories[tx.category_id] || 0) + amount;
          }
        }
      }
    });

    return summary;
  }

  function calculateMonthSummaries(allTransactions: Transaction[]): Map<string, { income: number; expense: number; balance: number }> {
    const monthSummaries = new Map<string, { income: number; expense: number; balance: number }>();

    // 먼저 reimbursement 매핑을 계산
    const monthReimbursements: { [key: string]: { [key: number]: number } } = {};
    allTransactions
      .filter(tx => tx.date && typeof tx.date === 'string') // Filter out transactions with invalid dates
      .forEach(tx => {
        // Parse date string to avoid timezone issues
        // tx.date is in YYYY-MM-DD format, parse it safely
        const [year, month, day] = tx.date.split('-').map(Number);
        const txDate = new Date(year, month - 1, day); // month is 0-based in JavaScript
      
      // 날짜만 사용하여 월 키 생성 (시간대 문제 해결)
      const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
      if (tx.type === 'Income') {
        const cat = tx.category_id != null ? categoryMap.get(tx.category_id) : undefined;
        if (cat?.is_reimbursement && cat.reimbursement_target_category_id) {
          if (!monthReimbursements[monthKey]) {
            monthReimbursements[monthKey] = {};
          }
          if (cat.reimbursement_target_category_id) {
            monthReimbursements[monthKey][cat.reimbursement_target_category_id] = 
              (monthReimbursements[monthKey][cat.reimbursement_target_category_id] || 0) + tx.amount;
          }
        }
      }
    });

    // 각 월별로 수입/지출 계산
    allTransactions
      .filter(tx => tx.date && typeof tx.date === 'string') // Filter out transactions with invalid dates
      .forEach(tx => {
        // Parse date string to avoid timezone issues
        // tx.date is in YYYY-MM-DD format, parse it safely
        const [year, month, day] = tx.date.split('-').map(Number);
        const txDate = new Date(year, month - 1, day); // month is 0-based in JavaScript
      
      // 날짜만 사용하여 월 키 생성 (시간대 문제 해결)
      const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthSummaries.has(monthKey)) {
        monthSummaries.set(monthKey, { income: 0, expense: 0, balance: 0 });
      }
      const summary = monthSummaries.get(monthKey)!;

      if (tx.type === 'Adjust' || tx.type === 'Transfer') {
        return;
      }

      const cat = tx.category_id != null ? categoryMap.get(tx.category_id) : undefined;
      if (tx.type === 'Income') {
        if (!cat?.is_reimbursement) {
          // 일반 수입은 양수 (reimbursement는 총 수입에 포함하지 않음)
          summary.income += tx.amount;
          summary.balance += tx.amount;
        }
      } else if (tx.type === 'Expense') {
        // 지출은 음수로 저장되어 있음
        const reimbursement = tx.category_id && monthReimbursements[monthKey] ? 
          monthReimbursements[monthKey][tx.category_id] || 0 : 0;
        const amount = tx.amount; // 이미 음수로 저장되어 있음
        const netAmount = amount + reimbursement; // reimbursement 더함 (빚을 갚음)
        summary.expense += netAmount;
        summary.balance += netAmount;
      }
    });

    return monthSummaries;
  }

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
  const [year, setYear] = React.useState(selectedMonth.slice(0, 4));
  const [month, setMonth] = React.useState(selectedMonth.slice(5, 7));
  React.useEffect(() => {
    setYear(selectedMonth.slice(0, 4));
    setMonth(selectedMonth.slice(5, 7));
  }, [selectedMonth]);
  const handleMonthChange = (newYear: string, newMonth: string) => {
    onMonthChange(`${newYear}-${newMonth}`);
  };

  // 범례 분할 (퍼센테이지 순으로 정렬)
  const sortedLabels = useMemo(() => {
    const result = categoryExpenses.labels
      .map((id, index) => ({
        id,
        amount: Math.abs(categoryExpenses.data[index]),
        percentage: categoryPercentages[labelsForDisplay[index]] || 0
      }))
      .filter(item => item.amount > 0 && item.id !== -1)
      .sort((a, b) => b.percentage - a.percentage) // 퍼센테이지 순으로 정렬
      .map(item => item.id);
    
    return result;
  }, [categoryExpenses, categoryPercentages, labelsForDisplay]);

  const mid = Math.ceil(sortedLabels.length / 2);
  const leftLegend = sortedLabels.slice(0, mid);
  const rightLegend = sortedLabels.slice(mid);

  // 차트 ref
  const doughnutRef = useRef<any>(null);

  // 범례 hover 핸들러
  const handleLegendHover = (label: string) => {
    const chart = doughnutRef.current;
    if (!chart) return;

    // donutChartData의 labels 배열에서 해당 라벨의 인덱스를 찾습니다
    const idx = donutChartData.labels.indexOf(label);
    if (idx === -1) return;

    // Chart.js v3+ API
    chart.setActiveElements([
      { datasetIndex: 0, index: idx }
    ]);
    chart.tooltip.setActiveElements([
      { datasetIndex: 0, index: idx }
    ], {x: 0, y: 0});
    chart.update();
  };
  const handleLegendLeave = () => {
    const chart = doughnutRef.current;
    if (!chart) return;
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], {x: 0, y: 0});
    chart.update();
  };

  // Chart.js 전역 설정 추가
  useEffect(() => {
    // Chart.js 전역 설정
    ChartJS.defaults.plugins.tooltip.enabled = true;
    ChartJS.defaults.responsive = true;
    ChartJS.defaults.maintainAspectRatio = true;
    
    return () => {
      // 컴포넌트 언마운트 시 기본값 복원
      ChartJS.defaults.plugins.tooltip.enabled = true;
      ChartJS.defaults.responsive = true;
      ChartJS.defaults.maintainAspectRatio = true;
    };
  }, []);

  const legendItemStyle = {
    display: 'flex', alignItems: 'center', mb: 0.5, cursor: 'pointer', p: 0.5, borderRadius: 1,
    transition: 'all 0.2s ease', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.05)', transform: 'scale(1.02)' }
  };

  const renderLegendItems = (legendIds: number[]) =>
    legendIds.map(id => {
      const idx = categoryExpenses.labels.indexOf(id);
      const label = labelsForDisplay[idx];
      return (
        <Box key={id} sx={legendItemStyle} onMouseEnter={() => handleLegendHover(label)} onMouseLeave={handleLegendLeave}>
          <Box sx={{ width: 10, height: 10, bgcolor: getCategoryColorById(id), mr: 1, borderRadius: '2px', flexShrink: 0 }} />
          <Typography variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.2 }}>{label}</Typography>
        </Box>
      );
    });

  const donutChartData = useMemo(() => {
    // filter out undefined category (id -1)
    const items = categoryExpenses.labels.map((id, idx) => ({
      id,
      label: labelsForDisplay[idx],
      value: Math.abs(categoryExpenses.data[idx]),
    })).filter(item => item.id !== -1);
    

    
    return {
      labels: items.map(item => item.label),
      datasets: [
        {
          data: items.map(item => item.value),
          backgroundColor: items.map(item => getCategoryColorById(item.id)),
        },
      ],
    };
  }, [labelsForDisplay, categoryExpenses, getCategoryColorById]);

  const donutChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    layout: { padding: 0 },
    hover: { mode: 'nearest' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        position: 'nearest' as const,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: function(context: any[]) {
            const item = context[0];
            const label = item.label || '';
            const percentage = categoryPercentages[label]?.toFixed(1) || '0.0';
            return `${label} (${percentage}%)`;
          },
          label: function(context: any) {
            const rawValue = context.parsed as number;
            return `  ${formatCurrency(Math.abs(rawValue))}`;
          }
        }
      }
    }
  }), [labelsForDisplay, categoryPercentages, categoryExpenses, formatCurrency]);

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={3}>
        {/* 총계 */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Summary
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Select
                value={year}
                size="small"
                onChange={e => {
                  setYear(e.target.value);
                  handleMonthChange(e.target.value, month);
                }}
                sx={{ 
                  width: 90,
                  '& .MuiOutlinedInput-notchedOutline': {
                    border: 'none'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    border: 'none'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    border: 'none'
                  },
                  backgroundColor: 'transparent',
                  '& .MuiSelect-icon': {
                    color: 'text.secondary'
                  }
                }}
              >
                {years.map(y => (
                  <MenuItem key={y} value={String(y)}>{y}</MenuItem>
                ))}
              </Select>
              <Select
                value={month}
                size="small"
                onChange={e => {
                  setMonth(e.target.value);
                  handleMonthChange(year, e.target.value);
                }}
                sx={{ 
                  width: 120,
                  '& .MuiOutlinedInput-notchedOutline': {
                    border: 'none'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    border: 'none'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    border: 'none'
                  },
                  backgroundColor: 'transparent',
                  '& .MuiSelect-icon': {
                    color: 'text.secondary'
                  }
                }}
              >
                {months.map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="subtitle1" color="success.main">
                Total Income: {formatCurrency(totals.income)}
              </Typography>
              <Typography variant="subtitle1" color="error.main">
                Total Expenses: {formatCurrency(totalRawExpenses)}
              </Typography>
              <Typography variant="subtitle1" color="info.main">
                Total Reimbursed: {formatCurrency(totalReimbursed)}
              </Typography>
              <Typography variant="subtitle1" color="warning.main">
                (Net Expenses: {formatCurrency(totalRawExpenses + totalReimbursed)})
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography
                variant="subtitle1"
                fontWeight="bold"
                color={(totals.income + totalRawExpenses + totalReimbursed) >= 0 ? 'success.main' : 'error.main'}
              >
                Net: {formatCurrency(totals.income + totalRawExpenses + totalReimbursed)}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* 카테고리별 지출 */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Expenses by Category
            </Typography>
            {donutChartData.labels.length > 0 ? (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: 1,
                '& canvas': {
                  touchAction: 'none !important',
                  userSelect: 'none'
                }
              }}>
                {/* 왼쪽 범례 */}
                <Box sx={{ minWidth: 100, maxWidth: 120 }}>
                  {renderLegendItems(leftLegend)}
                </Box>
                {/* 도넛 그래프 */}
                <Box sx={{ width: 180, height: 180, flexShrink: 0 }}>
                  <Doughnut ref={doughnutRef} data={donutChartData} options={donutChartOptions} />
                </Box>
                {/* 오른쪽 범례 */}
                <Box sx={{ minWidth: 100, maxWidth: 120 }}>
                  {renderLegendItems(rightLegend)}
                </Box>
              </Box>
            ) : (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: 180,
                color: 'text.secondary'
              }}>
                <Typography variant="body2">
                  No expense data available for this month
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* 월별 트렌드 */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Monthly Trends
            </Typography>
            <Box sx={{ 
              height: 200,
              width: '100%',
              overflow: 'hidden',
              '& canvas': {
                touchAction: 'none !important',
                userSelect: 'none',
                maxWidth: '100% !important'
              }
            }}>
              <Bar
                data={{
                  labels: monthlyTrends.labels,
                  datasets: [
                    {
                      label: 'Total Income',
                      data: monthlyTrends.income.map(value => Math.abs(value)),
                      backgroundColor: 'rgba(134, 239, 172, 0.6)',
                      borderColor: 'rgb(34, 197, 94)',
                      borderWidth: 1
                    },
                    {
                      label: 'Net Expense',
                      data: monthlyTrends.expense.map(value => Math.abs(value)),
                      backgroundColor: 'rgba(252, 165, 165, 0.6)',
                      borderColor: 'rgb(239, 68, 68)',
                      borderWidth: 1
                    }
                  ]
                }}
                                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  layout: { 
                    padding: { 
                      top: 10, 
                      right: 20, 
                      bottom: 10, 
                      left: 10 
                    } 
                  },
                  hover: {
                    mode: 'nearest',
                    intersect: false
                  },
                  scales: { 
                    x: { 
                      stacked: false,
                      ticks: {
                        maxRotation: 0,
                        minRotation: 0
                      },
                      grid: {
                        display: false
                      }
                    }, 
                    y: { 
                      stacked: false, 
                      beginAtZero: true,
                      ticks: {
                        callback: function(value) {
                          return formatCurrency(value as number);
                        }
                      },
                      grid: {
                        color: 'rgba(0,0,0,0.1)'
                      }
                    } 
                  },
                  plugins: {
                    legend: { 
                      display: true, 
                      position: 'top' as const 
                    },
                    tooltip: {
                      enabled: true,
                      position: 'nearest',
                      callbacks: {
                        label: function(context) {
                          return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                        }
                      }
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TransactionSummary; 