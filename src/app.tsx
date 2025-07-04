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
  LinearProgress,
} from '@mui/material';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import BackupIcon from '@mui/icons-material/Backup';
import BuildIcon from '@mui/icons-material/Build';
import { invoke } from '@tauri-apps/api/core';
import { desktopDir } from '@tauri-apps/api/path';
import AccountsPage from './components/AccountsPage';
import TransactionsPage from './components/TransactionsPage';
import BudgetsPage from './components/BudgetsPage';
import CategoryManagementDialog from './components/CategoryManagementDialog';
import BulkTransactionEdit from './components/BulkTransactionEdit';
import ImportExportDialog from './components/ImportExportDialog';
import BackupRestoreDialog from './components/BackupRestoreDialog';

import { Account, Transaction } from './db';
import logo from './logo.png';

const theme = createTheme({
  palette: {
    mode: 'light',
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
      default: '#fafbfc',
      paper: '#ffffff',
    },
    text: {
      primary: '#222831',
      secondary: '#4F5B69',
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
          backgroundColor: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(35, 64, 117, 0.12)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(35, 64, 117, 0.12)',
          border: 'none',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          backgroundColor: '#fff',
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
      },
    },
  },
});

const App: React.FC = () => {
  const location = useLocation();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [toolsAnchorEl, setToolsAnchorEl] = useState<null | HTMLElement>(null);
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
  const [categories, setCategories] = useState<string[]>([]);

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
      console.log('OneDrive path not found, falling back to desktop:', error);
    }

    // Fallback to desktop if OneDrive not found
    return await desktopDir();
  };

  const handleBackup = async () => {
    try {
      const backupDir = await findOneDrivePath();
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const savePath = `${backupDir}/walnutbook_backup_${timestamp}.db`;
      
      await invoke('backup_database', { savePath });
      
              const isOneDrive = savePath.includes('OneDrive') || savePath.includes('WalnutBook_Backups');
        setSnackbar({
          open: true,
          message: isOneDrive 
            ? `Backup saved to OneDrive/WalnutBook_Backups: ${savePath.split('/').pop()}`
            : `Backup saved to Desktop: ${savePath.split('/').pop()}`,
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
      case '/transactions':
        return 1;
      case '/budgets':
        return 2;
      default:
        return 0;
    }
  };

  // Load data for dialogs
  const loadDialogData = async () => {
    try {
      const [accountsData, transactionsData, categoriesData] = await Promise.all([
        invoke<Account[]>('get_accounts'),
        invoke<Transaction[]>('get_transactions'),
        invoke<string[]>('get_categories')
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

  return (
    <ThemeProvider theme={theme}>
        <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', backgroundColor: '#fafbfc !important' }}>
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
              width: 120, 
              display: 'flex', 
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              px: 2,
              pb: 1,
              minHeight: 112,
              ml: 'auto',
              position: 'static',
            }}>
              <Box sx={{ display: 'flex', gap: 1, flexDirection: 'row' }}>
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
                <Tab label="Accounts" component={Link} to="/" />
                <Tab label="Transactions" component={Link} to="/transactions" />
                <Tab label="Budgets" component={Link} to="/budgets" />
              </Tabs>
            </Box>

          </Box>
        </AppBar>
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<AccountsPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
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
            Bulk Edit
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
              const createdList = await invoke<Transaction[]>('import_transactions', { transactions });
              const importedCount = createdList.length;
              const duplicateCount = transactions.length - importedCount;
              
              // 로컬 상태를 즉시 업데이트하여 부드러운 UI 전환
              const [newAccounts, newTransactions] = await Promise.all([
                invoke<Account[]>('get_accounts'),
                invoke<Transaction[]>('get_transactions')
              ]);
              
              setAccounts(newAccounts);
              setTransactions(newTransactions);
              
              // 모든 페이지가 데이터를 새로고침하도록 이벤트 발생
              window.dispatchEvent(new Event('accountsUpdated'));
              window.dispatchEvent(new Event('transactionsUpdated'));
              window.dispatchEvent(new Event('budgetsUpdated'));
              
              setSnackbar({
                open: true,
                message: `Imported ${importedCount} transactions, skipped ${duplicateCount} duplicates.`,
                severity: 'success',
              });
            } catch (error) {
              setSnackbar({
                open: true,
                message: 'Failed to import transactions: ' + String(error),
                severity: 'error',
              });
            }
          }}
          accounts={accounts}
          transactions={transactions}
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
                 invoke<string[]>('get_categories')
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
  );
};

export default App;
