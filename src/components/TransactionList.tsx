import React, { useState, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

export interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: string[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: number) => Promise<void>;
  onCategoryChange: (id: number, category: string) => Promise<void>;
  onDescriptionChange?: (id: number, description: string) => Promise<void>;
  initialSelectedIds?: number[];
}

const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  accounts,
  categories,
  onEdit,
  onDelete,
  onCategoryChange,
  onDescriptionChange,
  initialSelectedIds = [],
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
  // Full categories with type info for filtering
  interface FullCategory { 
    id: number; 
    name: string; 
    type: 'income' | 'expense' | 'adjust' | 'transfer'; 
  }
  const [fullCategories, setFullCategories] = useState<FullCategory[]>([]);
  const [editDescriptionId, setEditDescriptionId] = useState<number | null>(null);
  const [editDescriptionValue, setEditDescriptionValue] = useState<string>('');

  // Pre-select newly imported transactions
  useEffect(() => {
    if (initialSelectedIds.length) {
      setSelectedIds(initialSelectedIds);
    }
  }, [initialSelectedIds]);

  // Load full categories for inline dropdown filtering
  useEffect(() => {
    invoke('get_categories_full')
      .then(res => {
        console.log('Loaded full categories:', res);
        setFullCategories(res as FullCategory[]);
      })
      .catch(err => console.error('Failed to load full categories:', err));
  }, [categories]);

  // Bulk operation handlers
  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await onDelete(id);
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
    // 부호를 그대로 표시
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
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

  // 표시용 금액 변환 함수
  const getDisplayAmount = (transaction: Transaction) => {
    if (transaction.type === 'expense') {
      return -Math.abs(transaction.amount);
    }
    if (transaction.type === 'income') {
      return Math.abs(transaction.amount);
    }
    if (transaction.type === 'transfer' || transaction.type === 'adjust') {
      if (transaction.category === 'Transfer Out' || transaction.category === 'Subtract') {
        return -Math.abs(transaction.amount);
      }
      if (transaction.category === 'Transfer In' || transaction.category === 'Add') {
        return Math.abs(transaction.amount);
      }
    }
    return transaction.amount;
  };

  return (
    <>
      <Box sx={{ mb: 1, p: 1, backgroundColor: 'background.paper', borderRadius: 1 }}>
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
              onChange={(e) => setSelectedTypes(
                typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value
              )}
              input={<OutlinedInput label="Type" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
              MenuProps={{ MenuListProps: { dense: true } }}
            >
              {['income', 'expense', 'transfer'].map((type) => (
                <MenuItem key={type} value={type} dense>
                  <Checkbox checked={selectedTypes.indexOf(type) > -1} size="small" />
                  <ListItemText primary={type.charAt(0).toUpperCase() + type.slice(1)} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Category</InputLabel>
            <Select
              multiple
              value={selectedCategories}
              onChange={(e) => setSelectedCategories(
                typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value
              )}
              input={<OutlinedInput label="Category" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
              MenuProps={{ MenuListProps: { dense: true } }}
            >
              {uniqueCategories.map((category) => (
                <MenuItem key={category} value={category} dense>
                  <Checkbox checked={selectedCategories.indexOf(category) > -1} size="small" />
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
              onChange={(e) => setSelectedAccounts(
                typeof e.target.value === 'string' ? e.target.value.split(',').map(Number) : e.target.value
              )}
              input={<OutlinedInput label="Account" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={getAccountName(value)} size="small" />
                  ))}
                </Box>
              )}
              MenuProps={{ MenuListProps: { dense: true } }}
            >
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id} dense>
                  <Checkbox checked={selectedAccounts.indexOf(account.id) > -1} />
                  <ListItemText primary={account.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="From Date"
              value={dateRange.start ? new Date(dateRange.start) : null}
              onChange={(newDate) => setDateRange(prev => ({
                ...prev,
                start: newDate ? newDate.toISOString().split('T')[0] : ''
              }))}
              slotProps={{ textField: { size: 'small' } }}
            />
            <DatePicker
              label="To Date"
              value={dateRange.end ? new Date(dateRange.end) : null}
              onChange={(newDate) => setDateRange(prev => ({
                ...prev,
                end: newDate ? newDate.toISOString().split('T')[0] : ''
              }))}
              slotProps={{ textField: { size: 'small' } }}
            />
          </LocalizationProvider>
        </Box>
      </Box>

      {/* Bulk action buttons */}
      <Box sx={{ display: 'flex', gap: 1, p: 0.5 }}>
        <Button variant="outlined" disabled={selectedIds.length === 0} onClick={handleBulkDelete}>
          Delete Selected
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={2} sx={{ width: '100%' }}>
        <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
        <TableHead>
          <TableRow>
              <TableCell padding="checkbox" sx={{ width: 40 }}>
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
              <TableCell sx={{ width: 100, whiteSpace: 'nowrap' }}>Date</TableCell>
              <TableCell sx={{ width: 120, whiteSpace: 'nowrap' }}>Account</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Description</TableCell>
              <TableCell sx={{ width: 180, whiteSpace: 'nowrap', px: 1, fontSize: '0.9rem' }}>Category</TableCell>
              <TableCell sx={{ width: 100, whiteSpace: 'nowrap' }}>Amount</TableCell>
              <TableCell sx={{ width: 100, whiteSpace: 'nowrap' }}>Type</TableCell>
              <TableCell align="right" sx={{ width: 100, whiteSpace: 'nowrap' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
            {filteredTransactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} align="center">
                <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
                    No transactions found
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
              filteredTransactions.map((transaction) => (
              <TableRow key={transaction.id}>
                  <TableCell padding="checkbox" sx={{ width: 40 }}>
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
                  <TableCell sx={{ width: 100, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{transaction.date}</TableCell>
                  <TableCell sx={{ width: 120, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{getAccountName(transaction.account_id)}</TableCell>
                  <TableCell
                    sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    onClick={() => {
                      setEditDescriptionId(transaction.id);
                      setEditDescriptionValue(transaction.payee);
                    }}
                    style={{ cursor: 'text' }}
                  >
                    {editDescriptionId === transaction.id ? (
                      <TextField
                        value={editDescriptionValue}
                        size="small"
                        variant="standard"
                        onChange={e => setEditDescriptionValue(e.target.value)}
                        onBlur={async () => {
                          if (typeof onDescriptionChange === 'function') {
                            await onDescriptionChange(transaction.id, editDescriptionValue.trim());
                          }
                          setEditDescriptionId(null);
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            if (typeof onDescriptionChange === 'function') {
                              await onDescriptionChange(transaction.id, editDescriptionValue.trim());
                            }
                            setEditDescriptionId(null);
                          } else if (e.key === 'Escape') {
                            setEditDescriptionId(null);
                          }
                        }}
                        autoFocus
                        sx={{ 
                          width: '100%', 
                          fontSize: '0.9rem', 
                          p: 0,
                          '& .MuiInputBase-input': {
                            fontSize: '0.9rem !important',
                            lineHeight: '1.2',
                            padding: '0 !important'
                          },
                          '& .MuiInputBase-root': {
                            fontSize: '0.9rem !important'
                          }
                        }}
                      />
                    ) : (
                      <Typography noWrap sx={{ fontSize: '0.9rem' }}>{transaction.payee}</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ width: 180, whiteSpace: 'nowrap', px: 1, fontSize: '0.9rem' }}>
                    <Select
                      value={transaction.category}
                      size="small"
                      variant="standard"
                      disableUnderline
                      onChange={(e) => onCategoryChange(transaction.id, e.target.value as string)}
                      sx={{
                        width: '100%',
                        height: '24px',
                        padding: '0 4px',
                        fontSize: '0.9rem',
                        '.MuiSelect-icon': { fontSize: '1rem', right: 4 },
                      }}
                    >
                      {fullCategories
                        .filter(c => {
                          if (transaction.type === 'adjust') {
                            return c.type === 'adjust';
                          } else if (transaction.type === 'transfer') {
                            return c.type === 'transfer';
                          } else if (transaction.type === 'income') {
                            return c.type === 'income';
                          } else if (transaction.type === 'expense') {
                            return c.type === 'expense';
                          }
                          return c.type === transaction.type;
                        })
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(c => (
                          <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                        ))}
                      {categories.includes('Uncategorized') && (
                        <MenuItem key="Uncategorized" value="Uncategorized">Uncategorized</MenuItem>
                      )}
                    </Select>
                  </TableCell>
                  <TableCell sx={{ width: 100, whiteSpace: 'nowrap', px: 1 }}>
                    <Typography
                      sx={{ fontSize: '0.9rem' }}
                      color={
                        getDisplayAmount(transaction) < 0 ? 'error' :
                        getDisplayAmount(transaction) > 0 ? 'success' :
                        'text.primary'
                      }
                    >
                      {formatCurrency(getDisplayAmount(transaction))}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: 100, whiteSpace: 'nowrap', px: 1 }}>
                    <Chip
                      label={transaction.type}
                      size="small"
                      color={
                        transaction.type === 'income' ? 'success' :
                        transaction.type === 'expense' ? 'error' :
                        transaction.type === 'adjust' && transaction.category === 'Subtract' ? 'error' :
                        transaction.type === 'adjust' && transaction.category === 'Add' ? 'success' :
                        'info'
                      }
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ width: 100, whiteSpace: 'nowrap' }}>
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