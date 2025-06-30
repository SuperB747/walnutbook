import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Box,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  SelectChangeEvent,
} from '@mui/material';
import { Transaction, Account, TransactionType } from '../db';

export interface BulkTransactionEditProps {
  open: boolean;
  onClose: () => void;
  onSave: (updates: { field: string; value: any; transactionIds: number[] }) => Promise<void>;
  transactions: Transaction[];
  accounts: Account[];
  categories: string[];
}

const BulkTransactionEdit: React.FC<BulkTransactionEditProps> = ({
  open,
  onClose,
  onSave,
  transactions,
  accounts,
  categories,
}) => {
  const [selectedField, setSelectedField] = useState<string>('');
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [selectedTransactions, setSelectedTransactions] = useState<number[]>([]);

  const handleFieldChange = (event: SelectChangeEvent) => {
    setSelectedField(event.target.value);
    setSelectedValue('');
  };

  const handleValueChange = (event: SelectChangeEvent) => {
    setSelectedValue(event.target.value);
  };

  const handleTransactionToggle = (transactionId: number) => {
    setSelectedTransactions(prev => {
      if (prev.includes(transactionId)) {
        return prev.filter(id => id !== transactionId);
      } else {
        return [...prev, transactionId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedTransactions.length === transactions.length) {
      setSelectedTransactions([]);
    } else {
      setSelectedTransactions(transactions.map(t => t.id));
    }
  };

  const handleSubmit = async () => {
    if (!selectedField || !selectedValue || selectedTransactions.length === 0) {
      return;
    }

    await onSave({
      field: selectedField,
      value: selectedField === 'account_id' ? parseInt(selectedValue, 10) : selectedValue,
      transactionIds: selectedTransactions,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  };

  const renderValueSelect = () => {
    switch (selectedField) {
      case 'account_id':
        return accounts.map(account => (
          <MenuItem key={account.id} value={account.id}>
            {account.name}
          </MenuItem>
        ));
      case 'category':
        return [
          <MenuItem key="" value="">
            <em>None</em>
          </MenuItem>,
          ...categories.map(category => (
            <MenuItem key={category} value={category}>
              {category}
            </MenuItem>
          )),
        ];
      case 'type':
        return [
          <MenuItem key="expense" value="expense">Expense</MenuItem>,
          <MenuItem key="income" value="income">Income</MenuItem>,
        ];
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Bulk Edit Transactions</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Field to Update</InputLabel>
            <Select
              value={selectedField}
              onChange={handleFieldChange}
              label="Field to Update"
            >
              <MenuItem value="account_id">Account</MenuItem>
              <MenuItem value="category">Category</MenuItem>
              <MenuItem value="type">Type</MenuItem>
            </Select>
          </FormControl>

          {selectedField && (
            <FormControl fullWidth>
              <InputLabel>New Value</InputLabel>
              <Select
                value={selectedValue}
                onChange={handleValueChange}
                label="New Value"
              >
                {renderValueSelect()}
              </Select>
            </FormControl>
          )}

          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle1">Select Transactions</Typography>
              <Button
                onClick={handleSelectAll}
                sx={{ ml: 2 }}
              >
                {selectedTransactions.length === transactions.length ? 'Deselect All' : 'Select All'}
              </Button>
            </Box>
            <List sx={{ maxHeight: 300, overflow: 'auto' }}>
              {transactions.map(transaction => (
                <ListItem
                  key={transaction.id}
                  dense
                  button
                  onClick={() => handleTransactionToggle(transaction.id)}
                >
                  <Checkbox
                    edge="start"
                    checked={selectedTransactions.includes(transaction.id)}
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemText
                    primary={`${transaction.date} - ${transaction.payee}`}
                    secondary={`${transaction.type} - ${transaction.amount}`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={!selectedField || !selectedValue || selectedTransactions.length === 0}
        >
          Update {selectedTransactions.length} Transaction(s)
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkTransactionEdit; 