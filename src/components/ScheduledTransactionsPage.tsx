import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Snackbar,
  Alert,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import ScheduledTransactionList from './ScheduledTransactionList';
import ScheduledTransactionForm from './ScheduledTransactionForm';
import { ScheduledTransaction, Account } from '../db';

const ScheduledTransactionsPage: React.FC = () => {
  const [scheduledTransactions, setScheduledTransactions] = useState<ScheduledTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<ScheduledTransaction | undefined>();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    loadScheduledTransactions();
    loadAccounts();
  }, []);

  const loadScheduledTransactions = async () => {
    try {
      const transactions = await window.electron.invoke('getScheduledTransactions');
      setScheduledTransactions(transactions);
    } catch (error) {
      console.error('Failed to load scheduled transactions:', error);
      showSnackbar('정기 거래 목록을 불러오는데 실패했습니다', 'error');
    }
  };

  const loadAccounts = async () => {
    try {
      const accountList = await window.electron.invoke('getAccounts');
      setAccounts(accountList);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      showSnackbar('계좌 목록을 불러오는데 실패했습니다', 'error');
    }
  };

  const handleAddTransaction = () => {
    setSelectedTransaction(undefined);
    setFormOpen(true);
  };

  const handleEditTransaction = (transaction: ScheduledTransaction) => {
    setSelectedTransaction(transaction);
    setFormOpen(true);
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    try {
      await window.electron.invoke('deleteScheduledTransaction', transactionId);
      await loadScheduledTransactions();
      showSnackbar('정기 거래가 삭제되었습니다', 'success');
    } catch (error) {
      console.error('Failed to delete scheduled transaction:', error);
      showSnackbar('정기 거래 삭제에 실패했습니다', 'error');
    }
  };

  const handleExecuteTransaction = async (transaction: ScheduledTransaction) => {
    try {
      await window.electron.invoke('executeScheduledTransaction', transaction);
      await loadScheduledTransactions();
      showSnackbar('정기 거래가 실행되었습니다', 'success');
    } catch (error) {
      console.error('Failed to execute scheduled transaction:', error);
      showSnackbar('정기 거래 실행에 실패했습니다', 'error');
    }
  };

  const handleSaveTransaction = async (transaction: Partial<ScheduledTransaction>) => {
    try {
      if (selectedTransaction) {
        await window.electron.invoke('updateScheduledTransaction', {
          ...transaction,
          id: selectedTransaction.id,
        });
        showSnackbar('정기 거래가 수정되었습니다', 'success');
      } else {
        await window.electron.invoke('createScheduledTransaction', transaction);
        showSnackbar('정기 거래가 추가되었습니다', 'success');
      }
      setFormOpen(false);
      await loadScheduledTransactions();
    } catch (error) {
      console.error('Failed to save scheduled transaction:', error);
      showSnackbar('정기 거래 저장에 실패했습니다', 'error');
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({
      ...prev,
      open: false,
    }));
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" component="h1">
          정기 거래 관리
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleAddTransaction}
        >
          새 정기 거래
        </Button>
      </Box>

      <ScheduledTransactionList
        scheduledTransactions={scheduledTransactions}
        accounts={accounts}
        onEditTransaction={handleEditTransaction}
        onDeleteTransaction={handleDeleteTransaction}
        onExecuteTransaction={handleExecuteTransaction}
      />

      <ScheduledTransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSaveTransaction}
        transaction={selectedTransaction}
        accounts={accounts}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
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
  );
};

export default ScheduledTransactionsPage; 