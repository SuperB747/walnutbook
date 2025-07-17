import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Box,
  Button,
  Snackbar,
  Alert,
  Card,
  CardContent,
  Typography,
  Grid,
  Tabs,
  Tab,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Category, Account, RecurringItem } from '../db';
import { invoke } from '@tauri-apps/api/core';
import { formatCurrency, safeFormatCurrency, parseLocalDate, createLocalDate, formatLocalDate, getCurrentLocalDate, calculateNextTransactionDate, parseDayOfMonth } from '../utils';
import { format, addDays, addWeeks, addMonths, isAfter, parse } from 'date-fns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';



interface RecurringFormData {
  name: string;
  amount: number;
  type: 'Income' | 'Expense';
  category_id: number | undefined;
  account_id: number | undefined;
  day_of_month: number[]; // Changed to array
  is_active: boolean;
  notes: string;
}

const RecurringPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RecurringItem | undefined>();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [formData, setFormData] = useState<RecurringFormData>({
    name: '',
    amount: 0,
    type: 'Expense',
    category_id: 0,
    account_id: 0,
    day_of_month: [1], // Changed to array
    is_active: true,
    notes: '',
  });
  // 추가: 금액 입력값을 문자열로 관리
  const [amountInputValue, setAmountInputValue] = useState('');
  // Day of month 입력값들을 문자열로 관리
  const [dayOfMonthInputValues, setDayOfMonthInputValues] = useState<string[]>(['1']);
  // 반복 방식: 'monthly_date' | 'interval'
  const [repeatType, setRepeatType] = useState<'monthly_date' | 'interval'>('monthly_date');
  // interval 관련 상태
  const [startDate, setStartDate] = useState<string>(formatLocalDate(getCurrentLocalDate()));
  const [intervalValue, setIntervalValue] = useState<number>(14); // 기본 2주
  const [intervalUnit, setIntervalUnit] = useState<'day' | 'week' | 'month'>('week');
  // DatePicker 상태
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerOpen2, setDatePickerOpen2] = useState(false);
  // 프리셋 선택
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  
  const handlePreset = (preset: 'biweekly' | 'monthly' | 'weekly') => {
    if (preset === 'biweekly') {
      setIntervalValue(2);
      setIntervalUnit('week');
      setRepeatType('interval');
    } else if (preset === 'monthly') {
      setIntervalValue(1);
      setIntervalUnit('month');
      setRepeatType('interval');
    } else if (preset === 'weekly') {
      setIntervalValue(1);
      setIntervalUnit('week');
      setRepeatType('interval');
    }
    setSelectedPreset(preset);
  };
  // 미리보기 날짜 계산
  const previewDates = useMemo(() => {
    const result: Set<string> = new Set(); // Use Set to avoid duplicates
    const today = toMidnight(new Date());
    
    console.log('Preview calculation:', {
      startDate,
      repeatType,
      intervalUnit,
      intervalValue,
      today: format(today, 'yyyy-MM-dd')
    });
    
    if (repeatType === 'monthly_date') {
      // 매월 n일들
      let base = startDate ? toMidnight(parse(startDate, 'yyyy-MM-dd', new Date())) : today;
      console.log('formData.day_of_month:', formData.day_of_month, 'type:', typeof formData.day_of_month);
      const days = formData.day_of_month || [1]; // Safety check
      console.log('days after safety check:', days, 'type:', typeof days, 'isArray:', Array.isArray(days));
      
      if (!Array.isArray(days)) {
        console.error('days is not an array, using fallback');
        const fallbackDays = [1];
        for (let i = 0; i < 12; i++) {
          for (const day of fallbackDays) {
            const d = toMidnight(new Date(base.getFullYear(), base.getMonth() + i, day));
            result.add(format(d, 'yyyy-MM-dd'));
          }
        }
      } else {
        for (let i = 0; i < 12; i++) {
          for (const day of days) {
            const d = toMidnight(new Date(base.getFullYear(), base.getMonth() + i, day));
            result.add(format(d, 'yyyy-MM-dd'));
          }
        }
      }
    } else {
      // 시작일 + 반복주기 - 단순한 계산
      if (startDate) {
        let currentDate = toMidnight(parse(startDate, 'yyyy-MM-dd', new Date()));
        console.log('Start date parsed:', format(currentDate, 'yyyy-MM-dd'));
        
        // 12개의 발생일 계산
        for (let i = 0; i < 12; i++) {
          console.log(`Iteration ${i}: current date:`, format(currentDate, 'yyyy-MM-dd'));
          
          result.add(format(currentDate, 'yyyy-MM-dd'));
          console.log('Added to result:', format(currentDate, 'yyyy-MM-dd'));
          
          // 다음 발생일 계산
          if (intervalUnit === 'day') {
            currentDate = toMidnight(addDays(currentDate, intervalValue));
          } else if (intervalUnit === 'week') {
            currentDate = toMidnight(addWeeks(currentDate, intervalValue));
          } else {
            currentDate = toMidnight(addMonths(currentDate, intervalValue));
          }
        }
      } else {
        // Start Date가 없는 경우 현재 날짜부터 계산
        let base = today;
        for (let i = 0; i < 12; i++) {
          result.add(format(base, 'yyyy-MM-dd'));
          if (intervalUnit === 'day') {
            base = toMidnight(addDays(base, intervalValue));
          } else if (intervalUnit === 'week') {
            base = toMidnight(addWeeks(base, intervalValue));
          } else {
            base = toMidnight(addMonths(base, intervalValue));
          }
        }
      }
    }
    
    const sortedResult = Array.from(result).sort();
    console.log('Final preview dates:', sortedResult);
    return sortedResult;
  }, [startDate, repeatType, formData.day_of_month, intervalUnit, intervalValue]);

  const loadData = async () => {
    try {
      const [items, cats, accts] = await Promise.all([
        invoke<RecurringItem[]>('get_recurring_items'),
        invoke<Category[]>('get_categories_full'),
        invoke<Account[]>('get_accounts')
      ]);
      setRecurringItems(items || []);
      setCategories(cats || []);
      setAccounts(accts || []);
      
      // Load checked items for all months
      await loadCheckedItems();
    } catch (error) {
      console.error('Failed to load recurring data:', error);
      setSnackbar({ open: true, message: 'Failed to load data', severity: 'error' });
    }
  };

  const loadCheckedItems = async () => {
    try {
      // Get current month and previous months to check for completed transactions
      const today = new Date();
      const currentMonth = format(today, 'yyyy-MM');
      const monthsToCheck = [];
      
      // Check current month and previous 12 months
      for (let i = 0; i < 12; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        monthsToCheck.push(format(date, 'yyyy-MM'));
      }
      
      const allCheckedItems = new Set<string>();
      
      for (const month of monthsToCheck) {
        const checkedIds = await invoke<string[]>('get_recurring_checks', { month });
        checkedIds.forEach(id => allCheckedItems.add(id));
        if (checkedIds.length > 0) {
          console.log(`Month ${month} has checked items:`, checkedIds);
        }
      }
      
      setCheckedItems(allCheckedItems);
      console.log('All checked items loaded:', Array.from(allCheckedItems));
    } catch (error) {
      console.error('Failed to load checked items:', error);
    }
  };

  useEffect(() => {
    loadData();
    loadCheckedItems(); // Also load checked items on mount
  }, []);



  // activeTab이 바뀔 때마다 formData.type도 업데이트
  useEffect(() => {
    if (isFormOpen && selectedItem === undefined) {
      const itemType = activeTab === 0 ? 'Expense' : 'Income';
      setFormData(prev => ({
        ...prev,
        type: itemType,
        category_id: getFirstCategoryId(categories, itemType),
      }));
    }
  }, [activeTab, isFormOpen, selectedItem, categories]);

  // Refresh checked items when tab changes
  useEffect(() => {
    loadCheckedItems();
  }, [activeTab]);

  // Listen for window focus to refresh data when returning from Reports page
  useEffect(() => {
    const handleFocus = () => {
      loadCheckedItems();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Listen for recurring check changes from Reports page
  useEffect(() => {
    const handleRecurringCheckChanged = (event: CustomEvent) => {
      console.log('Recurring check changed:', event.detail);
      loadCheckedItems();
    };

    window.addEventListener('recurringCheckChanged', handleRecurringCheckChanged as EventListener);
    return () => window.removeEventListener('recurringCheckChanged', handleRecurringCheckChanged as EventListener);
  }, []);

  const handleAddItem = () => {
    setSelectedItem(undefined);
    const itemType = activeTab === 0 ? 'Expense' : 'Income';
    setFormData({
      name: '',
      amount: 0,
      type: itemType,
      category_id: getFirstCategoryId(categories, itemType),
      account_id: getFirstAccountId(accounts),
      day_of_month: [1],
      is_active: true,
      notes: '',
    });
    setAmountInputValue('');
    setDayOfMonthInputValues(['1']);
    setRepeatType('monthly_date');
    setStartDate(formatLocalDate(getCurrentLocalDate()));
    setIntervalValue(14);
    setIntervalUnit('week');
    setSelectedPreset('');
    setIsFormOpen(true);
  };

  const handleEditItem = (item: RecurringItem) => {
    try {
      console.log('handleEditItem called with item:', item);
      console.log('item.day_of_month:', item.day_of_month, 'type:', typeof item.day_of_month);
      
      setSelectedItem(item);
      const parsedDays = parseDayOfMonth(item.day_of_month);
      console.log('parsedDays:', parsedDays, 'type:', typeof parsedDays, 'isArray:', Array.isArray(parsedDays));
      
      // Ensure parsedDays is an array
      const safeParsedDays = Array.isArray(parsedDays) ? parsedDays : [1];
      
      setFormData({
        name: item.name,
        amount: item.amount,
        type: item.type,
        category_id: item.category_id,
        account_id: item.account_id,
        day_of_month: safeParsedDays,
        is_active: item.is_active,
        notes: item.notes || '',
      });
      setAmountInputValue(item.amount !== undefined ? Math.abs(item.amount).toString() : '');
      // Parse day_of_month from JSON string to array
      setDayOfMonthInputValues(safeParsedDays.map((d: number) => d.toString()));
      
      // Load new fields if they exist
      if (item.repeat_type) {
        setRepeatType(item.repeat_type as 'monthly_date' | 'interval');
      }
      if (item.start_date) {
        setStartDate(item.start_date);
      }
      if (item.interval_value) {
        setIntervalValue(item.interval_value);
      }
      if (item.interval_unit) {
        setIntervalUnit(item.interval_unit as 'day' | 'week' | 'month');
      }
      
      // Set selected preset based on current interval settings
      if (item.repeat_type === 'interval') {
        if (item.interval_unit === 'week' && item.interval_value === 1) {
          setSelectedPreset('weekly');
        } else if (item.interval_unit === 'week' && item.interval_value === 2) {
          setSelectedPreset('biweekly');
        } else if (item.interval_unit === 'month' && item.interval_value === 1) {
          setSelectedPreset('monthly');
        } else {
          setSelectedPreset('');
        }
      } else {
        setSelectedPreset('');
      }
      
      setIsFormOpen(true);
    } catch (error) {
      console.error('Error in handleEditItem:', error);
      setSnackbar({ 
        open: true, 
        message: 'Failed to load item for editing. Please try again.', 
        severity: 'error' 
      });
    }
  };

  const handleDeleteItem = async (item: RecurringItem) => {
    try {
      await invoke('delete_recurring_item', { id: item.id });
      await loadData();
      setSnackbar({ open: true, message: 'Recurring item deleted successfully.', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to delete recurring item.', severity: 'error' });
    }
  };

  const handleSaveItem = async () => {
    try {
      // Debug form validation
      console.log('Form validation check:', {
        name: formData.name,
        amount: formData.amount,
        category_id: formData.category_id,
        account_id: formData.account_id,
        nameValid: !!formData.name,
        amountValid: Math.abs(formData.amount) > 0,
        categoryValid: !!formData.category_id,
        accountValid: !!formData.account_id,
        allValid: !!(formData.name && Math.abs(formData.amount) > 0 && formData.category_id && formData.account_id)
      });

      // 보정: interval 방식일 때 day_of_month는 [1]로 설정, monthly_date일 때는 배열을 JSON으로 저장
      const safeDayOfMonth = repeatType === 'interval' ? '[1]' : JSON.stringify(formData.day_of_month);
      // 보정: repeat_type, interval_unit, interval_value, start_date
      const safeRepeatType = repeatType === 'interval' ? 'interval' : 'monthly_date';
      const safeIntervalUnit = ['day', 'week', 'month'].includes(intervalUnit) ? intervalUnit : 'month';
      const safeIntervalValue = intervalValue || 1;
      const safeStartDate = startDate && startDate !== '' ? startDate : null;

      console.log('Sending data to backend:', {
        name: formData.name,
        amount: formData.amount,
        type: formData.type,
        category_id: formData.category_id,
        account_id: formData.account_id,
        day_of_month: safeDayOfMonth,
        day_of_month_original: formData.day_of_month,
        is_active: formData.is_active,
        notes: formData.notes,
        repeat_type: safeRepeatType,
        start_date: safeStartDate,
        interval_value: safeIntervalValue,
        interval_unit: safeIntervalUnit,
      });

      if (selectedItem) {
        await invoke('update_recurring_item', {
          id: selectedItem.id,
          name: formData.name,
          amount: formData.amount,
          itemType: formData.type,
          categoryId: formData.category_id,
          accountId: formData.account_id,
          dayOfMonth: safeDayOfMonth,
          isActive: formData.is_active,
          notes: formData.notes,
          repeatType: safeRepeatType,
          startDate: safeStartDate,
          intervalValue: safeIntervalValue,
          intervalUnit: safeIntervalUnit,
        });
      } else {
        const invokeData = {
          name: formData.name,
          amount: formData.amount,
          itemType: formData.type,
          categoryId: formData.category_id,
          accountId: formData.account_id,
          dayOfMonth: safeDayOfMonth,
          isActive: formData.is_active,
          notes: formData.notes,
          repeatType: safeRepeatType,
          startDate: safeStartDate,
          intervalValue: safeIntervalValue,
          intervalUnit: safeIntervalUnit,
        };
        console.log('Invoking add_recurring_item with data:', invokeData);
        console.log('Data keys:', Object.keys(invokeData));
        console.log('itemType value:', invokeData.itemType);
        await invoke('add_recurring_item', invokeData);
      }
      await loadData();
      setIsFormOpen(false);
      setSnackbar({ 
        open: true, 
        message: `Recurring item ${selectedItem ? 'updated' : 'added'} successfully.`, 
        severity: 'success' 
      });
    } catch (error) {
      console.error('Failed to add/update recurring item:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      console.error('Selected item:', selectedItem);
      console.error('Form data:', formData);
      console.error('Repeat type:', repeatType);
      console.error('Start date:', startDate);
      console.error('Interval value:', intervalValue);
      console.error('Interval unit:', intervalUnit);
      setSnackbar({ 
        open: true, 
        message: `Failed to ${selectedItem ? 'update' : 'add'} recurring item.`, 
        severity: 'error' 
      });
    }
  };

  const filteredItems = useMemo(() => {
    const type = activeTab === 0 ? 'Expense' : 'Income';
    return recurringItems.filter(item => item.type === type);
  }, [recurringItems, activeTab]);

  const totalAmount = useMemo(() => {
    if (activeTab === 0) {
      // Expense 탭: Expense만, 절대값 합산
      return filteredItems
        .filter(item => item.type === 'Expense')
        .reduce((sum, item) => sum + Math.abs(item.amount), 0);
    } else {
      // Income 탭: Income만 합산
      return filteredItems
        .filter(item => item.type === 'Income')
        .reduce((sum, item) => sum + item.amount, 0);
    }
  }, [filteredItems, activeTab]);

  const getCategoryName = (categoryId: number) => {
    return categories.find(c => c.id === categoryId)?.name || 'Undefined';
  };

  const getAccountName = (accountId: number) => {
    return accounts.find(a => a.id === accountId)?.name || 'Undefined';
  };

  const availableCategories = useMemo(() => {
    const type = activeTab === 0 ? 'Expense' : 'Income';
    return categories.filter(c => c.type === type);
  }, [categories, activeTab]);

  // category/account 기본값 보정 함수
  function getFirstCategoryId(categories: Category[], type: 'Income' | 'Expense'): number | undefined {
    const found = categories.find(c => c.type === type);
    return found ? found.id : undefined;
  }
  function getFirstAccountId(accounts: Account[]): number | undefined {
    return accounts.length > 0 ? accounts[0].id : undefined;
  }

  // value가 옵션에 없으면 ''로 보정
  function safeSelectValue<T extends { id: number }>(value: number | undefined, options: T[]): number | '' {
    if (value === undefined) return '';
    return options.some(opt => opt.id === value) ? value : '';
  }

  // 날짜 0시로 맞추는 함수
  function toMidnight(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Recurring Items</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Manage your regular income and expenses like salary, mortgage, utilities, etc.
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0 }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              sx={{
                minHeight: 48,
                '& .MuiTab-root': {
                  color: 'text.primary',
                  fontWeight: 700,
                  fontSize: '1rem',
                  letterSpacing: '0.15px',
                  textTransform: 'none',
                  minHeight: '48px',
                  padding: '12px 28px',
                  borderRadius: '12px 12px 0 0',
                  margin: '0 4px',
                  transition: 'background-color 0.2s, color 0.2s',
                  backgroundColor: 'rgba(0,0,0,0)',
                  '&:hover': {
                    backgroundColor: 'rgba(0,0,0,0.08)',
                    color: 'text.primary',
                  },
                  '&.Mui-selected': {
                    backgroundColor: '#1976d2',
                    color: 'white',
                    boxShadow: '0 2px 12px rgba(35, 64, 117, 0.10)',
                    zIndex: 1,
                  },
                },
              }}
            >
              <Tab label="Expenses" />
              <Tab label="Income" />
            </Tabs>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddItem}
              >
                Add {activeTab === 0 ? 'Expense' : 'Income'}
              </Button>
            </Box>
          </Box>
          <Box sx={{ borderBottom: '2px solid #1976d2', width: '100%' }} />
        </Box>

        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total {activeTab === 0 ? 'Expenses' : 'Income'}
                </Typography>
                <Typography variant="h5" component="div" color={activeTab === 0 ? 'error.main' : 'success.main'}>
                  {formatCurrency(totalAmount)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Active Items
                </Typography>
                <Typography variant="h5" component="div">
                  {filteredItems.filter(item => item.is_active).length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Account</TableCell>
                <TableCell align="center">Next Transaction Date</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Box>
                      <Typography variant="body1">{item.name}</Typography>
                      {item.notes && (
                        <Typography variant="caption" color="text.secondary">
                          {item.notes}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography color={item.type === 'Expense' ? 'error.main' : 'success.main'}>
                      {item.type === 'Expense' ? '-' + formatCurrency(Math.abs(item.amount)) : formatCurrency(item.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>{getCategoryName(item.category_id)}</TableCell>
                  <TableCell>{getAccountName(item.account_id)}</TableCell>
                  <TableCell align="center">
                    {(() => {
                      const nextDate = calculateNextTransactionDate(item, checkedItems);
                      return (
                        <Typography variant="body2" color="text.primary">
                          {nextDate}
                        </Typography>
                      );
                    })()}
                  </TableCell>
                  <TableCell align="center">
                    <Typography 
                      variant="body2" 
                      color={item.is_active ? 'success.main' : 'text.secondary'}
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton 
                      size="small" 
                      onClick={() => {
                        console.log('Edit button clicked for item:', item);
                        handleEditItem(item);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDeleteItem(item)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body1" color="text.secondary" sx={{ py: 2 }}>
                      No {activeTab === 0 ? 'expenses' : 'income'} items found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={isFormOpen} onClose={() => setIsFormOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ pb: 1 }}>
            {selectedItem ? 'Edit' : 'Add'} Recurring {activeTab === 0 ? 'Expense' : 'Income'}
          </DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* Repeat Type Selection */}
              <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  variant={repeatType === 'monthly_date' ? 'contained' : 'outlined'}
                  onClick={() => {
                    setRepeatType('monthly_date');
                    setSelectedPreset('');
                  }}
                >Monthly Date</Button>
                <Button
                  size="small"
                  variant={repeatType === 'interval' ? 'contained' : 'outlined'}
                  onClick={() => {
                    setRepeatType('interval');
                    setSelectedPreset('');
                  }}
                >Start Date + Interval</Button>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>Preset</InputLabel>
                  <Select
                    value={selectedPreset}
                    label="Preset"
                    onChange={(e) => handlePreset(e.target.value as 'biweekly' | 'monthly' | 'weekly')}
                  >
                    <MenuItem value="">Select Preset</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="biweekly">Bi-Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              {/* Input fields based on repeat type */}
              {repeatType === 'monthly_date' ? (
                <>
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Day(s) of Month (up to 2)
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      {dayOfMonthInputValues.map((value, index) => (
                        <TextField
                          key={index}
                          size="small"
                          label={`Day ${index + 1}`}
                          type="number"
                          value={value}
                          onChange={(e) => {
                            const newValues = [...dayOfMonthInputValues];
                            newValues[index] = e.target.value;
                            setDayOfMonthInputValues(newValues);
                            
                            // Update formData with valid numbers
                            const validNumbers = newValues
                              .map(v => parseInt(v))
                              .filter(num => !isNaN(num) && num >= 1 && num <= 31);
                            setFormData({ ...formData, day_of_month: validNumbers.length > 0 ? validNumbers : [1] });
                          }}
                          sx={{ width: 100 }}
                          inputProps={{ min: 1, max: 31 }}
                          required={index === 0}
                        />
                      ))}
                      {dayOfMonthInputValues.length < 2 && (
                        <Button
                          variant="outlined"
                          size="small"
                          sx={{ minWidth: 40 }}
                          onClick={() => {
                            const newValues = [...dayOfMonthInputValues, ''];
                            setDayOfMonthInputValues(newValues);
                          }}
                        >
                          +
                        </Button>
                      )}
                      {dayOfMonthInputValues.length > 1 && (
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          sx={{ minWidth: 40 }}
                          onClick={() => {
                            const newValues = dayOfMonthInputValues.slice(0, -1);
                            setDayOfMonthInputValues(newValues);
                            
                            // Update formData
                            const validNumbers = newValues
                              .map(v => parseInt(v))
                              .filter(num => !isNaN(num) && num >= 1 && num <= 31);
                            setFormData({ ...formData, day_of_month: validNumbers.length > 0 ? validNumbers : [1] });
                          }}
                        >
                          -
                        </Button>
                      )}
                    </Box>
                  </Box>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                      label="Start Date"
                      value={startDate ? parse(startDate, 'yyyy-MM-dd', new Date()) : null}
                      onChange={(newDate) => {
                        if (newDate) {
                          setStartDate(format(newDate, 'yyyy-MM-dd'));
                        }
                        setDatePickerOpen(false);
                      }}
                      open={datePickerOpen}
                      onOpen={() => setDatePickerOpen(true)}
                      onClose={() => setDatePickerOpen(false)}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          InputLabelProps: { shrink: true },
                          onClick: () => setDatePickerOpen(true),
                          inputProps: { readOnly: true },
                        }
                      }}
                      openTo="day"
                      disableFuture={false}
                    />
                  </LocalizationProvider>
                </>
              ) : (
                <>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                      label="Start Date"
                      value={startDate ? parse(startDate, 'yyyy-MM-dd', new Date()) : null}
                      onChange={(newDate) => {
                        if (newDate) {
                          setStartDate(format(newDate, 'yyyy-MM-dd'));
                        }
                        setDatePickerOpen2(false);
                      }}
                      open={datePickerOpen2}
                      onOpen={() => setDatePickerOpen2(true)}
                      onClose={() => setDatePickerOpen2(false)}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          InputLabelProps: { shrink: true },
                          onClick: () => setDatePickerOpen2(true),
                          inputProps: { readOnly: true },
                        }
                      }}
                      openTo="day"
                      disableFuture={false}
                    />
                  </LocalizationProvider>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      size="small"
                      label="Interval"
                      type="number"
                      value={intervalValue}
                      onChange={e => setIntervalValue(parseInt(e.target.value) || 1)}
                      sx={{ width: 100 }}
                      inputProps={{ min: 1 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <InputLabel>Unit</InputLabel>
                      <Select
                        value={intervalUnit}
                        label="Unit"
                        onChange={e => setIntervalUnit(e.target.value as 'day' | 'week' | 'month')}
                      >
                        <MenuItem value="day">Days</MenuItem>
                        <MenuItem value="week">Weeks</MenuItem>
                        <MenuItem value="month">Months</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                </>
              )}
              <Grid container spacing={1}>
                <Grid item xs={12}>
                  <TextField
                    size="small"
                    label="Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    label="Amount"
                    type="number"
                    value={amountInputValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAmountInputValue(value);
                      const num = parseFloat(value);
                      // For income, store positive value; for expense, store negative value
                      const finalAmount = isNaN(num) ? 0 : (formData.type === 'Income' ? Math.abs(num) : -Math.abs(num));
                      setFormData({ ...formData, amount: finalAmount });
                    }}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={safeSelectValue(formData.category_id, availableCategories)}
                      onChange={(e) => setFormData({ ...formData, category_id: Number(e.target.value) })}
                      label="Category"
                      required
                    >
                      {availableCategories.map((category) => (
                        <MenuItem key={category.id} value={category.id}>
                          {category.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Account</InputLabel>
                    <Select
                      value={safeSelectValue(formData.account_id, accounts)}
                      onChange={(e) => setFormData({ ...formData, account_id: Number(e.target.value) })}
                      label="Account"
                      required
                    >
                      {accounts.map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          {account.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <TextField
                size="small"
                label="Notes (Optional)"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                fullWidth
                multiline
                rows={1}
              />
              {/* Preview */}
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Expected Occurrence Dates (Preview)</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {previewDates.slice(0, 8).map(date => (
                    <Box key={date} sx={{ px: 1, py: 0.25, bgcolor: '#e3f2fd', borderRadius: 0.5, fontSize: 12 }}>
                      {date}
                    </Box>
                  ))}
                  {previewDates.length > 8 && (
                    <Box sx={{ px: 1, py: 0.25, bgcolor: '#e3f2fd', borderRadius: 0.5, fontSize: 12 }}>
                      +{previewDates.length - 8} more
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 1 }}>
            <Button size="small" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button 
              size="small"
              onClick={handleSaveItem} 
              variant="contained"
              disabled={!formData.name || Math.abs(formData.amount) <= 0 || !formData.category_id || !formData.account_id}
            >
              {selectedItem ? 'Update' : 'Add'}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            variant="filled"
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
};

export default RecurringPage; 