import React, { useState, useMemo, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Chip, Typography, TextField, Box, FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, OutlinedInput, Button, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { Transaction, Account, Category } from '../db';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { parse } from 'date-fns';
import { getCategoryName, formatCurrency, fixAmountSign } from '../utils';
import { invoke } from '@tauri-apps/api/core';

export interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: number) => Promise<void>;
  onBulkDelete?: (ids: number[]) => Promise<void>;
  onCategoryChange: (id: number, categoryId: number | undefined) => Promise<void>;
  onDescriptionChange?: (id: number, description: string) => Promise<void>;
  onNotesChange?: (id: number, notes: string) => Promise<void>;
  initialSelectedIds?: number[];
  importedIds?: number[];
  onAddTransaction?: () => void;
  filter: any;
  setFilter: React.Dispatch<React.SetStateAction<any>>;
  searchInput: string;
  setSearchInput: React.Dispatch<React.SetStateAction<string>>;
  selectedMonth?: string;
}

const getAccountName = (accounts: Account[], accountId: number): string => {
  const account = accounts.find(a => a.id === accountId);
  return account ? account.name : 'Unknown Account';
};

const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  accounts,
  categories,
  onEdit,
  onDelete,
  onBulkDelete,
  onCategoryChange,
  onDescriptionChange,
  onNotesChange,
  initialSelectedIds = [],
  importedIds = [],
  onAddTransaction,
  filter,
  setFilter,
  searchInput,
  setSearchInput,
  selectedMonth,
}) => {
  // Handle imported transactions
  useEffect(() => {
    if (importedIds && importedIds.length > 0) {
      // setSelectedIds(importedIds); // This state is now managed by the parent
    }
  }, [importedIds]);
  const [editDescriptionId, setEditDescriptionId] = useState<number | null>(null);
  const [editDescriptionValue, setEditDescriptionValue] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: 'single' | 'bulk' | null; targetId?: number; }>({ open: false, type: null });
  const [isDeleting, setIsDeleting] = useState(false);

  // 고유 카테고리
  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(
      transactions.filter(t => t.type !== 'Transfer' && t.type !== 'Adjust').map(t => getCategoryName(categories, t.category_id))
    ));
  }, [transactions, categories]);

  // 필터링된 거래 내역
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const { searchTerm, types, categories: catFilter, accounts: accFilter, hasAttachment, currentMonth, currentYear, fromDate, toDate } = filter;
      const searchMatch = (() => {
        if (searchTerm === '') return true;
        // 금액 숫자만 입력된 경우: 금액(절대값)에 해당 숫자가 포함되는지 확인
        const trimmed = searchTerm.trim();
        if (/^-?\d*\.?\d*$/.test(trimmed)) {
          const searchAmount = Math.abs(parseFloat(trimmed));
          const absAmount = Math.abs(transaction.amount);
          // 정확히 일치하는 경우
          if (absAmount === searchAmount) return true;
          // 숫자가 금액에 포함되는 경우 (예: "1" 입력 시 173.50, 100 등 검색)
          return absAmount.toString().includes(trimmed);
        }
        // 기존 텍스트 검색
        return (
          (transaction.payee?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
          (transaction.notes?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
          (getCategoryName(categories, transaction.category_id)?.toLowerCase() || '').includes(searchTerm.toLowerCase())
        );
      })();
      const typeMatch = types.length === 0 || types.includes((transaction.type?.toLowerCase() || ''));
      const categoryMatch = catFilter.length === 0 || catFilter.includes(getCategoryName(categories, transaction.category_id) || '');
      const accountMatch = accFilter.length === 0 || accFilter.includes(transaction.account_id);
      // 첨부파일 필터
      const attachmentMatch = !hasAttachment || (transaction.attachment_path && transaction.attachment_path.trim() !== '');
      // 날짜 필터
      const dateMatch = true; // 기본적으로 모든 거래 포함
      if (currentMonth) {
        // Summary에서 선택된 달과 연동
        if (selectedMonth) {
          if (!transaction.date || !transaction.date.startsWith(selectedMonth)) return false;
        } else {
          const transactionDate = new Date(transaction.date);
          const isCurrentMonth = transactionDate.getMonth() === new Date().getMonth() && transactionDate.getFullYear() === new Date().getFullYear();
          if (!isCurrentMonth) return false;
        }
      }
      if (currentYear) {
        const transactionDate = new Date(transaction.date);
        const isCurrentYear = transactionDate.getFullYear() === new Date().getFullYear();
        if (!isCurrentYear) return false;
      }
      // From/To 날짜 필터
      if (fromDate || toDate) {
        const transactionDate = new Date(transaction.date);
        if (fromDate && transactionDate < fromDate) return false;
        if (toDate && transactionDate > toDate) return false;
      }
      return searchMatch && typeMatch && categoryMatch && accountMatch && attachmentMatch && dateMatch;
    });
  }, [transactions, categories, filter]);

  // 필터된 거래 합계 계산 (Expense는 음수, Income은 양수, Transfer/Adjust는 sign 유지)
  const filteredSum = useMemo(() => {
    return filteredTransactions.reduce((sum, t) => sum + fixAmountSign(t.amount, t.type, getCategoryName(categories, t.category_id)), 0);
  }, [filteredTransactions, categories]);

  // 필터가 적용되어 있는지 여부
  const isFilterActive = useMemo(() => {
    return filter.searchTerm !== '' ||
      filter.types.length > 0 ||
      filter.categories.length > 0 ||
      filter.accounts.length > 0 ||
      filter.hasAttachment ||
      filter.currentMonth ||
      filter.currentYear ||
      filter.fromDate !== null ||
      filter.toDate !== null;
  }, [filter]);

  // 삭제 핸들러 통합
  const openDeleteDialog = (type: 'single' | 'bulk', id?: number, event?: React.MouseEvent) => {
    setConfirmDialog({
      open: true,
      type,
      targetId: id,
    });
  };
  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      if (confirmDialog.type === 'single' && confirmDialog.targetId !== undefined) {
        await onDelete(confirmDialog.targetId);
      } else if (confirmDialog.type === 'bulk') {
        if (onBulkDelete) {
          await onBulkDelete(filter.selectedIds); // Use filter.selectedIds
        } else {
          for (const id of filter.selectedIds) await onDelete(id); // Use filter.selectedIds
        }
        // setSelectedIds([]); // This state is now managed by the parent
      }
      setConfirmDialog({ open: false, type: null });
    } catch (error) {
      // 에러 핸들링
    } finally {
      setIsDeleting(false);
    }
  };

  // 필터 초기화
  const handleClearFilters = () => {
    setFilter({ searchTerm: '', types: [], categories: [], accounts: [], currentMonth: false, currentYear: false, hasAttachment: false, selectedIds: [], fromDate: null, toDate: null });
    setSearchInput('');
  };

  // 기타 유틸
  const getDisplayPayee = (transaction: Transaction) => {
    if (transaction.type === 'Transfer') {
      // Show only the transfer description; notes will be styled separately
      if (transaction.payee && transaction.payee.includes(' → ')) {
        return transaction.payee;
      }
      const accountInfo = transaction.notes || '';
      const description = transaction.payee || '';
      // Legacy [To:] or [From:] tags
      const tagMatch = accountInfo.match(/\[(To|From):\s*([^\]]+)\]/);
      if (tagMatch) {
        const direction = tagMatch[1];
        const accountName = tagMatch[2];
        const displayText = direction === 'To' ? `To: ${accountName}` : `From: ${accountName}`;
        return description ? `${displayText} ${description}` : displayText;
      }
      return description || accountInfo || transaction.payee;
    }
    
    // 일반 거래의 경우 Description만 반환 (Notes는 별도로 처리)
    return transaction.payee;
  };

  const getDisplayNotes = (transaction: Transaction) => {
    if (!transaction.notes) {
      return null;
    }
    let notes = transaction.notes;
    // Remove temp TO_ACCOUNT_ID metadata
    if (notes.includes('[TO_ACCOUNT_ID:')) {
      const endIdx = notes.indexOf(']');
      if (endIdx !== -1) {
        notes = notes.substring(endIdx + 1).trim();
      }
    }
    // Remove [To:] or [From:] tags
    notes = notes.replace(/\[(To|From):\s*[^\]]+\]/, '').trim();
    return notes || null;
  };
  const isEditableTransfer = (transaction: Transaction) => {
    if (transaction.type !== 'Transfer') return true;
    if (transaction.amount < 0) return true;
    
    // Transfer 거래의 경우 notes에서 계좌 이름을 확인
    if (transaction.notes && transaction.notes.includes('[To:')) {
      const match = transaction.notes.match(/\[To:\s*([^\]]+)\]/);
      return match !== null;
    }
    
    return false;
  };

  return (
    <>
      <Box sx={{ mb: 1, p: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, minHeight: 56 }}>
        <TextField label="Search" size="small" value={searchInput} onChange={e => {
          setSearchInput(e.target.value);
          // Search가 활성화되면 Current Month 자동 활성화, 비워지면 비활성화
          if (e.target.value.trim() !== '') {
            setFilter((f: typeof filter) => ({ ...f, currentMonth: true, currentYear: false }));
          } else {
            setFilter((f: typeof filter) => ({ ...f, currentMonth: false, currentYear: false }));
          }
        }} sx={{ minWidth: 120, flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Account</InputLabel>
          <Select multiple value={filter.accounts} onChange={e => {
            const newAccounts = typeof e.target.value === 'string' ? e.target.value.split(',').map(Number) : e.target.value;
            setFilter((f: typeof filter) => ({ 
              ...f, 
              accounts: newAccounts,
              currentMonth: newAccounts.length > 0 ? true : false,
              currentYear: false
            }));
          }} input={<OutlinedInput label="Account" />} renderValue={selected => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pr: 2 }}>{selected.map((value: number) => <Chip key={value} label={getAccountName(accounts, value)} size="small" />)}</Box>} MenuProps={{ MenuListProps: { dense: true } }}>{accounts.map(account => (<MenuItem key={account.id} value={account.id} dense><Checkbox checked={filter.accounts.indexOf(account.id) > -1} /><ListItemText primary={account.name} /></MenuItem>))}</Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Type</InputLabel>
          <Select multiple value={filter.types} onChange={e => {
            const newTypes = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
            setFilter((f: typeof filter) => ({ 
              ...f, 
              types: newTypes,
              currentMonth: newTypes.length > 0 ? true : false,
              currentYear: false
            }));
          }} input={<OutlinedInput label="Type" />} renderValue={selected => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{selected.map((value: string) => <Chip key={value} label={value} size="small" />)}</Box>} MenuProps={{ MenuListProps: { dense: true } }}>{['income', 'expense', 'transfer', 'adjust'].map(type => (<MenuItem key={type} value={type} dense><Checkbox checked={filter.types.indexOf(type) > -1} size="small" /><ListItemText primary={type.charAt(0).toUpperCase() + type.slice(1)} /></MenuItem>))}</Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Category</InputLabel>
          <Select multiple value={filter.categories} onChange={e => {
            const newCategories = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
            setFilter((f: typeof filter) => ({ 
              ...f, 
              categories: newCategories,
              currentMonth: newCategories.length > 0 ? true : false,
              currentYear: false
            }));
          }} input={<OutlinedInput label="Category" />} renderValue={selected => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pr: 2 }}>{selected.map((value: string) => <Chip key={value} label={value} size="small" />)}</Box>} MenuProps={{ MenuListProps: { dense: true } }}>{uniqueCategories.sort().map(category => (<MenuItem key={category} value={category} dense><Checkbox checked={filter.categories.indexOf(category) > -1} size="small" /><ListItemText primary={category} /></MenuItem>))}</Select>
        </FormControl>
        <Button
          variant={filter.hasAttachment ? "contained" : "outlined"}
          size="small"
          onClick={() => setFilter((f: typeof filter) => ({ 
            ...f, 
            hasAttachment: !f.hasAttachment,
            currentMonth: !f.hasAttachment ? true : false,
            currentYear: false
          }))}
          sx={{
            minWidth: 120,
            height: 40,
            borderColor: filter.hasAttachment ? 'primary.main' : 'rgba(35, 64, 117, 0.23)',
            color: filter.hasAttachment ? 'primary.contrastText' : 'text.primary',
            fontSize: '0.9375rem',
            fontWeight: 400,
            textTransform: 'none',
            boxSizing: 'border-box',
            backgroundColor: filter.hasAttachment ? 'primary.main' : 'background.paper',
            '&:hover': { 
              backgroundColor: filter.hasAttachment ? 'primary.dark' : 'rgba(25, 118, 210, 0.04)',
              borderColor: filter.hasAttachment ? 'primary.dark' : 'rgba(35, 64, 117, 0.23)'
            },
          }}
        >
          Attachment
        </Button>
        <Button
          variant={filter.currentMonth ? "contained" : "outlined"}
          size="small"
          disabled={filter.fromDate !== null || filter.toDate !== null}
          onClick={() => setFilter((f: typeof filter) => ({ 
  ...f, 
  currentMonth: !f.currentMonth,
  currentYear: false // Turn off Current Year when Current Month is toggled
}))}
          sx={{
            minWidth: 120,
            height: 40,
            borderColor: filter.currentMonth ? 'primary.main' : 'rgba(35, 64, 117, 0.23)',
            color: filter.currentMonth ? 'primary.contrastText' : 'text.primary',
            fontSize: '0.9375rem',
            fontWeight: 400,
            textTransform: 'none',
            boxSizing: 'border-box',
            backgroundColor: filter.currentMonth ? 'primary.main' : 'background.paper',
            '&:hover': { 
              backgroundColor: filter.currentMonth ? 'primary.dark' : 'rgba(25, 118, 210, 0.04)',
              borderColor: filter.currentMonth ? 'primary.dark' : 'rgba(35, 64, 117, 0.23)'
            },
          }}
          title="Show only current month's transactions"
        >
          Current Month
        </Button>
        <Button
          variant={filter.currentYear ? "contained" : "outlined"}
          size="small"
          disabled={filter.fromDate !== null || filter.toDate !== null}
          onClick={() => setFilter((f: typeof filter) => ({ 
  ...f, 
  currentYear: !f.currentYear,
  currentMonth: false // Turn off Current Month when Current Year is toggled
}))}
          sx={{
            minWidth: 120,
            height: 40,
            borderColor: filter.currentYear ? 'primary.main' : 'rgba(35, 64, 117, 0.23)',
            color: filter.currentYear ? 'primary.contrastText' : 'text.primary',
            fontSize: '0.9375rem',
            fontWeight: 400,
            textTransform: 'none',
            boxSizing: 'border-box',
            backgroundColor: filter.currentYear ? 'primary.main' : 'background.paper',
            '&:hover': { 
              backgroundColor: filter.currentYear ? 'primary.dark' : 'rgba(25, 118, 210, 0.04)',
              borderColor: filter.currentYear ? 'primary.dark' : 'rgba(35, 64, 117, 0.23)'
            },
          }}
          title="Show only current year's transactions"
        >
          Current Year
        </Button>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker
            label="From Date"
            value={filter.fromDate}
            onChange={(newValue) => setFilter((f: typeof filter) => ({ 
              ...f, 
              fromDate: newValue,
              currentMonth: false,
              currentYear: false
            }))}
            slotProps={{
              textField: {
                size: 'small',
                sx: { 
                  minWidth: 120, 
                  height: 40,
                  '& .MuiInputAdornment-root': {
                    '& .MuiIconButton-root': {
                      backgroundColor: 'transparent',
                      color: 'rgba(0, 0, 0, 0.54)',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        color: 'rgba(0, 0, 0, 0.87)',
                      }
                    }
                  }
                }
              }
            }}
          />
          <DatePicker
            label="To Date"
            value={filter.toDate}
            onChange={(newValue) => setFilter((f: typeof filter) => ({ 
              ...f, 
              toDate: newValue,
              currentMonth: false,
              currentYear: false
            }))}
            slotProps={{
              textField: {
                size: 'small',
                sx: { 
                  minWidth: 120, 
                  height: 40,
                  '& .MuiInputAdornment-root': {
                    '& .MuiIconButton-root': {
                      backgroundColor: 'transparent',
                      color: 'rgba(0, 0, 0, 0.54)',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        color: 'rgba(0, 0, 0, 0.87)',
                      }
                    }
                  }
                }
              }
            }}
          />
        </LocalizationProvider>
        <Button
          variant="outlined"
          size="small"
          onClick={handleClearFilters}
          sx={{ minWidth: 120, height: 40, fontSize: '0.9375rem', fontWeight: 400, textTransform: 'none', boxSizing: 'border-box' }}
        >
          Clear Filters
        </Button>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, p: 0.5 }}>
        <Button variant="outlined" disabled={filter.selectedIds.length === 0 || isDeleting} onClick={e => openDeleteDialog('bulk')}>
          {isDeleting ? 'Deleting...' : 'Delete Selected'}
        </Button>
        {/* Show filtered sum only if a filter is active, styled like Min Amount input and next to Add Transaction */}
        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'flex-end', gap: 1 }}>
          {isFilterActive && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid',
                borderColor: 'rgba(35, 64, 117, 0.23)',
                borderRadius: '14px',
                px: 2.25, // Match MUI outlined button horizontal padding
                height: 36, // Match DELETE SELECTED button height
                bgcolor: 'background.paper',
                fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
                fontSize: '0.9375rem',
                color: 'text.primary',
                fontWeight: 500,
                letterSpacing: '0.1px',
                mr: 1,
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontWeight: 500, letterSpacing: '0.1px', marginRight: 8, color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}>FILTERED TOTAL:</span>
              <span
                style={{
                  fontWeight: 500,
                  color:
                    filteredSum > 0
                      ? '#388e3c'
                      : filteredSum < 0
                      ? '#d32f2f'
                      : 'inherit',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
              >
                {formatCurrency(filteredSum)}
              </span>
            </Box>
          )}
          {onAddTransaction && (
            <Button variant="contained" color="secondary" onClick={onAddTransaction} startIcon={<AddIcon />} disabled={isDeleting}>
              Add Transaction
            </Button>
          )}
        </Box>
      </Box>
      <TableContainer component={Paper} elevation={2} sx={{ width: '100%' }}>
        <Table size="small" sx={{ 
          tableLayout: 'fixed', 
          width: '100%', 
          minWidth: '800px',
          '& .MuiTableRow-root:hover': {
            backgroundColor: 'rgba(25, 118, 210, 0.04) !important',
            '& .MuiTableCell-root': {
              backgroundColor: 'rgba(25, 118, 210, 0.04) !important'
            }
          }
        }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ width: 50, minWidth: 50 }}>
                <Checkbox indeterminate={filter.selectedIds.length > 0 && filter.selectedIds.length < filteredTransactions.length} checked={filteredTransactions.length > 0 && filter.selectedIds.length === filteredTransactions.length} onChange={e => { if (e.target.checked) setFilter((f: typeof filter) => ({ ...f, selectedIds: filteredTransactions.map(t => t.id) })); else setFilter((f: typeof filter) => ({ ...f, selectedIds: [] })); }} />
              </TableCell>
              <TableCell align="left" sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap' }}>Date</TableCell>
              <TableCell align="left" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>Account</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Description</TableCell>
              <TableCell align="center" sx={{ width: 40, minWidth: 40, p: 0 }}></TableCell> {/* Clip icon column */}
              <TableCell align="center" sx={{ width: 180, minWidth: 180, whiteSpace: 'nowrap', px: 1, fontSize: '0.9rem' }}>Category</TableCell>
              <TableCell align="center" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap', pr: 4 }}>Amount</TableCell>
              <TableCell align="center" sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap' }}>Type</TableCell>
              <TableCell align="center" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>No transactions found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map(transaction => (
                <TableRow 
                  key={transaction.id}
                  sx={{
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.04) !important',
                      cursor: 'pointer',
                      '& .MuiTableCell-root': {
                        backgroundColor: 'rgba(25, 118, 210, 0.04) !important'
                      }
                    },
                    transition: 'all 0.15s ease-in-out'
                  }}
                >
                  <TableCell padding="checkbox" sx={{ width: 50, minWidth: 50 }}>
                    <Checkbox 
                      checked={filter.selectedIds.includes(transaction.id)} 
                      onChange={e => { 
                        const id = transaction.id; 
                        setFilter((f: typeof filter) => ({ ...f, selectedIds: e.target.checked ? [...f.selectedIds, id] : f.selectedIds.filter((i: number) => i !== id) })); 
                      }} 
                    />
                  </TableCell>
                  <TableCell sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{transaction.date}</TableCell>
                  <TableCell sx={{ width: 100, minWidth: 100, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{getAccountName(accounts, transaction.account_id)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => { setEditDescriptionId(transaction.id); setEditDescriptionValue(transaction.notes || ''); }} style={{ cursor: 'text' }}>
                    {editDescriptionId === transaction.id ? (
                      <TextField value={editDescriptionValue} size="small" variant="standard" onChange={e => setEditDescriptionValue(e.target.value)} onBlur={async () => { 
                        const newValue = editDescriptionValue.trim();
                        const originalValue = transaction.notes || '';
                        if (newValue !== originalValue && typeof onNotesChange === 'function') {
                          await onNotesChange(transaction.id, newValue);
                        }
                        setEditDescriptionId(null); 
                      }} onKeyDown={async e => { 
                        if (e.key === 'Enter') { 
                          const newValue = editDescriptionValue.trim();
                          const originalValue = transaction.notes || '';
                          if (newValue !== originalValue && typeof onNotesChange === 'function') {
                            await onNotesChange(transaction.id, newValue);
                          }
                          setEditDescriptionId(null); 
                        } else if (e.key === 'Escape') { 
                          setEditDescriptionId(null); 
                        } 
                      }} autoFocus sx={{ width: '100%', fontSize: '0.9rem', p: 0, '& .MuiInputBase-input': { fontSize: '0.9rem !important', lineHeight: '1.2', padding: '0 !important' }, '& .MuiInputBase-root': { fontSize: '0.9rem !important' } }} />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <Typography noWrap sx={{ fontSize: '0.9rem' }}>
                          {getDisplayPayee(transaction)}
                          {getDisplayNotes(transaction) && (
                            <Typography component="span" sx={(theme) => ({
                              fontSize: '0.9rem',
                              color: theme.palette.mode === 'light' ? '#0288d1' : '#FFA500',
                              fontWeight: 500
                            })}>
                              {' '}[{getDisplayNotes(transaction)}]
                            </Typography>
                          )}
                        </Typography>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{ width: 40, minWidth: 40, p: 0 }}>
                    {transaction.attachment_path && (
                      <IconButton size="small" title="View PDF" onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await invoke('open_transaction_attachment', { attachmentPath: transaction.attachment_path });
                        } catch (err) {
                          alert('PDF 열기 실패: ' + err);
                        }
                      }} sx={{ backgroundColor: 'transparent', p: 0.5 }}>
                        <span role="img" aria-label="attachment">📎</span>
                      </IconButton>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{ width: 180, minWidth: 180, whiteSpace: 'nowrap', px: 1, fontSize: '0.9rem' }}>
                    {(transaction.type === 'Income' || transaction.type === 'Expense') ? (
                                              <Select 
                          value={transaction.category_id || ''} 
                          size="small" 
                          variant="standard" 
                          disableUnderline 
                          onChange={e => { 
                            const categoryId = e.target.value ? Number(e.target.value) : undefined;
                            onCategoryChange(transaction.id, categoryId);
                          }} 
                          sx={{ 
                            width: '100%', 
                            height: '24px', 
                            padding: '0 4px', 
                            fontSize: '0.9rem', 
                            '.MuiSelect-icon': { 
                              fontSize: '1rem', 
                              right: 4 
                            } 
                          }}
                        >
                        <MenuItem value="">
                          <em>Select a category</em>
                        </MenuItem>
                        {categories
                          .filter(c => c.type === transaction.type)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(c => (
                            <MenuItem key={c.id} value={c.id}>
                              {c.name}
                            </MenuItem>
                          ))
                        }
                      </Select>
                    ) : ''}
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap', px: 1, pr: 4 }}>
                    <Typography sx={{ fontSize: '0.9rem' }} color={transaction.amount < 0 ? 'error' : transaction.amount > 0 ? 'success' : 'text.primary'}>{formatCurrency(transaction.amount)}</Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap', px: 1 }}>
                    <Chip 
                      label={transaction.type === 'Adjust' ? 'Adjust' : transaction.type} 
                      size="small" 
                      sx={{
                        backgroundColor: (() => {
                          if (transaction.type === 'Expense') return '#f44336'; // 빨강색
                          if (transaction.type === 'Income') return '#4caf50'; // 녹색
                          if (transaction.type === 'Adjust') {
                            const categoryName = getCategoryName(categories, transaction.category_id);
                            if (categoryName === 'Add') return '#9c27b0'; // 보라색
                            if (categoryName === 'Subtract') return '#e91e63'; // 핑크색
                            return '#757575'; // 기본 회색
                          }
                          if (transaction.type === 'Transfer') {
                            // Transfer의 경우 amount가 음수면 출발계좌, 양수면 도착계좌
                            return transaction.amount < 0 ? '#ff9800' : '#2196f3'; // 오렌지색(출발) vs 파랑색(도착)
                          }
                          return '#757575'; // 기본 회색
                        })(),
                        color: 'white',
                        fontWeight: 'bold'
                      }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {isEditableTransfer(transaction) && (<IconButton size="small" onClick={() => onEdit(transaction)} sx={{ mr: 1, backgroundColor: 'transparent', color: '#6B7280', '&:hover': { backgroundColor: 'rgba(107, 114, 128, 0.08)', color: '#374151' } }}><EditIcon /></IconButton>)}
                      <IconButton size="small" onClick={e => openDeleteDialog('single', transaction.id, e)} disabled={isDeleting} sx={{ backgroundColor: 'transparent', color: isDeleting ? 'action.disabled' : '#6B7280', '&:hover': { backgroundColor: isDeleting ? 'transparent' : 'rgba(107, 114, 128, 0.08)', color: isDeleting ? 'action.disabled' : '#374151' } }}><DeleteIcon /></IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog 
        open={confirmDialog.open} 
        onClose={() => setConfirmDialog({ open: false, type: null })}
        PaperProps={{ sx: { minWidth: 260 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>{confirmDialog.type === 'single' ? 'Delete Transaction' : `Delete ${filter.selectedIds.length} Transactions`}</DialogTitle>
        <DialogContent sx={{ pb: 1 }}><Typography>{confirmDialog.type === 'single' ? 'Are you sure you want to delete this transaction?' : `Are you sure you want to delete the selected ${filter.selectedIds.length} transactions?`}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, type: null })} color="inherit" disabled={isDeleting}>Cancel</Button>
          <Button onClick={handleConfirm} color="error" variant="contained" disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Delete'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TransactionList; 