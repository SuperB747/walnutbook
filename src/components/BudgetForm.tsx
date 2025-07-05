import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import { Budget, Category } from '../db';

interface BudgetFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (budget: Partial<Budget>) => void;
  budget?: Budget;
  month: string;
  categories: Category[];
}

const BudgetForm: React.FC<BudgetFormProps> = ({
  open,
  onClose,
  onSave,
  budget,
  month,
  categories,
}) => {
  const [formData, setFormData] = useState<Partial<Budget>>({
    category_id: 0,
    amount: 0,
    notes: '',
    month: month,
  });
  
  // 금액 입력을 위한 별도 상태 (문자열로 관리)
  const [amountInput, setAmountInput] = useState<string>('0');

  useEffect(() => {
    if (budget) {
      const amount = Number(budget.amount.toFixed(2));
      setFormData({
        category_id: budget.category_id,
        amount: amount,
        notes: budget.notes || '',
        month: budget.month,
      });
      // 초기 로드 시에만 통화 형식으로 표시
      setAmountInput(amount.toFixed(2));
    } else {
      setFormData({
        category_id: 0,
        amount: 0,
        notes: '',
        month: month,
      });
      setAmountInput('0.00');
    }
  }, [budget, month]);

  const handleChange = (field: keyof Budget) => (
    event: React.ChangeEvent<HTMLInputElement | { value: unknown }>
  ) => {
    if (field === 'amount') {
      const inputValue = event.target.value as string;
      
      // 사용자 입력을 그대로 표시 (편집 가능하도록)
      setAmountInput(inputValue);
      
      // 숫자 변환 및 저장
      if (inputValue === '' || inputValue === '.') {
        setFormData({
          ...formData,
          amount: 0,
        });
      } else if (!isNaN(Number(inputValue))) {
        setFormData({
          ...formData,
          amount: Number(inputValue),
        });
      }
    } else if (field === 'category_id') {
      setFormData({
        ...formData,
        category_id: Number(event.target.value),
      });
    } else {
      const value = event.target.value as string;
      setFormData({
        ...formData,
        [field]: value,
      });
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {budget ? 'Edit Budget' : 'New Budget'}
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth required margin="normal">
            <InputLabel>Category</InputLabel>
            <Select
              value={formData.category_id || ''}
              onChange={handleChange('category_id')}
            label="Category"
            >
              {categories.map(category => (
                <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Amount"
            type="text"
            value={amountInput}
            onChange={handleChange('amount')}
            onBlur={() => {
              // 포커스를 잃을 때 통화 형식으로 포맷팅
              if (amountInput !== '' && !isNaN(Number(amountInput))) {
                const numValue = Number(amountInput);
                setAmountInput(numValue.toFixed(2));
              } else if (amountInput === '' || amountInput === '.') {
                setAmountInput('0.00');
              }
            }}
            fullWidth
            required
            margin="normal"
            inputProps={{
              inputMode: "decimal",
              pattern: "[0-9]*[.]?[0-9]*"
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
          />
          <TextField
            label="Notes"
            value={formData.notes}
            onChange={handleChange('notes')}
            fullWidth
            multiline
            rows={3}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default BudgetForm; 