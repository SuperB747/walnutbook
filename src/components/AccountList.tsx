import React, { useState, useEffect } from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Paper,
  Box,
  Chip,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Account } from '../db';

interface AccountListProps {
  accounts: Account[];
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (accountId: number) => void;
}

const AccountList: React.FC<AccountListProps> = ({
  accounts,
  onEditAccount,
  onDeleteAccount,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
    }).format(amount);
  };

  const getAccountTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'checking':
        return 'primary';
      case 'savings':
        return 'success';
      case 'credit':
        return 'error';
      case 'investment':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Paper elevation={2}>
      <Box p={2}>
        <Typography variant="h6" gutterBottom>
          계좌 목록
        </Typography>
        <List>
          {accounts.map((account) => (
            <ListItem key={account.id} divider>
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="subtitle1">{account.name}</Typography>
                    <Chip
                      label={account.type}
                      size="small"
                      color={getAccountTypeColor(account.type) as any}
                    />
                  </Box>
                }
                secondary={
                  <>
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.primary"
                    >
                      {formatCurrency(account.balance)}
                    </Typography>
                    <br />
                    <Typography component="span" variant="body2" color="text.secondary">
                      {account.category}
                    </Typography>
                  </>
                }
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  aria-label="edit"
                  onClick={() => onEditAccount(account)}
                  sx={{ mr: 1 }}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => onDeleteAccount(account.id)}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Box>
    </Paper>
  );
};

export default AccountList; 