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
  CircularProgress,
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
import TransactionSummary from './TransactionSummary';
import ImportExportDialog from './ImportExportDialog';

import CategoryManagementDialog from './CategoryManagementDialog';
import BackupRestoreDialog from './BackupRestoreDialog';
import { Transaction, Account, Category } from '../db';
import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';
import { getCurrentLocalDate, formatLocalDate } from '../utils';

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
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>();
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const currentMonth = format(getCurrentLocalDate(), 'yyyy-MM');
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
  const [loading, setLoading] = useState(true);
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(null);
  const openActionsMenu = (event: React.MouseEvent<HTMLElement>) => setActionsAnchorEl(event.currentTarget);
  const closeActionsMenu = () => setActionsAnchorEl(null);

  // 1. Add filter and setFilter state to TransactionsPage:
  const [filter, setFilter] = useState({
    searchTerm: '',
    types: [] as string[],
    categories: [] as string[],
    accounts: [] as number[],
    currentMonth: false,
    currentYear: false,
    hasAttachment: false,
    selectedIds: [] as number[],
    fromDate: null as Date | null,
    toDate: null as Date | null,
  });

  // 1. Add searchInput state:
  const [searchInput, setSearchInput] = useState('');

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    const handleDataUpdate = () => loadAllData();
    const handleTransactionsImported = (event: CustomEvent) => {
      setImportedIds(event.detail.importedIds);
      setImportedDuplicateCount(event.detail.duplicateCount || 0);
    };
    
    window.addEventListener('transactionsUpdated', handleDataUpdate);
    window.addEventListener('budgetsUpdated', handleDataUpdate);
    window.addEventListener('accountsUpdated', handleDataUpdate);
    window.addEventListener('transactionsImported', handleTransactionsImported as EventListener);
    
    return () => {
      window.removeEventListener('transactionsUpdated', handleDataUpdate);
      window.removeEventListener('budgetsUpdated', handleDataUpdate);
      window.removeEventListener('accountsUpdated', handleDataUpdate);
      window.removeEventListener('transactionsImported', handleTransactionsImported as EventListener);
    };
  }, []);

  useEffect(() => {
    if (importedIds.length > 0) {
      const message = `Successfully imported ${importedIds.length} transaction${importedIds.length === 1 ? '' : 's'}${importedDuplicateCount > 0 ? ` (${importedDuplicateCount} duplicate${importedDuplicateCount === 1 ? '' : 's'} skipped)` : ''}`;
      setSnackbar({
        open: true,
        message,
        severity: 'success',
      });
      // Select the imported transactions
      setFilter(prev => ({ ...prev, selectedIds: importedIds }));
      setImportedDuplicateCount(0);
      setImportedIds([]);
    }
  }, [importedIds, importedDuplicateCount]);

  // 2. Debounce effect for searchInput:
  useEffect(() => {
    const handler = setTimeout(() => {
      setFilter((f) => ({ ...f, searchTerm: searchInput }));
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

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
      
      // Transfer 거래인 경우 백엔드에서 이미 쌍을 삭제했으므로 프론트엔드에서도 쌍을 모두 제거
      setTransactions(prev => {
        if (transactionToDelete.type === 'Transfer') {
          if (transactionToDelete.transfer_id) {
            // transfer_id가 있는 경우 같은 transfer_id를 가진 모든 트랜잭션 제거
            return prev.filter(t => t.transfer_id !== transactionToDelete.transfer_id);
          } else {
            // 레거시 Transfer 거래의 경우 쌍을 찾아서 제거
            const pairTransaction = prev.find(t => 
              t.id !== id && 
              t.type === 'Transfer' && 
              t.date === transactionToDelete.date && 
              Math.abs(t.amount) === Math.abs(transactionToDelete.amount) && 
              t.payee === transactionToDelete.payee && 
              t.account_id !== transactionToDelete.account_id
            );
            if (pairTransaction) {
              return prev.filter(t => t.id !== id && t.id !== pairTransaction.id);
            }
          }
        }
        // 일반 거래인 경우 해당 ID만 제거
        return prev.filter(t => t.id !== id);
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
      const processedTransferIds = new Set<number>();
      
      for (const id of ids) {
        try { 
          await invoke('delete_transaction', { id }); 
          successfulDeletions++;
          
          // Transfer 거래인 경우 백엔드에서 이미 쌍을 삭제했으므로 추가 처리 불필요
          const transaction = transactions.find(t => t.id === id);
          if (transaction?.type === 'Transfer' && transaction.transfer_id) {
            processedTransferIds.add(transaction.transfer_id);
          }
        } catch (error) {
          console.error(`Failed to delete transaction ${id}:`, error);
          // Transfer 거래인 경우 백엔드에서 이미 쌍을 삭제했으므로 실패로 인식하지 않음
          const transaction = transactions.find(t => t.id === id);
          if (transaction?.type === 'Transfer') {
            successfulDeletions++;
            if (transaction.transfer_id) {
              processedTransferIds.add(transaction.transfer_id);
            }
          } else {
            failedDeletions.push(id);
          }
        }
      }
      
      if (successfulDeletions === 0) {
        setSnackbar({ open: true, message: 'Failed to delete any transactions', severity: 'error' });
        return;
      }
      
      // Transfer 거래 쌍을 프론트엔드에서도 제거
      const deletedTransactions = transactions.filter(t => ids.includes(t.id));
      const transferIdsToRemove = new Set<number>();
      deletedTransactions.forEach(transaction => {
        if (transaction.type === 'Transfer') {
          if (transaction.transfer_id && !processedTransferIds.has(transaction.transfer_id)) {
            const relatedTransactions = transactions.filter(t => t.transfer_id === transaction.transfer_id);
            relatedTransactions.forEach(t => { if (!ids.includes(t.id)) transferIdsToRemove.add(t.id); });
            processedTransferIds.add(transaction.transfer_id);
          } else if (!transaction.transfer_id) {
            const pairTransaction = transactions.find(t => !ids.includes(t.id) && t.type === 'Transfer' && t.date === transaction.date && Math.abs(t.amount) === Math.abs(transaction.amount) && t.payee === transaction.payee && t.account_id !== transaction.account_id);
            if (pairTransaction) transferIdsToRemove.add(pairTransaction.id);
          }
        }
      });
      
      setTransactions(prev => {
        let filtered = prev.filter(t => !ids.includes(t.id));
        if (transferIdsToRemove.size > 0) filtered = filtered.filter(t => !transferIdsToRemove.has(t.id));
        return filtered;
      });
      // Clear selected transactions after successful deletion
      setFilter(prev => ({ ...prev, selectedIds: [] }));
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


  const handleImport = async (importTxs: Partial<Transaction>[]): Promise<{ imported: Transaction[]; imported_count: number; duplicate_count: number; }> => {
    try {
      // Call backend to import transactions with duplicate detection
      const result = await invoke<{ imported: Transaction[]; imported_count: number; duplicate_count: number; }>('import_transactions', { transactions: importTxs });
      const importedIds = result.imported.map(t => t.id);
      setImportedIds(importedIds);
      setImportedDuplicateCount(result.duplicate_count);
      // Refresh data
      window.dispatchEvent(new Event('transactionsUpdated'));
      return result;
    } catch (error) {
      console.error('Import failed:', error);
      // Don't show snackbar here - let the main app handle it
      return { imported: [], imported_count: 0, duplicate_count: 0 };
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

  const handleNotesChange = async (id: number, notes: string): Promise<void> => {
    try {
      const tx = transactions.find(t => t.id === id);
      if (tx) {
        await invoke('update_transaction', { transaction: { ...tx, notes } });
        if (tx.type === 'Transfer' && tx.transfer_id) {
          // Transfer면 같은 transfer_id를 가진 모든 트랜잭션의 notes를 갱신
          setTransactions(prev =>
            prev.map(t =>
              t.transfer_id === tx.transfer_id ? { ...t, notes } : t
            )
          );
        } else {
          setTransactions(prev => prev.map(t => t.id === id ? { ...t, notes } : t));
        }
        setSnackbar({ open: true, message: 'Notes updated', severity: 'success' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to update notes', severity: 'error' });
    }
  };

  const handleSnackbarClose = (_event?: React.SyntheticEvent | Event, reason?: string): void => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    localStorage.setItem('walnutbook_selected_month', month);
    // Summary에서 달이 변경되어도 Current Month 필터는 자동으로 활성화하지 않음
  };

  const filteredByMonth = selectedMonth ? transactions.filter((t) => t.date && t.date.startsWith(selectedMonth)) : transactions;

  // 2. Add isFilterActive logic:
  const isFilterActive = filter.searchTerm !== '' ||
    filter.types.length > 0 ||
    filter.categories.length > 0 ||
    filter.accounts.length > 0 ||
    filter.hasAttachment ||
    filter.currentMonth ||
    filter.currentYear ||
    filter.fromDate !== null ||
    filter.toDate !== null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }
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
        transactions={isFilterActive ? transactions : filteredByMonth}
        accounts={accounts}
        categories={categories}
        filter={filter}
        setFilter={setFilter}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        selectedMonth={selectedMonth}
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
        onNotesChange={handleNotesChange}
        initialSelectedIds={filter.selectedIds}
        importedIds={importedIds}
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