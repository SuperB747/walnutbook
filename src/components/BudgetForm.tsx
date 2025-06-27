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
import { Budget } from '../db';

interface BudgetFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (budget: Partial<Budget>) => void;
  budget?: Budget;
  month: string;
}

const BudgetForm: React.FC<BudgetFormProps> = ({
  open,
  onClose,
  onSave,
  budget,
  month,
}) => {
  const [formData, setFormData] = useState<Partial<Budget>>({
    category: '',
    amount: 0,
    notes: '',
    month: month,
  });

  useEffect(() => {
    if (budget) {
      setFormData({
        category: budget.category,
        amount: budget.amount,
        notes: budget.notes || '',
        month: budget.month,
      });
    } else {
      setFormData({
        category: '',
        amount: 0,
        notes: '',
        month: month,
      });
    }
  }, [budget, month]);

  const handleChange = (field: keyof Budget) => (
    event: React.ChangeEvent<HTMLInputElement | { value: unknown }>
  ) => {
    const value = field === 'amount' 
      ? Number(event.target.value) 
      : event.target.value as string;
    
    setFormData({
      ...formData,
      [field]: value,
    });
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
          <TextField
            label="Category"
            value={formData.category}
            onChange={handleChange('category')}
            fullWidth
            required
            margin="normal"
          />
          <TextField
            label="Amount"
            type="number"
            value={formData.amount}
            onChange={handleChange('amount')}
            fullWidth
            required
            margin="normal"
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