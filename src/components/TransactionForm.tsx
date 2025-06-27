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
import { Transaction, Account } from '../db';

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (transaction: Partial<Transaction>) => void;
  transaction?: Transaction;
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

const TransactionForm: React.FC<TransactionFormProps> = ({
  open,
  onClose,
  onSave,
  transaction,
  accounts,
}) => {
  const [formData, setFormData] = useState<Partial<Transaction>>({
    date: new Date().toISOString().split('T')[0],
    account_id: accounts[0]?.id,
    payee: '',
    category: '',
    amount: 0,
    type: 'expense',
    notes: '',
    status: 'uncleared',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (transaction) {
      setFormData(transaction);
    } else {
      setFormData({
        date: new Date().toISOString().split('T')[0],
        account_id: accounts[0]?.id,
        payee: '',
        category: '',
        amount: 0,
        type: 'expense',
        notes: '',
        status: 'uncleared',
      });
    }
    setErrors({});
  }, [transaction, accounts]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.date) {
      newErrors.date = '날짜를 선택해주세요';
    }
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
          {transaction ? '거래 내역 수정' : '새 거래 내역 추가'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              name="date"
              label="날짜"
              type="date"
              value={formData.date}
              onChange={handleChange}
              fullWidth
              required
              error={!!errors.date}
              helperText={errors.date}
              InputLabelProps={{ shrink: true }}
            />

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
              <InputLabel>상태</InputLabel>
              <Select
                name="status"
                value={formData.status}
                onChange={handleChange}
                label="상태"
              >
                <MenuItem value="uncleared">미승인</MenuItem>
                <MenuItem value="cleared">승인됨</MenuItem>
                <MenuItem value="reconciled">조정됨</MenuItem>
              </Select>
            </FormControl>

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

export default TransactionForm; 