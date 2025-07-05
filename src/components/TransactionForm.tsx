import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  FormHelperText,
  Grid,
  SelectChangeEvent,
  Chip,
} from '@mui/material';
import { invoke } from '@tauri-apps/api/core';
import { Transaction, Account, TransactionType, Category } from '../db';
import { format, parse } from 'date-fns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

export interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (transaction: Partial<Transaction>) => Promise<void>;
  transaction?: Transaction;
  accounts: Account[];
  categories: Category[];
}

const TransactionForm: React.FC<TransactionFormProps> = ({
  open,
  onClose,
  onSave,
  transaction,
  accounts,
  categories,
}) => {
  const [formData, setFormData] = useState<Partial<Transaction>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    account_id: accounts[0]?.id,
    type: 'expense',
    category_id: 0,
    amount: undefined,
    payee: '',
    notes: '',
  });
  const [amountInputValue, setAmountInputValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [toAccountId, setToAccountId] = useState<number | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);
  
  // State to preserve values for continuous mode
  const [preservedValues, setPreservedValues] = useState<Partial<Transaction>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    account_id: accounts[0]?.id,
    type: 'expense',
    category_id: 0,
    payee: '',
  });

  // Load all categories with type when dialog opens
  const loadCategoriesFull = async () => {
    try {
      console.log('Loading categories...');
      const result = await invoke<Category[]>('get_categories_full');
      console.log('Loaded categories:', result);
      console.log('Current form data before setting categories:', formData);
      setAllCategories(result);
      console.log('Categories set successfully');
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  };

  useEffect(() => { 
    if (open) {
      loadCategoriesFull();
      // Transfer 거래 수정 시 Description 필드에 포커스
      if (transaction?.type === 'transfer') {
        setTimeout(() => {
          if (descriptionRef.current) {
            descriptionRef.current.focus();
            // 커서를 텍스트 끝으로 이동
            const length = descriptionRef.current.value.length;
            descriptionRef.current.setSelectionRange(length, length);
          }
        }, 100);
      }
    }
  }, [open, transaction]);

  useEffect(() => {
    if (transaction) {
      // 편집 창에서는 amount를 항상 양수로 표시
      const displayAmount = transaction.amount ? Math.abs(transaction.amount) : undefined;
      setFormData({
        ...transaction,
        date: transaction.date,
        amount: displayAmount, // 항상 양수로 표시
        category_id: transaction.category_id,
      });
      setAmountInputValue(displayAmount?.toString() || '');
      
      // Transfer 거래의 경우 notes에서 "To Account" 정보 추출
      if (transaction.type === 'transfer' && transaction.notes) {
        const toAccountMatch = transaction.notes.match(/\[To: (.+?)\]/);
        if (toAccountMatch) {
          const toAccountName = toAccountMatch[1];
          const toAccount = accounts.find(acc => acc.name === toAccountName);
          if (toAccount) {
            setToAccountId(toAccount.id);
          }
        }
      }
    } else {
      // In continuous mode, preserve most fields and only reset amount and notes
      setFormData({
        ...preservedValues,
        amount: undefined,
        notes: '',
        category_id: 0,
      });
      setAmountInputValue('');
      setToAccountId(undefined);
    }
    setErrors({});
  }, [transaction, accounts, preservedValues]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.payee) newErrors.payee = 'Payee is required';
    if (!formData.account_id) newErrors.account_id = 'Account is required';
    if (!formData.type) newErrors.type = 'Type is required';
    if (!formData.category_id) newErrors.category_id = 'Category is required';
    if (!formData.amount || formData.amount === 0) newErrors.amount = 'Amount is required';
    if (formData.type === 'transfer' && !toAccountId) newErrors.toAccount = 'To Account is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const fixAmountSign = (amount: number | undefined, type: string | undefined, category: string | undefined) => {
    if (amount === undefined) return amount;
    if (type === 'expense') return -Math.abs(amount);
    if (type === 'income') return Math.abs(amount);
    if (type === 'transfer') {
      // Transfer는 항상 양수로 처리 (백엔드에서 출발/도착 계좌에 따라 부호 결정)
      return Math.abs(amount);
    }
    // Adjust는 category에 따라 부호 결정
    if (type === 'adjust') {
      if (category === 'Subtract') {
        return -Math.abs(amount);
      } else {
        return Math.abs(amount);
      }
    }
    return amount;
  };

  const handleChange = (
    e: SelectChangeEvent | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    let updates: Partial<Transaction> = { [name]: value };

    if (name === 'account_id') {
      updates.account_id = parseInt(value, 10);
    }

    if (name === 'category_id') {
      updates.category_id = parseInt(value, 10);
    }

    if (name === 'type') {
      updates.category_id = 0;
      if (value === 'adjust') {
        const addCategory = allCategories.find(cat => cat.name === 'Add');
        if (addCategory) {
          updates.category_id = addCategory.id;
        }
      } else if (value === 'transfer') {
        const transferCategory = allCategories.find(cat => cat.name === 'Transfer');
        if (transferCategory) {
          updates.category_id = transferCategory.id;
        }
      }
    }

    // Handle amount sign for transfer/adjust categories only
    if (formData.type === 'transfer' || formData.type === 'adjust') {
      const amount = formData.amount || 0;
      updates.amount = fixAmountSign(amount, formData.type, allCategories.find(cat => cat.id === formData.category_id)?.name);
    }

    // Handle numeric values
    if (name === 'amount') {
      if (formData.type === 'adjust') {
        updates.amount = parseFloat(value) || 0;
      } else {
        updates.amount = fixAmountSign(parseFloat(value) || 0, formData.type, allCategories.find(cat => cat.id === formData.category_id)?.name);
      }
    }

    setFormData(prev => ({ ...prev, ...updates }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handlePayeeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, payee: event.target.value }));
  };

  const formatAmount = (amount: number | undefined): string => {
    if (amount === undefined) return '';
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      let finalTransaction = {
        ...formData,
        payee: formData.payee ? formData.payee.trim() : '',
        amount: fixAmountSign(formData.amount, formData.type, allCategories.find(cat => cat.id === formData.category_id)?.name)
      };
      
      // Transfer 거래 수정 시
      if (transaction?.type === 'transfer') {
        // To Account 정보를 notes에 설정
        if (toAccountId) {
          const toAccount = accounts.find(acc => acc.id === toAccountId);
          if (toAccount) {
            finalTransaction.notes = `[To: ${toAccount.name}]`;
          }
        }
      }
      // 새로운 Transfer 거래 생성 시
      else if (formData.type === 'transfer' && toAccountId) {
        const description = finalTransaction.payee;
        finalTransaction.notes = description;
        finalTransaction.payee = `${formData.account_id} → ${toAccountId}`; // 백엔드에서 계좌 이름으로 대체됨
      }
      // Adjust 거래는 category를 그대로 저장 (백엔드에서 부호 결정에 사용)
      // category는 이미 'Add' 또는 'Subtract'로 설정되어 있음
      
      await onSave(finalTransaction);
      
      // In continuous mode, preserve current values for next transaction
      if (!transaction) {
        setPreservedValues({
          date: formData.date,
          type: formData.type,
          payee: formData.payee,
          account_id: formData.account_id,
          category_id: formData.category_id,
        });
      }
    }
  };

  // Filter categories based on selected type
  const filteredCategories = useMemo(() => {
    if (formData.type === 'transfer') {
      // Transfer는 단일 카테고리 사용
      return [{ id: 0, name: 'Transfer', type: 'transfer' as const }];
    }
    // Adjust는 Add/Subtract 카테고리 사용
    if (formData.type === 'adjust') {
      return [
        { id: 0, name: 'Add', type: 'adjust' as const },
        { id: 1, name: 'Subtract', type: 'adjust' as const }
      ];
    }
    return allCategories.filter(cat => cat.type === formData.type);
  }, [allCategories, formData.type]);

  // Transfer 거래일 때 출발 계좌(account_id), amount는 수정 불가, To Account만 변경 가능
  const isTransfer = formData.type === 'transfer';

  // 금액 입력값은 항상 양수만 허용
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // 빈 문자열 처리
    if (value === '') {
      setFormData(prev => ({ ...prev, amount: undefined }));
      setAmountInputValue('');
      return;
    }
    
    // 숫자와 소수점만 허용
    const cleanValue = value.replace(/[^\d.]/g, '');
    
    // 소수점이 여러 개 있으면 첫 번째만 유지
    const parts = cleanValue.split('.');
    const finalValue = parts.length > 1 ? parts[0] + '.' + parts.slice(1).join('') : cleanValue;
    
    // 소수점으로 시작하면 0 추가
    const processedValue = finalValue.startsWith('.') ? '0' + finalValue : finalValue;
    
    // 소수점 이하 2자리로 제한
    let result = processedValue;
    if (processedValue.includes('.')) {
      const [whole, decimal] = processedValue.split('.');
      result = whole + '.' + decimal.slice(0, 2);
    }
    
    // 입력값 상태 업데이트
    setAmountInputValue(result);
    
    // formData 업데이트
    const amount = result === '' ? undefined : Math.abs(parseFloat(result) || 0);
    setFormData(prev => ({ ...prev, amount }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>
          {transaction ? 'Edit Transaction' : 'Add New Transaction'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Date"
                    value={formData.date ? parse(formData.date, 'yyyy-MM-dd', new Date()) : null}
                    onChange={(newDate) => {
                      if (newDate) {
                        setFormData(prev => ({ ...prev, date: format(newDate, 'yyyy-MM-dd') }));
                        setErrors(prev => ({ ...prev, date: '' }));
                      }
                      setDatePickerOpen(false);
                    }}
                    open={datePickerOpen}
                    onOpen={() => setDatePickerOpen(true)}
                    onClose={() => setDatePickerOpen(false)}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true,
                        error: !!errors.date,
                        helperText: errors.date,
                        InputLabelProps: { shrink: true },
                        onClick: () => setDatePickerOpen(true),
                        inputProps: { readOnly: true },
                      }
                    }}
                    openTo="day"
                    disableFuture={false}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth required error={!!errors.type}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    name="type"
                    value={formData.type || ''}
                    onChange={handleChange}
                    label="Type"
                    disabled={!!(transaction && transaction.type === 'transfer')}
                  >
                    <MenuItem value="expense">
                      <Chip 
                        label="Expense" 
                        size="small" 
                        color="error" 
                        sx={{ minWidth: 80 }}
                      />
                    </MenuItem>
                    <MenuItem value="income">
                      <Chip 
                        label="Income" 
                        size="small" 
                        color="success" 
                        sx={{ minWidth: 80 }}
                      />
                    </MenuItem>
                    <MenuItem value="transfer">
                      <Chip 
                        label="Transfer" 
                        size="small" 
                        color="info" 
                        sx={{ minWidth: 80 }}
                      />
                    </MenuItem>
                    <MenuItem value="adjust">
                      <Chip 
                        label="Adjust" 
                        size="small" 
                        color={formData.type === 'adjust' && Number(formData.amount) < 0 ? 'error' : 'info'}
                        sx={{ minWidth: 80 }}
                      />
                    </MenuItem>
                  </Select>
                  {errors.type && (
                    <FormHelperText>{errors.type}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  name="payee"
                  value={formData.payee || ''}
                  onChange={handlePayeeChange}
                  required
                  error={!!errors.payee}
                  helperText={errors.payee}
                  placeholder="e.g., Monthly transfer to savings"
                  inputRef={descriptionRef}
                  inputProps={{
                    style: { cursor: 'text' },
                    maxLength: 100,
                    autoFocus: true,
                    autoComplete: 'off',
                    'data-lpignore': 'true'
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth required error={!!errors.account_id}>
                  <InputLabel>Account</InputLabel>
                  <Select
                    name="account_id"
                    value={formData.account_id?.toString() || ''}
                    onChange={handleChange}
                    label="Account"
                    disabled={transaction?.type === 'transfer'}
                  >
                    {accounts.map((account) => (
                      <MenuItem key={account.id} value={account.id.toString()}>
                        {account.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.account_id && (
                    <FormHelperText>{errors.account_id}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              {formData.type === 'transfer' && (
                <Grid item xs={12}>
                  <FormControl fullWidth required error={!!errors.toAccount}>
                    <InputLabel>To Account</InputLabel>
                    <Select
                      value={toAccountId?.toString() || ''}
                      onChange={(e) => {
                        const newToAccountId = parseInt(e.target.value, 10);
                        setToAccountId(newToAccountId);
                        
                        // To Account 변경 시 notes 업데이트
                        if (newToAccountId) {
                          const toAccount = accounts.find(acc => acc.id === newToAccountId);
                          if (toAccount) {
                            setFormData(prev => ({
                              ...prev,
                              notes: `[To: ${toAccount.name}]`
                            }));
                          }
                        }
                      }}
                      label="To Account"
                    >
                      {accounts
                        .filter(account => account.id !== formData.account_id)
                        .map((account) => (
                          <MenuItem key={account.id} value={account.id.toString()}>
                            {account.name}
                          </MenuItem>
                        ))}
                    </Select>
                    {errors.toAccount && (
                      <FormHelperText>{errors.toAccount}</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
              )}
              {formData.type !== 'transfer' && formData.type !== 'adjust' && (
                <Grid item xs={12}>
                  <FormControl fullWidth required error={!!errors.category_id}>
                    <InputLabel>Category</InputLabel>
                    <Select
                      name="category_id"
                      value={formData.category_id?.toString() || ''}
                      onChange={handleChange}
                      label="Category"
                      MenuProps={{
                        PaperProps: {
                          style: {
                            maxHeight: 300
                          }
                        },
                        slotProps: {
                          paper: {
                            style: {
                              zIndex: 9999
                            }
                          }
                        }
                      }}
                    >
                      <MenuItem value="">
                        <em>Select a category</em>
                      </MenuItem>
                      {filteredCategories.map(category => (
                        <MenuItem key={category.id} value={category.id.toString()}>
                          {category.name}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.category_id && (
                      <FormHelperText>{errors.category_id}</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
              )}
              {formData.type === 'adjust' && (
                <Grid item xs={12}>
                  <FormControl fullWidth required error={!!errors.category_id}>
                    <InputLabel>Adjustment Type</InputLabel>
                    <Select
                      name="category_id"
                      value={formData.category_id?.toString() || ''}
                      onChange={handleChange}
                      label="Adjustment Type"
                    >
                      <MenuItem value="Add">
                        <Chip 
                          label="Add" 
                          size="small" 
                          color="success"
                          sx={{ minWidth: 80 }}
                        />
                      </MenuItem>
                      <MenuItem value="Subtract">
                        <Chip 
                          label="Subtract" 
                          size="small" 
                          color="error"
                          sx={{ minWidth: 80 }}
                        />
                      </MenuItem>
                    </Select>
                    {errors.category_id && (
                      <FormHelperText>{errors.category_id}</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
              )}
              <Grid item xs={12}>
                <TextField
                  name="amount"
                  label="Amount"
                  value={amountInputValue}
                  onChange={handleAmountChange}
                  fullWidth
                  required
                  error={!!errors.amount}
                  helperText={errors.amount}
                  inputProps={{
                    autoComplete: 'off',
                    'data-lpignore': 'true'
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  name="notes"
                  label="Notes"
                  value={formData.notes || ''}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={2}
                  sx={{
                    '& .MuiFormLabel-root': {
                      backgroundColor: 'background.paper',
                      px: 0.5,
                    }
                  }}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          {!transaction && (
            <Button onClick={onClose} variant="outlined">
              Done
            </Button>
          )}
          <Button type="submit" variant="contained" color="primary">
            {transaction ? 'Save Changes' : 'Add & Continue'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default TransactionForm; 