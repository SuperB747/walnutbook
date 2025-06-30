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
import { Transaction } from '../db';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';

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
        // Subtract reimbursements from corresponding categories
        if (transaction.category === 'Grocery') {
          amount = Math.max(0, amount - reimbursements.grocery);
          reimbursements.grocery = Math.max(0, reimbursements.grocery - transaction.amount);
        } else if (transaction.category === 'Utility') {
          amount = Math.max(0, amount - reimbursements.utility);
          reimbursements.utility = Math.max(0, reimbursements.utility - transaction.amount);
        } else if (transaction.category === 'Exercise') {
          amount = Math.max(0, amount - reimbursements.exercise);
          reimbursements.exercise = Math.max(0, reimbursements.exercise - transaction.amount);
        }
        
        if (amount > 0) {
          acc[transaction.category] = (acc[transaction.category] || 0) + amount;
        }
        return acc;
      }, {} as Record<string, number>);

    // 상위 5개 카테고리 선택 (나머지는 '기타'로 통합)
    const sortedCategories = Object.entries(expenses)
      .sort(([, a], [, b]) => b - a);
    
    const top5 = sortedCategories.slice(0, 5);
    const others = sortedCategories.slice(5).reduce((sum, [, amount]) => sum + amount, 0);

    return {
      labels: [...top5.map(([category]) => category), others > 0 ? 'Others' : null].filter(Boolean),
      data: [...top5.map(([, amount]) => amount), others > 0 ? others : null].filter(Boolean),
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
              <TextField
                label="Month"
                type="month"
                value={selectedMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: 120 }}
              />
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
                      backgroundColor: [
                        '#FF6384',
                        '#36A2EB',
                        '#FFCE56',
                        '#4BC0C0',
                        '#9966FF',
                        '#C9CBCF',
                      ],
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