import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Snackbar,
  Alert,
  Stack,
  AlertColor,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  ImportExport as ImportExportIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material';
import TransactionList from './TransactionList';
import TransactionForm from './TransactionForm';
import BulkTransactionEdit from './BulkTransactionEdit';
import TransactionSummary from './TransactionSummary';
import ImportExportDialog from './ImportExportDialog';
import AutoCategoryRules from './AutoCategoryRules';
import { Transaction, Account, CategoryRule } from '../db';

interface SnackbarState {
  open: boolean;
  message: string;
  severity: AlertColor;
}

const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>();
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    loadTransactions();
    loadAccounts();
    loadCategoryRules();
    loadCategories();
  }, []);

  const loadTransactions = async (): Promise<void> => {
    try {
      const transactionList = await window.electron.invoke('getTransactions');
      setTransactions(transactionList);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      showSnackbar('Failed to load transactions', 'error');
    }
  };

  const loadAccounts = async (): Promise<void> => {
    try {
      const accountList = await window.electron.invoke('getAccounts');
      setAccounts(accountList);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      showSnackbar('Failed to load accounts', 'error');
    }
  };

  const loadCategoryRules = async (): Promise<void> => {
    try {
      const rules = await window.electron.invoke('getCategoryRules');
      setCategoryRules(rules);
    } catch (error) {
      console.error('Failed to load category rules:', error);
      showSnackbar('Failed to load category rules', 'error');
    }
  };

  const loadCategories = async (): Promise<void> => {
    try {
      const categoryList = await window.electron.invoke('getCategories');
      const allCategories = Array.from(new Set([...categoryList, 'Uncategorized']));
      setCategories(allCategories);
    } catch (error) {
      console.error('Failed to load categories:', error);
      showSnackbar('Failed to load categories', 'error');
    }
  };

  const handleTransactionSave = async (transaction: Partial<Transaction>): Promise<void> => {
    try {
      if (selectedTransaction) {
        await window.electron.invoke('updateTransaction', { ...selectedTransaction, ...transaction });
      } else {
        await window.electron.invoke('createTransaction', transaction);
      }
      await loadTransactions();
      setFormOpen(false);
      setSelectedTransaction(undefined);
      showSnackbar('Transaction saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save transaction:', error);
      showSnackbar('Failed to save transaction', 'error');
    }
  };

  const handleTransactionDelete = async (id: number): Promise<void> => {
    try {
      await window.electron.invoke('deleteTransaction', id);
      await loadTransactions();
      showSnackbar('Transaction deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      showSnackbar('Failed to delete transaction', 'error');
    }
  };

  const handleBulkEdit = async (updates: { field: string; value: any; transactionIds: number[] }): Promise<void> => {
    try {
      await window.electron.invoke('bulkUpdateTransactions', updates);
      await loadTransactions();
      setBulkEditOpen(false);
      showSnackbar('Transactions updated successfully', 'success');
    } catch (error) {
      console.error('Failed to update transactions:', error);
      showSnackbar('Failed to update transactions', 'error');
    }
  };

  const handleImport = async (transactions: Partial<Transaction>[]): Promise<void> => {
    try {
      await window.electron.invoke('importTransactions', transactions);
      await loadTransactions();
      await loadAccounts();
      window.dispatchEvent(new Event('accountsUpdated'));
      showSnackbar('Transactions imported successfully', 'success');
    } catch (error) {
      console.error('Failed to import transactions:', error);
      showSnackbar('Failed to import transactions', 'error');
    }
  };

  const showSnackbar = (message: string, severity: AlertColor): void => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  const handleSnackbarClose = (_event?: React.SyntheticEvent | Event, reason?: string): void => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          Transactions
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          startIcon={<AutoAwesomeIcon />}
          onClick={() => setRulesOpen(true)}
        >
          Auto-Category Rules
        </Button>
        <Button
          variant="contained"
          startIcon={<ImportExportIcon />}
          onClick={() => setImportExportOpen(true)}
        >
          Import/Export
        </Button>
        <Button
          variant="contained"
          startIcon={<EditIcon />}
          onClick={() => setBulkEditOpen(true)}
        >
          Bulk Edit
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setFormOpen(true)}
        >
          Add Transaction
        </Button>
      </Stack>

      <TransactionSummary transactions={transactions} />

      <TransactionList
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        onEdit={(transaction) => {
          setSelectedTransaction(transaction);
          setFormOpen(true);
        }}
        onDelete={handleTransactionDelete}
        onCategoryChange={async (id, newCategory) => {
          try {
            const tx = transactions.find(t => t.id === id);
            if (tx) {
              await window.electron.invoke('updateTransaction', { ...tx, category: newCategory });
              await loadTransactions();
              showSnackbar('Category updated', 'success');
            }
          } catch (error) {
            console.error('Failed to update category:', error);
            showSnackbar('Failed to update category', 'error');
          }
        }}
        onStatusChange={async (id, newStatus) => {
          try {
            const tx = transactions.find(t => t.id === id);
            if (tx) {
              await window.electron.invoke('updateTransaction', { ...tx, status: newStatus });
              await loadTransactions();
              showSnackbar('Status updated', 'success');
            }
          } catch (error) {
            console.error('Failed to update status:', error);
            showSnackbar('Failed to update status', 'error');
          }
        }}
      />

      <TransactionForm
        open={formOpen}
        transaction={selectedTransaction}
        accounts={accounts}
        categories={categories}
        onClose={() => {
          setFormOpen(false);
          setSelectedTransaction(undefined);
        }}
        onSave={handleTransactionSave}
      />

      <BulkTransactionEdit
        open={bulkEditOpen}
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        onClose={() => setBulkEditOpen(false)}
        onSave={handleBulkEdit}
      />

      <ImportExportDialog
        open={importExportOpen}
        accounts={accounts}
        transactions={transactions}
        onClose={() => setImportExportOpen(false)}
        onImport={handleImport}
      />

      <AutoCategoryRules
        open={rulesOpen}
        rules={categoryRules}
        onClose={() => setRulesOpen(false)}
        onRulesChange={loadCategoryRules}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TransactionsPage; 