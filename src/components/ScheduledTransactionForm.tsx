import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { ScheduledTransaction, Account } from '../db';

interface ScheduledTransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (transaction: Partial<ScheduledTransaction>) => void;
  transaction?: ScheduledTransaction;
  accounts: Account[];
}

const TRANSACTION_CATEGORIES = [
  '급여',
  '사업소득',
  '투자수익',
  '기타수입',
  '식비',
  '주거/통신',
  '생활용품',
  '의복/미용',
  '건강/문화',
  '교육/육아',
  '교통/차량',
  '금융보험',
  '이체',
  '기타지출',
];

const FREQUENCIES = [
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly', label: '매년' },
];

const ScheduledTransactionForm: React.FC<ScheduledTransactionFormProps> = ({
  open,
  onClose,
  onSave,
  transaction,
  accounts,
}) => {
  const [formData, setFormData] = useState<Partial<ScheduledTransaction>>({
    account_id: accounts[0]?.id,
    payee: '',
    category: '',
    amount: 0,
    type: 'expense',
    frequency: 'monthly',
    next_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (transaction) {
      setFormData(transaction);
    } else {
      setFormData({
        account_id: accounts[0]?.id,
        payee: '',
        category: '',
        amount: 0,
        type: 'expense',
        frequency: 'monthly',
        next_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    }
    setErrors({});
  }, [transaction, accounts]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.account_id) {
      newErrors.account_id = '계좌를 선택해주세요';
    }
    if (!formData.payee) {
      newErrors.payee = '거래처를 입력해주세요';
    }
    if (!formData.category) {
      newErrors.category = '카테고리를 선택해주세요';
    }
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = '금액을 입력해주세요';
    }
    if (!formData.next_date) {
      newErrors.next_date = '다음 실행일을 선택해주세요';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name as string]: value,
    }));
    // Clear error when field is edited
    if (errors[name as string]) {
      setErrors((prev) => ({
        ...prev,
        [name as string]: '',
      }));
    }
  };

  const handleDateChange = (date: Date | null) => {
    if (date) {
      setFormData((prev) => ({
        ...prev,
        next_date: date.toISOString().split('T')[0],
      }));
      if (errors.next_date) {
        setErrors((prev) => ({
          ...prev,
          next_date: '',
        }));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {transaction ? '정기 거래 수정' : '새 정기 거래 추가'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <FormControl fullWidth required error={!!errors.account_id}>
              <InputLabel>계좌</InputLabel>
              <Select
                name="account_id"
                value={formData.account_id || ''}
                onChange={handleChange}
                label="계좌"
              >
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                  </MenuItem>
                ))}
              </Select>
              {errors.account_id && (
                <FormHelperText>{errors.account_id}</FormHelperText>
              )}
            </FormControl>

            <TextField
              name="payee"
              label="거래처"
              value={formData.payee}
              onChange={handleChange}
              fullWidth
              required
              error={!!errors.payee}
              helperText={errors.payee}
            />

            <FormControl fullWidth required error={!!errors.category}>
              <InputLabel>카테고리</InputLabel>
              <Select
                name="category"
                value={formData.category}
                onChange={handleChange}
                label="카테고리"
              >
                {TRANSACTION_CATEGORIES.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
              {errors.category && (
                <FormHelperText>{errors.category}</FormHelperText>
              )}
            </FormControl>

            <TextField
              name="amount"
              label="금액"
              type="number"
              value={formData.amount}
              onChange={handleChange}
              fullWidth
              required
              error={!!errors.amount}
              helperText={errors.amount}
              InputProps={{
                inputProps: { min: 0 }
              }}
            />

            <FormControl fullWidth required>
              <InputLabel>거래 유형</InputLabel>
              <Select
                name="type"
                value={formData.type}
                onChange={handleChange}
                label="거래 유형"
              >
                <MenuItem value="income">수입</MenuItem>
                <MenuItem value="expense">지출</MenuItem>
                <MenuItem value="transfer">이체</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth required>
              <InputLabel>실행 주기</InputLabel>
              <Select
                name="frequency"
                value={formData.frequency}
                onChange={handleChange}
                label="실행 주기"
              >
                {FREQUENCIES.map((freq) => (
                  <MenuItem key={freq.value} value={freq.value}>
                    {freq.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <DatePicker
              label="다음 실행일"
              value={formData.next_date ? new Date(formData.next_date) : null}
              onChange={handleDateChange}
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  error: !!errors.next_date,
                  helperText: errors.next_date,
                },
              }}
            />

            <TextField
              name="notes"
              label="메모"
              value={formData.notes}
              onChange={handleChange}
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" variant="contained" color="primary">
            저장
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ScheduledTransactionForm; 