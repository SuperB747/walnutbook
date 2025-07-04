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
    // 앱 시작 시에는 항상 현재 달을 기본으로 사용
    const currentMonth = format(new Date(), 'yyyy-MM');
    
    // 앱이 처음 시작되었는지 확인 (sessionStorage 사용)
    const isFirstStart = !sessionStorage.getItem('walnutbook_session_started');
    
    if (isFirstStart) {
      // 앱이 처음 시작된 경우 현재 달 사용
      sessionStorage.setItem('walnutbook_session_started', 'true');
      return currentMonth;
    } else {
      // 앱이 이미 실행 중인 경우 localStorage에서 저장된 달 사용
      const savedMonth = localStorage.getItem('walnutbook_selected_month');
      return savedMonth || currentMonth;
    }
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
    
    // 복원 후 데이터 새로고침을 위한 이벤트 리스너
    const handleDataUpdate = () => {
      loadTransactions();
      loadAccounts();
      loadCategories();
    };
    
    window.addEventListener('transactionsUpdated', handleDataUpdate);
    window.addEventListener('budgetsUpdated', handleDataUpdate);
    window.addEventListener('accountsUpdated', handleDataUpdate);
    
    return () => {
      window.removeEventListener('transactionsUpdated', handleDataUpdate);
      window.removeEventListener('budgetsUpdated', handleDataUpdate);
      window.removeEventListener('accountsUpdated', handleDataUpdate);
    };
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
        const updatedTransaction = await invoke<Transaction>('update_transaction', { 
          transaction: { ...selectedTransaction, ...transaction } 
        });
        
        // 로컬 상태에서 거래를 업데이트하여 즉시 UI 업데이트
        setTransactions(prevTransactions => 
          prevTransactions.map(t => 
            t.id === selectedTransaction.id ? updatedTransaction : t
          )
        );
        
        setFormOpen(false);
        setSelectedTransaction(undefined);
      } else {
        const newTransaction = await invoke<Transaction>('create_transaction', { transaction });
        
        // 로컬 상태에 새 거래를 추가하여 즉시 UI 업데이트
        setTransactions(prevTransactions => [newTransaction, ...prevTransactions]);
        
        // Always keep the form open for new transactions (continuous mode)
      }
      
      // 다른 페이지가 거래 변경을 인식하도록 이벤트 발생
      window.dispatchEvent(new Event('transactionsUpdated'));
      
      showSnackbar('Transaction saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save transaction:', error);
      showSnackbar('Failed to save transaction', 'error');
    }
  };

  const handleTransactionDelete = async (id: number): Promise<void> => {
    try {
      // 삭제할 거래 정보를 먼저 가져와서 Transfer 페어 확인
      const transactionToDelete = transactions.find(t => t.id === id);
      
      await invoke('delete_transaction', { id });
      
      // 로컬 상태에서 삭제된 거래를 제거하여 즉시 UI 업데이트
      setTransactions(prevTransactions => {
        let filtered = prevTransactions.filter(t => t.id !== id);
        
        // Transfer 거래인 경우 페어된 거래도 함께 제거
        if (transactionToDelete && transactionToDelete.type === 'transfer') {
          if (transactionToDelete.transfer_id) {
            // transfer_id가 있는 경우 같은 transfer_id를 가진 다른 거래도 제거
            filtered = filtered.filter(t => t.transfer_id !== transactionToDelete.transfer_id);
          } else {
            // transfer_id가 없는 경우 기존 방식으로 페어 찾기
            const pairTransaction = prevTransactions.find(t => 
              t.id !== id && 
              t.type === 'transfer' && 
              t.date === transactionToDelete.date && 
              Math.abs(t.amount) === Math.abs(transactionToDelete.amount) &&
              t.payee === transactionToDelete.payee &&
              t.account_id !== transactionToDelete.account_id
            );
            if (pairTransaction) {
              filtered = filtered.filter(t => t.id !== pairTransaction.id);
            }
          }
        }
        
        return filtered;
      });
      
      // 다른 페이지가 거래 삭제를 인식하도록 이벤트 발생
      window.dispatchEvent(new Event('transactionsUpdated'));
      
      showSnackbar('Transaction deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      showSnackbar('Failed to delete transaction', 'error');
    }
  };

  const handleBulkDelete = async (ids: number[]): Promise<void> => {
    try {
      let deletedCount = 0;
      
      for (const id of ids) {
        try {
          await invoke('delete_transaction', { id });
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete transaction ${id}:`, error);
        }
      }
      
      // 로컬 상태에서 삭제된 거래들을 제거하여 즉시 UI 업데이트
      setTransactions(prevTransactions => {
        let filtered = prevTransactions.filter(t => !ids.includes(t.id));
        
        // Transfer 거래들의 페어도 함께 제거
        const deletedTransactions = prevTransactions.filter(t => ids.includes(t.id));
        const transferIdsToRemove = new Set<number>();
        
        deletedTransactions.forEach(transaction => {
          if (transaction.type === 'transfer') {
            if (transaction.transfer_id) {
              transferIdsToRemove.add(transaction.transfer_id);
            } else {
              // transfer_id가 없는 경우 기존 방식으로 페어 찾기
              const pairTransaction = prevTransactions.find(t => 
                !ids.includes(t.id) && 
                t.type === 'transfer' && 
                t.date === transaction.date && 
                Math.abs(t.amount) === Math.abs(transaction.amount) &&
                t.payee === transaction.payee &&
                t.account_id !== transaction.account_id
              );
              if (pairTransaction) {
                transferIdsToRemove.add(pairTransaction.id);
              }
            }
          }
        });
        
        // 페어된 Transfer 거래들도 제거
        if (transferIdsToRemove.size > 0) {
          filtered = filtered.filter(t => !transferIdsToRemove.has(t.id));
        }
        
        return filtered;
      });
      
      if (deletedCount === ids.length) {
        showSnackbar(`${deletedCount} transactions deleted successfully`, 'success');
      } else {
        showSnackbar(`${deletedCount} out of ${ids.length} transactions deleted successfully`, 'warning');
      }
      
      // 다른 페이지가 거래 삭제를 인식하도록 이벤트 발생
      window.dispatchEvent(new Event('transactionsUpdated'));
    } catch (error) {
      console.error('Failed to delete transactions:', error);
      showSnackbar('Failed to delete transactions', 'error');
    }
  };

  const handleBulkEdit = async (updates: { field: string; value: any; transactionIds: number[] }): Promise<void> => {
    try {
      const updatedTransactions = await invoke<Transaction[]>('bulk_update_transactions', { updates });
      
      // 로컬 상태에서 일괄 업데이트된 거래들을 반영하여 즉시 UI 업데이트
      setTransactions(prevTransactions => {
        const updatedIds = new Set(updatedTransactions.map(t => t.id));
        return prevTransactions.map(t => 
          updatedIds.has(t.id) 
            ? updatedTransactions.find(ut => ut.id === t.id) || t
            : t
        );
      });
      
      setBulkEditOpen(false);
      showSnackbar('Transactions updated successfully', 'success');
    } catch (error) {
      console.error('Failed to update transactions:', error);
      showSnackbar('Failed to update transactions', 'error');
    }
  };

  const handleImport = async (importTxs: Partial<Transaction>[]): Promise<void> => {
    try {
      const createdList = await invoke<Transaction[]>('import_transactions', { transactions: importTxs });
      const importedCount = createdList.length;
      const duplicateCount = importTxs.length - importedCount;
      
      // 로컬 상태를 즉시 업데이트하여 부드러운 UI 전환
      const [newAccounts, newTransactions] = await Promise.all([
        invoke<Account[]>('get_accounts'),
        invoke<Transaction[]>('get_transactions')
      ]);
      
      setAccounts(newAccounts);
      setTransactions(newTransactions);
      
      // 새로 임포트된 거래들의 ID를 설정 (새로운 거래 목록에서 찾기)
      const newImportedIds = createdList.map(t => t.id);
      setImportedIds(newImportedIds);
      setImportedDuplicateCount(duplicateCount);
      
      // 다른 페이지가 거래 변경을 인식하도록 이벤트 발생
      window.dispatchEvent(new Event('transactionsUpdated'));
      
      setSnackbar({
        open: true,
        message: `Imported ${importedCount} transactions, skipped ${duplicateCount} duplicates.`,
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
        // For transfer transactions, update the payee field (description only)
        if (tx.type === 'transfer') {
          await invoke('update_transaction', { transaction: { ...tx, payee: description } });
        } else {
          await invoke('update_transaction', { transaction: { ...tx, payee: description } });
        }
        
        // 로컬 상태에서 설명을 업데이트하여 즉시 UI 업데이트
        setTransactions(prevTransactions => 
          prevTransactions.map(t => 
            t.id === id ? { ...t, payee: description } : t
          )
        );
        
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
    ? transactions.filter((t) => t.date && t.date.startsWith(selectedMonth))
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
              setTransactions(prevTransactions => 
                prevTransactions.map(t => 
                  t.id === id ? { ...t, category: newCategory } : t
                )
              );
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
        onClose={() => setImportExportOpen(false)}
        onImport={handleImport}
      />

      <CategoryManagementDialog
        open={categoriesOpen}
        onClose={async () => {
          setCategoriesOpen(false);
          try {
            const newCategories = await invoke<string[]>('get_categories');
            setCategories(newCategories);
          } catch (error) {
            console.error('Failed to refresh categories:', error);
          }
        }}
        onChange={async () => {
          try {
            const newCategories = await invoke<string[]>('get_categories');
            setCategories(newCategories);
          } catch (error) {
            console.error('Failed to refresh categories:', error);
          }
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