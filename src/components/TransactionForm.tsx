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
import { getCurrentLocalDate, formatLocalDate } from '../utils';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import path from 'path-browserify';

export interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (transaction: Partial<Transaction>) => Promise<void>;
  transaction?: Transaction;
  accounts: Account[];
  categories: Category[];
}

interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
}

// PDF 파일을 base64로 변환하는 함수
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    date: formatLocalDate(getCurrentLocalDate()),
    account_id: accounts[0]?.id,
    type: 'Expense' as TransactionType,
    category_id: undefined,
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
    date: formatLocalDate(getCurrentLocalDate()),
    account_id: accounts[0]?.id,
    type: 'Expense' as TransactionType,
    category_id: undefined,
    payee: '',
  });

  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success'
  });

  // Add state for temporary transaction ID


  // Load all categories with type when dialog opens
  const loadCategoriesFull = async () => {
    try {
      const result = await invoke<Category[]>("get_categories_full");
      setAllCategories(result);
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  };

  useEffect(() => { 
    if (open) {
      loadCategoriesFull();
      // Transfer 거래 수정 시 Description 필드에 포커스
      if (transaction?.type === 'Transfer') {
        setTimeout(() => {
          if (descriptionRef.current) {
            descriptionRef.current.focus();
            // 커서를 텍스트 끝으로 이동
            const length = descriptionRef.current.value.length;
            descriptionRef.current.setSelectionRange(length, length);
          }
        }, 100);
      }
      // Reset temp transaction ID when dialog opens

    }
  }, [open, transaction]);

  // Transfer 편집 시 toAccountId 항상 세팅
  useEffect(() => {
    if (transaction && transaction.type === 'Transfer') {
      // 1. [TO_ACCOUNT_ID:x] 파싱
      const toIdMatch = transaction.notes?.match(/\[TO_ACCOUNT_ID:(\d+)\]/);
      if (toIdMatch) {
        setToAccountId(Number(toIdMatch[1]));
      } else {
        // 2. [To: ...] 레거시 지원
        const toAccountMatch = transaction.notes?.match(/\[To: (.+?)\]/);
        if (toAccountMatch) {
          const toAccountName = toAccountMatch[1];
          const toAccount = accounts.find(acc => acc.name === toAccountName);
          if (toAccount) {
            setToAccountId(toAccount.id);
          }
        }
      }
    }
  }, [transaction, accounts, open]);

  useEffect(() => {
    if (transaction) {
      // 편집 창에서는 amount를 항상 양수로 표시
      const displayAmount = transaction.amount ? Math.abs(transaction.amount) : undefined;
      // Transfer 거래의 경우 notes에서 자동 생성된 정보 제거
      let cleanNotes = transaction.notes;
      if (transaction.type === 'Transfer' && transaction.notes) {
        cleanNotes = transaction.notes.replace(/\[To: [^\]]+\]/, '').trim();
        cleanNotes = cleanNotes.replace(/\[From: \d+\]/, '').trim();
        if (cleanNotes === '') {
          cleanNotes = undefined;
        }
      }
      setFormData({
        ...transaction,
        date: transaction.date,
        amount: displayAmount, // 항상 양수로 표시
        category_id: transaction.category_id,
        notes: cleanNotes,
      });
      setAmountInputValue(displayAmount?.toString() || '');
      // Transfer 거래의 경우 to_account_id 사용
      if (transaction.type === 'Transfer' && transaction.to_account_id) {
        setToAccountId(transaction.to_account_id);
      }
    } else {
      setFormData({
        ...preservedValues,
        amount: undefined,
        notes: '',
        category_id: undefined,
      });
      setAmountInputValue('');
      setToAccountId(undefined);
    }
    setErrors({});
  }, [transaction, accounts, preservedValues]);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.date) errors.date = 'Date is required';
    if (!formData.account_id) errors.account_id = 'Account is required';
    if (!formData.type) errors.type = 'Type is required';
    if (formData.amount === undefined || formData.amount === null) errors.amount = 'Amount is required';
    if (formData.type !== 'Transfer' && !formData.payee?.trim()) errors.payee = 'Description is required';
    
    setErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const fixAmountSign = (amount: number | undefined, type: string | undefined, category: string | undefined) => {
    if (amount === undefined) return amount;

    if (type === 'Expense') return -Math.abs(amount);
    if (type === 'Income') return Math.abs(amount);
    if (type === 'Transfer') {
      // Transfer는 항상 양수로 처리 (백엔드에서 출발/도착 계좌에 따라 부호 결정)
      return Math.abs(amount);
    }
    // Adjust는 계좌 타입과 관계없이 동일하게 처리
    if (type === 'Adjust') {
      // Add는 양수(잔액 증가), Subtract는 음수(잔액 감소)
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
      updates.category_id = value === '' ? undefined : parseInt(value, 10);
    }

    if (name === 'type') {
      updates.category_id = undefined;  // 0 대신 undefined 사용
      if (value === 'Adjust') {
        const addCategory = allCategories.find(cat => cat.name === 'Add');
        if (addCategory) {
          updates.category_id = addCategory.id;
        }
      } else if (value === 'Transfer') {
        const transferCategory = allCategories.find(cat => cat.name === 'Transfer');
        if (transferCategory) {
          updates.category_id = transferCategory.id;
        }
        setToAccountId(undefined);
      }
    }

    // Handle amount sign for transfer/adjust categories only
    if (formData.type === 'Transfer' || formData.type === 'Adjust') {
      const amount = formData.amount || 0;
      updates.amount = fixAmountSign(amount, formData.type, allCategories.find(cat => cat.id === formData.category_id)?.name);
    }

    // Handle numeric values
    if (name === 'amount') {
      if (formData.type === 'Adjust') {
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
    if (!validateForm()) {
      return;
    }

    // Transfer 거래일 때 도착 계좌가 선택되지 않으면 에러
    if (formData.type === 'Transfer' && !toAccountId) {
      setSnackbar({ open: true, message: '도착 계좌를 선택하세요.', severity: 'error' });
      return;
    }

    // Transfer 거래일 때 출발 계좌와 도착 계좌가 같으면 에러
    if (formData.type === 'Transfer' && formData.account_id === toAccountId) {
      setSnackbar({ open: true, message: '출발 계좌와 도착 계좌가 같을 수 없습니다.', severity: 'error' });
      return;
    }

    const finalTransaction = { ...formData };
    
    // Fix amount sign before saving based on transaction type and category
    if (finalTransaction.amount !== undefined) {
      const category = allCategories.find(cat => cat.id === finalTransaction.category_id)?.name;
      finalTransaction.amount = fixAmountSign(finalTransaction.amount, finalTransaction.type, category);
    }
    
    if (finalTransaction.type === 'Transfer') {
      // 출발/도착 계좌 이름으로 자동 Description 생성
      const fromAccount = accounts.find(acc => acc.id === formData.account_id);
      const toAccount = accounts.find(acc => acc.id === toAccountId);
      if (fromAccount && toAccount) {
        finalTransaction.payee = `[${fromAccount.name} → ${toAccount.name}]`;
      }
      let userNote = formData.notes || '';
      finalTransaction.notes = userNote;
      finalTransaction.to_account_id = toAccountId;
    }

    try {
      // Always create new transaction (no temporary transaction handling)
      await onSave(finalTransaction);
      
      // If editing existing transaction, close the dialog
      if (transaction) {
        onClose();
      } else {
        // If creating new transaction, preserve values and reset form for next entry
        setPreservedValues({
          date: formData.date,
          account_id: formData.account_id,
          type: formData.type,
          category_id: formData.category_id,
          payee: formData.payee,
        });
        
        // Reset form for next transaction
        setFormData({
          ...preservedValues,
          amount: undefined,
          notes: '',
          category_id: undefined,
        });
        setAmountInputValue('');
        setToAccountId(undefined);
        setErrors({});
      }
    } catch (error) {
      setSnackbar({ open: true, message: `Failed to ${transaction ? 'update' : 'create'} transaction: ${error}`, severity: 'error' });
    }
  };

  // Filter categories based on selected type
  const filteredCategories = useMemo(() => {
    if (formData.type === 'Transfer') {
      // Transfer는 단일 카테고리 사용
      const transferCategory = allCategories.find(cat => cat.name === 'Transfer');
      return transferCategory ? [transferCategory] : [];
    }
    // Adjust는 Add/Subtract 카테고리 사용
    if (formData.type === 'Adjust') {
      return allCategories.filter(cat => cat.type === 'Adjust');
    }
    // Income/Expense는 해당 타입의 카테고리만 사용
    return allCategories.filter(cat => cat.type === formData.type);
  }, [formData.type, allCategories]);

  // Transfer 거래일 때 출발 계좌(account_id), amount는 수정 불가, To Account만 변경 가능
  const isTransfer = formData.type === 'Transfer';

  // 금액 입력값은 항상 양수만 허용
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // 빈 문자열 처리
    if (value === '') {
      setFormData(prev => ({ ...prev, amount: undefined }));
      setAmountInputValue('');
      return;
    }
    
    // 숫자와 소수점만 허용 (음수 기호 제외)
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
    
    // formData 업데이트 - 항상 양수로 저장
    const amount = result === '' ? undefined : Math.abs(parseFloat(result) || 0);
    setFormData(prev => ({ ...prev, amount }));
  };

  const handleClose = async () => {
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
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
                    onChange={(newDate: Date | null) => {
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
                    disabled={!!(transaction && transaction.type === 'Transfer')}
                  >
                    <MenuItem value="Expense">
                      <Chip 
                        label="Expense" 
                        size="small" 
                        sx={{ 
                          minWidth: 80,
                          backgroundColor: '#f44336', // 빨강색
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </MenuItem>
                    <MenuItem value="Income">
                      <Chip 
                        label="Income" 
                        size="small" 
                        sx={{ 
                          minWidth: 80,
                          backgroundColor: '#4caf50', // 녹색
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </MenuItem>
                    <MenuItem value="Transfer">
                      <Chip 
                        label="Transfer" 
                        size="small" 
                        sx={{ 
                          minWidth: 80,
                          backgroundColor: '#ff9800', // 오렌지색
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </MenuItem>
                    <MenuItem value="Adjust">
                      <Chip 
                        label="Adjust" 
                        size="small" 
                        sx={{ 
                          minWidth: 80,
                          backgroundColor: '#9c27b0', // 보라색
                          color: 'white',
                          fontWeight: 'bold'
                        }}
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
                  value={formData.type === 'Transfer' && toAccountId ? 
                    (() => {
                      const fromAccount = accounts.find(acc => acc.id === formData.account_id);
                      const toAccount = accounts.find(acc => acc.id === toAccountId);
                      return fromAccount && toAccount ? `[${fromAccount.name} → ${toAccount.name}]` : (formData.payee || '');
                    })() : 
                    (formData.payee || '')
                  }
                  onChange={handlePayeeChange}
                  required
                  error={!!errors.payee}
                  helperText={errors.payee}
                  disabled={formData.type === 'Transfer'}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{
                    readOnly: formData.type === 'Transfer',
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
                    disabled={transaction?.type === 'Transfer' || (transaction && formData.type === 'Transfer')}
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
              {formData.type === 'Transfer' && (
                <Grid item xs={12}>
                  <FormControl fullWidth required error={!!errors.toAccount}>
                    <InputLabel>To Account</InputLabel>
                    <Select
                      value={toAccountId?.toString() || ''}
                      onChange={(e) => {
                        const newToAccountId = parseInt(e.target.value, 10);
                        setToAccountId(newToAccountId);
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
              {formData.type !== 'Transfer' && formData.type !== 'Adjust' && (
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
                        <em>Undefined</em>
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
              {formData.type === 'Adjust' && (
                <Grid item xs={12}>
                  <FormControl fullWidth required error={!!errors.category_id}>
                    <InputLabel>Adjustment Type</InputLabel>
                    <Select
                      name="category_id"
                      value={formData.category_id?.toString() || ''}
                      onChange={handleChange}
                      label="Adjustment Type"
                    >
                      {allCategories
                        .filter(cat => cat.name === 'Add' || cat.name === 'Subtract')
                        .map(category => (
                          <MenuItem key={category.id} value={category.id.toString()}>
                            <Chip 
                              label={category.name} 
                              size="small" 
                              color={category.name === 'Add' ? 'success' : 'error'}
                              sx={{ minWidth: 80 }}
                            />
                          </MenuItem>
                        ))}
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
              {/* PDF 첨부 UI */}
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button
                      variant="outlined"
                      component="label"
                    >
                      {formData.attachment_path ? 'Replace PDF' : 'Attach PDF'}
                      <input
                        type="file"
                        accept="application/pdf"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            // If editing existing transaction, use its ID
                            let transactionId = transaction?.id;
                            
                            // If creating new transaction, don't create temporary transaction
                            // Just store the attachment path in memory
                            if (!transaction) {
                              // For PDF attachment, we need basic fields but not necessarily payee for Transfer transactions
                              const basicErrors: Record<string, string> = {};
                              if (!formData.date) basicErrors.date = 'Date is required';
                              if (!formData.account_id) basicErrors.account_id = 'Account is required';
                              if (!formData.type) basicErrors.type = 'Type is required';
                              if (formData.amount === undefined || formData.amount === null) basicErrors.amount = 'Amount is required';
                              
                              // For Transfer transactions, also require to_account_id
                              if (formData.type === 'Transfer' && !toAccountId) {
                                basicErrors.to_account_id = 'Destination account is required';
                              }
                              
                              // For non-Transfer transactions, require payee
                              if (formData.type !== 'Transfer' && !formData.payee?.trim()) {
                                basicErrors.payee = 'Description is required';
                              }
                              
                              if (Object.keys(basicErrors).length > 0) {
                                setErrors(basicErrors);
                                setSnackbar({ open: true, message: 'Please fill in all required fields before attaching PDF', severity: 'error' });
                                return;
                              }
                              
                              // Don't create temporary transaction, just proceed with attachment
                              transactionId = undefined;
                            }
                            
                            if (formData.attachment_path) {
                              await invoke('delete_transaction_attachment', {
                                attachmentPath: formData.attachment_path
                              });
                            }
                            const base64 = await fileToBase64(file);
                            const base64Data = base64.split(',')[1];
                            // For new transactions, prepare the complete transaction data including to_account_id and auto-generated payee
                            let transactionDataForBackend = null;
                            if (!transaction) {
                              let completeFormData = { ...formData };
                              
                              // For Transfer transactions, include to_account_id and auto-generated payee
                              if (formData.type === 'Transfer' && toAccountId) {
                                completeFormData.to_account_id = toAccountId;
                                
                                // Auto-generate payee (description) for Transfer transactions
                                const fromAccount = accounts.find(acc => acc.id === formData.account_id);
                                const toAccount = accounts.find(acc => acc.id === toAccountId);
                                if (fromAccount && toAccount) {
                                  completeFormData.payee = `[${fromAccount.name} → ${toAccount.name}]`;
                                }
                              }
                              
                              transactionDataForBackend = completeFormData;
                            }
                            
                            const result = await invoke<string>('save_transaction_attachment', {
                              fileName: file.name,
                              base64: base64Data,
                              transactionId: transactionId,
                              transactionData: transactionDataForBackend
                            });
                            setFormData(prev => ({ ...prev, attachment_path: result }));
                          } catch (err) {
                            setSnackbar({ open: true, message: 'PDF 첨부 실패: ' + err, severity: 'error' });
                          }
                        }}
                      />
                    </Button>
                    {formData.attachment_path && (
                      <>
                        <Button
                          variant="text"
                          color="error"
                          onClick={async () => {
                            try {
                              await invoke('delete_transaction_attachment', {
                                attachmentPath: formData.attachment_path
                              });
                              setFormData(prev => ({ ...prev, attachment_path: undefined }));
                            } catch (err) {
                              setSnackbar({ open: true, message: 'PDF 삭제 실패: ' + err, severity: 'error' });
                            }
                          }}
                        >
                          Delete PDF
                        </Button>
                        <Button
                          variant="text"
                          onClick={async () => {
                            // PDF 미리보기(새 창)
                            await invoke('open_transaction_attachment', {
                              attachmentPath: formData.attachment_path
                            });
                          }}
                        >
                          View PDF
                        </Button>
                      </>
                    )}
                  </Box>
                  {formData.attachment_path && (
                    <span style={{ fontSize: '0.95em', color: '#555', display: 'inline-block', marginTop: 2 }}>
                      {(() => {
                        const p = formData.attachment_path;
                        if (!p) return null;
                        const parts = p.split(/[\\/]/);
                        return parts[parts.length - 1];
                      })()}
                    </span>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          {!transaction && (
            <Button onClick={handleClose} variant="outlined">
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