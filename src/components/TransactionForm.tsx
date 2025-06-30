import React, { useState, useEffect, useMemo } from 'react';
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

// Category with type info from backend
interface FullCategory {
  id: number;
  name: string;
  type: 'income' | 'expense' | 'adjust' | 'transfer';
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
    type: transaction?.type || 'expense' as TransactionType,
    amount: undefined,
    payee: '',
    category: '',
    notes: '',
    account_id: accounts[0]?.id,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allCategories, setAllCategories] = useState<FullCategory[]>([]);

  // Load all categories with type when dialog opens
  const loadCategoriesFull = async () => {
    try {
      console.log('Loading categories...');
      const result = await invoke<FullCategory[]>('get_categories_full');
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
    }
  }, [open]);

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
        amount: undefined,
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
    e: SelectChangeEvent | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    let updates: Partial<Transaction> = { [name]: value };

    if (name === 'type') {
      // Reset category when type changes
      updates.category = '';
      
      // Set default category for adjust and transfer types
      if (value === 'adjust') {
        updates.category = 'Add';
      } else if (value === 'transfer') {
        updates.category = 'Transfer Out';
      }
    }

    // Handle amount sign for transfer categories
    if (name === 'category' && formData.type === 'transfer') {
      const amount = formData.amount || 0;
      if (value === 'Transfer In' && amount < 0) {
        updates.amount = Math.abs(amount);
      } else if (value === 'Transfer Out' && amount > 0) {
        updates.amount = -Math.abs(amount);
      }
    }

    // Handle numeric values
    if (name === 'amount') {
      updates.amount = parseFloat(value) || 0;
    }

    setFormData(prev => ({ ...prev, ...updates }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handlePayeeChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const payee = event.target.value;
    setFormData(prev => ({ ...prev, payee }));

    if (payee && !transaction) {
      try {
        const category = await invoke<string>('find_matching_category', { payee });
        if (category) {
          setFormData(prev => ({ ...prev, category }));
        }
      } catch (error) {
        console.error('Error finding matching category:', error);
      }
    }
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

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    const amount = parseFloat(value) || undefined;
    setFormData(prev => ({ ...prev, amount }));

    // Clear error when field is edited
    if (errors.amount) {
      setErrors(prev => ({ ...prev, amount: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      await onSave(formData);
    }
  };

  // Filter categories based on selected type
  const filteredCategories = useMemo(() => {
    return allCategories.filter(cat => {
      if (formData.type === 'adjust') {
        return cat.type === 'adjust';
      } else if (formData.type === 'transfer') {
        return cat.type === 'transfer';
      }
      return cat.type === formData.type;
    });
  }, [allCategories, formData.type]);

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
                <TextField
                  fullWidth
                  label="Payee"
                  name="payee"
                  value={formData.payee}
                  onChange={handlePayeeChange}
                  required
                  error={!!errors.payee}
                  helperText={errors.payee}
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
                <FormControl fullWidth required error={!!errors.type}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    name="type"
                    value={formData.type || ''}
                    onChange={handleChange}
                    label="Type"
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
                        color="info" 
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
                <FormControl fullWidth required error={!!errors.category}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    name="category"
                    value={formData.category || ''}
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
                      <MenuItem key={category.id} value={category.name}>
                        {category.name}
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
                  value={formData.amount !== undefined ? formData.amount : ''}
                  onChange={handleAmountChange}
                  onBlur={() => {
                    if (formData.amount !== undefined) {
                      const formatted = formatAmount(formData.amount);
                      const el = document.querySelector('input[name="amount"]') as HTMLInputElement;
                      if (el) el.value = formatted;
                    }
                  }}
                  onFocus={(e) => {
                    e.target.value = formData.amount?.toString() || '';
                  }}
                  fullWidth
                  required
                  error={!!errors.amount}
                  helperText={errors.amount}
                  inputProps={{
                    inputMode: 'decimal',
                    pattern: '[0-9]*[.]?[0-9]*'
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
          <Button type="submit" variant="contained" color="primary">
            {transaction ? 'Save Changes' : 'Add Transaction'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default TransactionForm; 