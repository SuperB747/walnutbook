import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Button,
  Snackbar,
  Alert,
  Card,
  CardContent,
  Typography,
  Grid,
  LinearProgress,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ko } from 'date-fns/locale';
import BudgetList from './BudgetList';
import BudgetForm from './BudgetForm';
import { Budget, Transaction } from '../db';

const { ipcRenderer } = window.electron;

const BudgetsPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | undefined>();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const selectedMonth = selectedDate.toISOString().slice(0, 7); // YYYY-MM

  const loadBudgets = async () => {
    try {
      const result = await ipcRenderer.invoke('getBudgets', selectedMonth);
      setBudgets(result);
    } catch (error) {
      console.error('Failed to load budgets:', error);
      setSnackbar({
        open: true,
        message: '예산 정보를 불러오는데 실패했습니다.',
        severity: 'error',
      });
    }
  };

  const loadTransactions = async () => {
    try {
      const result = await ipcRenderer.invoke('getTransactions');
      setTransactions(result);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setSnackbar({
        open: true,
        message: '거래 내역을 불러오는데 실패했습니다.',
        severity: 'error',
      });
    }
  };

  useEffect(() => {
    loadBudgets();
    loadTransactions();
  }, [selectedMonth]);

  const handleAddBudget = () => {
    setSelectedBudget(undefined);
    setIsFormOpen(true);
  };

  const handleEditBudget = (budget: Budget) => {
    setSelectedBudget(budget);
    setIsFormOpen(true);
  };

  const handleSaveBudget = async (budgetData: Partial<Budget>) => {
    try {
      await ipcRenderer.invoke('setBudget', {
        ...budgetData,
        month: selectedMonth,
      });
      await loadBudgets();
      setIsFormOpen(false);
      setSnackbar({
        open: true,
        message: `예산이 ${selectedBudget ? '수정' : '설정'}되었습니다.`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to save budget:', error);
      setSnackbar({
        open: true,
        message: `예산 ${selectedBudget ? '수정' : '설정'}에 실패했습니다.`,
        severity: 'error',
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const calculateTotalBudget = () => {
    return budgets.reduce((sum, budget) => sum + budget.amount, 0);
  };

  const calculateTotalSpent = () => {
    return transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          t.date.startsWith(selectedMonth)
      )
      .reduce((sum, t) => sum + t.amount, 0);
  };

  const totalBudget = calculateTotalBudget();
  const totalSpent = calculateTotalSpent();
  const remainingBudget = totalBudget - totalSpent;
  const progress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
    }).format(amount);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ko}>
            <DatePicker
              views={['year', 'month']}
              label="월 선택"
              value={selectedDate}
              onChange={(newValue) => newValue && setSelectedDate(newValue)}
              sx={{ width: 200 }}
            />
          </LocalizationProvider>

          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddBudget}
          >
            새 예산 설정
          </Button>
        </Box>

        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  총 예산
                </Typography>
                <Typography variant="h5" component="div">
                  {formatCurrency(totalBudget)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  총 지출
                </Typography>
                <Typography variant="h5" component="div" color="error">
                  {formatCurrency(totalSpent)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  남은 예산
                </Typography>
                <Typography
                  variant="h5"
                  component="div"
                  color={remainingBudget < 0 ? 'error' : 'success'}
                >
                  {formatCurrency(remainingBudget)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(progress, 100)}
                  color={progress >= 100 ? 'error' : progress >= 80 ? 'warning' : 'primary'}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {Math.round(progress)}%
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <BudgetList
          budgets={budgets}
          transactions={transactions}
          onEditBudget={handleEditBudget}
          month={selectedMonth}
        />

        <BudgetForm
          open={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSave={handleSaveBudget}
          budget={selectedBudget}
          month={selectedMonth}
        />

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity={snackbar.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
};

export default BudgetsPage; 