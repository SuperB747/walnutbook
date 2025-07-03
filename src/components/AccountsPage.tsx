import React, { useState, useEffect } from 'react';
import { Container, Box, Button, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import AccountList from './AccountList';
import AccountForm from './AccountForm';
import { Account } from '../db';
import { invoke } from '@tauri-apps/api/core';

const AccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | undefined>();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });
  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAccountId, setDeleteAccountId] = useState<number | null>(null);

  const loadAccounts = async () => {
    try {
      setIsLoading(true);
      const result = await invoke('get_accounts') as Account[];
      setAccounts(result);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load accounts.',
        severity: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial load
    loadAccounts();
    // 복원 후 데이터 새로고침을 위한 이벤트 리스너
    const handler = () => loadAccounts();
    window.addEventListener('accountsUpdated', handler);
    window.addEventListener('transactionsUpdated', handler);
    window.addEventListener('budgetsUpdated', handler);
    return () => {
      window.removeEventListener('accountsUpdated', handler);
      window.removeEventListener('transactionsUpdated', handler);
      window.removeEventListener('budgetsUpdated', handler);
    };
  }, []);

  const handleAddAccount = () => {
    setSelectedAccount(undefined);
    setIsFormOpen(true);
  };

  const handleEditAccount = (account: Account) => {
    setSelectedAccount(account);
    setIsFormOpen(true);
  };

  // Open confirmation dialog for account deletion
  const handleDeleteAccount = (accountId: number) => {
    setDeleteAccountId(accountId);
    setDeleteDialogOpen(true);
  };

  // Confirm and perform deletion
  const handleConfirmDelete = async () => {
    if (deleteAccountId == null) return;
    try {
      const updatedAccounts = await invoke<Account[]>('delete_account', { id: deleteAccountId });
      setAccounts(updatedAccounts);
      
      // 다른 페이지가 계정 삭제를 인식하도록 이벤트 발생
      window.dispatchEvent(new Event('accountsUpdated'));
      
      setSnackbar({ open: true, message: 'Account deleted successfully.', severity: 'success' });
    } catch (error) {
      console.error('Failed to delete account:', error);
      setSnackbar({ open: true, message: 'Failed to delete account.', severity: 'error' });
    } finally {
      setDeleteDialogOpen(false);
      setDeleteAccountId(null);
    }
  };

  // Cancel deletion
  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setDeleteAccountId(null);
  };

  const handleSaveAccount = async (accountData: Partial<Account>) => {
    try {
      let updatedAccounts: Account[];
      
      if (selectedAccount) {
        updatedAccounts = await invoke<Account[]>('update_account', {
          account: {
            id: selectedAccount.id,
            name: accountData.name!,
            type: accountData.type!,
            balance: selectedAccount.balance,
            description: accountData.description,
            created_at: selectedAccount.created_at,
          }
        });
      } else {
        updatedAccounts = await invoke<Account[]>('create_account', {
          name: accountData.name!,
          accountType: accountData.type!,
        });
      }
      
      setAccounts(updatedAccounts);
      setIsFormOpen(false);
      
      // 다른 페이지가 계정 변경을 인식하도록 이벤트 발생
      window.dispatchEvent(new Event('accountsUpdated'));
      
      setSnackbar({
        open: true,
        message: `Account ${selectedAccount ? 'updated' : 'added'} successfully.`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to save account:', error);
      setSnackbar({
        open: true,
        message: `Failed to ${selectedAccount ? 'update' : 'add'} account.`,
        severity: 'error',
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Account Summary</Typography>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<AddIcon />}
            onClick={handleAddAccount}
          >
            Add New Account
          </Button>
        </Box>

        <AccountList
          accounts={accounts}
          onEdit={handleEditAccount}
          onDelete={handleDeleteAccount}
          isLoading={isLoading}
        />

        <AccountForm
          open={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSave={handleSaveAccount}
          account={selectedAccount}
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

        {/* Confirmation Dialog for Delete Account */}
        <Dialog open={deleteDialogOpen} onClose={handleCancelDelete}>
          <DialogTitle>Delete Account</DialogTitle>
          <DialogContent>
            Are you sure you want to delete this account?
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCancelDelete}>Cancel</Button>
            <Button onClick={handleConfirmDelete} color="error">Delete</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};

export default AccountsPage; 