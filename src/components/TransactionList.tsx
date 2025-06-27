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
  Chip,
  Typography,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Transaction, Account } from '../db';

interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transactionId: number) => void;
}

const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  accounts,
  onEditTransaction,
  onDeleteTransaction,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'income':
        return 'success';
      case 'expense':
        return 'error';
      case 'transfer':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'cleared':
        return 'success';
      case 'reconciled':
        return 'info';
      default:
        return 'warning';
    }
  };

  const getAccountName = (accountId: number) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? account.name : '알 수 없는 계좌';
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'income':
        return '수입';
      case 'expense':
        return '지출';
      case 'transfer':
        return '이체';
      default:
        return type;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'cleared':
        return '승인됨';
      case 'reconciled':
        return '조정됨';
      case 'uncleared':
        return '미승인';
      default:
        return status;
    }
  };

  return (
    <TableContainer component={Paper} elevation={2}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>날짜</TableCell>
            <TableCell>계좌</TableCell>
            <TableCell>거래처</TableCell>
            <TableCell>카테고리</TableCell>
            <TableCell>금액</TableCell>
            <TableCell>유형</TableCell>
            <TableCell>상태</TableCell>
            <TableCell>메모</TableCell>
            <TableCell align="right">작업</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} align="center">
                <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
                  거래 내역이 없습니다.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{formatDate(transaction.date)}</TableCell>
                <TableCell>{getAccountName(transaction.account_id)}</TableCell>
                <TableCell>{transaction.payee}</TableCell>
                <TableCell>{transaction.category}</TableCell>
                <TableCell>
                  <Typography
                    color={transaction.type === 'expense' ? 'error' : 'success'}
                  >
                    {formatCurrency(transaction.amount)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={getTransactionTypeLabel(transaction.type)}
                    size="small"
                    color={getTransactionTypeColor(transaction.type) as any}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={getStatusLabel(transaction.status)}
                    size="small"
                    color={getStatusColor(transaction.status) as any}
                  />
                </TableCell>
                <TableCell>{transaction.notes || '-'}</TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => onEditTransaction(transaction)}
                    sx={{ mr: 1 }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => onDeleteTransaction(transaction.id)}
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
  );
};

export default TransactionList; 