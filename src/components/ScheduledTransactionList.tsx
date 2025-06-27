import React from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Typography,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as ExecuteIcon,
} from '@mui/icons-material';
import { ScheduledTransaction, Account } from '../db';

interface ScheduledTransactionListProps {
  scheduledTransactions: ScheduledTransaction[];
  accounts: Account[];
  onEditTransaction: (transaction: ScheduledTransaction) => void;
  onDeleteTransaction: (transactionId: number) => void;
  onExecuteTransaction: (transaction: ScheduledTransaction) => void;
}

const ScheduledTransactionList: React.FC<ScheduledTransactionListProps> = ({
  scheduledTransactions,
  accounts,
  onEditTransaction,
  onDeleteTransaction,
  onExecuteTransaction,
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

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'daily':
        return '매일';
      case 'weekly':
        return '매주';
      case 'monthly':
        return '매월';
      case 'yearly':
        return '매년';
      default:
        return frequency;
    }
  };

  return (
    <TableContainer component={Paper} elevation={2}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>다음 실행일</TableCell>
            <TableCell>계좌</TableCell>
            <TableCell>거래처</TableCell>
            <TableCell>카테고리</TableCell>
            <TableCell>금액</TableCell>
            <TableCell>유형</TableCell>
            <TableCell>주기</TableCell>
            <TableCell>메모</TableCell>
            <TableCell align="right">작업</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {scheduledTransactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} align="center">
                <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
                  등록된 정기 거래가 없습니다.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            scheduledTransactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{formatDate(transaction.next_date)}</TableCell>
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
                    label={getFrequencyLabel(transaction.frequency)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{transaction.notes || '-'}</TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => onExecuteTransaction(transaction)}
                    sx={{ mr: 1 }}
                    title="지금 실행"
                  >
                    <ExecuteIcon />
                  </IconButton>
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

export default ScheduledTransactionList; 