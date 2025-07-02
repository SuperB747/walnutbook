import React, { useMemo, useCallback, useRef } from 'react';
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
import { Transaction, TransactionType } from '../db';
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

const TransactionSummary: React.FC<TransactionSummaryProps> = ({ monthTransactions, allTransactions, selectedMonth, onMonthChange }) => {
  // Transactions for summary and category calculations
  const transactionsToSummarize = monthTransactions;

  // 전체 카테고리 목록을 추출하여 고정된 색상 매핑 생성
  const allCategories = useMemo(() => {
    const categories = new Set<string>();
    allTransactions.forEach(transaction => {
      if (transaction.category) {
        categories.add(transaction.category);
      }
    });
    // Uncategorized를 명시적으로 추가
    categories.add('Uncategorized');
    return Array.from(categories).sort();
  }, [allTransactions]);

  // 카테고리별 고유 색상 함수
  const getCategoryColor = useCallback((category: string) => {
    // Uncategorized는 밝은 회색으로 고정
    if (category === 'Uncategorized') {
      return '#E0E0E0';
    }
    const idx = allCategories.indexOf(category);
    return ghibliColors[idx % ghibliColors.length];
  }, [allCategories]);

  // 수입/지출 합계 계산
  const totals = useMemo(() => {
    const reimbursements = {
      grocery: 0,
      utility: 0,
      exercise: 0
    };

    return transactionsToSummarize.reduce(
      (acc, transaction) => {
        if (transaction.type === 'income') {
          // Handle reimbursements specially
          if (transaction.category === 'Reimbursement [G]') {
            reimbursements.grocery += transaction.amount;
          } else if (transaction.category === 'Reimbursement [U]') {
            reimbursements.utility += transaction.amount;
          } else if (transaction.category === 'Reimbursement [E]') {
            reimbursements.exercise += transaction.amount;
          }
          acc.income += transaction.amount;
        } else if (transaction.type === 'expense') {
          acc.expense += transaction.amount;
        }
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [transactionsToSummarize]);

  // 카테고리별 지출 계산
  const categoryExpenses = useMemo(() => {
    // 선택된 월의 expense 거래만 필터링
    const monthExpenses = transactionsToSummarize.filter(t => t.type === 'expense');
    
    console.log('Selected month:', selectedMonth);
    console.log('Month expenses:', monthExpenses);
    
    // 카테고리별 지출 합계 계산
    const expensesByCategory = monthExpenses.reduce((acc, transaction) => {
      const category = transaction.category && transaction.category.trim() !== '' ? transaction.category : 'Uncategorized';
      console.log(`Processing transaction: category="${transaction.category}" -> normalized="${category}"`);
      acc[category] = (acc[category] || 0) + transaction.amount;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('Expenses by category:', expensesByCategory);
    console.log('All categories found:', Object.keys(expensesByCategory));
    
    // 금액 순으로 정렬
    const sortedCategories = Object.entries(expensesByCategory)
      .sort(([, a], [, b]) => b - a);

    return {
      labels: sortedCategories.map(([category]) => category),
      data: sortedCategories.map(([, amount]) => amount),
    };
  }, [transactionsToSummarize, selectedMonth]);

  // 월별 트렌드 계산
  const monthlyTrends = useMemo(() => {
    // Use all transactions for trends
    const last6Months = eachMonthOfInterval({
      start: startOfMonth(subMonths(new Date(), 5)),
      end: endOfMonth(new Date()),
    });

    const monthlyData = last6Months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      return allTransactions.reduce(
        (acc, transaction) => {
          const transactionDate = new Date(transaction.date);
          if (transactionDate >= monthStart && transactionDate <= monthEnd) {
            // Skip adjust and transfer type transactions for monthly trends
            if (transaction.type === 'adjust' || transaction.type === 'transfer') {
              return acc;
            }
            
            if (transaction.type === 'income') {
              acc.income += transaction.amount;
            } else if (transaction.type === 'expense') {
              acc.expense += transaction.amount;
            }
          }
          return acc;
        },
        { income: 0, expense: 0 }
      );
    });

    return {
      labels: last6Months.map(month => format(month, 'MMM yyyy')),
      income: monthlyData.map(data => data.income),
      expense: monthlyData.map(data => data.expense),
    };
  }, [allTransactions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  // 카테고리별 퍼센테이지 계산
  const categoryPercentages = useMemo(() => {
    const totalExpense = Math.abs(categoryExpenses.data.reduce((sum, amount) => sum + amount, 0));
    if (totalExpense === 0) return {};
    
    const percentages: Record<string, number> = {};
    categoryExpenses.labels.forEach((label, index) => {
      if (label) {
        const amount = Math.abs(categoryExpenses.data[index]);
        percentages[label] = (amount / totalExpense) * 100;
      }
    });
    
    return percentages;
  }, [categoryExpenses]);

  const calculateSummary = () => {
    const summary = {
      income: 0,
      expense: 0,
      balance: 0,
      categories: {} as Record<string, number>,
    };

    transactionsToSummarize.forEach((transaction) => {
      // Skip adjust and transfer type transactions for monthly summary
      if (transaction.type === 'adjust' || transaction.type === 'transfer' as TransactionType) {
        return;
      }

      if (transaction.type === 'income') {
        summary.income += transaction.amount;
        summary.balance += transaction.amount;
      } else if (transaction.type === 'expense') {
        summary.expense += transaction.amount;
        summary.balance -= transaction.amount;
      }

      // Update category totals
      if (transaction.category) {
        if (!summary.categories[transaction.category]) {
          summary.categories[transaction.category] = 0;
        }
        summary.categories[transaction.category] += 
          transaction.type === 'income' ? transaction.amount : -transaction.amount;
      }
    });

    return summary;
  };

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
      .map((label, index) => ({
        label,
        percentage: categoryPercentages[label] || 0,
        amount: categoryExpenses.data[index]
      }))
      .filter(item => item.label !== null)
      .sort((a, b) => b.percentage - a.percentage)
      .map(item => item.label as string);
    
    console.log('Sorted labels for legend:', result);
    return result;
  }, [categoryExpenses, categoryPercentages]);

  const mid = Math.ceil(sortedLabels.length / 2);
  const leftLegend = sortedLabels.slice(0, mid);
  const rightLegend = sortedLabels.slice(mid);

  // 차트 ref
  const doughnutRef = useRef<any>(null);

  // 범례 hover 핸들러
  const handleLegendHover = (label: string) => {
    const chart = doughnutRef.current;
    if (!chart) return;
    const idx = categoryExpenses.labels.indexOf(label);
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

  return (
    <Box sx={{ mb: 2 }}>
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
                Total Expenses: {formatCurrency(totals.expense)}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" fontWeight="bold">
                Net: {formatCurrency(totals.income - totals.expense)}
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
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
              {/* 왼쪽 범례 */}
              <Box sx={{ minWidth: 100, maxWidth: 120 }}>
                {leftLegend.map((label) => (
                  <Box 
                    key={label} 
                    sx={{ display: 'flex', alignItems: 'center', mb: 0.5, cursor: 'pointer' }}
                    onMouseEnter={() => handleLegendHover(label)}
                    onMouseLeave={handleLegendLeave}
                  >
                    <Box sx={{ width: 10, height: 10, bgcolor: getCategoryColor(label), mr: 1, borderRadius: '2px', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.2 }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
              {/* 도넛 그래프 */}
              <Box sx={{ width: 180, height: 180, flexShrink: 0 }}>
                <Doughnut
                  ref={doughnutRef}
                  data={{
                    labels: categoryExpenses.labels,
                    datasets: [
                      {
                        data: categoryExpenses.data,
                        backgroundColor: categoryExpenses.labels
                          .filter((label): label is string => label !== null)
                          .map(label => getCategoryColor(label)),
                      },
                    ],
                  }}
                  options={{
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          title: function(context) {
                            const label = context[0].label || '';
                            const percentage = categoryPercentages[label]?.toFixed(1) || '0.0';
                            return `${label} (${percentage}%)`;
                          },
                          label: function(context) {
                            const value = context.parsed;
                            return `  ${formatCurrency(Math.abs(value))}`;
                          }
                        }
                      }
                    },
                  }}
                />
              </Box>
              {/* 오른쪽 범례 */}
              <Box sx={{ minWidth: 100, maxWidth: 120 }}>
                {rightLegend.map((label) => (
                  <Box 
                    key={label} 
                    sx={{ display: 'flex', alignItems: 'center', mb: 0.5, cursor: 'pointer' }}
                    onMouseEnter={() => handleLegendHover(label)}
                    onMouseLeave={handleLegendLeave}
                  >
                    <Box sx={{ width: 10, height: 10, bgcolor: getCategoryColor(label), mr: 1, borderRadius: '2px', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.2 }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* 월별 트렌드 */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Monthly Trends
            </Typography>
            <Box sx={{ height: 200 }}>
              <Bar
                data={{
                  labels: monthlyTrends.labels,
                  datasets: [
                    {
                      label: 'Income',
                      data: monthlyTrends.income,
                      backgroundColor: 'rgba(75, 192, 192, 0.5)',
                      borderColor: 'rgb(75, 192, 192)',
                      borderWidth: 1,
                    },
                    {
                      label: 'Expenses',
                      data: monthlyTrends.expense.map(e => Math.abs(e)),
                      backgroundColor: 'rgba(255, 99, 132, 0.5)',
                      borderColor: 'rgb(255, 99, 132)',
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: {
                      stacked: false,
                    },
                    y: {
                      stacked: false,
                      beginAtZero: true,
                    },
                  },
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