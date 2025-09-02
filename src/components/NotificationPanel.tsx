import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Badge,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Tooltip,
  Fade,
  Slide
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  CreditCard as CreditCardIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { Reminder } from '../db';
import { format, addDays, isAfter, isBefore } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';
import dayjs from 'dayjs';


interface NotificationPanelProps {
  reminders: Reminder[];
}

interface ReminderItem {
  item: Reminder;
  dueDate: Date;
  daysUntilDue: number;
  isOverdue: boolean;
  severity: 'warning' | 'error' | 'info';
  statementBalance?: number;
}

interface ReminderPaymentHistory {
  id: number;
  reminder_id: number;
  paid_date: string;
  is_paid: boolean;
  created_at: string;
  statement_date?: string;
  note?: string;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ reminders }) => {
  const theme = useTheme();
  const [isMinimized, setIsMinimized] = useState(false); // 최소화 상태만 유지
  const [reminderItems, setReminderItems] = useState<ReminderItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true); // 초기 로딩 상태

  useEffect(() => {
    const processReminders = async () => {

      const today = new Date();
      const filteredReminders: ReminderItem[] = [];

      reminders.forEach(item => {

        
        // Parse the next payment date - use local date parsing to avoid timezone issues
        const [year, month, day] = item.next_payment_date.split('-').map(Number);
        const nextOccurrence = new Date(year, month - 1, day); // month is 0-indexed
        // Use the same calculation method as ReminderPage for consistency
        const daysUntilDue = Math.ceil((nextOccurrence.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        
        
        // Show reminders for items due in 7 days or less, or overdue
        if (daysUntilDue <= 7) {
          let severity: 'warning' | 'error' | 'info' = 'info';
          if (daysUntilDue < 0) {
            severity = 'error'; // Overdue
          } else if (daysUntilDue <= 3) {
            severity = 'error'; // Due soon
          } else {
            severity = 'warning'; // Due in a week
          }

          filteredReminders.push({
            item,
            dueDate: nextOccurrence,
            daysUntilDue,
            isOverdue: daysUntilDue < 0,
            severity
          });
        }
      });



      // Sort by urgency (overdue first, then by days until due)
      filteredReminders.sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return a.daysUntilDue - b.daysUntilDue;
      });

      // Get statement balances for each reminder
      const remindersWithBalance = await Promise.all(
        filteredReminders.map(async (reminder) => {
          const balance = await getStatementBalance(reminder.item.account_id, reminder.item.statement_date, reminder.item.id);
          return {
            ...reminder,
            statementBalance: balance
          };
        })
      );

      setReminderItems(remindersWithBalance);
      setIsInitialLoading(false); // 초기 로딩 완료
      
      // 자동으로 알림창을 펼치기 (알림이 있을 때만)
      if (remindersWithBalance.length > 0) {
        setIsMinimized(false);
      } else {
        setIsMinimized(true); // 알림이 없으면 최소화
      }
    };

    processReminders();
  }, [reminders]);

  // Add interval to refresh reminders every minute to keep due dates current
  useEffect(() => {
    const interval = setInterval(() => {
      if (reminders.length > 0) {
        const processReminders = async () => {
          const today = new Date();
          const filteredReminders: ReminderItem[] = [];

          reminders.forEach(item => {
            // Parse the next payment date - use local date parsing to avoid timezone issues
            const [year, month, day] = item.next_payment_date.split('-').map(Number);
            const nextOccurrence = new Date(year, month - 1, day); // month is 0-indexed
            // Use the same calculation method as ReminderPage for consistency
            const daysUntilDue = Math.ceil((nextOccurrence.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysUntilDue <= 7) {
              let severity: 'warning' | 'error' | 'info' = 'info';
              if (daysUntilDue < 0) {
                severity = 'error';
              } else if (daysUntilDue <= 3) {
                severity = 'error';
              } else {
                severity = 'warning';
              }

              filteredReminders.push({
                item,
                dueDate: nextOccurrence,
                daysUntilDue,
                isOverdue: daysUntilDue < 0,
                severity
              });
            }
          });

          filteredReminders.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            return a.daysUntilDue - b.daysUntilDue;
          });

          const remindersWithBalance = await Promise.all(
            filteredReminders.map(async (reminder) => {
              const balance = await getStatementBalance(reminder.item.account_id, reminder.item.statement_date, reminder.item.id);
              return {
                ...reminder,
                statementBalance: balance
              };
            })
          );

          setReminderItems(remindersWithBalance);
          
          // 자동으로 알림창을 펼치기 (알림이 있을 때만)
          if (remindersWithBalance.length > 0) {
            setIsMinimized(false);
          } else {
            setIsMinimized(true); // 알림이 없으면 최소화
          }
        };

        processReminders();
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [reminders]);



  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return theme.palette.error.main;
      case 'warning':
        return theme.palette.warning.main;
      default:
        return theme.palette.info.main;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <ErrorIcon sx={{ color: theme.palette.error.main, fontSize: 16 }} />;
      case 'warning':
        return <WarningIcon sx={{ color: theme.palette.warning.main, fontSize: 16 }} />;
      default:
        return <CreditCardIcon sx={{ color: theme.palette.info.main, fontSize: 16 }} />;
    }
  };

  const getDaysText = (daysUntilDue: number, isOverdue: boolean) => {
    if (isOverdue) {
      return `${Math.abs(daysUntilDue)} days overdue`;
    }
    if (daysUntilDue === 0) {
      return 'Due today';
    }
    if (daysUntilDue === 1) {
      return 'Due tomorrow';
    }
    return `Due in ${daysUntilDue} days`;
  };

  const getStatementBalance = async (accountId: number, statementDate: string, reminderId: number) => {
    try {
      const today = dayjs().format('YYYY-MM-DD');
      
      // Get payment history for this reminder
      const paymentHistory = await invoke<ReminderPaymentHistory[]>('get_reminder_payment_history', {
        reminder_id: reminderId,
        reminderId: reminderId
      });
      
      // Sort payment history by date (statement_date or paid_date)
      const sortedHistory = [...paymentHistory]
        .map(h => ({ ...h, _date: h.statement_date || h.paid_date }))
        .filter(h => h._date)
        .sort((a, b) => (a._date || '').localeCompare(b._date || ''));
      
      // Statement Balance 계산: Reminders 페이지와 동일한 로직 사용
      let start_date = '1970-01-01'; // 기본값
      let end_date = statementDate 
        ? statementDate
        : today;
      
      // 가장 최근 payment history의 statement_date를 시작점으로 사용
      if (sortedHistory.length > 0) {
        const lastStatementDate = sortedHistory[sortedHistory.length - 1]._date;
        if (lastStatementDate) {
          start_date = dayjs(lastStatementDate).add(1, 'day').format('YYYY-MM-DD');
        }
      }
      
      const result = await invoke<number>('get_statement_balance', {
        accountId,
        startDate: start_date,
        endDate: end_date
      });
      return result;
    } catch (error) {
      console.error('Error getting statement balance:', error);
      return undefined;
    }
  };



  const handleClose = () => {
    setIsMinimized(true);
  };

  const handleMaximize = () => {
    setIsMinimized(false);
  };

  // 최소화된 상태일 때 종 아이콘만 표시
  if (isMinimized) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 140,
          right: 20,
          zIndex: 1300,
        }}
      >
                 <Slide direction="left" in={true} mountOnEnter unmountOnExit>
           <IconButton
             onClick={handleMaximize}
             sx={{
               width: 48,
               height: 48,
               backgroundColor: theme.palette.primary.main,
               color: theme.palette.primary.contrastText,
               borderRadius: '50%',
               boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
               '&:hover': {
                 backgroundColor: theme.palette.primary.dark,
               },
               '& .MuiSvgIcon-root': {
                 fontSize: 24,
               }
             }}
           >
            <Badge
              badgeContent={reminderItems.length}
              color="error"
              sx={{
                '& .MuiBadge-badge': {
                  backgroundColor: theme.palette.error.main,
                  color: theme.palette.error.contrastText,
                  fontSize: '0.7rem',
                  height: 18,
                  minWidth: 18,
                  top: -4,
                  right: -4,
                }
              }}
            >
              <NotificationsIcon />
            </Badge>
          </IconButton>
        </Slide>
      </Box>
    );
  }

    // Show minimized bell icon during initial loading
  if (isInitialLoading) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 140,
          right: 20,
          zIndex: 1300,
        }}
      >
        <Slide direction="left" in={true} mountOnEnter unmountOnExit>
          <IconButton
            onClick={handleMaximize}
            sx={{
              width: 48,
              height: 48,
              backgroundColor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              '&:hover': {
                backgroundColor: theme.palette.primary.dark,
              },
              '& .MuiSvgIcon-root': {
                fontSize: 24,
              }
            }}
          >
            <Badge
              badgeContent={0}
              color="error"
              sx={{
                '& .MuiBadge-badge': {
                  backgroundColor: theme.palette.error.main,
                  color: theme.palette.error.contrastText,
                  fontSize: '0.7rem',
                  height: 18,
                  minWidth: 18,
                  top: -4,
                  right: -4,
                }
              }}
            >
              <NotificationsIcon />
            </Badge>
          </IconButton>
        </Slide>
      </Box>
    );
  }

     return (
     <Box
       sx={{
         position: 'fixed',
         top: 140, // 헤더 높이(112px) + 여백(28px) = 140px
         right: 20,
         zIndex: 1300,
         maxWidth: 320,
         minWidth: 280
       }}
     >
                               <Slide direction="left" in={true} mountOnEnter unmountOnExit>
           <Paper
             elevation={4}
             sx={{
               borderRadius: 0.5,
               overflow: 'hidden',
               border: `1px solid ${theme.palette.divider}`,
               backgroundColor: theme.palette.background.paper,
             }}
           >
                         {/* Header */}
             <Box
               sx={{
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'space-between',
                 p: 1.5,
                 backgroundColor: theme.palette.primary.main,
                 color: theme.palette.primary.contrastText,
               }}
             >
               <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                 <NotificationsIcon sx={{ fontSize: 18 }} />
                 <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                   Payment Reminders
                 </Typography>
                 <Badge
                   badgeContent={reminderItems.length}
                   color="error"
                   sx={{
                     marginLeft: 1,
                     '& .MuiBadge-badge': {
                       backgroundColor: theme.palette.error.main,
                       color: theme.palette.error.contrastText,
                       fontSize: '0.7rem',
                       height: 18,
                       minWidth: 18
                     }
                   }}
                 />
               </Box>
               <Tooltip title="Minimize">
                 <IconButton
                   size="small"
                   onClick={handleClose}
                   sx={{ 
                     color: theme.palette.primary.contrastText,
                     padding: 0.5,
                     '& .MuiSvgIcon-root': { fontSize: 16 }
                   }}
                 >
                   <CloseIcon />
                 </IconButton>
               </Tooltip>
             </Box>

                           {/* Content */}
              <Box 
                sx={{ 
                  maxHeight: 300, 
                  overflow: 'auto',
                  backgroundColor: theme.palette.background.paper,
                }}
              >
                {reminderItems.length > 0 ? (
                  <List sx={{ p: 0 }}>
                    {reminderItems.map((reminder, index) => (
                      <ListItem
                        key={`${reminder.item.id}-${reminder.dueDate.toISOString()}`}
                        sx={{
                          borderBottom: index < reminderItems.length - 1 ? `1px solid ${theme.palette.divider}` : 'none',
                          padding: '8px 12px',
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {getSeverityIcon(reminder.severity)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                {reminder.item.account_name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                {format(reminder.dueDate, 'MMM dd, yyyy')}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Box sx={{ mt: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontSize: '0.75rem',
                                    color: reminder.statementBalance !== null && reminder.statementBalance !== undefined
                                      ? (reminder.statementBalance < 0 ? 'error.main' : 'text.secondary')
                                      : 'text.secondary'
                                  }}
                                >
                                  {reminder.statementBalance !== null && reminder.statementBalance !== undefined ? 
                                    `${reminder.statementBalance < 0 ? '-' : ''}$${Math.abs(reminder.statementBalance).toFixed(2)}` : 
                                    '--'
                                  }
                                </Typography>
                                <Chip
                                  label={getDaysText(reminder.daysUntilDue, reminder.isOverdue)}
                                  size="small"
                                  sx={{
                                    backgroundColor: getSeverityColor(reminder.severity),
                                    color: theme.palette.getContrastText(getSeverityColor(reminder.severity)),
                                    fontWeight: 600,
                                    fontSize: '0.7rem',
                                    height: 22,
                                    '& .MuiChip-label': { padding: '0 8px' }
                                  }}
                                />
                              </Box>
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  // No reminders message
                  <Box sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                      No payment reminders due within 7 days
                    </Typography>
                  </Box>
                )}
              </Box>
          </Paper>
        </Slide>
     </Box>
   );
};

export default NotificationPanel; 