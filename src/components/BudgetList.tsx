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
import { Budget, Transaction } from '../db';

interface BudgetListProps {
  budgets: Budget[];
  transactions: Transaction[];
  onEditBudget: (budget: Budget) => void;
  onDeleteBudget: (budget: Budget) => void;
  month: string;
}

const BudgetList: React.FC<BudgetListProps> = ({
  budgets,
  transactions,
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

  const calculateSpentAmount = (category: string) => {
    return transactions
      .filter(
        (t) =>
          t.category === category &&
          t.type === 'expense' &&
          t.date.startsWith(month)
      )
      .reduce((sum, t) => sum + t.amount, 0);
  };

  const getProgressColor = (spent: number, budgeted: number) => {
    const ratio = spent / budgeted;
    if (ratio >= 1) return 'error';
    if (ratio >= 0.8) return 'warning';
    return 'primary';
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
            .sort((a, b) => a.category.localeCompare(b.category))
            .map((budget) => {
            const spent = calculateSpentAmount(budget.category);
            const remaining = budget.amount - spent;
            const progress = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

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
                    <Typography variant="body1" noWrap>{budget.category}</Typography>
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
                    <Box sx={{ width: '100%', mr: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(progress, 100)}
                        color={getProgressColor(spent, budget.amount)}
                      />
                    </Box>
                    <Box sx={{ minWidth: 35 }}>
                      <Typography variant="body2" color="text.secondary">
                        {Math.round(progress)}%
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