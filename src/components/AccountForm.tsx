import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  SelectChangeEvent,
  Typography,
} from '@mui/material';
import { Account, AccountType } from '../db';
import { invoke } from '@tauri-apps/api/core';

// Helper: format numbers as CAD currency with two decimal places, treating near-zero as zero
const formatCurrency = (amount: number): string => {
  // Avoid '-$0.00' for negative zero or tiny values
  const value = Math.abs(amount) < 0.005 ? 0 : amount;
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 }).format(value);
};

export interface AccountFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (account: Partial<Account>) => Promise<void>;
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
    type: 'Checking' as AccountType,
    description: '',
  });


  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        type: account.type,
        description: account.description || '',
      });
    } else {
      setFormData({
        name: '',
        type: 'Checking' as AccountType,
        description: '',
      });
    }
  }, [account]);



  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTypeChange = (event: SelectChangeEvent) => {
    setFormData(prev => ({
      ...prev,
      type: event.target.value as AccountType,
    }));
  };

  const handleSubmit = async () => {
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Failed to save account:', error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{account ? 'Edit Account' : 'New Account'}</DialogTitle>
        <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
            fullWidth
            label="Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
            />

            <TextField
              fullWidth
              label="Description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              multiline
              rows={2}
              placeholder="Optional description for this account"
            />

          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
              <Select
                value={formData.type}
              onChange={handleTypeChange}
              label="Type"
              >
              <MenuItem value="Checking">Checking</MenuItem>
              <MenuItem value="Savings">Savings</MenuItem>
              <MenuItem value="Credit">Credit</MenuItem>
              <MenuItem value="Investment">Investment</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>


          </Box>
        </DialogContent>
        <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary">
          Save
          </Button>
        </DialogActions>
    </Dialog>
  );
};

export default AccountForm; 