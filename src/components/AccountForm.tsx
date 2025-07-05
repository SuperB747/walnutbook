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
  Divider,
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
    type: 'checking' as AccountType,
    description: '',
  });
  const [csvSignLogic, setCsvSignLogic] = useState<string>('standard');

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        type: account.type,
        description: account.description || '',
      });
      // Load CSV import settings for existing account
      loadCsvImportSettings(account.id);
    } else {
      setFormData({
        name: '',
        type: 'checking' as AccountType,
        description: '',
      });
      setCsvSignLogic('standard');
    }
  }, [account]);

  const loadCsvImportSettings = async (accountId: number) => {
    try {
      console.log('Loading CSV import settings for account:', accountId);
      const logic = await invoke('get_csv_sign_logic_for_account', { accountId });
      console.log('Loaded CSV sign logic:', logic);
      setCsvSignLogic(logic as string);
    } catch (error) {
      console.warn('Failed to load CSV import settings:', error);
      setCsvSignLogic('standard');
    }
  };

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
      
      // Save CSV import settings if account exists
      if (account) {
        console.log('Saving CSV import settings:', { accountId: account.id, csvSignLogic });
        await invoke('update_account_import_settings', { 
          accountId: account.id, 
          csvSignLogic 
        });
        console.log('CSV import settings saved successfully');
      }
    } catch (error) {
      console.error('Failed to save account or CSV import settings:', error);
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
              <MenuItem value="checking">Checking</MenuItem>
              <MenuItem value="savings">Savings</MenuItem>
              <MenuItem value="credit">Credit</MenuItem>
              <MenuItem value="investment">Investment</MenuItem>
              <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>

            {account && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" sx={{ mb: 1 }}>
                  CSV Import Settings
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Configure how CSV files are interpreted for this account
                </Typography>
                <FormControl fullWidth>
                  <InputLabel>CSV Sign Logic</InputLabel>
                  <Select
                    value={csvSignLogic}
                    onChange={(e) => setCsvSignLogic(e.target.value)}
                    label="CSV Sign Logic"
                  >
                    <MenuItem value="standard">
                      <Box>
                        <Typography variant="body2">Standard</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Positive = Income, Negative = Expense
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="reversed">
                      <Box>
                        <Typography variant="body2">Reversed</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Positive = Expense, Negative = Income
                        </Typography>
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>
              </>
            )}
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