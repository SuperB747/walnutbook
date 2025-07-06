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
  isLoading?: boolean;
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

// Credit 계좌 잔액을 표시하는 함수 (부호 변환 없이 그대로)
const formatCreditBalance = (account: Account): string => {
  return safeFormatCurrency(account.balance);
};

const AccountList: React.FC<AccountListProps> = ({
  accounts,
  onEdit,
  onDelete,
  isLoading = false,
}) => {
  // 알파벳 순서로 정렬
  const sortedAccounts = [...accounts].sort((a, b) => a.name.localeCompare(b.name));
  // Net Balance 계산: 모든 계좌 balance를 그대로 합산
  const totalBalance = sortedAccounts.reduce((sum, account) => sum + account.balance, 0);
  const availableFunds = sortedAccounts.filter(a => a.type === 'Checking' || a.type === 'Savings').reduce((sum, a) => sum + a.balance, 0);
  // Credit 계좌 잔액 합산 (부호 변환 없이 그대로)
  const creditAccounts = sortedAccounts.filter(a => a.type === 'Credit');
  const creditCardBalance = creditAccounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <Box>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
            <AccountBalanceWalletIcon sx={{ fontSize: 40, color: isLoading ? 'grey.400' : (availableFunds < 0 ? '#d32f2f' : '#388e3c'), mr: 2 }} />
            <CardContent sx={{ p: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">Available Funds</Typography>
              {isLoading ? (
                <Box sx={{ width: '80%', height: 24, bgcolor: 'grey.200', borderRadius: 1, mt: 0.5 }} />
              ) : (
                <Typography variant="h6" sx={{ color: availableFunds < 0 ? '#d32f2f' : '#388e3c', fontWeight: 700 }}>
                  {safeFormatCurrency(availableFunds)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
            <CreditCardIcon sx={{ fontSize: 40, color: isLoading ? 'grey.400' : (creditCardBalance < 0 ? '#d32f2f' : '#388e3c'), mr: 2 }} />
            <CardContent sx={{ p: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">Credit Card Balance</Typography>
              {isLoading ? (
                <Box sx={{ width: '80%', height: 24, bgcolor: 'grey.200', borderRadius: 1, mt: 0.5 }} />
              ) : (
                <Typography variant="h6" sx={{ color: creditCardBalance < 0 ? '#d32f2f' : '#388e3c', fontWeight: 700 }}>
                  {safeFormatCurrency(creditCardBalance)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={3} sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
            <CalculateIcon sx={{ fontSize: 40, color: isLoading ? 'grey.400' : (totalBalance < 0 ? '#d32f2f' : '#388e3c'), mr: 2 }} />
            <CardContent sx={{ p: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">Net Balance</Typography>
              {isLoading ? (
                <Box sx={{ width: '80%', height: 24, bgcolor: 'grey.200', borderRadius: 1, mt: 0.5 }} />
              ) : (
                <Typography variant="h6" sx={{ color: totalBalance < 0 ? '#d32f2f' : '#388e3c', fontWeight: 700 }}>
                  {safeFormatCurrency(totalBalance)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <TableContainer component={Paper}>
        <Table size="small" sx={{
          tableLayout: 'fixed', // 테이블 레이아웃 고정
          '& .MuiTableCell-root': {
            fontSize: '0.92rem',
            py: 0.5,
            px: 1.2,
            lineHeight: 1.2,
          },
          '& .MuiTableRow-root': {
            height: '32px',
          },
          '& .MuiTableHead-root .MuiTableCell-root': {
            fontWeight: 600,
            color: 'text.primary',
          },
        }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 130, minWidth: 130, maxWidth: 130 }}>Name</TableCell>
              <TableCell sx={{ minWidth: 200, maxWidth: 'none' }}>Description</TableCell>
              <TableCell align="center" sx={{ width: 80, minWidth: 80, maxWidth: 80 }}>Type</TableCell>
              <TableCell align="right" sx={{ width: 100, minWidth: 100, maxWidth: 100 }}>Balance</TableCell>
              <TableCell align="center" sx={{ width: 120, minWidth: 120, maxWidth: 120 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
          {isLoading ? (
            // 로딩 중일 때 스켈레톤 행들 표시
            Array.from({ length: 5 }).map((_, index) => (
              <TableRow key={`loading-${index}`}>
                <TableCell sx={{ width: 130, minWidth: 130, maxWidth: 130 }}>
                  <Box sx={{ width: '80%', height: 16, bgcolor: 'grey.200', borderRadius: 1 }} />
                </TableCell>
                <TableCell sx={{ minWidth: 200, maxWidth: 'none' }}>
                  <Box sx={{ width: '60%', height: 16, bgcolor: 'grey.200', borderRadius: 1 }} />
                </TableCell>
                <TableCell align="center" sx={{ width: 80, minWidth: 80, maxWidth: 80 }}>
                  <Box sx={{ width: '70%', height: 16, bgcolor: 'grey.200', borderRadius: 1, mx: 'auto' }} />
                </TableCell>
                <TableCell align="right" sx={{ width: 100, minWidth: 100, maxWidth: 100 }}>
                  <Box sx={{ width: '60%', height: 16, bgcolor: 'grey.200', borderRadius: 1, ml: 'auto' }} />
                </TableCell>
                <TableCell align="center" sx={{ width: 120, minWidth: 120, maxWidth: 120 }}>
                  <Box sx={{ width: '80%', height: 16, bgcolor: 'grey.200', borderRadius: 1, mx: 'auto' }} />
                </TableCell>
              </TableRow>
            ))
          ) : (
            sortedAccounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell sx={{ width: 130, minWidth: 130, maxWidth: 130 }}>
                  <Typography variant="body2" sx={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap' 
                  }}>
                    {account.name}
                  </Typography>
                </TableCell>
                <TableCell sx={{ minWidth: 200, maxWidth: 'none' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap' 
                  }}>
                    {account.description || '-'}
                  </Typography>
                </TableCell>
                <TableCell align="center">{account.type}</TableCell>
                <TableCell align="right">
                  <Typography color={account.balance < 0 ? 'error.main' : 'inherit'}>
                    {formatCreditBalance(account)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <IconButton
                      size="small"
                    onClick={() => onEdit(account)}
                    sx={{ 
                      backgroundColor: 'transparent',
                      color: '#6B7280',
                      '&:hover': {
                        backgroundColor: 'rgba(107, 114, 128, 0.08)',
                        color: '#374151'
                      }
                    }}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                    size="small"
                    onClick={() => onDelete(account.id)}
                    sx={{ 
                      backgroundColor: 'transparent',
                      color: '#6B7280',
                      '&:hover': {
                        backgroundColor: 'rgba(107, 114, 128, 0.08)',
                        color: '#374151'
                      }
                    }}
                >
                  <DeleteIcon />
                </IconButton>
                </TableCell>
              </TableRow>
            ))
          )}
          </TableBody>
        </Table>
      </TableContainer>
      </Box>
  );
};

export default AccountList; 