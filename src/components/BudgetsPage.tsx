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
import { Add as AddIcon, History as HistoryIcon, AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ko } from 'date-fns/locale';
import BudgetList from './BudgetList';
import BudgetForm from './BudgetForm';
import { Budget, Transaction } from '../db';
import { enCA } from 'date-fns/locale';
import { invoke } from '@tauri-apps/api/core';


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

  // Listen for accountsUpdated event to refresh data after backup restore
  useEffect(() => {
    // 복원 후 데이터 새로고침을 위한 이벤트 리스너
    const handleAccountsUpdated = () => {
      loadBudgets();
      loadTransactions();
    };
    
    window.addEventListener('accountsUpdated', handleAccountsUpdated);
    window.addEventListener('transactionsUpdated', handleAccountsUpdated);
    window.addEventListener('budgetsUpdated', handleAccountsUpdated);
    return () => {
      window.removeEventListener('accountsUpdated', handleAccountsUpdated);
      window.removeEventListener('transactionsUpdated', handleAccountsUpdated);
      window.removeEventListener('budgetsUpdated', handleAccountsUpdated);
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
      
      // 다른 페이지가 예산 삭제를 인식하도록 이벤트 발생
      window.dispatchEvent(new Event('budgetsUpdated'));
      
      setSnackbar({
        open: true,
        message: 'Budget deleted successfully.',
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to delete budget:', error);
      setSnackbar({
        open: true,
        message: 'Failed to delete budget.',
        severity: 'error',
      });
    }
  };

  const handleSaveBudget = async (budgetData: Partial<Budget>) => {
    try {
      let updatedBudgets: Budget[];
      
      if (selectedBudget) {
        updatedBudgets = await invoke<Budget[]>('update_budget', {
          budget: {
            id: selectedBudget.id,
            category: budgetData.category!,
            amount: budgetData.amount!,
            month: selectedMonth,
            notes: budgetData.notes,
            created_at: selectedBudget.created_at,
          }
        });
      } else {
        updatedBudgets = await invoke<Budget[]>('add_budget', {
          category: budgetData.category!,
          amount: budgetData.amount!,
          month: selectedMonth,
          notes: budgetData.notes,
        });
      }
      
      setBudgets(updatedBudgets);
      setIsFormOpen(false);
      
      // 다른 페이지가 예산 변경을 인식하도록 이벤트 발생
      window.dispatchEvent(new Event('budgetsUpdated'));
      
      setSnackbar({
        open: true,
        message: `Budget ${selectedBudget ? 'updated' : 'added'} successfully.`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to save budget:', error);
      setSnackbar({
        open: true,
        message: `Failed to ${selectedBudget ? 'update' : 'add'} budget.`,
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
    return Math.abs(transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          t.date.startsWith(selectedMonth)
      )
      .reduce((sum, t) => sum + t.amount, 0));
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



  const handleAutoGenerateBudget = async () => {
    try {
      // Determine last month's date range
      const currentYear = parseInt(year);
      const currentMonth = parseInt(month);
      
      // Calculate previous month
      let prevYear = currentYear;
      let prevMonth = currentMonth - 1;
      
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = currentYear - 1;
      }
      
      const prevMonthStr = `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;
      
      // Step 1: Import last month's budgets first
      const prevBudgets = await invoke<Budget[]>('get_budgets', { month: prevMonthStr });
      if (prevBudgets.length > 0) {
        const existingCategories = new Set(budgets.map(b => b.category));
        const toImport = prevBudgets.filter(b => !existingCategories.has(b.category));
        
        if (toImport.length > 0) {
          for (const b of toImport) {
            await invoke('add_budget', { category: b.category, amount: b.amount, month: selectedMonth, notes: b.notes });
          }
          console.log(`Imported ${toImport.length} budget(s) from last month`);
        }
      }
      
      // Reload budgets after import
      const updatedBudgets = await invoke<Budget[]>('get_budgets', { month: selectedMonth });
      setBudgets(updatedBudgets);
      
      // Step 2: Get last month's expense transactions for auto-generation
      const lastMonthExpenses = transactions.filter(t => 
        t.type === 'expense' && 
        t.date.startsWith(prevMonthStr)
      );
      
      // Calculate spending by category
      const spendingByCategory = new Map<string, number>();
      for (const t of lastMonthExpenses) {
        const category = t.category;
        const amount = Math.abs(t.amount);
        spendingByCategory.set(category, (spendingByCategory.get(category) || 0) + amount);
      }
      
      // Get all expense categories from database
      const allCategories = await invoke<{ id: number; name: string; type: string }[]>('get_categories_full');
      
      // Categories to exclude from budget generation
      const excludedCategories = [
        'Reimbursement',
        'Reimbursement [G]',
        'Reimbursement [U]', 
        'Reimbursement [E]',
        'Reimbursement [WCST]',
        'Transfer',
        'Adjust'
      ];
      
      // Get eligible expense categories
      const eligibleCategories = allCategories
        .filter(category => category.type === 'expense')
        .filter(category => 
          !excludedCategories.some(excluded => category.name.includes(excluded))
        )
        .map(category => category.name);
      
      // Map existing budgets by category
      const budgetMap = new Map<string, Budget>(budgets.map(b => [b.category, b]));
      
      let createdCount = 0;
      let skippedCount = 0;
      
      // Create budgets for eligible categories
      for (const category of eligibleCategories) {
        const amount = spendingByCategory.get(category) || 0;
        const existing = budgetMap.get(category);
        
        if (existing) {
          skippedCount++;
        } else {
          await invoke<Budget[]>('add_budget', { 
            category, 
            amount, 
            month: selectedMonth, 
            notes: '' 
          });
          createdCount++;
        }
      }
      
      // Update local state with final budgets
      const finalBudgets = await invoke<Budget[]>('get_budgets', { month: selectedMonth });
      setBudgets(finalBudgets);
      
      let message = `Auto-generate completed: Created ${createdCount} new budget(s)`;
      if (skippedCount > 0) {
        message += `, skipped ${skippedCount} existing budget(s)`;
      }
      
      setSnackbar({ open: true, message, severity: 'success' });
    } catch (error) {
      console.error('Auto-generate budgets failed:', error);
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
        />

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
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