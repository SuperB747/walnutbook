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
} from '@mui/material';
import { Account } from '../db';

interface AccountFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (account: Partial<Account>) => void;
  account?: Account;
}

const AccountForm: React.FC<AccountFormProps> = ({
  open,
  onClose,
  onSave,
  account,
}) => {
  const [formData, setFormData] = useState<Partial<Account>>({
    name: '',
    type: '',
    category: '',
    balance: 0,
  });

  useEffect(() => {
    if (account) {
      setFormData(account);
    } else {
      setFormData({
        name: '',
        type: '',
        category: '',
        balance: 0,
      });
    }
  }, [account]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name as string]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const accountTypes = [
    { value: 'checking', label: '입출금' },
    { value: 'savings', label: '예금' },
    { value: 'credit', label: '신용카드' },
    { value: 'investment', label: '투자' },
  ];

  const accountCategories = [
    '현금성 자산',
    '예/적금',
    '투자 자산',
    '신용카드',
    '대출',
    '기타',
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {account ? '계좌 수정' : '새 계좌 추가'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              name="name"
              label="계좌명"
              value={formData.name}
              onChange={handleChange}
              fullWidth
              required
            />
            <FormControl fullWidth required>
              <InputLabel>계좌 유형</InputLabel>
              <Select
                name="type"
                value={formData.type}
                onChange={handleChange}
                label="계좌 유형"
              >
                {accountTypes.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth required>
              <InputLabel>카테고리</InputLabel>
              <Select
                name="category"
                value={formData.category}
                onChange={handleChange}
                label="카테고리"
              >
                {accountCategories.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              name="balance"
              label="초기 잔액"
              type="number"
              value={formData.balance}
              onChange={handleChange}
              fullWidth
              required
              InputProps={{
                inputProps: { min: 0 }
              }}
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

export default AccountForm; 