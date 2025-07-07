import React, { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Chip, Typography, TextField, Box, FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, OutlinedInput, Button, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { Transaction, Account, Category } from '../db';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { parse } from 'date-fns';

export interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: number) => Promise<void>;
  onBulkDelete?: (ids: number[]) => Promise<void>;
  onCategoryChange: (id: number, categoryId: number | undefined) => Promise<void>;
  onDescriptionChange?: (id: number, description: string) => Promise<void>;
  initialSelectedIds?: number[];
  importedIds?: number[];
  onAddTransaction?: () => void;
}

const getAccountName = (accounts: Account[], accountId: number): string => {
  const account = accounts.find(a => a.id === accountId);
  return account ? account.name : 'Unknown Account';
};
const getCategoryName = (categories: Category[], categoryId: number | undefined): string => {
  if (!categoryId) return 'Undefined';
  const category = categories.find(cat => cat.id === categoryId);
  return category?.name || 'Undefined';
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
  initialSelectedIds = [],
  importedIds = [],
  onAddTransaction,
}) => {
  console.log('TransactionList received importedIds:', importedIds);
  // 통합 필터 상태
  const [filter, setFilter] = useState({
    searchTerm: '',
    types: [] as string[],
    categories: [] as string[],
    accounts: [] as number[],
    dateRange: { start: '', end: '' },
  });
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
  
  // Auto-select imported transactions when they are first loaded
  React.useEffect(() => {
    console.log('TransactionList useEffect triggered with importedIds:', importedIds);
    if (importedIds.length > 0) {
      console.log('Auto-selecting imported transactions:', importedIds);
      setSelectedIds(importedIds);
      console.log('Updated selectedIds:', importedIds);
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
      const { searchTerm, types, categories: catFilter, accounts: accFilter, dateRange } = filter;
      const searchMatch = searchTerm === '' || 
        transaction.payee.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getCategoryName(categories, transaction.category_id).toLowerCase().includes(searchTerm.toLowerCase());
      const typeMatch = types.length === 0 || types.includes(transaction.type.toLowerCase());
      const categoryMatch = catFilter.length === 0 || catFilter.includes(getCategoryName(categories, transaction.category_id));
      const accountMatch = accFilter.length === 0 || accFilter.includes(transaction.account_id);
      const dateMatch = (!dateRange.start || transaction.date >= dateRange.start) && (!dateRange.end || transaction.date <= dateRange.end);
      return searchMatch && typeMatch && categoryMatch && accountMatch && dateMatch;
    });
  }, [transactions, categories, filter]);

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
          await onBulkDelete(selectedIds);
        } else {
          for (const id of selectedIds) await onDelete(id);
        }
        setSelectedIds([]);
      }
      setConfirmDialog({ open: false, type: null });
    } catch (error) {
      // 에러 핸들링
    } finally {
      setIsDeleting(false);
    }
  };

  // 필터 초기화
  const handleClearFilters = () => setFilter({ searchTerm: '', types: [], categories: [], accounts: [], dateRange: { start: '', end: '' } });

  // 기타 유틸
  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  const getDisplayPayee = (transaction: Transaction) => {
    if (transaction.type === 'Transfer') {
      // Transfer 거래의 경우 payee 필드에 "[계좌명 → 계좌명]" 형태로 저장되어 있음
      if (transaction.payee && transaction.payee.includes(' → ')) {
        const description = transaction.payee;
        const notes = transaction.notes || '';
        
        // Notes에서 임시 정보 제거
        let cleanNotes = notes;
        if (cleanNotes.includes('[TO_ACCOUNT_ID:')) {
          const endIndex = cleanNotes.indexOf(']');
          if (endIndex !== -1) {
            cleanNotes = cleanNotes.substring(endIndex + 1).trim();
          }
        }
        
        // Description과 Notes 결합
        if (cleanNotes) {
          return `${description} ${cleanNotes}`;
        } else {
          return description;
        }
      }
      
      // 기존 방식 (notes에서 계좌 정보 추출)
      const accountInfo = transaction.notes || '';
      const description = transaction.payee || '';
      
      if (accountInfo && accountInfo.includes('[To:') || accountInfo.includes('[From:')) {
        const match = accountInfo.match(/\[(To|From):\s*([^\]]+)\]/);
        if (match) {
          const direction = match[1];
          const accountName = match[2];
          const displayText = direction === 'To' ? `To: ${accountName}` : `From: ${accountName}`;
          if (description) return `${displayText} ${description}`;
          return displayText;
        }
      }
      
      if (accountInfo && description) return `${accountInfo} ${description}`;
      if (accountInfo) return accountInfo;
      if (description) return description;
      return transaction.payee;
    }
    return transaction.payee;
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
        <TextField label="Search" size="small" value={filter.searchTerm} onChange={e => setFilter(f => ({ ...f, searchTerm: e.target.value }))} sx={{ minWidth: 120, flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Account</InputLabel>
          <Select multiple value={filter.accounts} onChange={e => setFilter(f => ({ ...f, accounts: typeof e.target.value === 'string' ? e.target.value.split(',').map(Number) : e.target.value }))} input={<OutlinedInput label="Account" />} renderValue={selected => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pr: 2 }}>{selected.map((value: number) => <Chip key={value} label={getAccountName(accounts, value)} size="small" />)}</Box>} MenuProps={{ MenuListProps: { dense: true } }}>{accounts.map(account => (<MenuItem key={account.id} value={account.id} dense><Checkbox checked={filter.accounts.indexOf(account.id) > -1} /><ListItemText primary={account.name} /></MenuItem>))}</Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Type</InputLabel>
          <Select multiple value={filter.types} onChange={e => setFilter(f => ({ ...f, types: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value }))} input={<OutlinedInput label="Type" />} renderValue={selected => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{selected.map((value: string) => <Chip key={value} label={value} size="small" />)}</Box>} MenuProps={{ MenuListProps: { dense: true } }}>{['income', 'expense', 'transfer', 'adjust'].map(type => (<MenuItem key={type} value={type} dense><Checkbox checked={filter.types.indexOf(type) > -1} size="small" /><ListItemText primary={type.charAt(0).toUpperCase() + type.slice(1)} /></MenuItem>))}</Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Category</InputLabel>
          <Select multiple value={filter.categories} onChange={e => setFilter(f => ({ ...f, categories: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value }))} input={<OutlinedInput label="Category" />} renderValue={selected => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pr: 2 }}>{selected.map((value: string) => <Chip key={value} label={value} size="small" />)}</Box>} MenuProps={{ MenuListProps: { dense: true } }}>{uniqueCategories.sort().map(category => (<MenuItem key={category} value={category} dense><Checkbox checked={filter.categories.indexOf(category) > -1} size="small" /><ListItemText primary={category} /></MenuItem>))}</Select>
        </FormControl>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DatePicker label="From Date" value={filter.dateRange.start ? parse(filter.dateRange.start, 'yyyy-MM-dd', new Date()) : null} onChange={newDate => setFilter(f => ({ ...f, dateRange: { ...f.dateRange, start: newDate ? newDate.toISOString().split('T')[0] : '' } }))} slotProps={{ textField: { size: 'small', sx: { width: 150 } } }} />
          <DatePicker label="To Date" value={filter.dateRange.end ? parse(filter.dateRange.end, 'yyyy-MM-dd', new Date()) : null} onChange={newDate => setFilter(f => ({ ...f, dateRange: { ...f.dateRange, end: newDate ? newDate.toISOString().split('T')[0] : '' } }))} slotProps={{ textField: { size: 'small', sx: { width: 150 } } }} />
        </LocalizationProvider>
        <Button variant="outlined" size="small" onClick={handleClearFilters} sx={{ minWidth: 100, height: 40 }}>Clear Filters</Button>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, p: 0.5 }}>
        <Button variant="outlined" disabled={selectedIds.length === 0 || isDeleting} onClick={e => openDeleteDialog('bulk')}>{isDeleting ? 'Deleting...' : 'Delete Selected'}</Button>
        {onAddTransaction && (<Button variant="contained" color="secondary" onClick={onAddTransaction} startIcon={<AddIcon />} disabled={isDeleting}>Add Transaction</Button>)}
      </Box>
      <TableContainer component={Paper} elevation={2} sx={{ width: '100%' }}>
        <Table size="small" sx={{ tableLayout: 'fixed', width: '100%', minWidth: '800px' }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ width: 50, minWidth: 50 }}>
                <Checkbox indeterminate={selectedIds.length > 0 && selectedIds.length < filteredTransactions.length} checked={filteredTransactions.length > 0 && selectedIds.length === filteredTransactions.length} onChange={e => { if (e.target.checked) setSelectedIds(filteredTransactions.map(t => t.id)); else setSelectedIds([]); }} />
              </TableCell>
              <TableCell align="left" sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap' }}>Date</TableCell>
              <TableCell align="left" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>Account</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Description</TableCell>
              <TableCell align="center" sx={{ width: 180, minWidth: 180, whiteSpace: 'nowrap', px: 1, fontSize: '0.9rem' }}>Category</TableCell>
              <TableCell align="center" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap', pr: 4 }}>Amount</TableCell>
              <TableCell align="center" sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap' }}>Type</TableCell>
              <TableCell align="center" sx={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>No transactions found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map(transaction => (
                <TableRow key={transaction.id}>
                  <TableCell padding="checkbox" sx={{ width: 50, minWidth: 50 }}>
                    <Checkbox 
                      checked={selectedIds.includes(transaction.id)} 
                      onChange={e => { 
                        const id = transaction.id; 
                        setSelectedIds(prev => e.target.checked ? [...prev, id] : prev.filter(i => i !== id)); 
                      }} 
                    />
                  </TableCell>
                  <TableCell sx={{ width: 90, minWidth: 90, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{transaction.date}</TableCell>
                  <TableCell sx={{ width: 100, minWidth: 100, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{getAccountName(accounts, transaction.account_id)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => { setEditDescriptionId(transaction.id); setEditDescriptionValue(transaction.payee); }} style={{ cursor: 'text' }}>
                    {editDescriptionId === transaction.id ? (
                      <TextField value={editDescriptionValue} size="small" variant="standard" onChange={e => setEditDescriptionValue(e.target.value)} onBlur={async () => { 
                        const newValue = editDescriptionValue.trim();
                        const originalValue = transaction.payee;
                        if (newValue !== originalValue && typeof onDescriptionChange === 'function') {
                          await onDescriptionChange(transaction.id, newValue);
                        }
                        setEditDescriptionId(null); 
                      }} onKeyDown={async e => { 
                        if (e.key === 'Enter') { 
                          const newValue = editDescriptionValue.trim();
                          const originalValue = transaction.payee;
                          if (newValue !== originalValue && typeof onDescriptionChange === 'function') {
                            await onDescriptionChange(transaction.id, newValue);
                          }
                          setEditDescriptionId(null); 
                        } else if (e.key === 'Escape') { 
                          setEditDescriptionId(null); 
                        } 
                      }} autoFocus sx={{ width: '100%', fontSize: '0.9rem', p: 0, '& .MuiInputBase-input': { fontSize: '0.9rem !important', lineHeight: '1.2', padding: '0 !important' }, '& .MuiInputBase-root': { fontSize: '0.9rem !important' } }} />
                    ) : (
                      <Typography noWrap sx={{ fontSize: '0.9rem' }}>{getDisplayPayee(transaction)}</Typography>
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
        <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>{confirmDialog.type === 'single' ? 'Delete Transaction' : `Delete ${selectedIds.length} Transactions`}</DialogTitle>
        <DialogContent sx={{ pb: 1 }}><Typography>{confirmDialog.type === 'single' ? 'Are you sure you want to delete this transaction?' : `Are you sure you want to delete the selected ${selectedIds.length} transactions?`}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, type: null })} color="inherit" disabled={isDeleting}>Cancel</Button>
          <Button onClick={handleConfirm} color="error" variant="contained" disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Delete'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TransactionList; 