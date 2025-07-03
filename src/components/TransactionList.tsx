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
  Popover,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  FilterList as FilterIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { Transaction, Account } from '../db';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { parse } from 'date-fns';

export interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: string[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: number) => Promise<void>;
  onCategoryChange: (id: number, category: string) => Promise<void>;
  onDescriptionChange?: (id: number, description: string) => Promise<void>;
  initialSelectedIds?: number[];
  onAddTransaction?: () => void;
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
  onAddTransaction,
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
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'single' | 'bulk' | null;
    targetId?: number;
    anchorPosition?: { top: number; left: number };
  }>({ open: false, type: null });

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
  const handleBulkDelete = async (event?: React.MouseEvent) => {
    setConfirmDialog({
      open: true,
      type: 'bulk',
      anchorPosition: event ? { top: event.clientY, left: event.clientX } : undefined
    });
  };
  const handleSingleDelete = (id: number, event: React.MouseEvent) => {
    setConfirmDialog({
      open: true,
      type: 'single',
      targetId: id,
      anchorPosition: { top: event.clientY, left: event.clientX }
    });
  };
  const handleConfirm = async () => {
    if (confirmDialog.type === 'single' && confirmDialog.targetId !== undefined) {
      await onDelete(confirmDialog.targetId);
    } else if (confirmDialog.type === 'bulk') {
      for (const id of selectedIds) {
        await onDelete(id);
      }
      setSelectedIds([]);
    }
    setConfirmDialog({ open: false, type: null });
  };
  const handleCancel = () => setConfirmDialog({ open: false, type: null });

  // Clear all filters
  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedTypes([]);
    setSelectedCategories([]);
    setSelectedAccounts([]);
    setDateRange({ start: '', end: '' });
  };

  // 모든 고유 카테고리 추출 (transfer, adjust 타입 제외)
  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(
      transactions
        .filter(t => t.type !== 'transfer' && t.type !== 'adjust')
        .map(t => t.category)
    ));
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
    // Transfer, expense, income, adjust 모두 백엔드에서 저장된 amount를 그대로 사용
    return transaction.amount;
  };

  // Transfer payee 포맷을 사용자 친화적으로 변환
  const getDisplayPayee = (transaction: Transaction) => {
    // For transfer transactions, combine notes (account info) and payee (description)
    if (transaction.type === 'transfer') {
      const accountInfo = transaction.notes || '';
      const description = transaction.payee || '';
      if (accountInfo && description) {
        return `${accountInfo} ${description}`;
      } else if (accountInfo) {
        return accountInfo;
      } else if (description) {
        return description;
      }
      return transaction.payee;
    }
    return transaction.payee;
  };

  // Check if this is a transfer transaction that can be edited (from account)
  const isEditableTransfer = (transaction: Transaction) => {
    if (transaction.type !== 'transfer') return true;
    
    // Transfer 거래에서 출발 계좌인지 확인 (음수 금액이거나 [To: account] 형식의 notes)
    return transaction.amount < 0 || (transaction.notes && transaction.notes.includes('[To:'));
  };

  return (
    <>
      <Box sx={{ mb: 1, p: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, minHeight: 56 }}>
        <TextField
          label="Search"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{
            minWidth: 120,
            flex: 1,
            '& .MuiInputLabel-root': {
              backgroundColor: '#fafbfc',
              px: 0.75,
              zIndex: 2,
              transition: 'background-color 0.2s, padding 0.2s',
              '&.MuiInputLabel-shrink': {
                backgroundColor: '#fafbfc',
                px: 0.75,
                zIndex: 2,
              },
            },
            '& .MuiOutlinedInput-notchedOutline': {
              transition: 'border-color 0.1s',
            },
          }}
        />
        <FormControl size="small" sx={{
          minWidth: 120,
          '& .MuiInputLabel-root': {
            backgroundColor: '#fafbfc',
            px: 0.75,
            zIndex: 2,
            transition: 'background-color 0.2s, padding 0.2s',
            '&.MuiInputLabel-shrink': {
              backgroundColor: '#fafbfc',
              px: 0.75,
              zIndex: 2,
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            transition: 'border-color 0.1s',
          },
        }}>
          <InputLabel>Account</InputLabel>
          <Select
            multiple
            value={selectedAccounts}
            onChange={(e) => setSelectedAccounts(
              typeof e.target.value === 'string' ? e.target.value.split(',').map(Number) : e.target.value
            )}
            input={<OutlinedInput label="Account" />}
            sx={{ 
              backgroundColor: 'transparent',
              '& .MuiSelect-icon': {
                right: 8,
                position: 'absolute'
              }
            }}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pr: 2 }}>
                {selected.map((value) => (
                  <Chip key={value} label={getAccountName(value)} size="small" sx={{ backgroundColor: 'transparent', boxShadow: 'none', border: 'none' }} />
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
        <FormControl size="small" sx={{
          minWidth: 100,
          '& .MuiInputLabel-root': {
            backgroundColor: '#fafbfc',
            px: 0.75,
            zIndex: 2,
            transition: 'background-color 0.2s, padding 0.2s',
            '&.MuiInputLabel-shrink': {
              backgroundColor: '#fafbfc',
              px: 0.75,
              zIndex: 2,
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            transition: 'border-color 0.1s',
          },
        }}>
          <InputLabel>Type</InputLabel>
          <Select
            multiple
            value={selectedTypes}
            onChange={(e) => setSelectedTypes(
              typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value
            )}
            input={<OutlinedInput label="Type" />}
            sx={{ backgroundColor: 'transparent' }}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} size="small" sx={{ backgroundColor: 'transparent', boxShadow: 'none', border: 'none' }} />
                ))}
              </Box>
            )}
            MenuProps={{ MenuListProps: { dense: true } }}
          >
            {['income', 'expense', 'transfer', 'adjust'].map((type) => (
              <MenuItem key={type} value={type} dense>
                <Checkbox checked={selectedTypes.indexOf(type) > -1} size="small" />
                <ListItemText primary={type.charAt(0).toUpperCase() + type.slice(1)} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{
          minWidth: 120,
          '& .MuiInputLabel-root': {
            backgroundColor: '#fafbfc',
            px: 0.75,
            zIndex: 2,
            transition: 'background-color 0.2s, padding 0.2s',
            '&.MuiInputLabel-shrink': {
              backgroundColor: '#fafbfc',
              px: 0.75,
              zIndex: 2,
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            transition: 'border-color 0.1s',
          },
        }}>
          <InputLabel>Category</InputLabel>
          <Select
            multiple
            value={selectedCategories}
            onChange={(e) => setSelectedCategories(
              typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value
            )}
            input={<OutlinedInput label="Category" />}
            sx={{ 
              backgroundColor: 'transparent',
              '& .MuiSelect-icon': {
                right: 8,
                position: 'absolute'
              }
            }}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pr: 2 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} size="small" sx={{ backgroundColor: 'transparent', boxShadow: 'none', border: 'none' }} />
                ))}
              </Box>
            )}
            MenuProps={{ MenuListProps: { dense: true } }}
          >
            {uniqueCategories.sort().map((category) => (
              <MenuItem key={category} value={category} dense>
                <Checkbox checked={selectedCategories.indexOf(category) > -1} size="small" />
                <ListItemText primary={category} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            label="From Date"
            value={dateRange.start ? parse(dateRange.start, 'yyyy-MM-dd', new Date()) : null}
            onChange={(newDate) => setDateRange(prev => ({
              ...prev,
              start: newDate ? newDate.toISOString().split('T')[0] : ''
            }))}
            slotProps={{
              textField: {
                size: 'small',
                sx: {
                  width: 150,
                  '& .MuiInputLabel-root': {
                    backgroundColor: '#fafbfc',
                    px: 0.75,
                    zIndex: 2,
                    transition: 'background-color 0.2s, padding 0.2s',
                    '&.MuiInputLabel-shrink': {
                      backgroundColor: '#fafbfc',
                      px: 0.75,
                      zIndex: 2,
                    },
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    transition: 'border-color 0.1s',
                  },
                  '& .MuiIconButton-root': {
                    backgroundColor: 'transparent !important',
                    color: '#234075 !important',
                    transition: 'background-color 0.15s',
                    '&:hover, &:focus-visible': {
                      backgroundColor: 'rgba(35,64,117,0.08) !important',
                      color: '#234075 !important',
                    },
                    '&:active': {
                      backgroundColor: 'transparent !important',
                      color: '#234075 !important',
                    },
                    '&:focus': {
                      backgroundColor: 'transparent !important',
                    },
                  }
                },
              },
            }}
          />
          <DatePicker
            label="To Date"
            value={dateRange.end ? parse(dateRange.end, 'yyyy-MM-dd', new Date()) : null}
            onChange={(newDate) => setDateRange(prev => ({
              ...prev,
              end: newDate ? newDate.toISOString().split('T')[0] : ''
            }))}
            slotProps={{
              textField: {
                size: 'small',
                sx: {
                  width: 150,
                  '& .MuiInputLabel-root': {
                    backgroundColor: '#fafbfc',
                    px: 0.75,
                    zIndex: 2,
                    transition: 'background-color 0.2s, padding 0.2s',
                    '&.MuiInputLabel-shrink': {
                      backgroundColor: '#fafbfc',
                      px: 0.75,
                      zIndex: 2,
                    },
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    transition: 'border-color 0.1s',
                  },
                  '& .MuiIconButton-root': {
                    backgroundColor: 'transparent !important',
                    color: '#234075 !important',
                    transition: 'background-color 0.15s',
                    '&:hover, &:focus-visible': {
                      backgroundColor: 'rgba(35,64,117,0.08) !important',
                      color: '#234075 !important',
                    },
                    '&:active': {
                      backgroundColor: 'transparent !important',
                      color: '#234075 !important',
                    },
                    '&:focus': {
                      backgroundColor: 'transparent !important',
                    },
                  }
                },
              },
            }}
          />
        </LocalizationProvider>
        <Button
          variant="outlined"
          size="small"
          onClick={handleClearFilters}
          sx={{
            minWidth: 100,
            height: 40
          }}
        >
          Clear Filters
        </Button>
      </Box>

      {/* Bulk action buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, p: 0.5 }}>
        <Button variant="outlined" disabled={selectedIds.length === 0} onClick={handleBulkDelete}>
          Delete Selected
        </Button>
        {onAddTransaction && (
          <Button variant="contained" color="secondary" onClick={onAddTransaction} startIcon={<AddIcon />}>
            Add Transaction
          </Button>
        )}
      </Box>

      <TableContainer component={Paper} elevation={2} sx={{ 
        width: '100%',
        overflowX: 'auto',
        '& .MuiTable-root': {
          minWidth: '100%',
        }
      }}>
        <Table size="small" sx={{ 
          tableLayout: 'fixed', 
          width: '100%',
          minWidth: '800px'
        }}>
        <TableHead>
          <TableRow>
              <TableCell padding="checkbox" sx={{ width: 50, minWidth: 50 }}>
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
              <TableCell align="left" sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap' }}>Date</TableCell>
              <TableCell align="left" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>Account</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Description</TableCell>
              <TableCell align="center" sx={{ width: 180, minWidth: 180, whiteSpace: 'nowrap', px: 1, fontSize: '0.9rem' }}>Category</TableCell>
              <TableCell align="center"sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap', pr: 4 }}>Amount</TableCell>
              <TableCell align="center"sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap' }}>Type</TableCell>
              <TableCell align="center" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>Actions</TableCell>
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
                  <TableCell padding="checkbox" sx={{ width: 50, minWidth: 50 }}>
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
                  <TableCell sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{transaction.date}</TableCell>
                  <TableCell sx={{ width: 100, minWidth: 100, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{getAccountName(transaction.account_id)}</TableCell>
                  <TableCell
                    sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    onClick={() => {
                      setEditDescriptionId(transaction.id);
                      // For transfer transactions, only show description (payee) for editing
                      if (transaction.type === 'transfer') {
                        setEditDescriptionValue(transaction.payee || '');
                      } else {
                        setEditDescriptionValue(transaction.payee);
                      }
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
                      <Typography noWrap sx={{ fontSize: '0.9rem' }}>{getDisplayPayee(transaction)}</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{ width: 180, minWidth: 180, whiteSpace: 'nowrap', px: 1, fontSize: '0.9rem' }}>
                    {(transaction.type === 'income' || transaction.type === 'expense') ? (
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
                          .filter(c => c.type === transaction.type)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(c => (
                            <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                          ))}
                        {categories.includes('Uncategorized') && (
                          <MenuItem key="Uncategorized" value="Uncategorized">Uncategorized</MenuItem>
                        )}
                      </Select>
                    ) : (
                      ''
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap', px: 1, pr: 4 }}>
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
                  <TableCell align="center" sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap', px: 1 }}>
                    <Chip
                      label={transaction.type === 'adjust' ? 'Adjust' : transaction.type}
                      size="small"
                      color={
                        transaction.type === 'adjust'
                          ? getDisplayAmount(transaction) < 0
                            ? undefined
                            : 'info'
                        : transaction.type === 'income'
                          ? 'success'
                        : transaction.type === 'expense'
                          ? 'error'
                        : transaction.type === 'transfer' && getDisplayAmount(transaction) < 0
                          ? 'secondary'
                          : 'info'
                      }
                      sx={
                        transaction.type === 'adjust' && getDisplayAmount(transaction) < 0
                          ? { backgroundColor: '#e573c7', color: '#fff' }
                          : undefined
                      }
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>
                  {isEditableTransfer(transaction) && (
                    <IconButton
                      size="small"
                        onClick={() => onEdit(transaction)}
                      sx={{ 
                        mr: 1,
                        backgroundColor: 'transparent',
                        color: 'primary.main',
                        '&:hover': {
                          backgroundColor: 'rgba(25, 118, 210, 0.08)',
                          color: 'primary.dark'
                        }
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  )}
                  <IconButton
                    size="small"
                      onClick={(e) => handleSingleDelete(transaction.id, e)}
                    sx={{ 
                      backgroundColor: 'transparent',
                      color: 'error.main',
                      '&:hover': {
                        backgroundColor: 'rgba(244, 67, 54, 0.08)',
                        color: 'error.dark'
                      }
                    }}
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

    {/* Confirm Delete Dialog/Popover */}
    <Popover
      open={confirmDialog.open}
      anchorReference="anchorPosition"
      anchorPosition={confirmDialog.anchorPosition}
      onClose={handleCancel}
      PaperProps={{ sx: { p: 2, minWidth: 260 } }}
      disableRestoreFocus
    >
      <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>
        {confirmDialog.type === 'single'
          ? 'Delete Transaction'
          : `Delete ${selectedIds.length} Transactions`}
      </DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        <Typography>
          {confirmDialog.type === 'single'
            ? 'Are you sure you want to delete this transaction?'
            : `Are you sure you want to delete the selected ${selectedIds.length} transactions?`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} color="inherit">Cancel</Button>
        <Button onClick={handleConfirm} color="error" variant="contained">Delete</Button>
      </DialogActions>
    </Popover>
    </>
  );
};

export default TransactionList; 