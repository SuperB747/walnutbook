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
  Select,
  MenuItem,
} from '@mui/material';
import { Add as AddIcon, History as HistoryIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ko } from 'date-fns/locale';
import BudgetList from './BudgetList';
import BudgetForm from './BudgetForm';
import { Budget, Transaction } from '../db';
import { enCA } from 'date-fns/locale';
import { invoke } from '@tauri-apps/api/core';
import { subMonths, format as formatDateFns } from 'date-fns';

const BudgetsPage: React.FC = () => {
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
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const selectedMonth = `${year}-${month}`;
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | undefined>();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const loadBudgets = async () => {
    try {
      const result = await invoke<Budget[]>('get_budgets', { month: selectedMonth });
      setBudgets(result);
    } catch (error) {
      console.error('Failed to load budgets:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load budget information.',
        severity: 'error',
      });
    }
  };

  const loadTransactions = async () => {
    try {
      const result = await invoke<Transaction[]>('get_transactions');
      setTransactions(result);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load transactions.',
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
      if (selectedBudget) {
        await invoke<Budget[]>('update_budget', { budget: { id: selectedBudget.id, category: budgetData.category!, amount: budgetData.amount!, month: selectedMonth, notes: budgetData.notes } });
      } else {
        await invoke<Budget[]>('add_budget', { category: budgetData.category!, amount: budgetData.amount!, month: selectedMonth, notes: budgetData.notes });
      }
      await loadBudgets();
      setIsFormOpen(false);
      setSnackbar({
        open: true,
        message: `Budget ${selectedBudget ? 'updated' : 'set'} successfully.`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to save budget:', error);
      setSnackbar({
        open: true,
        message: `Failed to ${selectedBudget ? 'update' : 'set'} budget.`,
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
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  const handleImportLastMonth = async () => {
    try {
      const prevMonthDate = subMonths(new Date(`${year}-${month}-01`), 1);
      const prevMonth = formatDateFns(prevMonthDate, 'yyyy-MM');
      const prevBudgets = await invoke<Budget[]>('get_budgets', { month: prevMonth });
      if (!prevBudgets.length) {
        setSnackbar({ open: true, message: "No budgets found for last month.", severity: 'info' });
        return;
      }
      const existingCategories = new Set(budgets.map(b => b.category));
      const toImport = prevBudgets.filter(b => !existingCategories.has(b.category));
      if (!toImport.length) {
        setSnackbar({ open: true, message: "All last month's budgets already exist.", severity: 'info' });
        return;
      }
      for (const b of toImport) {
        await invoke('add_budget', { category: b.category, amount: b.amount, month: selectedMonth, notes: b.notes });
      }
      await loadBudgets();
      setSnackbar({ open: true, message: `Imported ${toImport.length} budget(s) from last month.`, severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to import last month\'s budget.', severity: 'error' });
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Select
              value={year}
              size="small"
              onChange={e => setYear(e.target.value)}
              sx={{ width: 90 }}
            >
              {years.map(y => (
                <MenuItem key={y} value={String(y)}>{y}</MenuItem>
              ))}
            </Select>
            <Select
              value={month}
              size="small"
              onChange={e => setMonth(e.target.value)}
              sx={{ width: 120 }}
            >
              {months.map(m => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </Select>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleAddBudget}
            >
              New Budget
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<HistoryIcon />}
              onClick={handleImportLastMonth}
              sx={{ minWidth: 200 }}
            >
              Import Last Month's Budget
            </Button>
          </Box>
        </Box>

        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Budget
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
                  Total Spent
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
                  Remaining Budget
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