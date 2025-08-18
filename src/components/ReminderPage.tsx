import React, { useEffect, useState, useMemo } from 'react';
import {
  Container, Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, Checkbox, IconButton, List, ListItem, ListItemText, ListItemSecondaryAction, Snackbar, Alert, Divider, Paper
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { Reminder, Account, ReminderPaymentHistory } from '../db';
import dayjs, { Dayjs } from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { format } from 'date-fns';

function getNextMonthDate(current: string, day: number): string {
  const date = new Date(current);
  date.setMonth(date.getMonth() + 1);
  date.setDate(day);
  if (date.getDate() !== day) {
    date.setDate(0);
  }
  return date.toISOString().slice(0, 10);
}

// Due in XX days 계산 함수
function getDueInDays(nextDate: string): string {
  const today = new Date();
  // Parse the date using local date parsing to avoid timezone issues
  const [year, month, day] = nextDate.split('-').map(Number);
  const due = new Date(year, month - 1, day); // month is 0-indexed
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (isNaN(diff)) return '';
  if (diff === 0) return 'Due today';
  if (diff > 0) return `Due in ${diff} days`;
  return `Overdue by ${-diff} days`;
}

const ReminderPage: React.FC = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  // localStorage에서 마지막으로 본 Account id를 불러오고, 없으면 null
  const getInitialSelectedId = () => {
    const saved = localStorage.getItem('reminders_selected_id');
    if (saved && !isNaN(Number(saved))) return Number(saved);
    return null;
  };
  const [selectedId, setSelectedIdRaw] = useState<number | null>(getInitialSelectedId);
  // setSelectedId를 래핑해서 localStorage에도 저장
  const setSelectedId = (id: number | null) => {
    setSelectedIdRaw(id);
    if (id != null) {
      localStorage.setItem('reminders_selected_id', String(id));
    } else {
      localStorage.removeItem('reminders_selected_id');
    }
  };
  const [form, setForm] = useState<{ account_id: number | ''; payment_day: number | ''; notes: string; date: Dayjs | null; statement_date: Dayjs | null }>({ account_id: '', payment_day: '', notes: '', date: null, statement_date: null });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [noteInput, setNoteInput] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [statementDatePickerOpen, setStatementDatePickerOpen] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<ReminderPaymentHistory[]>([]);
  // Payment history 노트 입력 상태 관리
  const [noteEdits, setNoteEdits] = useState<{ [id: number]: string }>({});
  const [statementBalance, setStatementBalance] = useState<number | null>(null);

  // 좌측 리스트에서 선택된 리마인더
  const selectedReminder = reminders.find(r => r.id === selectedId) || reminders[0];

  const loadReminders = async () => {
    const data = await invoke<Reminder[]>('get_reminders');
    setReminders(Array.isArray(data) ? data : []);
    // Dispatch event to notify other components
    window.dispatchEvent(new Event('remindersUpdated'));
  };
  const loadAccounts = async () => {
    const data = await invoke<Account[]>('get_accounts');
    setAccounts(Array.isArray(data) ? data.filter(a => a.type === 'Credit') : []);
  };
  useEffect(() => { loadReminders(); loadAccounts(); }, []);

  // reminders가 바뀔 때, selectedId가 null이거나 현재 id가 리스트에 없으면 가장 위(가까운 Due Date)로 자동 선택
  useEffect(() => {
    if (reminders.length === 0) return;
    const sorted = [...reminders].sort((a, b) => a.next_payment_date.localeCompare(b.next_payment_date));
    if (selectedId == null || !reminders.some(r => r.id === selectedId)) {
      setSelectedId(sorted[0].id);
    }
  }, [reminders]);

  // payment history 불러오기
  useEffect(() => {
    if (!selectedReminder) return;
    invoke<ReminderPaymentHistory[]>('get_reminder_payment_history', {
      reminder_id: selectedReminder.id,
      reminderId: selectedReminder.id
    })
      .then(history => {
        setPaymentHistory(history);
      })
      .catch(error => {
        console.error('Failed to load payment history:', error);
        setPaymentHistory([]);
      });
    
    // Clear note edits when reminder changes
    setNoteEdits({});
  }, [selectedReminder]);

  // Statement Balance 구간 계산 및 API 호출
  useEffect(() => {
    if (!selectedReminder) {
      setStatementBalance(null);
      return;
    }
    const today = dayjs().format('YYYY-MM-DD');
    // paymentHistory에서 statement_date 없으면 paid_date 사용
    const sortedHistory = [...paymentHistory]
      .map(h => ({ ...h, _date: h.statement_date || h.paid_date }))
      .filter(h => h._date)
      .sort((a, b) => (a._date || '').localeCompare(b._date || ''));
    
    // Statement Balance 계산: 이전 statement_date부터 현재 statement_date까지
    let start_date = '1970-01-01';
         let end_date = selectedReminder.statement_date
       ? selectedReminder.statement_date
       : today;
    
    // 가장 최근 payment history의 statement_date를 시작점으로 사용
    if (sortedHistory.length > 0) {
      const lastStatementDate = sortedHistory[sortedHistory.length - 1]._date;
      if (lastStatementDate) {
        start_date = dayjs(lastStatementDate).add(1, 'day').format('YYYY-MM-DD');
      }
    }
    // 디버깅용 로그 추가
    invoke<number>('get_statement_balance', {
      accountId: selectedReminder.account_id,
      startDate: start_date,
      endDate: end_date
    })
      .then(result => {
        setStatementBalance(result);
      })
      .catch(e => {
        console.error('get_statement_balance error', e);
        setStatementBalance(null);
      });
  }, [selectedReminder, paymentHistory]);

  const handleOpenDialog = (reminder?: Reminder) => {
    if (reminder) {
      setEditReminder(reminder);
      setForm({
        account_id: reminder.account_id,
        payment_day: reminder.payment_day,
        notes: '',
        date: dayjs(reminder.next_payment_date),
        statement_date: reminder.statement_date ? dayjs(reminder.statement_date) : null,
      });
    } else {
      setEditReminder(null);
      setForm({ account_id: '', payment_day: '', notes: '', date: null, statement_date: null });
    }
    setDialogOpen(true);
  };
  const handleCloseDialog = () => { setDialogOpen(false); };

  const handleSave = async () => {
    const account = accounts.find(a => a.id === form.account_id);
    if (!account || !form.date || !form.statement_date) return;
    const payment_day = form.date.date();
    const next_payment_date = form.date.format('YYYY-MM-DD');
    const statement_date = form.statement_date.format('YYYY-MM-DD');
    const reminder: Reminder = {
      id: editReminder ? editReminder.id : 0,
      account_id: account.id,
      account_name: account.name,
      payment_day,
      next_payment_date,
      is_checked: false,
      notes: editReminder?.notes ?? [],
      created_at: editReminder ? editReminder.created_at : '',
      statement_date,
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
    setSelectedId(null);
    loadReminders();
  };

  const handleCheck = async (reminder: Reminder) => {
    if (!reminder.next_payment_date || !reminder.statement_date) {
      setSnackbar({ open: true, message: 'Payment date 또는 statement date가 없습니다.', severity: 'error' });
      return;
    }
    const next_payment_date = dayjs(reminder.next_payment_date).add(30, 'day').format('YYYY-MM-DD');
    const next_statement_date = dayjs(reminder.statement_date).add(30, 'day').format('YYYY-MM-DD');
    if (!dayjs(next_payment_date).isValid() || !dayjs(next_statement_date).isValid()) {
      setSnackbar({ open: true, message: '날짜 형식이 올바르지 않습니다.', severity: 'error' });
      return;
    }
    // Explicitly use snake_case keys
    await invoke('check_reminder', {
      id: reminder.id,
      nextPaymentDate: next_payment_date,
      nextStatementDate: next_statement_date,
    });
    // payment history 자동 등록 (statement_date도 함께 전달)
    let note = '';
    if (typeof statementBalance === 'number') {
      note = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Math.abs(statementBalance));
    }
    await invoke('add_reminder_payment_history', {
      reminder_id: reminder.id,
      reminderId: reminder.id,
      paid_date: reminder.next_payment_date,
      paidDate: reminder.next_payment_date,
      statement_date: reminder.statement_date,
      statementDate: reminder.statement_date,
      note,
    });
    loadReminders();
  };

  const handleUncheckPayment = async (historyId: number) => {
    await invoke('uncheck_reminder_payment_history', { id: historyId });
    if (selectedReminder) {
      const updated = await invoke<ReminderPaymentHistory[]>('get_reminder_payment_history', {
        reminder_id: selectedReminder.id,
        reminderId: selectedReminder.id
      });
      setPaymentHistory(updated);
    }
  };

  // 노트 추가/삭제
  const handleAddNote = async () => {
    if (!selectedReminder || !noteInput.trim()) return;
    await invoke('add_note_to_reminder', { id: selectedReminder.id, note: noteInput.trim() });
    setNoteInput('');
    loadReminders();
  };
  const handleDeleteNote = async (idx: number) => {
    if (!selectedReminder) return;
    await invoke('delete_note_from_reminder', { id: selectedReminder.id, note_index: idx });
    loadReminders();
  };

  // Payment history 삭제 핸들러
  const handleDeletePaymentHistory = async (historyId: number) => {
    await invoke('delete_reminder_payment_history', {
      id: historyId
    });
    if (selectedReminder) {
      const updated = await invoke<ReminderPaymentHistory[]>('get_reminder_payment_history', {
        reminder_id: selectedReminder.id,
        reminderId: selectedReminder.id
      });
      setPaymentHistory(updated);
      loadReminders();
    }
  };

  // Payment history 노트 입력 핸들러
  const handleNoteChange = (id: number, value: string) => {
    setNoteEdits(edits => {
      const newEdits = { ...edits, [id]: value };
      return newEdits;
    });
  };

  // Payment history 노트 저장 핸들러
  const handleNoteSave = async (id: number) => {
    // noteEdits[id]가 undefined면(수정 안 했으면) 저장하지 않음
    if (noteEdits[id] === undefined) {
      setNoteEdits(edits => {
        const newEdits = { ...edits };
        delete newEdits[id];
        return newEdits;
      });
      return;
    }
    try {
      const note = noteEdits[id];
      await invoke('update_reminder_payment_history_note', { id, note });
      setSnackbar({ open: true, message: 'Note saved successfully', severity: 'success' });
      if (selectedReminder) {
        const updated = await invoke<ReminderPaymentHistory[]>('get_reminder_payment_history', {
          reminder_id: selectedReminder.id,
          reminderId: selectedReminder.id
        });
        setPaymentHistory(updated);
        setNoteEdits(edits => {
          const newEdits = { ...edits };
          delete newEdits[id];
          return newEdits;
        });
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      setSnackbar({ open: true, message: 'Failed to save note', severity: 'error' });
    }
  };

  // 미완료 → 완료 순, 날짜 오름차순, 체크 시 아래로
  // Due date 오름차순(가까운 순)으로만 정렬
  const sortedReminders = [...reminders].sort((a, b) => {
    return a.next_payment_date.localeCompare(b.next_payment_date);
  });

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', gap: 3, py: 4 }}>
        {/* 좌측: 리스트 */}
        <Paper sx={{ minWidth: 400, maxWidth: 520, flex: '0 0 440px', p: 2, borderRadius: 3, boxShadow: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Reminders</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={{ mb: 2, width: '100%' }}>
            Add Reminder
          </Button>
          <List>
            {sortedReminders.map(reminder => (
              <ListItem
                key={reminder.id}
                button
                selected={selectedId === reminder.id || (!selectedId && sortedReminders[0]?.id === reminder.id)}
                onClick={() => setSelectedId(reminder.id)}
                sx={{ borderRadius: 2, mb: 0.5, py: 0.5, px: 1, minHeight: 36 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{reminder.account_name}</Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: getDueInDays(reminder.next_payment_date).includes('Overdue') ? 'error.main' : 'primary.main',
                        fontWeight: 500,
                        ml: 'auto',
                        textAlign: 'right',
                        minWidth: 100,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {getDueInDays(reminder.next_payment_date)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label="edit"
                      color="default"
                      onClick={e => { e.stopPropagation(); handleOpenDialog(reminder); }}
                      sx={{
                        color: 'primary.main',
                        background: 'transparent',
                        transition: 'background 0.2s',
                        '&:hover': {
                          background: 'action.hover',
                          color: 'primary.main'
                        },
                        '& svg': { color: 'primary.main !important' }
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label="delete"
                      color="default"
                      onClick={e => { e.stopPropagation(); handleDelete(reminder.id); }}
                      sx={{
                        color: 'error.main',
                        background: 'transparent',
                        transition: 'background 0.2s',
                        '&:hover': {
                          background: 'action.hover',
                          color: 'error.main'
                        },
                        '& svg': { color: 'error.main !important' }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              </ListItem>
            ))}
          </List>
        </Paper>
        {/* 우측: 상세/노트 */}
        <Paper sx={{ flex: 1, p: 3, minHeight: 500, borderRadius: 3, boxShadow: 2 }}>
          {selectedReminder ? (
            <>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h5" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {selectedReminder.account_name}
                    {accounts.find(a => a.id === selectedReminder.account_id)?.description && (
                      <>
                        <span style={{ margin: '0 4px', color: '#888' }}>-</span>
                        <Typography component="span" variant="body2" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: 16 }}>
                          {accounts.find(a => a.id === selectedReminder.account_id)?.description}
                        </Typography>
                      </>
                    )}
                  </Typography>
                                     <Button
                     variant="outlined"
                     onClick={() => handleCheck(selectedReminder)}
                     sx={{
                       minWidth: 80,
                       height: 32,
                       textTransform: 'none',
                       fontWeight: 600,
                       fontSize: '0.875rem',
                       borderColor: 'success.main',
                       color: 'success.main',
                       '&:hover': {
                         borderColor: 'success.dark',
                         color: 'success.dark',
                         bgcolor: 'success.light'
                       }
                     }}
                   >
                     PAID
                   </Button>
                </Box>
                <Typography variant="subtitle1" sx={{ mt: 1, fontWeight: 500 }}>
                  Statement Date: {selectedReminder.statement_date}
                </Typography>
                                 <Typography variant="body2" sx={{ mt: 1, color: statementBalance !== null ? (statementBalance < 0 ? 'error.main' : 'primary.main') : 'text.secondary', fontWeight: 600 }}>
                   Statement Balance: {(() => {
                     return statementBalance !== null ? `${statementBalance < 0 ? '-' : ''}$${Math.abs(statementBalance).toFixed(2)}` : '--';
                   })()}
                 </Typography>
                 {/* 날짜 범위 정보 추가 */}
                 <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', fontSize: '0.8rem' }}>
                   {(() => {
                     if (!selectedReminder) return '';
                     
                     const sortedHistory = [...paymentHistory]
                       .map(h => ({ ...h, _date: h.statement_date || h.paid_date }))
                       .filter(h => h._date)
                       .sort((a, b) => (a._date || '').localeCompare(b._date || ''));
                     
                     let start_date = '1970-01-01';
                                           let end_date = selectedReminder.statement_date
                        ? selectedReminder.statement_date
                        : dayjs().format('YYYY-MM-DD');
                     
                     if (sortedHistory.length > 0) {
                       const lastStatementDate = sortedHistory[sortedHistory.length - 1]._date;
                       if (lastStatementDate) {
                         start_date = dayjs(lastStatementDate).add(1, 'day').format('YYYY-MM-DD');
                       }
                     }
                     
                     return `From ${start_date} To ${end_date}`;
                   })()}
                 </Typography>
                <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                  Next Due Date: {(() => {
                    const [year, month, day] = selectedReminder.next_payment_date.split('-').map(Number);
                    const dueDate = new Date(year, month - 1, day);
                    return format(dueDate, 'MMM dd, yyyy');
                  })()}
                </Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Recent Payment History (6 months)</Typography>
                <List dense>
                  {paymentHistory.length === 0 && <ListItem><ListItemText primary="No payment history." /></ListItem>}
                  {paymentHistory.map(h => (
                    <ListItem key={h.id} sx={{ 
                      bgcolor: h.is_paid ? 'success.light' : 'error.light',
                      color: h.is_paid ? 'success.contrastText' : 'error.contrastText',
                      borderRadius: 1, 
                      mb: 0.5, 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 2, 
                      py: 0.5 
                    }}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          aria-label="delete"
                          onClick={() => handleDeletePaymentHistory(h.id)}
                          sx={{
                            color: 'error.main',
                            background: 'transparent',
                            transition: 'background 0.2s',
                            '&:hover': {
                              background: 'action.hover',
                              color: 'error.main'
                            },
                            '& svg': { color: 'error.main !important' }
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={
                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="body2" sx={{ minWidth: 120, fontWeight: 500 }}>
                              Statement Date: {h.statement_date || h.paid_date}
                            </Typography>
                            <Typography variant="body2" sx={{ color: h.is_paid ? 'success.main' : 'error.main', fontWeight: 700, minWidth: 40 }}>
                              {h.is_paid ? 'PAID' : 'UNPAID'}
                            </Typography>
                            {/* Note inline edit */}
                            <NoteInlineEdit
                              value={noteEdits[h.id] !== undefined ? noteEdits[h.id] : h.note || ''}
                              onChange={v => {
                                handleNoteChange(h.id, v);
                              }}
                              onSave={() => {
                                handleNoteSave(h.id);
                              }}
                            />
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          ) : (
            <Typography variant="body1" color="text.secondary">Select a reminder from the list.</Typography>
          )}
        </Paper>
        {/* Dialog for add/edit */}
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
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Statement Date"
                value={form.statement_date}
                onChange={(statement_date: Dayjs | null) => setForm(f => ({ ...f, statement_date }))}
                open={statementDatePickerOpen}
                onOpen={() => setStatementDatePickerOpen(true)}
                onClose={() => setStatementDatePickerOpen(false)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                    sx: { mb: 2 },
                    InputLabelProps: { shrink: true },
                    onClick: () => setStatementDatePickerOpen(true),
                    inputProps: { readOnly: true },
                  }
                }}
                openTo="day"
                disableFuture={false}
              />
              <DatePicker
                label="Payment Due Date"
                value={form.date}
                onChange={(date: Dayjs | null) => setForm(f => ({ ...f, date }))}
                open={datePickerOpen}
                onOpen={() => setDatePickerOpen(true)}
                onClose={() => setDatePickerOpen(false)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                    sx: { mb: 2 },
                    InputLabelProps: { shrink: true },
                    onClick: () => setDatePickerOpen(true),
                    inputProps: { readOnly: true },
                  }
                }}
                openTo="day"
                disableFuture={false}
              />
            </LocalizationProvider>
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

// NoteInlineEdit: 클릭 시 인풋, 포커스아웃/엔터 시 자동 저장
const NoteInlineEdit: React.FC<{ value: string; onChange: (v: string) => void; onSave: () => void }> = ({ value, onChange, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  
  useEffect(() => { 
    setLocalValue(value); 
  }, [value]);
  
  const handleBlur = () => { 
    setEditing(false); 
    // 항상 저장 시도 (값이 변경되었는지 상관없이)
    onSave(); 
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { 
      setEditing(false); 
      // 항상 저장 시도 (값이 변경되었는지 상관없이)
      onSave(); 
    }
    if (e.key === 'Escape') { 
      setEditing(false); 
      setLocalValue(value); 
    }
  };
  
  const handleClick = () => {
    setEditing(true);
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue); 
    onChange(newValue); 
  };
  
  return editing ? (
    <TextField
      size="small"
      value={localValue}
      autoFocus
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      sx={{ minWidth: 120, maxWidth: 200 }}
      inputProps={{ style: { fontSize: 14, padding: 4 } }}
      variant="standard"
    />
  ) : (
    <Typography
      variant="body2"
      sx={{ 
        minWidth: 120, 
        maxWidth: 200, 
        cursor: 'pointer', 
        color: value ? 'inherit' : '#aaa', 
        borderBottom: '1px dashed #ccc',
        '&:hover': {
          borderBottom: '1px solid #666'
        }
      }}
      onClick={handleClick}
      title={value || 'Add a note'}
    >
      {value || 'Add a note'}
    </Typography>
  );
};

export default ReminderPage; 