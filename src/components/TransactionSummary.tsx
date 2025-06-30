import React, { useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Divider,
  TextField,
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
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
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

const TransactionSummary: React.FC<TransactionSummaryProps> = ({ monthTransactions, allTransactions, selectedMonth, onMonthChange }) => {
  // Transactions for summary and category calculations
  const transactionsToSummarize = monthTransactions;

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
    const reimbursements = {
      grocery: 0,
      utility: 0,
      exercise: 0
    };

    // First pass: calculate reimbursements
    transactionsToSummarize.forEach(transaction => {
      if (transaction.type === 'income') {
        if (transaction.category === 'Reimbursement [G]') {
          reimbursements.grocery += transaction.amount;
        } else if (transaction.category === 'Reimbursement [U]') {
          reimbursements.utility += transaction.amount;
        } else if (transaction.category === 'Reimbursement [E]') {
          reimbursements.exercise += transaction.amount;
        }
      }
    });

    // Second pass: calculate expenses with reimbursements subtracted
    const expenses = transactionsToSummarize
      .filter(t => t.type === 'expense')
      .reduce((acc, transaction) => {
        let amount = transaction.amount;
        const category = transaction.category || 'Uncategorized';
        
        // Subtract reimbursements from corresponding categories
        if (category === 'Grocery') {
          amount = Math.max(0, amount - reimbursements.grocery);
          reimbursements.grocery = Math.max(0, reimbursements.grocery - transaction.amount);
        } else if (category === 'Utility') {
          amount = Math.max(0, amount - reimbursements.utility);
          reimbursements.utility = Math.max(0, reimbursements.utility - transaction.amount);
        } else if (category === 'Exercise') {
          amount = Math.max(0, amount - reimbursements.exercise);
          reimbursements.exercise = Math.max(0, reimbursements.exercise - transaction.amount);
        }
        
        if (amount > 0) {
          acc[category] = (acc[category] || 0) + amount;
        }
        return acc;
      }, {} as Record<string, number>);

    // 상위 6개 카테고리 선택 (나머지는 'Others'로 통합)
    const sortedCategories = Object.entries(expenses)
      .sort(([, a], [, b]) => b - a);
    
    const top6 = sortedCategories.slice(0, 6);
    const others = sortedCategories.slice(6).reduce((sum, [, amount]) => sum + amount, 0);

    return {
      labels: [...top6.map(([category]) => category), others > 0 ? 'Others' : null].filter(Boolean),
      data: [...top6.map(([, amount]) => amount), others > 0 ? others : null].filter(Boolean),
    };
  }, [transactionsToSummarize]);

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

  // 카테고리별 색상 매핑
  const getCategoryColor = (category: string): string => {
    const colorMap: Record<string, string> = {
      'Food & Dining': '#FF6384',
      'Housing': '#36A2EB', 
      'Transportation': '#FFCE56',
      'Shopping': '#4BC0C0',
      'Entertainment': '#9966FF',
      'Healthcare': '#FF9F40',
      'Education': '#FF6384',
      'Insurance': '#36A2EB',
      'Utilities': '#FFCE56',
      'Other': '#C9CBCF',
      'Salary': '#4BC0C0',
      'Business Income': '#9966FF',
      'Investment': '#FF9F40',
      'Reimbursement [G]': '#FF6384',
      'Reimbursement [U]': '#FFCE56',
      'Reimbursement [E]': '#4BC0C0',
      'Grocery': '#FF6384',
      'Utility': '#FFCE56',
      'Exercise': '#4BC0C0',
      'Add': '#4BC0C0',
      'Subtract': '#FF6384',
      'Transfer In': '#36A2EB',
      'Transfer Out': '#9966FF',
      'Uncategorized': '#C9CBCF',
    };
    
    return colorMap[category] || '#C9CBCF'; // 기본값은 회색
  };

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

  return (
    <Box sx={{ mb: 2 }}>
      <Grid container spacing={3}>
        {/* 총계 */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6" gutterBottom>
                Summary
              </Typography>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enUS}>
                <DatePicker
                  views={['year', 'month']}
                  label="Month"
                  minDate={new Date('2000-01-01')}
                  maxDate={new Date('2100-12-31')}
                  value={selectedMonth ? new Date(selectedMonth + '-01') : null}
                  onChange={(date) => {
                    if (date) onMonthChange(format(date, 'yyyy-MM'));
                  }}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: { width: 160 }
                    }
                  }}
                />
              </LocalizationProvider>
            </Box>
            <Box sx={{ mt: 2 }}>
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
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Expenses by Category
            </Typography>
            <Box sx={{ height: 200, display: 'flex', justifyContent: 'center' }}>
              <Doughnut
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
                    legend: {
                      position: 'bottom',
                      labels: {
                        boxWidth: 12,
                      },
                    },
                  },
                }}
              />
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
                      data: monthlyTrends.expense,
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