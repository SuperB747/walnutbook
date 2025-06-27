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
import { Edit as EditIcon } from '@mui/icons-material';
import { Budget, Transaction } from '../db';

interface BudgetListProps {
  budgets: Budget[];
  transactions: Transaction[];
  onEditBudget: (budget: Budget) => void;
  month: string;
}

const BudgetList: React.FC<BudgetListProps> = ({
  budgets,
  transactions,
  onEditBudget,
  month,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
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
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>카테고리</TableCell>
            <TableCell align="right">예산</TableCell>
            <TableCell align="right">지출</TableCell>
            <TableCell align="right">남은 금액</TableCell>
            <TableCell>진행률</TableCell>
            <TableCell align="right">작업</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {budgets.map((budget) => {
            const spent = calculateSpentAmount(budget.category);
            const remaining = budget.amount - spent;
            const progress = (spent / budget.amount) * 100;

            return (
              <TableRow key={budget.id}>
                <TableCell>
                  <Box>
                    <Typography variant="body1">{budget.category}</Typography>
                    {budget.notes && (
                      <Typography variant="caption" color="text.secondary">
                        {budget.notes}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">{formatCurrency(budget.amount)}</TableCell>
                <TableCell align="right">{formatCurrency(spent)}</TableCell>
                <TableCell align="right">
                  <Typography
                    color={remaining < 0 ? 'error' : 'success'}
                    fontWeight="bold"
                  >
                    {formatCurrency(remaining)}
                  </Typography>
                </TableCell>
                <TableCell>
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
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => onEditBudget(budget)}
                  >
                    <EditIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
          {budgets.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} align="center">
                <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
                  설정된 예산이 없습니다.
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