import React, { useState, useEffect } from 'react';
import { Container, Box, Button, Snackbar, Alert } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import AccountList from './AccountList';
import AccountForm from './AccountForm';
import { Account } from '../db';
import { invoke } from '@tauri-apps/api/core';

const AccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
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

  const loadAccounts = async () => {
    try {
      const result = await invoke('get_accounts') as Account[];
      setAccounts(result);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      setSnackbar({
        open: true,
        message: 'Failed to load accounts.',
        severity: 'error',
      });
    }
  };

  useEffect(() => {
    // Initial load
    loadAccounts();
    // Reload whenever accountsUpdated event is fired
    const handler = () => loadAccounts();
    window.addEventListener('accountsUpdated', handler);
    return () => window.removeEventListener('accountsUpdated', handler);
  }, []);

  const handleAddAccount = () => {
    setSelectedAccount(undefined);
    setIsFormOpen(true);
  };

  const handleEditAccount = (account: Account) => {
    setSelectedAccount(account);
    setIsFormOpen(true);
  };

  const handleDeleteAccount = async (accountId: number) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      try {
        await invoke('delete_account', { id: accountId });
        await loadAccounts();
        setSnackbar({
          open: true,
          message: 'Account deleted successfully.',
          severity: 'success',
        });
      } catch (error) {
        console.error('Failed to delete account:', error);
        setSnackbar({
          open: true,
          message: 'Failed to delete account.',
          severity: 'error',
        });
      }
    }
  };

  const handleSaveAccount = async (accountData: Partial<Account>) => {
    try {
      if (selectedAccount) {
        await invoke<Account[]>('update_account', {
          account: {
            id: selectedAccount.id,
            name: accountData.name!,
            type: accountData.type!,
            balance: selectedAccount.balance,
            created_at: selectedAccount.created_at,
          }
        });
      } else {
        await invoke<Account[]>('create_account', {
          name: accountData.name!,
          accountType: accountData.type!,
        });
      }
      await loadAccounts();
      setIsFormOpen(false);
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
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="contained"
            color="primary"
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

export default AccountsPage; 