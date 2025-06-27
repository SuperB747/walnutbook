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
} from '@mui/material';
import { Account, AccountType } from '../db';

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
    type: 'checking' as AccountType,
    balance: 0,
  });

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        type: account.type,
        balance: account.balance,
      });
    } else {
      setFormData({
        name: '',
        type: 'checking' as AccountType,
        balance: 0,
      });
    }
  }, [account]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'balance' ? parseFloat(value) : value,
    }));
  };

  const handleTypeChange = (event: SelectChangeEvent) => {
    setFormData(prev => ({
      ...prev,
      type: event.target.value as AccountType,
    }));
  };

  const handleSubmit = async () => {
    await onSave(formData);
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

          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              value={formData.type}
              onChange={handleTypeChange}
              label="Type"
            >
              <MenuItem value="checking">Checking</MenuItem>
              <MenuItem value="savings">Savings</MenuItem>
              <MenuItem value="credit">Credit</MenuItem>
              <MenuItem value="investment">Investment</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Balance"
            name="balance"
            type="number"
            value={formData.balance}
            onChange={handleChange}
          />
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