import React, { useState, useEffect, useMemo } from 'react';
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
import { Add as AddIcon, AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ko } from 'date-fns/locale';
import BudgetList from './BudgetList';
import BudgetForm from './BudgetForm';
import { Budget, Transaction, Category } from '../db';
import { enCA } from 'date-fns/locale';
import { invoke } from '@tauri-apps/api/core';

const MONTHS = [
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

const BudgetsPage: React.FC = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => 2020 + i);
  const [year, setYear] = useState(() => localStorage.getItem('budgetYear') || String(now.getFullYear()));
  const [month, setMonth] = useState(() => localStorage.getItem('budgetMonth') || (now.getMonth() + 1).toString().padStart(2, '0'));
  const selectedMonth = `${year}-${month}`;
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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

  const loadAllData = async () => {
    try {
      const [budgetList, transactionList, categoryList] = await Promise.all([
        invoke<Budget[]>('get_budgets', { month: selectedMonth }),
        invoke<Transaction[]>('get_transactions'),
        invoke<Category[]>("get_categories_full")
      ]);
      setBudgets(budgetList);
      setTransactions(transactionList);
      setCategories(categoryList);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load data', severity: 'error' });
    }
  };

  useEffect(() => {
    loadAllData();
  }, [selectedMonth]);

  useEffect(() => {
    const handleDataUpdate = () => loadAllData();
    window.addEventListener('accountsUpdated', handleDataUpdate);
    window.addEventListener('transactionsUpdated', handleDataUpdate);
    window.addEventListener('budgetsUpdated', handleDataUpdate);
    window.addEventListener('categoriesUpdated', handleDataUpdate);
    return () => {
      window.removeEventListener('accountsUpdated', handleDataUpdate);
      window.removeEventListener('transactionsUpdated', handleDataUpdate);
      window.removeEventListener('budgetsUpdated', handleDataUpdate);
      window.removeEventListener('categoriesUpdated', handleDataUpdate);
    };
  }, []);

  const handleAddBudget = () => {
    setSelectedBudget(undefined);
    setIsFormOpen(true);
  };

  const handleEditBudget = (budget: Budget) => {
    setSelectedBudget(budget);
    setIsFormOpen(true);
  };

  const handleDeleteBudget = async (budget: Budget) => {
    try {
      const updatedBudgets = await invoke<Budget[]>('delete_budget', { id: budget.id });
      setBudgets(updatedBudgets);
      window.dispatchEvent(new Event('budgetsUpdated'));
      setSnackbar({ open: true, message: 'Budget deleted successfully.', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete budget.', severity: 'error' });
    }
  };

  const handleSaveBudget = async (budgetData: Partial<Budget>) => {
    try {
      let updatedBudgets: Budget[];
      if (selectedBudget) {
        updatedBudgets = await invoke<Budget[]>('update_budget', {
          budget: {
            id: selectedBudget.id,
            category_id: budgetData.category_id!,
            amount: budgetData.amount!,
            month: selectedMonth,
            notes: budgetData.notes,
            created_at: selectedBudget.created_at,
          }
        });
      } else {
        updatedBudgets = await invoke<Budget[]>('add_budget', {
          categoryId: budgetData.category_id!,
          amount: budgetData.amount!,
          month: selectedMonth,
          notes: budgetData.notes,
        });
      }
      setBudgets(updatedBudgets);
      setIsFormOpen(false);
      window.dispatchEvent(new Event('budgetsUpdated'));
      setSnackbar({ open: true, message: `Budget ${selectedBudget ? 'updated' : 'added'} successfully.`, severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: `Failed to ${selectedBudget ? 'update' : 'add'} budget.`, severity: 'error' });
    }
  };

  const totalBudget = useMemo(() => budgets.reduce((sum, budget) => sum + budget.amount, 0), [budgets]);
  const totalSpent = useMemo(() => 
    Math.abs(
      transactions
        .filter(t => 
          t.type === 'Expense' && 
          t.date.startsWith(selectedMonth) &&
          t.category_id !== undefined  // Only include transactions with categories
        )
        .reduce((sum, t) => sum + t.amount, 0)
    ), 
    [transactions, selectedMonth]
  );
  const remainingBudget = totalBudget - totalSpent;
  const progress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);

  const handleAutoGenerateBudget = async () => {
    // Auto-generate is only allowed for the current month
    const today = new Date();
    const todayMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (selectedMonth !== todayMonthStr) {
      setSnackbar({ open: true, message: 'Auto-generate is only allowed for the current month.', severity: 'info' });
      return;
    }
    try {
      const currentYear = parseInt(year);
      const currentMonth = parseInt(month);
      let prevYear = currentYear;
      let prevMonth = currentMonth - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = currentYear - 1;
      }
      const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2,'0')}`;

      const prevBudgets = await invoke<Budget[]>('get_budgets', { month: prevMonthStr });
      if (prevBudgets.length > 0) {
        const currentBudgets = await invoke<Budget[]>('get_budgets', { month: selectedMonth });
        const existingCatIds = new Set(currentBudgets.map(b => b.category_id));
        for (const b of prevBudgets) {
          if (!existingCatIds.has(b.category_id)) {
            console.log('add_budget params', { categoryId: b.category_id, amount: b.amount, month: selectedMonth, notes: b.notes });
            await invoke<Budget[]>('add_budget', { categoryId: b.category_id, amount: b.amount, month: selectedMonth, notes: b.notes });
          }
        }
      }

      const budgetsAfterCopy = await invoke<Budget[]>('get_budgets', { month: selectedMonth });
      setBudgets(budgetsAfterCopy);

      const lastMonthExpenses = transactions.filter(t => t.type === 'Expense' && t.date.startsWith(prevMonthStr));
      const spendingByCategory = new Map<number, number>();
      for (const t of lastMonthExpenses) {
        if (t.category_id != null) {
          spendingByCategory.set(t.category_id, (spendingByCategory.get(t.category_id) || 0) + Math.abs(t.amount));
        }
      }

      const allCategories = await invoke<Category[]>('get_categories_full');
      const excluded = ['Reimbursement', 'Transfer', 'Adjust'];
      const eligible = allCategories
        .filter(c => c.type === 'Expense' && !excluded.some(ex => c.name.includes(ex)));

      let createdCount = 0;
      let skippedCount = 0;
      const budgetedCatIds = new Set(budgetsAfterCopy.map(b => b.category_id));
      for (const c of eligible) {
        if (budgetedCatIds.has(c.id)) {
          skippedCount++;
        } else {
          const amt = spendingByCategory.get(c.id) || 0;
          console.log('add_budget params', { categoryId: c.id, amount: amt, month: selectedMonth, notes: '' });
          await invoke<Budget[]>('add_budget', { categoryId: c.id, amount: amt, month: selectedMonth, notes: '' });
          createdCount++;
        }
      }

      const finalBudgets = await invoke<Budget[]>('get_budgets', { month: selectedMonth });
      setBudgets(finalBudgets);

      let message = `Auto-generate completed: Created ${createdCount} new budget(s)`;
      if (skippedCount > 0) message += `, skipped ${skippedCount} existing budget(s)`;
      setSnackbar({ open: true, message, severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: `Auto-generate failed: ${String(error)}`, severity: 'error' });
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
              onChange={e => {
                const newYear = e.target.value;
                setYear(newYear);
                localStorage.setItem('budgetYear', newYear);
              }}
              sx={{ width: 90 }}
            >
              {years.map(y => (
                <MenuItem key={y} value={String(y)}>{y}</MenuItem>
              ))}
            </Select>
            <Select
              value={month}
              size="small"
              onChange={e => {
                const newMonth = e.target.value;
                setMonth(newMonth);
                localStorage.setItem('budgetMonth', newMonth);
              }}
              sx={{ width: 120 }}
            >
              {MONTHS.map(m => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </Select>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<AddIcon />}
              onClick={handleAddBudget}
            >
              New Budget
            </Button>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<AutoAwesomeIcon />}
              onClick={handleAutoGenerateBudget}
              sx={{ minWidth: 200 }}
            >
              Auto-Generate Budget
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
                <Typography variant="h5" component="div" color="success.main">
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
                <Typography variant="h5" component="div" color="error.main">
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
                  color={remainingBudget < 0 ? 'error.main' : 'success.main'}
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
          categories={categories}
          onEditBudget={handleEditBudget}
          onDeleteBudget={handleDeleteBudget}
          month={selectedMonth}
        />

        <BudgetForm
          open={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSave={handleSaveBudget}
          budget={selectedBudget}
          month={selectedMonth}
          categories={categories}
        />

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          sx={{
            '& .MuiSnackbar-root': {
              bottom: '24px',
            },
          }}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            variant="filled"
            sx={{ 
              width: '100%',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
              padding: '8px 12px',
              minHeight: 'auto',
              '& .MuiAlert-icon': {
                padding: '0',
                marginRight: '8px',
                fontSize: '20px',
              },
              '& .MuiAlert-message': {
                padding: '0',
                fontSize: '14px',
                fontWeight: 500,
              },
              '& .MuiAlert-action': {
                padding: '0',
                marginLeft: '8px',
                '& .MuiIconButton-root': {
                  padding: '2px',
                  color: 'inherit',
                  width: '16px',
                  height: '16px',
                  '& .MuiSvgIcon-root': {
                    fontSize: '14px',
                  },
                  '&:hover': {
                    backgroundColor: 'transparent',
                  },
                },
              },
            }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
};

export default BudgetsPage; 