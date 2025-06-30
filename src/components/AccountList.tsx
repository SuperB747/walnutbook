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
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { Account } from '../db';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import CalculateIcon from '@mui/icons-material/Calculate';

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
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>Account Summary</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
            <AccountBalanceWalletIcon sx={{ fontSize: 40, color: availableFunds < 0 ? '#d32f2f' : '#388e3c', mr: 2 }} />
            <CardContent sx={{ p: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">Available Funds</Typography>
              <Typography variant="h6" sx={{ color: availableFunds < 0 ? '#d32f2f' : '#388e3c', fontWeight: 700 }}>
                {safeFormatCurrency(availableFunds)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
            <CreditCardIcon sx={{ fontSize: 40, color: creditCardBalance < 0 ? '#d32f2f' : '#388e3c', mr: 2 }} />
            <CardContent sx={{ p: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">Credit Card Balance</Typography>
              <Typography variant="h6" sx={{ color: creditCardBalance < 0 ? '#d32f2f' : '#388e3c', fontWeight: 700 }}>
                {safeFormatCurrency(creditCardBalance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
            <CalculateIcon sx={{ fontSize: 40, color: totalBalance < 0 ? '#d32f2f' : '#388e3c', mr: 2 }} />
            <CardContent sx={{ p: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">Net Balance</Typography>
              <Typography variant="h6" sx={{ color: totalBalance < 0 ? '#d32f2f' : '#388e3c', fontWeight: 700 }}>
                {safeFormatCurrency(totalBalance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <TableContainer component={Paper}>
        <Table size="small" sx={{
          '& .MuiTableCell-root': {
            fontSize: '0.92rem',
            py: 0.5,
            px: 1.2,
            lineHeight: 1.2,
          },
          '& .MuiTableRow-root': {
            height: '32px',
          },
        }}>
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