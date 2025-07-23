import React, { useEffect, useState } from 'react';
import {
  Container, Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, Checkbox, IconButton, List, ListItem, ListItemText, ListItemSecondaryAction, Snackbar, Alert
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { Reminder, Account } from '../db';

function getNextMonthDate(current: string, day: number): string {
  const date = new Date(current);
  date.setMonth(date.getMonth() + 1);
  date.setDate(day);
  // 보정: 2월 등에서 날짜 초과시 말일로
  if (date.getDate() !== day) {
    date.setDate(0);
  }
  return date.toISOString().slice(0, 10);
}

const ReminderPage: React.FC = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [form, setForm] = useState<{ account_id: number | ''; payment_day: number | ''; notes: string }>({ account_id: '', payment_day: '', notes: '' });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const loadReminders = async () => {
    const data = await invoke<Reminder[]>('get_reminders');
    setReminders(Array.isArray(data) ? data : []);
  };
  const loadAccounts = async () => {
    const data = await invoke<Account[]>('get_accounts');
    setAccounts(Array.isArray(data) ? data.filter(a => a.type === 'Credit') : []);
  };
  useEffect(() => { loadReminders(); loadAccounts(); }, []);

  const handleOpenDialog = (reminder?: Reminder) => {
    if (reminder) {
      setEditReminder(reminder);
      setForm({ account_id: reminder.account_id, payment_day: reminder.payment_day, notes: reminder.notes || '' });
    } else {
      setEditReminder(null);
      setForm({ account_id: '', payment_day: '', notes: '' });
    }
    setDialogOpen(true);
  };
  const handleCloseDialog = () => { setDialogOpen(false); };

  const handleSave = async () => {
    const account = accounts.find(a => a.id === form.account_id);
    if (!account || !form.payment_day) return;
    const today = new Date();
    let next_payment_date = new Date(today.getFullYear(), today.getMonth(), Number(form.payment_day));
    if (next_payment_date < today) {
      next_payment_date.setMonth(next_payment_date.getMonth() + 1);
    }
    const reminder: Reminder = {
      id: editReminder ? editReminder.id : 0,
      account_id: account.id,
      account_name: account.name,
      payment_day: Number(form.payment_day),
      next_payment_date: next_payment_date.toISOString().slice(0, 10),
      is_checked: false,
      notes: form.notes,
      created_at: editReminder ? editReminder.created_at : '',
    };
    try {
      if (editReminder) {
        await invoke('update_reminder', { reminder });
        setSnackbar({ open: true, message: 'Reminder updated', severity: 'success' });
      } else {
        await invoke('add_reminder', { reminder });
        setSnackbar({ open: true, message: 'Reminder added', severity: 'success' });
      }
      setDialogOpen(false);
      loadReminders();
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to save reminder', severity: 'error' });
    }
  };

  const handleDelete = async (id: number) => {
    await invoke('delete_reminder', { id });
    loadReminders();
  };

  const handleCheck = async (reminder: Reminder) => {
    const nextDate = getNextMonthDate(reminder.next_payment_date, reminder.payment_day);
    await invoke('check_reminder', { id: reminder.id, next_payment_date: nextDate });
    loadReminders();
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Credit Card Payment Reminders</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Add your credit cards and payment days. Check off when paid to see the next due date. Sorted by next payment.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={{ mb: 2 }}>
          Add Reminder
        </Button>
        <List>
          {reminders.sort((a, b) => a.next_payment_date.localeCompare(b.next_payment_date)).map(reminder => (
            <ListItem key={reminder.id} sx={{ bgcolor: reminder.is_checked ? '#e0f7fa' : undefined, borderRadius: 2, mb: 1 }}>
              <Checkbox
                checked={reminder.is_checked}
                onChange={() => handleCheck(reminder)}
                icon={<CheckIcon />}
                checkedIcon={<CheckIcon />}
                sx={{ mr: 2 }}
              />
              <ListItemText
                primary={<>
                  <b>{reminder.account_name}</b> - Payment Day: {reminder.payment_day}
                  <span style={{ marginLeft: 12, color: '#1976d2' }}>Next: {reminder.next_payment_date}</span>
                </>}
                secondary={reminder.notes}
              />
              <ListItemSecondaryAction>
                <IconButton edge="end" onClick={() => handleOpenDialog(reminder)}><EditIcon /></IconButton>
                <IconButton edge="end" onClick={() => handleDelete(reminder.id)}><DeleteIcon /></IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="xs" fullWidth>
          <DialogTitle>{editReminder ? 'Edit Reminder' : 'Add Reminder'}</DialogTitle>
          <DialogContent>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Credit Card</InputLabel>
              <Select
                value={form.account_id}
                label="Credit Card"
                onChange={e => setForm(f => ({ ...f, account_id: Number(e.target.value) }))}
              >
                {accounts.map(a => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Payment Day (1~31)"
              type="number"
              fullWidth
              value={form.payment_day}
              onChange={e => setForm(f => ({ ...f, payment_day: Number(e.target.value) }))}
              inputProps={{ min: 1, max: 31 }}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Notes"
              fullWidth
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              multiline
              rows={2}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button onClick={handleSave} variant="contained">{editReminder ? 'Update' : 'Add'}</Button>
          </DialogActions>
        </Dialog>
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        >
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
        </Snackbar>
      </Box>
    </Container>
  );
};

export default ReminderPage; 