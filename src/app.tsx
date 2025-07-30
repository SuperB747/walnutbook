import React, { useState, useEffect } from 'react';
import {
  Box,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  ThemeProvider,
  createTheme,
  IconButton,
  Snackbar,
  Alert,
  Menu,
  MenuItem,
  Switch,
  FormControlLabel,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import BackupIcon from '@mui/icons-material/Backup';
import BuildIcon from '@mui/icons-material/Build';
import { invoke } from '@tauri-apps/api/core';
import { desktopDir } from '@tauri-apps/api/path';
import AccountsPage from './components/AccountsPage';
import TransactionsPage from './components/TransactionsPage';
import BudgetsPage from './components/BudgetsPage';
import RecurringPage from './components/RecurringPage';
import CategoryManagementDialog from './components/CategoryManagementDialog';
import BulkTransactionEdit from './components/BulkTransactionEdit';
import ImportExportDialog from './components/ImportExportDialog';
import BackupRestoreDialog from './components/BackupRestoreDialog';
import ReportsPage from './components/ReportsPage';
import ReminderPage from './components/ReminderPage';

import { Account, Transaction, Category } from './db';
import logo from './logo.png';

// Create a theme based on light or dark mode
const getTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette: {
      mode,
      primary: {
        main: '#234075',
        light: '#4F6D9A',
        dark: '#162447',
        contrastText: '#fff',
      },
      secondary: {
        main: '#1976d2',
        light: '#63a4ff',
        dark: '#004ba0',
      },
      background: {
        default: mode === 'light' ? '#fafbfc' : '#121212',
        paper: mode === 'light' ? '#ffffff' : '#1e1e1e',
      },
      text: {
        primary: mode === 'light' ? '#222831' : '#ffffff',
        secondary: mode === 'light' ? '#4F5B69' : '#cccccc',
      },
    },
    shape: {
      borderRadius: 14,
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: 'linear-gradient(90deg, #234075 0%, #1976d2 100%)',
            boxShadow: '0 2px 12px rgba(35, 64, 117, 0.08)',
            borderBottom: 'none',
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: '64px',
            padding: '8px 28px',
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          h6: {
            fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
            fontWeight: 600,
            letterSpacing: '0.3px',
            textShadow: 'none',
            fontSize: '1.25rem',
          },
          h5: {
            fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
            fontWeight: 600,
            letterSpacing: '0.2px',
          },
          h4: {
            fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
            fontWeight: 600,
            letterSpacing: '0.2px',
          },
          body1: {
            fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
            fontWeight: 400,
            letterSpacing: '0.1px',
          },
          body2: {
            fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
            fontWeight: 400,
            letterSpacing: '0.1px',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            color: '#234075',
            backgroundColor: 'rgba(255,255,255,0.12)',
            fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
            fontWeight: 700,
            fontSize: '1rem',
            letterSpacing: '0.15px',
            textTransform: 'none',
            minHeight: '48px',
            padding: '12px 28px',
            borderRadius: '12px 12px 0 0',
            margin: '0 4px',
            transition: 'background-color 0.2s, color 0.2s, box-shadow 0.2s',
            '&:hover': {
              backgroundColor: 'rgba(255,255,255,0.12)',
              color: '#fff',
            },
                      '&.Mui-selected': {
              color: '#234075',
              backgroundColor: '#f4f5f7',
              boxShadow: '0 2px 12px rgba(35, 64, 117, 0.10)',
              zIndex: 1,
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            display: 'none',
          },
          root: {
            minHeight: '48px',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: '#234075',
            backgroundColor: 'rgba(35, 64, 117, 0.06)',
            borderRadius: '16px',
            padding: '10px',
            fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
            transition: 'background-color 0.2s, color 0.2s',
            '&:hover': {
              backgroundColor: 'rgba(35, 64, 117, 0.06)',
              color: '#fff',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            boxShadow: mode === 'light'
              ? '0 4px 20px rgba(35, 64, 117, 0.12)'
              : '0 4px 20px rgba(0, 0, 0, 0.5)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'light' ? '#fff' : '#1e1e1e',
            borderRadius: 16,
            boxShadow: mode === 'light'
              ? '0 4px 20px rgba(35, 64, 117, 0.12)'
              : '0 4px 20px rgba(0, 0, 0, 0.5)',
            border: 'none',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'light' ? '#fff' : '#1e1e1e',
            borderColor: 'rgba(35, 64, 117, 0.1)',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
            fontWeight: 500,
            letterSpacing: '0.1px',
            borderRadius: 8,
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          // 스크롤바 완전히 숨기기
          '*': {
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            '&::-webkit-scrollbar-track': {
              display: 'none',
            },
            '&::-webkit-scrollbar-thumb': {
              display: 'none',
            },
            '&::-webkit-scrollbar-corner': {
              display: 'none',
            },
          },
          // HTML5 validation 메시지를 영어로 설정
          'input, textarea, select': {
            '&:invalid': {
              '&::-webkit-validation-bubble-message': {
                display: 'none',
              },
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiInputLabel-root': {
              transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
              transformOrigin: 'left top',
              background: 'none',
              '&::before': {
                content: '""',
                display: 'block',
                position: 'absolute',
                top: -3,
                left: -8,
                right: -8,
                bottom: -3,
                backgroundColor: '#fff',
                zIndex: -1,
                transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                transform: 'scale(0)',
                borderRadius: 4,
              },
              '&.Mui-focused, &.MuiInputLabel-shrink': {
                transform: 'translate(14px, -9px) scale(0.75)',
                padding: '0 8px',
                marginLeft: '-8px',
                '&::before': {
                  transform: 'scale(1)',
                },
              },
              '&:not(.MuiInputLabel-shrink)::before': {
                opacity: 0,
              },
            },
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: 'rgba(35, 64, 117, 0.23)',
                transition: 'border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                '& legend': {
                  marginLeft: '-4px',
                  '& > span': {
                    padding: '0 8px',
                  },
                },
              },
              '&:hover fieldset': {
                borderColor: 'rgba(35, 64, 117, 0.5)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#234075',
              },
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            '&.MuiInputLabel-outlined': {
              zIndex: 1,
              '&.MuiInputLabel-shrink': {
                backgroundColor: 'transparent',
                padding: '0 8px',
                marginLeft: '-8px',
              },
              '&:not(.MuiInputLabel-shrink)': {
                '&::before': {
                  opacity: 0,
                },
              },
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(35, 64, 117, 0.23)',
              transition: 'border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(35, 64, 117, 0.5)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#234075',
            },
          },
          notchedOutline: {
            transition: 'border-width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            '& legend': {
              transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
              marginLeft: '-4px',
              '& > span': {
                opacity: 0,
                padding: '0 8px',
              },
            },
          },
        },
      },
      // Ensure text-variant buttons use readable color in dark mode
      MuiButton: {
        styleOverrides: {
          root: ({ ownerState, theme }) => ({
            ...(ownerState.variant === 'text' && {
              color: theme.palette.mode === 'dark'
                ? theme.palette.text.primary
                : theme.palette.primary.main,
            }),
          }),
        },
      },
    },
  });

