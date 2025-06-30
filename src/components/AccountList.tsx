import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
  Box,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { Account } from '../db';

export interface AccountListProps {
  accounts: Account[];
  onEdit: (account: Account) => void;
  onDelete: (id: number) => void;
}

// Helper: format numbers as CAD currency with comma separators
const formatCurrency = (amount: number): string => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);

// Safely format balance values, fallback to 0 on invalid input
const safeFormatCurrency = (amount: number): string => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    console.warn('Invalid account balance:', amount);
    return formatCurrency(0);
  }
  // Treat near-zero values as exactly zero to avoid "-$0.00"
  if (Math.abs(amount) < 0.005) {
    return formatCurrency(0);
}
  return formatCurrency(amount);
};

const AccountList: React.FC<AccountListProps> = ({
  accounts,
  onEdit,
  onDelete,
}) => {
  // 알파벳 순서로 정렬
  const sortedAccounts = [...accounts].sort((a, b) => a.name.localeCompare(b.name));
  const totalBalance = sortedAccounts.reduce((sum, account) => sum + account.balance, 0);
  const availableFunds = sortedAccounts.filter(a => a.type === 'checking' || a.type === 'savings').reduce((sum, a) => sum + a.balance, 0);
  const creditCardBalance = sortedAccounts.filter(a => a.type === 'credit').reduce((sum, a) => sum + a.balance, 0);

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1">
          Available Funds: <b style={{ color: availableFunds < 0 ? '#d32f2f' : '#388e3c' }}>{safeFormatCurrency(availableFunds)}</b>
        </Typography>
        <Typography variant="subtitle1">
          Credit Card Balance: <b style={{ color: creditCardBalance < 0 ? '#d32f2f' : '#388e3c' }}>{safeFormatCurrency(creditCardBalance)}</b>
        </Typography>
        <Typography variant="subtitle1">
          Net Balance: <b style={{ color: totalBalance < 0 ? '#d32f2f' : '#388e3c' }}>{safeFormatCurrency(totalBalance)}</b>
        </Typography>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
          {sortedAccounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>{account.name}</TableCell>
                <TableCell>{account.type}</TableCell>
                <TableCell align="right">
                  <Typography color={account.balance < 0 ? 'error.main' : 'inherit'}>
                    {safeFormatCurrency(account.balance)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <IconButton
                      size="small"
                    onClick={() => onEdit(account)}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                    size="small"
                    onClick={() => onDelete(account.id)}
                >
                  <DeleteIcon />
                </IconButton>
                </TableCell>
              </TableRow>
          ))}
          </TableBody>
        </Table>
      </TableContainer>
      </Box>
  );
};

export default AccountList; 