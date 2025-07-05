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
import { Transaction, Account, Category } from '../db';
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>();
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const currentMonth = format(new Date(), 'yyyy-MM');
    const isFirstStart = !sessionStorage.getItem('walnutbook_session_started');
    if (isFirstStart) {
      sessionStorage.setItem('walnutbook_session_started', 'true');
      return currentMonth;
    } else {
      const savedMonth = localStorage.getItem('walnutbook_selected_month');
      return savedMonth || currentMonth;
    }
  });
  const [importedIds, setImportedIds] = useState<number[]>([]);
  const [importedDuplicateCount, setImportedDuplicateCount] = useState<number>(0);
  const [backupOpen, setBackupOpen] = useState(false);
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(null);
  const openActionsMenu = (event: React.MouseEvent<HTMLElement>) => setActionsAnchorEl(event.currentTarget);
  const closeActionsMenu = () => setActionsAnchorEl(null);

  const loadAllData = async () => {
    try {
      const [transactionList, accountList, categoryList] = await Promise.all([
        invoke<Transaction[]>('get_transactions'),
        invoke<Account[]>('get_accounts'),
        invoke<Category[]>('get_categories_full'),
      ]);
      setTransactions(transactionList || []);
      setAccounts(accountList || []);
      setCategories(categoryList || []);
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to load data', severity: 'error' });
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
    }
  };

  useEffect(() => {
    loadAllData();
    const handleDataUpdate = () => loadAllData();
    window.addEventListener('transactionsUpdated', handleDataUpdate);
    window.addEventListener('budgetsUpdated', handleDataUpdate);
    window.addEventListener('accountsUpdated', handleDataUpdate);
    return () => {
      window.removeEventListener('transactionsUpdated', handleDataUpdate);
      window.removeEventListener('budgetsUpdated', handleDataUpdate);
      window.removeEventListener('accountsUpdated', handleDataUpdate);
    };
  }, []);

  const handleTransactionSave = async (transaction: Partial<Transaction>): Promise<void> => {
    try {
      if (selectedTransaction) {
        const updatedTransaction = await invoke<Transaction>('update_transaction', { transaction: { ...selectedTransaction, ...transaction } });
        setTransactions(prev => prev.map(t => t.id === selectedTransaction.id ? updatedTransaction : t));
        setFormOpen(false);
        setSelectedTransaction(undefined);
      } else {
        const newTransaction = await invoke<Transaction>('create_transaction', { transaction });
        setTransactions(prev => [newTransaction, ...prev]);
      }
      window.dispatchEvent(new Event('transactionsUpdated'));
      setSnackbar({ open: true, message: 'Transaction saved successfully', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to save transaction', severity: 'error' });
    }
  };

  const handleTransactionDelete = async (id: number): Promise<void> => {
    try {
      const transactionToDelete = transactions.find(t => t.id === id);
      if (!transactionToDelete) {
        setSnackbar({ open: true, message: 'Transaction not found', severity: 'error' });
        return;
      }
      
      await invoke('delete_transaction', { id });
      setTransactions(prev => {
        let filtered = prev.filter(t => t.id !== id);
        if (transactionToDelete.type === 'transfer') {
          if (transactionToDelete.transfer_id) {
            filtered = filtered.filter(t => t.transfer_id !== transactionToDelete.transfer_id);
          } else {
            const pairTransaction = prev.find(t => t.id !== id && t.type === 'transfer' && t.date === transactionToDelete.date && Math.abs(t.amount) === Math.abs(transactionToDelete.amount) && t.payee === transactionToDelete.payee && t.account_id !== transactionToDelete.account_id);
            if (pairTransaction) filtered = filtered.filter(t => t.id !== pairTransaction.id);
          }
        }
        return filtered;
      });
      window.dispatchEvent(new Event('transactionsUpdated'));
      setSnackbar({ open: true, message: 'Transaction deleted successfully', severity: 'success' });
    } catch (error) {
      console.error('Delete transaction error:', error);
      setSnackbar({ open: true, message: 'Failed to delete transaction', severity: 'error' });
    }
  };

  const handleBulkDelete = async (ids: number[]): Promise<void> => {
    try {
      let successfulDeletions = 0;
      const failedDeletions: number[] = [];
      
      for (const id of ids) {
        try { 
          await invoke('delete_transaction', { id }); 
          successfulDeletions++;
        } catch (error) {
          console.error(`Failed to delete transaction ${id}:`, error);
          failedDeletions.push(id);
        }
      }
      
      if (successfulDeletions === 0) {
        setSnackbar({ open: true, message: 'Failed to delete any transactions', severity: 'error' });
        return;
      }
      
      const deletedTransactions = transactions.filter(t => ids.includes(t.id));
      const transferIdsToRemove = new Set<number>();
      const processedTransferIds = new Set<number>();
      deletedTransactions.forEach(transaction => {
        if (transaction.type === 'transfer') {
          if (transaction.transfer_id && !processedTransferIds.has(transaction.transfer_id)) {
            const relatedTransactions = transactions.filter(t => t.transfer_id === transaction.transfer_id);
            relatedTransactions.forEach(t => { if (!ids.includes(t.id)) transferIdsToRemove.add(t.id); });
            processedTransferIds.add(transaction.transfer_id);
          } else if (!transaction.transfer_id) {
            const pairTransaction = transactions.find(t => !ids.includes(t.id) && t.type === 'transfer' && t.date === transaction.date && Math.abs(t.amount) === Math.abs(transaction.amount) && t.payee === transaction.payee && t.account_id !== transaction.account_id);
            if (pairTransaction) transferIdsToRemove.add(pairTransaction.id);
          }
        }
      });
      setTransactions(prev => {
        let filtered = prev.filter(t => !ids.includes(t.id));
        if (transferIdsToRemove.size > 0) filtered = filtered.filter(t => !transferIdsToRemove.has(t.id));
        return filtered;
      });
      window.dispatchEvent(new Event('transactionsUpdated'));
      
      if (failedDeletions.length > 0) {
        setSnackbar({ 
          open: true, 
          message: `Deleted ${successfulDeletions} transactions successfully. Failed to delete ${failedDeletions.length} transactions.`, 
          severity: 'warning' 
        });
      } else {
        setSnackbar({ 
          open: true, 
          message: `Successfully deleted ${successfulDeletions} transaction${successfulDeletions > 1 ? 's' : ''}`, 
          severity: 'success' 
        });
      }
    } catch (error) {
      console.error('Bulk delete error:', error);
      setSnackbar({ open: true, message: 'Failed to delete transactions', severity: 'error' });
    }
  };

  const handleBulkEdit = async (updates: { field: string; value: any; transactionIds: number[] }): Promise<void> => {
    try {
      const updatedTransactions = await invoke<Transaction[]>('bulk_update_transactions', { updates });
      setTransactions(prev => {
        const updatedIds = new Set(updatedTransactions.map(t => t.id));
        return prev.map(t => updatedIds.has(t.id) ? updatedTransactions.find(ut => ut.id === t.id) || t : t);
      });
      setBulkEditOpen(false);
      setSnackbar({ open: true, message: 'Transactions updated successfully', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to update transactions', severity: 'error' });
    }
  };

  const handleImport = async (importTxs: Partial<Transaction>[]): Promise<void> => {
    try {
      const createdList = await invoke<Transaction[]>('import_transactions', { transactions: importTxs });
      const importedCount = createdList.length;
      const duplicateCount = importTxs.length - importedCount;
      const [newAccounts, newTransactions] = await Promise.all([
        invoke<Account[]>('get_accounts'),
        invoke<Transaction[]>('get_transactions')
      ]);
      setAccounts(newAccounts);
      setTransactions(newTransactions);
      setImportedIds(createdList.map(t => t.id));
      setImportedDuplicateCount(duplicateCount);
      window.dispatchEvent(new Event('transactionsUpdated'));
      setSnackbar({ open: true, message: `Imported ${importedCount} transactions, skipped ${duplicateCount} duplicates.`, severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to import transactions', severity: 'error' });
    }
  };

  const handleDescriptionChange = async (id: number, description: string): Promise<void> => {
    try {
      const tx = transactions.find(t => t.id === id);
      if (tx) {
        await invoke('update_transaction', { transaction: { ...tx, payee: description } });
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, payee: description } : t));
        setSnackbar({ open: true, message: 'Description updated', severity: 'success' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to update description', severity: 'error' });
    }
  };

  const handleSnackbarClose = (_event?: React.SyntheticEvent | Event, reason?: string): void => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    localStorage.setItem('walnutbook_selected_month', month);
  };

  const filteredByMonth = selectedMonth ? transactions.filter((t) => t.date && t.date.startsWith(selectedMonth)) : transactions;

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

      <TransactionSummary
        monthTransactions={filteredByMonth}
        allTransactions={transactions}
        selectedMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        categories={categories}
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
        onCategoryChange={async (id, newCategoryId) => {
          try {
            const tx = transactions.find(t => t.id === id);
            if (tx) {
              await invoke('update_transaction', { 
                transaction: { 
                  ...tx, 
                  category_id: newCategoryId === undefined ? null : newCategoryId 
                } 
              });
              setTransactions(prev => 
                prev.map(t => 
                  t.id === id ? { ...t, category_id: newCategoryId } : t
                )
              );
              setSnackbar({ open: true, message: 'Category updated', severity: 'success' });
            }
          } catch {
            setSnackbar({ open: true, message: 'Failed to update category', severity: 'error' });
          }
        }}
        onDescriptionChange={handleDescriptionChange}
        initialSelectedIds={importedIds}
        onAddTransaction={() => setFormOpen(true)}
        onBulkDelete={handleBulkDelete}
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
        categories={categories}
        onClose={() => setImportExportOpen(false)}
        onImport={handleImport}
      />

      <CategoryManagementDialog
        open={categoriesOpen}
        onClose={async () => {
          setCategoriesOpen(false);
          try {
            const newCategories = await invoke<Category[]>("get_categories_full");
            setCategories(newCategories);
          } catch {}
        }}
        onChange={async () => {
          try {
            const newCategories = await invoke<Category[]>("get_categories_full");
            setCategories(newCategories);
          } catch {}
        }}
      />

      <BackupRestoreDialog
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiSnackbar-root': {
            bottom: '24px',
          },
        }}
      >
        <Alert 
          onClose={handleSnackbarClose} 
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
  );
};

export default TransactionsPage; 