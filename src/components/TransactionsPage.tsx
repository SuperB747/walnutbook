import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Button,
  Snackbar,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Add as AddIcon, Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material';
import TransactionList from './TransactionList';
import TransactionForm from './TransactionForm';
import { Transaction, Account } from '../db';

const { ipcRenderer } = window.electron;

const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const loadTransactions = async () => {
    try {
      const accountId = selectedAccountId === 'all' ? undefined : Number(selectedAccountId);
      const result = await ipcRenderer.invoke('getTransactions', accountId);
      setTransactions(result);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setSnackbar({
        open: true,
        message: '거래 내역을 불러오는데 실패했습니다.',
        severity: 'error',
      });
    }
  };

  const loadAccounts = async () => {
    try {
      const result = await ipcRenderer.invoke('getAccounts');
      setAccounts(result);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      setSnackbar({
        open: true,
        message: '계좌 목록을 불러오는데 실패했습니다.',
        severity: 'error',
      });
    }
  };

  useEffect(() => {
    loadAccounts();
    loadTransactions();
  }, [selectedAccountId]);

  const handleAddTransaction = () => {
    setSelectedTransaction(undefined);
    setIsFormOpen(true);
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsFormOpen(true);
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    if (window.confirm('정말로 이 거래 내역을 삭제하시겠습니까?')) {
      try {
        await ipcRenderer.invoke('deleteTransaction', transactionId);
        await loadTransactions();
        setSnackbar({
          open: true,
          message: '거래 내역이 삭제되었습니다.',
          severity: 'success',
        });
      } catch (error) {
        console.error('Failed to delete transaction:', error);
        setSnackbar({
          open: true,
          message: '거래 내역 삭제에 실패했습니다.',
          severity: 'error',
        });
      }
    }
  };

  const handleSaveTransaction = async (transactionData: Partial<Transaction>) => {
    try {
      if (selectedTransaction) {
        await ipcRenderer.invoke('updateTransaction', {
          ...transactionData,
          id: selectedTransaction.id,
        });
      } else {
        await ipcRenderer.invoke('createTransaction', transactionData);
      }
      await loadTransactions();
      setIsFormOpen(false);
      setSnackbar({
        open: true,
        message: `거래 내역이 ${selectedTransaction ? '수정' : '추가'}되었습니다.`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to save transaction:', error);
      setSnackbar({
        open: true,
        message: `거래 내역 ${selectedTransaction ? '수정' : '추가'}에 실패했습니다.`,
        severity: 'error',
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const filteredTransactions = transactions.filter((transaction) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      transaction.payee.toLowerCase().includes(searchLower) ||
      transaction.category.toLowerCase().includes(searchLower) ||
      transaction.notes?.toLowerCase().includes(searchLower) ||
      accounts.find(a => a.id === transaction.account_id)?.name.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flex: 1 }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>계좌</InputLabel>
              <Select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                label="계좌"
              >
                <MenuItem value="all">전체 계좌</MenuItem>
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              placeholder="거래처, 카테고리, 메모로 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ flex: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchTerm && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm('')}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddTransaction}
            sx={{ ml: 2 }}
          >
            새 거래 추가
          </Button>
        </Box>

        <TransactionList
          transactions={filteredTransactions}
          accounts={accounts}
          onEditTransaction={handleEditTransaction}
          onDeleteTransaction={handleDeleteTransaction}
        />

        <TransactionForm
          open={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSave={handleSaveTransaction}
          transaction={selectedTransaction}
          accounts={accounts}
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

export default TransactionsPage; 