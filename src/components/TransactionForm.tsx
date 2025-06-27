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
  Grid,
  SelectChangeEvent,
} from '@mui/material';
import { Transaction, Account, TransactionType } from '../db';
import { format } from 'date-fns';

export interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (transaction: Partial<Transaction>) => Promise<void>;
  transaction?: Transaction;
  accounts: Account[];
  categories: string[];
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
    type: 'expense' as TransactionType,
    amount: 0,
    payee: '',
    category: '',
    notes: '',
    account_id: accounts[0]?.id,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (transaction) {
      setFormData({
        ...transaction,
        date: format(new Date(transaction.date), 'yyyy-MM-dd'),
      });
    } else {
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'expense' as TransactionType,
        amount: 0,
        payee: '',
        category: '',
        notes: '',
        account_id: accounts[0]?.id,
      });
    }
    setErrors({});
  }, [transaction, accounts]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.date) {
      newErrors.date = 'Please select a date';
    }
    if (!formData.account_id) {
      newErrors.account_id = 'Please select an account';
    }
    if (!formData.payee) {
      newErrors.payee = 'Please enter a payee';
    }
    if (!formData.category) {
      newErrors.category = 'Please select a category';
    }
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Please enter an amount';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) || 0 : value,
    }));

    // Clear error when field is edited
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handlePayeeChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const payee = event.target.value;
    setFormData(prev => ({ ...prev, payee }));

    if (payee && !transaction) {
      try {
        const category = await window.electron.invoke('findMatchingCategory', payee);
        if (category) {
          setFormData(prev => ({ ...prev, category }));
        }
      } catch (error) {
        console.error('Error finding matching category:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      await onSave(formData);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {transaction ? 'Edit Transaction' : 'Add New Transaction'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Payee"
                  value={formData.payee}
                  onChange={handlePayeeChange}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  name="date"
                  label="Date"
                  type="date"
                  value={formData.date}
                  onChange={handleChange}
                  fullWidth
                  required
                  error={!!errors.date}
                  helperText={errors.date}
                  InputLabelProps={{ shrink: true }}
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
              <Grid item xs={12}>
                <FormControl fullWidth required error={!!errors.category}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    name="category"
                    value={formData.category || ''}
                    onChange={handleChange}
                    label="Category"
                  >
                    {categories.map((category) => (
                      <MenuItem key={category} value={category}>
                        {category}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.category && (
                    <FormHelperText>{errors.category}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  name="amount"
                  label="Amount"
                  type="number"
                  value={formData.amount}
                  onChange={handleChange}
                  fullWidth
                  required
                  error={!!errors.amount}
                  helperText={errors.amount}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select
                    name="type"
                    value={formData.type || 'expense'}
                    onChange={handleChange}
                    label="Type"
                  >
                    <MenuItem value="expense">Expense</MenuItem>
                    <MenuItem value="income">Income</MenuItem>
                    <MenuItem value="transfer">Transfer</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  name="notes"
                  label="Notes"
                  value={formData.notes}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={3}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    name="status"
                    value={formData.status || 'uncleared'}
                    onChange={handleChange}
                    label="Status"
                  >
                    <MenuItem value="cleared">Cleared</MenuItem>
                    <MenuItem value="uncleared">Uncleared</MenuItem>
                    <MenuItem value="reconciled">Reconciled</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
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

export default TransactionForm; 