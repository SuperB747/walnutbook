import React from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Typography,
  IconButton,
  Box,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Budget, Transaction, Category } from '../db';

interface BudgetListProps {
  budgets: Budget[];
  transactions: Transaction[];
  categories: Category[];
  onEditBudget: (budget: Budget) => void;
  onDeleteBudget: (budget: Budget) => void;
  month: string;
}

const BudgetList: React.FC<BudgetListProps> = ({
  budgets,
  transactions,
  categories,
  onEditBudget,
  onDeleteBudget,
  month,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  const getCategoryName = (category_id: number) => {
    return categories.find(c => c.id === category_id)?.name || 'Undefined';
  };

  const calculateSpentAmount = (category_id: number) => {
    // 해당 월의 거래만 필터링
    const monthTransactions = transactions.filter(t => t.date.startsWith(month));
    
    // 해당 카테고리의 지출 계산
    const rawExpenses = monthTransactions
      .filter(t => t.category_id === category_id && t.type === 'Expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    // 해당 카테고리로 향하는 환급 계산
    const reimbursements = monthTransactions
      .filter(t => t.type === 'Income' && t.category_id != null)
      .reduce((sum, t) => {
        const category = categories.find(c => c.id === t.category_id);
        if (category?.is_reimbursement && category.reimbursement_target_category_id === category_id) {
          return sum + t.amount;
        }
        return sum;
      }, 0);
    
    // 순 지출 = 원래 지출 + 환급 (지출은 음수, 환급은 양수이므로 더하기)
    return rawExpenses + reimbursements;
  };

  const getProgressColor = (progress: number) => {
    if (progress > 100) return 'error';
    return 'success';
  };

  return (
    <TableContainer component={Paper} elevation={2}>
      <Table sx={{ 
        tableLayout: 'fixed',
        '& .MuiTableRow-root': {
          '&:hover': {
            backgroundColor: 'transparent'
          },
          '&.Mui-selected': {
            backgroundColor: 'transparent'
          },
          '&.Mui-selected:hover': {
            backgroundColor: 'transparent'
          }
        }
      }}>
        <TableHead>
          <TableRow sx={{ userSelect: 'none' }}>
            <TableCell sx={{ width: 250, minWidth: 250 }}>Category</TableCell>
            <TableCell align="right" sx={{ width: 120, minWidth: 120 }}>Budget</TableCell>
            <TableCell align="right" sx={{ width: 120, minWidth: 120 }}>Spent</TableCell>
            <TableCell align="right" sx={{ width: 120, minWidth: 120 }}>Remaining</TableCell>
            <TableCell align="center" sx={{ minWidth: 0 }}>Progress</TableCell>
            <TableCell align="center" sx={{ width: 130, minWidth: 130 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {budgets
            .sort((a, b) => getCategoryName(a.category_id).localeCompare(getCategoryName(b.category_id)))
            .map((budget) => {
            const spent = Math.abs(calculateSpentAmount(budget.category_id));
            const remaining = budget.amount - spent;
            const hasBudget = budget.amount > 0;
            const progress = hasBudget ? Math.min((spent / budget.amount) * 100, 999) : 0;
            // fillPercent: how much to fill within 0-200% scale
            const fillPercent = hasBudget ? Math.min(progress / 2, 100) : 0;
            // barColor based on actual progress
            const barColor = hasBudget
              ? (progress > 200
                  ? 'error.dark'
                  : progress > 100
                    ? 'error.light'
                    : 'success.main')
              : undefined;

            return (
              <TableRow 
                key={budget.id}
                sx={{ 
                  userSelect: 'none',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)'
                  }
                }}
              >
                <TableCell sx={{ width: 250, minWidth: 250 }}>
                  <Box>
                    <Typography variant="body1" noWrap>{getCategoryName(budget.category_id)}</Typography>
                    {budget.notes && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {budget.notes}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ width: 120, minWidth: 120 }}>{formatCurrency(budget.amount)}</TableCell>
                <TableCell align="right" sx={{ width: 120, minWidth: 120 }}>{formatCurrency(spent)}</TableCell>
                <TableCell align="right" sx={{ width: 120, minWidth: 120 }}>
                  <Typography
                    color={remaining < 0 ? 'error' : 'success'}
                    fontWeight="bold"
                  >
                    {formatCurrency(remaining)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: '100%', mr: 1, position: 'relative', border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                      <LinearProgress
                        variant="determinate"
                        value={fillPercent}
                        sx={{
                          height: 16,
                          borderRadius: 0,
                          bgcolor: 'transparent',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: barColor,
                          }
                        }}
                      />
                      {/* 100% marker line */}
                      <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', bgcolor: 'divider' }} />
                    </Box>
                    <Box sx={{ minWidth: 35 }}>
                      <Typography variant="body2" color="text.secondary">
                        {hasBudget ? Math.round(progress) : 0}%
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell align="right" sx={{ width: 130, minWidth: 130 }}>
                  <IconButton
                    size="small"
                    onClick={() => onEditBudget(budget)}
                    sx={{
                      backgroundColor: 'transparent',
                      color: '#6B7280',
                      '&:hover': {
                        backgroundColor: 'rgba(107, 114, 128, 0.08)',
                        color: '#374151'
                      }
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => onDeleteBudget(budget)}
                    sx={{
                      backgroundColor: 'transparent',
                      color: '#6B7280',
                      '&:hover': {
                        backgroundColor: 'rgba(107, 114, 128, 0.08)',
                        color: '#374151'
                      }
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
          {budgets.length === 0 && (
            <TableRow sx={{ userSelect: 'none' }}>
              <TableCell colSpan={6} align="center">
                <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
                  No budgets set for this month.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default BudgetList; 