export const App: React.FC = () => {
  const location = useLocation();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [toolsAnchorEl, setToolsAnchorEl] = useState<null | HTMLElement>(null);
  // State for light/dark mode
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  // Generate theme when mode changes
  const theme = React.useMemo(() => getTheme(mode), [mode]);

  const openToolsMenu = (event: React.MouseEvent<HTMLElement>) => setToolsAnchorEl(event.currentTarget);
  const closeToolsMenu = () => setToolsAnchorEl(null);


  
  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [importExportDialogOpen, setImportExportDialogOpen] = useState(false);
  const [backupRestoreDialogOpen, setBackupRestoreDialogOpen] = useState(false);


  
  // Data states for dialogs
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Function to find OneDrive path and create backup folder
  const findOneDrivePath = async (): Promise<string> => {
    try {
      // Try to find OneDrive path from environment variables
      const oneDrivePath = await invoke<string>('get_onedrive_path');
      if (oneDrivePath) {
        // Create WalnutBook backup folder in OneDrive
        const backupFolder = `${oneDrivePath}/WalnutBook_Backups`;
        await invoke('create_backup_folder', { folderPath: backupFolder });
        return backupFolder;
      }
    } catch (error) {

    }

    // Fallback to desktop if OneDrive not found
    return await desktopDir();
  };

  const handleBackup = async () => {
    try {
      const backupInfo = await invoke<{ timestamp: string; file_size: number; file_path: string }>('manual_backup_to_onedrive');
      setSnackbar({
        open: true,
        message: `Backup saved to: ${backupInfo.file_path} (${(backupInfo.file_size / 1024).toFixed(1)} KB)`,
        severity: 'success',
      });
    } catch (err) {
      console.error('Backup failed:', err);
      setSnackbar({
        open: true,
        message: 'Backup failed: ' + String(err),
        severity: 'error',
      });
    }
  };

  const getActiveTab = () => {
    switch (location.pathname) {
      case '/accounts':
        return 0;
      case '/transactions':
        return 1;
      case '/budgets':
        return 2;
      case '/recurring':
        return 3;
      case '/reminders':
        return 4;
      case '/reports':
        return 5;
      default:
        return 5; // Default to Reports tab
    }
  };

  // Load data for dialogs
  const loadDialogData = async () => {
    try {
      const [accountsData, transactionsData, categoriesData] = await Promise.all([
        invoke<Account[]>('get_accounts'),
        invoke<Transaction[]>('get_transactions'),
        invoke<Category[]>('get_categories_full')
      ]);
      setAccounts(accountsData);
      setTransactions(transactionsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load dialog data:', error);
    }
  };



  // Load data when dialogs open
  useEffect(() => {
    if (categoryDialogOpen || bulkEditDialogOpen || importExportDialogOpen) {
      loadDialogData();
    }
  }, [categoryDialogOpen, bulkEditDialogOpen, importExportDialogOpen]);

  const [splash, setSplash] = useState(true);

  useEffect(() => {
    // TODO: 실제 앱 준비 완료 시점에 setSplash(false) 호출
    const timer = setTimeout(() => setSplash(false), 2000); // 2초 후 splash 제거 (예시)
    return () => clearTimeout(timer);
  }, []);

  // pre-splash 제거 (index.html)
  useEffect(() => {
    if (!splash) {
      const preSplash = document.getElementById('pre-splash');
      if (preSplash) preSplash.style.opacity = '0';
      setTimeout(() => {
        if (preSplash && preSplash.parentNode) preSplash.parentNode.removeChild(preSplash);
      }, 500); // fade-out 후 제거
    }
  }, [splash]);

  return (
    <>
      {splash && (
        <div style={{
          position: 'fixed', zIndex: 9999, top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(255,255,255,0.35)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'opacity 0.5s',
          opacity: splash ? 1 : 0,
          pointerEvents: splash ? 'auto' : 'none',
        }}>
          <div style={{
            minWidth: 220,
            minHeight: 180,
            padding: '32px 28px 24px 28px',
            borderRadius: 24,
            background: 'rgba(255,255,255,0.85)',
            boxShadow: '0 8px 32px 0 rgba(31,38,135,0.18)',
            textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: 'linear-gradient(135deg, #fff 60%, #e0e7ff 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 18, fontWeight: 900, fontSize: 32, color: '#667eea',
              boxShadow: '0 2px 8px #667eea33',
            }}>WB</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#667eea', marginBottom: 6 }}>WalnutBook</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 18 }}>Personal Finance Manager</div>
            <div style={{ width: 32, height: 32, border: '3px solid #e0e7ff', borderTop: '3px solid #667eea', borderRadius: '50%', animation: 'spin 1.1s linear infinite', margin: '0 auto 8px' }} />
            <div style={{ color: '#667eea', fontSize: 14, fontWeight: 600 }}>Loading...</div>
          </div>
        </div>
      )}
      {/* 실제 앱 내용 */}
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
            <AppBar position="static">
              <Box sx={{ 
                position: 'relative',
                display: 'flex', 
                alignItems: 'stretch',
                background: 'linear-gradient(90deg, #234075 0%, #1976d2 100%)',
                borderBottom: 'none',
                borderRadius: '0 0 20px 20px',
                boxShadow: 'none',
                minHeight: 112, // Toolbar(64px) + Tabs(48px) = 112px
              }}>
                {/* 로고 영역 - 왼쪽 */}
                <Box sx={{ 
                  flexShrink: 0, 
                  width: 240, 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 2,
                }}>
                  <img 
                    src={logo} 
                    alt="WalnutBook Logo" 
                    style={{
                      height: '100px',
                      width: 'auto',
                      objectFit: 'contain',
                    }}
                  />
                </Box>

                {/* 오른쪽 영역 - 툴 버튼들 */}
                <Box sx={{ 
                  flexShrink: 0, 
                  width: 'auto', 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  px: 2,
                  pb: 1,
                  minHeight: 112,
                  ml: 'auto',
                  position: 'static',
                }}>
                  {/* Dark Mode 토글 - 위쪽 */}
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <FormControlLabel
                      control={<Switch checked={mode === 'dark'} onChange={() => setMode(mode === 'light' ? 'dark' : 'light')} color="default" />} 
                      label="Dark Mode" 
                      sx={{ color: 'inherit', m: 0 }}
                    />
                  </Box>
                  
                  {/* Tool 버튼들 - 아래쪽 */}
                  <Box sx={{ display: 'flex', gap: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <IconButton
                      color="inherit"
                      onClick={openToolsMenu}
                      sx={{ 
                        backdropFilter: 'blur(8px)',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        },
                      }}
                      title="Tools"
                    >
                      <BuildIcon />
                    </IconButton>
                    <IconButton
                      color="inherit"
                      onClick={handleBackup}
                      sx={{ 
                        backdropFilter: 'blur(8px)',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        },
                      }}
                      title="Backup Database"
                    >
                      <BackupIcon />
                    </IconButton>
                  </Box>
                </Box>

                {/* 중앙 영역 - 탭들 */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    bottom: 0,
                    transform: 'translateX(-50%)',
                    zIndex: 2,
                    minHeight: 48,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    width: 'auto',
                  }}
                >
                  <Tabs 
                    value={getActiveTab()} 
                    sx={{
                      '& .MuiTabs-indicator': {
                        backgroundColor: '#ffffff',
                      },
                      '& .MuiTab-root': {
                        color: '#234075',
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
                        fontWeight: 700,
                        fontSize: '1rem',
                        letterSpacing: '0.15px',
                        textTransform: 'none',
                        minHeight: '48px',
                        padding: '12px 28px',
                        borderRadius: '12px 12px 0 0',
                        margin: '0 4px',
                        transition: 'background-color 0.2s, color 0.2s, box-shadow 0.2s',
                        '&:hover': {
                          backgroundColor: 'rgba(255,255,255,0.12)',
                          color: '#fff',
                        },
                        '&.Mui-selected': {
                          color: '#234075',
                          backgroundColor: '#fafbfc',
                          boxShadow: '0 2px 12px rgba(35, 64, 117, 0.10)',
                          zIndex: 1,
                          borderBottom: 'none',
                        },
                      },
                    }}
                  >
                    <Tab label="Accounts" component={Link} to="/accounts" />
                    <Tab label="Transactions" component={Link} to="/transactions" />
                    <Tab label="Budgets" component={Link} to="/budgets" />
                    <Tab label="Recurring" component={Link} to="/recurring" />
                    <Tab label="Reminders" component={Link} to="/reminders" />
                    <Tab label="Reports" component={Link} to="/reports" />
                  </Tabs>
                </Box>

              </Box>
            </AppBar>
              <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
              <Routes>
                <Route path="/" element={<ReportsPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/budgets" element={<BudgetsPage />} />
                <Route path="/recurring" element={<RecurringPage />} />
                <Route path="/reminders" element={<ReminderPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Routes>
            </Box>
            <Menu
              anchorEl={toolsAnchorEl}
              open={Boolean(toolsAnchorEl)}
              onClose={closeToolsMenu}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
            >
              <MenuItem onClick={() => {
                closeToolsMenu();
                setCategoryDialogOpen(true);
              }}>
                Manage Categories
              </MenuItem>
              <MenuItem onClick={() => {
                closeToolsMenu();
                setBulkEditDialogOpen(true);
              }}>
                Bulk Edit Transactions
              </MenuItem>
              <MenuItem onClick={() => {
                closeToolsMenu();
                setImportExportDialogOpen(true);
              }}>
                Import/Export
              </MenuItem>
              <MenuItem onClick={() => {
                closeToolsMenu();
                setBackupRestoreDialogOpen(true);
              }}>
                Backup & Restore
              </MenuItem>


            </Menu>
            <Snackbar
              open={snackbar.open}
              autoHideDuration={6000}
              onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
              sx={{
                '& .MuiSnackbar-root': {
                  bottom: '24px',
                },
              }}
            >
              <Alert
                onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                severity={snackbar.severity}
                variant="filled"
                sx={{ 
                  width: '100%',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
                  padding: '8px 12px',
                  minHeight: 'auto',
                  '& .MuiAlert-icon': {
                    padding: '0',
                    marginRight: '8px',
                    fontSize: '20px',
                  },
                  '& .MuiAlert-message': {
                    padding: '0',
                    fontSize: '14px',
                    fontWeight: 500,
                  },
                  '& .MuiAlert-action': {
                    padding: '0',
                    marginLeft: '8px',
                    '& .MuiIconButton-root': {
                      padding: '2px',
                      color: 'inherit',
                      width: '16px',
                      height: '16px',
                      '& .MuiSvgIcon-root': {
                        fontSize: '14px',
                      },
                      '&:hover': {
                        backgroundColor: 'transparent',
                      },
                    },
                  },
                }}
              >
                {snackbar.message}
              </Alert>
            </Snackbar>

            {/* Dialogs */}
            <CategoryManagementDialog
              open={categoryDialogOpen}
              onClose={() => setCategoryDialogOpen(false)}
              onChange={loadDialogData}
            />
            
            <BulkTransactionEdit
              open={bulkEditDialogOpen}
              onClose={() => setBulkEditDialogOpen(false)}
              onSave={async (updates) => {
                try {
                  await invoke('bulk_update_transactions', updates);
                  await loadDialogData();
                  setSnackbar({
                    open: true,
                    message: `Updated ${updates.transactionIds.length} transaction(s)`,
                    severity: 'success',
                  });
                } catch (error) {
                  setSnackbar({
                    open: true,
                    message: 'Failed to update transactions: ' + String(error),
                    severity: 'error',
                  });
                }
              }}
              transactions={transactions}
              accounts={accounts}
              categories={categories}
            />
            
            <ImportExportDialog
              open={importExportDialogOpen}
              onClose={() => setImportExportDialogOpen(false)}
              onImport={async (transactions) => {
                try {
                  const result = await invoke<{ imported: Transaction[]; imported_count: number; duplicate_count: number }>('import_transactions', { transactions });
                  // Refresh data
                  const [newAccounts, newTransactions] = await Promise.all([
                    invoke<Account[]>('get_accounts'),
                    invoke<Transaction[]>('get_transactions')
                  ]);
                  setAccounts(newAccounts);
                  setTransactions(newTransactions);
                  window.dispatchEvent(new Event('accountsUpdated'));
                  window.dispatchEvent(new Event('transactionsUpdated'));
                  window.dispatchEvent(new Event('budgetsUpdated'));
                  const importedTransactionIds = result.imported.map(t => t.id);
                  window.dispatchEvent(new CustomEvent('transactionsImported', {
                    detail: { importedIds: importedTransactionIds, duplicateCount: result.duplicate_count }
                  }));
                  // Show success message with import and skip counts
                  if (result.imported_count > 0) {
                    const message = result.duplicate_count > 0 
                      ? `Successfully imported ${result.imported_count} transactions, ${result.duplicate_count} duplicates skipped`
                      : `Successfully imported ${result.imported_count} transactions`;
                    setSnackbar({ 
                      open: true, 
                      message, 
                      severity: 'success' 
                    });
                  } else {
                    const message = result.duplicate_count > 0 
                      ? `No transactions imported, ${result.duplicate_count} duplicates found`
                      : 'No transactions were imported';
                    setSnackbar({ 
                      open: true, 
                      message, 
                      severity: 'warning' 
                    });
                  }
                  return result;
                } catch (error) {
                  setSnackbar({
                    open: true,
                    message: 'Failed to import transactions: ' + String(error),
                    severity: 'error',
                  });
                  return { imported: [], imported_count: 0, duplicate_count: 0 };
                }
              }}
              accounts={accounts}
              transactions={transactions}
              categories={categories}
            />
            
                     <BackupRestoreDialog
               open={backupRestoreDialogOpen}
               onClose={() => setBackupRestoreDialogOpen(false)}
               onRestore={async () => {
                 try {
                   // 로컬 상태를 즉시 업데이트하여 부드러운 UI 전환
                   const [newAccounts, newTransactions, newCategories] = await Promise.all([
                     invoke<Account[]>('get_accounts'),
                     invoke<Transaction[]>('get_transactions'),
                     invoke<Category[]>('get_categories_full')
                   ]);
                   
                   setAccounts(newAccounts);
                   setTransactions(newTransactions);
                   setCategories(newCategories);
                   
                   // 모든 페이지가 데이터를 새로고침하도록 이벤트 발생
                   window.dispatchEvent(new Event('accountsUpdated'));
                   window.dispatchEvent(new Event('transactionsUpdated'));
                   window.dispatchEvent(new Event('budgetsUpdated'));
                   
                   setSnackbar({
                     open: true,
                     message: 'Database restored successfully!',
                     severity: 'success',
                   });
                 } catch (error) {
                   setSnackbar({
                     open: true,
                     message: 'Failed to refresh data after restore: ' + String(error),
                     severity: 'error',
                   });
                 }
               }}
             />
             


          </Box>
      </ThemeProvider>
    </>
  );
};

// CSS 애니메이션 추가 (전역)
const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style);

export default App;
