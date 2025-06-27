import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Typography,
  TextField,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput,
  Button,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { Transaction, Account } from '../db';
import { format } from 'date-fns';

export interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: string[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: number) => Promise<void>;
  onCategoryChange: (id: number, category: string) => Promise<void>;
  onStatusChange: (id: number, status: Transaction['status']) => Promise<void>;
}

const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  accounts,
  categories,
  onEdit,
  onDelete,
  onCategoryChange,
  onStatusChange,
}) => {
  // 검색 및 필터 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<{start: string; end: string}>({
    start: '',
    end: '',
  });
  // Selected transaction IDs for bulk operations
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // Bulk operation handlers
  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await onDelete(id);
    }
    setSelectedIds([]);
  };
  const handleBulkMarkCleared = async () => {
    for (const id of selectedIds) {
      await onStatusChange(id, 'cleared');
    }
    setSelectedIds([]);
  };

  // 모든 고유 카테고리 추출
  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(transactions.map(t => t.category)));
  }, [transactions]);

  // 필터링된 거래 내역
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      // 검색어 필터링
      const searchMatch = searchTerm === '' || 
        transaction.payee.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.category.toLowerCase().includes(searchTerm.toLowerCase());

      // 거래 유형 필터링
      const typeMatch = selectedTypes.length === 0 || 
        selectedTypes.includes(transaction.type);

      // 카테고리 필터링
      const categoryMatch = selectedCategories.length === 0 ||
        selectedCategories.includes(transaction.category);

      // 계좌 필터링
      const accountMatch = selectedAccounts.length === 0 ||
        selectedAccounts.includes(transaction.account_id);

      // 날짜 범위 필터링
      const dateMatch = (!dateRange.start || transaction.date >= dateRange.start) &&
        (!dateRange.end || transaction.date <= dateRange.end);

      return searchMatch && typeMatch && categoryMatch && accountMatch && dateMatch;
    });
  }, [transactions, searchTerm, selectedTypes, selectedCategories, selectedAccounts, dateRange]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'income':
        return 'success';
      case 'expense':
        return 'error';
      case 'transfer':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'cleared':
        return 'success';
      case 'reconciled':
        return 'info';
      default:
        return 'warning';
    }
  };

  const getAccountName = (accountId: number): string => {
    const account = accounts.find(a => a.id === accountId);
    return account ? account.name : 'Unknown Account';
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'income':
        return 'Income';
      case 'expense':
        return 'Expense';
      case 'transfer':
        return 'Transfer';
      default:
        return type;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'cleared':
        return 'Cleared';
      case 'reconciled':
        return 'Reconciled';
      case 'uncleared':
        return 'Uncleared';
      default:
        return status;
    }
  };

  return (
    <>
      <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Filters</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Search"
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ flexGrow: 1 }}
          />
          
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Type</InputLabel>
            <Select
              multiple
              value={selectedTypes}
              onChange={(e) => setSelectedTypes(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              input={<OutlinedInput label="Type" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              <MenuItem value="income">Income</MenuItem>
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="transfer">Transfer</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Category</InputLabel>
            <Select
              multiple
              value={selectedCategories}
              onChange={(e) => setSelectedCategories(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              input={<OutlinedInput label="Category" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              {uniqueCategories.map((category) => (
                <MenuItem key={category} value={category}>
                  <Checkbox checked={selectedCategories.indexOf(category) > -1} />
                  <ListItemText primary={category} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Account</InputLabel>
            <Select
              multiple
              value={selectedAccounts}
              onChange={(e) => setSelectedAccounts(typeof e.target.value === 'string' ? e.target.value.split(',').map(Number) : e.target.value)}
              input={<OutlinedInput label="Account" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={getAccountName(value)} size="small" />
                  ))}
                </Box>
              )}
            >
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  <Checkbox checked={selectedAccounts.indexOf(account.id) > -1} />
                  <ListItemText primary={account.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="From Date"
            type="date"
            size="small"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="To Date"
            type="date"
            size="small"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </Box>

      {/* Bulk action buttons */}
      <Box sx={{ display: 'flex', gap: 1, p: 1 }}>
        <Button variant="outlined" disabled={selectedIds.length === 0} onClick={handleBulkDelete}>
          Delete Selected
        </Button>
        <Button variant="outlined" disabled={selectedIds.length === 0} onClick={handleBulkMarkCleared}>
          Mark Cleared
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedIds.length > 0 && selectedIds.length < filteredTransactions.length}
                  checked={filteredTransactions.length > 0 && selectedIds.length === filteredTransactions.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(filteredTransactions.map((t) => t.id));
                    } else {
                      setSelectedIds([]);
                    }
                  }}
                />
              </TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Account</TableCell>
              <TableCell>Payee</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
                    No transactions found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedIds.includes(transaction.id)}
                      onChange={(e) => {
                        const id = transaction.id;
                        setSelectedIds((prev) =>
                          e.target.checked ? [...prev, id] : prev.filter((i) => i !== id)
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell>{format(new Date(transaction.date), 'yyyy-MM-dd')}</TableCell>
                  <TableCell>{getAccountName(transaction.account_id)}</TableCell>
                  <TableCell>{transaction.payee}</TableCell>
                  <TableCell>
                    <Select
                      value={transaction.category}
                      size="small"
                      onChange={(e) => onCategoryChange(transaction.id, e.target.value as string)}
                    >
                      {categories.map(cat => (
                        <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Typography
                      color={transaction.type === 'expense' ? 'error' : 'success'}
                    >
                      {formatCurrency(transaction.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={transaction.type}
                      size="small"
                      color={
                        transaction.type === 'income' ? 'success' :
                        transaction.type === 'expense' ? 'error' : 'info'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {/* Clear/Unclear toggle */}
                    <Checkbox
                      checked={transaction.status === 'cleared'}
                      onChange={(e) => onStatusChange(transaction.id, e.target.checked ? 'cleared' : 'uncleared')}
                      color="primary"
                    />
                  </TableCell>
                  <TableCell>{transaction.notes || '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => onEdit(transaction)}
                      sx={{ mr: 1 }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => onDelete(transaction.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default TransactionList; 