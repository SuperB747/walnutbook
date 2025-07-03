import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Menu,
  MenuItem,
  Typography,
  Snackbar,
  Alert,
  Stack,
  AlertColor,
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  ImportExport as ImportExportIcon,
  AutoAwesome as AutoAwesomeIcon,
  ArrowDropDown as ArrowDropDownIcon,
} from '@mui/icons-material';
import TransactionList from './TransactionList';
import TransactionForm from './TransactionForm';
import BulkTransactionEdit from './BulkTransactionEdit';
import TransactionSummary from './TransactionSummary';
import ImportExportDialog from './ImportExportDialog';

import CategoryManagementDialog from './CategoryManagementDialog';
import BackupRestoreDialog from './BackupRestoreDialog';
import { Transaction, Account } from '../db';
import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';

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

  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const [categories, setCategories] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    // localStorage에서 저장된 달을 가져오거나, 없으면 현재 달 사용
    const savedMonth = localStorage.getItem('walnutbook_selected_month');
    return savedMonth || format(new Date(), 'yyyy-MM');
  });
  const [importedIds, setImportedIds] = useState<number[]>([]);
  const [importedDuplicateCount, setImportedDuplicateCount] = useState<number>(0);
  const [backupOpen, setBackupOpen] = useState(false);
  // State for actions dropdown menu
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(null);
  const openActionsMenu = (event: React.MouseEvent<HTMLElement>) => setActionsAnchorEl(event.currentTarget);
  const closeActionsMenu = () => setActionsAnchorEl(null);

  useEffect(() => {
    loadTransactions();
    loadAccounts();

    loadCategories();
  }, []);

  const loadTransactions = async (): Promise<void> => {
    try {
      const transactionList = await invoke('get_transactions') as Transaction[];
      setTransactions(transactionList);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      showSnackbar('Failed to load transactions', 'error');
    }
  };

  const loadAccounts = async (): Promise<void> => {
    try {
      const accountList = await invoke('get_accounts') as Account[];
      setAccounts(accountList);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      showSnackbar('Failed to load accounts', 'error');
    }
  };



  const loadCategories = async (): Promise<void> => {
    try {
      const categoryList = await invoke('get_categories') as string[];
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
        await invoke('update_transaction', { transaction: { ...selectedTransaction, ...transaction } });
        setFormOpen(false);
        setSelectedTransaction(undefined);
      } else {
        await invoke('create_transaction', { transaction });
        // Always keep the form open for new transactions (continuous mode)
      }
      await loadTransactions();
      showSnackbar('Transaction saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save transaction:', error);
      showSnackbar('Failed to save transaction', 'error');
    }
  };

  const handleTransactionDelete = async (id: number): Promise<void> => {
    try {
      await invoke('delete_transaction', { id });
      await loadTransactions();
      showSnackbar('Transaction deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      showSnackbar('Failed to delete transaction', 'error');
    }
  };

  const handleBulkEdit = async (updates: { field: string; value: any; transactionIds: number[] }): Promise<void> => {
    try {
      await invoke('bulk_update_transactions', { updates });
      await loadTransactions();
      setBulkEditOpen(false);
      showSnackbar('Transactions updated successfully', 'success');
    } catch (error) {
      console.error('Failed to update transactions:', error);
      showSnackbar('Failed to update transactions', 'error');
    }
  };

  const handleImport = async (importTxs: Partial<Transaction>[]): Promise<void> => {
    try {
      const existingIds = transactions.map(t => t.id);
      const createdList = await invoke<Transaction[]>('import_transactions', { transactions: importTxs });
      const newIds = createdList.map(t => t.id).filter(id => !existingIds.includes(id));
      const duplicateCount = importTxs.length - newIds.length;
      await loadTransactions();
      await loadAccounts();
      window.dispatchEvent(new Event('accountsUpdated'));
      setImportedIds(newIds);
      setImportedDuplicateCount(duplicateCount);
      setSnackbar({
        open: true,
        message: `Imported ${newIds.length} transactions, skipped ${duplicateCount} duplicates.`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to import transactions:', error);
      setSnackbar({ open: true, message: 'Failed to import transactions', severity: 'error' });
    }
  };

  const handleDescriptionChange = async (id: number, description: string): Promise<void> => {
    try {
      const tx = transactions.find(t => t.id === id);
      if (tx) {
        await invoke('update_transaction', { transaction: { ...tx, payee: description } });
        await loadTransactions();
        showSnackbar('Description updated', 'success');
      }
    } catch (error) {
      console.error('Failed to update description:', error);
      showSnackbar('Failed to update description', 'error');
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

  // Handle month change and save to localStorage
  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    localStorage.setItem('walnutbook_selected_month', month);
  };

  // Filter transactions by selected month (YYYY-MM)
  const filteredByMonth = selectedMonth
    ? transactions.filter((t) => t.date.startsWith(selectedMonth))
    : transactions;

  return (
    <Box sx={{ p: 3 }}>
      <Menu
        anchorEl={actionsAnchorEl}
        open={Boolean(actionsAnchorEl)}
        onClose={closeActionsMenu}
      >
        <MenuItem onClick={() => { setCategoriesOpen(true); closeActionsMenu(); }}>
          Manage Categories
        </MenuItem>
        <MenuItem onClick={() => { setBulkEditOpen(true); closeActionsMenu(); }}>
          Bulk Edit
        </MenuItem>
        <MenuItem onClick={() => { setImportExportOpen(true); closeActionsMenu(); }}>
          Import/Export
        </MenuItem>

        <MenuItem onClick={() => { setBackupOpen(true); closeActionsMenu(); }}>
          Backup & Restore
        </MenuItem>
      </Menu>
      
      {/* Summary with month selector inside component */}
      <TransactionSummary
        monthTransactions={filteredByMonth}
        allTransactions={transactions}
        selectedMonth={selectedMonth}
        onMonthChange={handleMonthChange}
      />

        <TransactionList
        transactions={filteredByMonth}
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
              await invoke('update_transaction', { transaction: { ...tx, category: newCategory } });
              await loadTransactions();
              showSnackbar('Category updated', 'success');
            }
          } catch (error) {
            console.error('Failed to update category:', error);
            showSnackbar('Failed to update category', 'error');
          }
        }}
        onDescriptionChange={handleDescriptionChange}
        initialSelectedIds={importedIds}
        onAddTransaction={() => setFormOpen(true)}
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



      <CategoryManagementDialog
        open={categoriesOpen}
        onClose={() => {
          setCategoriesOpen(false);
          loadCategories();
        }}
        onChange={loadCategories}
      />

      <BackupRestoreDialog
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        onRestore={() => {
          loadAccounts();
          loadTransactions();
          window.dispatchEvent(new Event('accountsUpdated'));
        }}
        />

        <Snackbar
          open={snackbar.open}
        autoHideDuration={10000}
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