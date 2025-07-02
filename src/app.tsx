import React, { useState } from 'react';
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
} from '@mui/material';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import BackupIcon from '@mui/icons-material/Backup';
import { invoke } from '@tauri-apps/api/core';
import { desktopDir } from '@tauri-apps/api/path';
import AccountsPage from './components/AccountsPage';
import TransactionsPage from './components/TransactionsPage';
import BudgetsPage from './components/BudgetsPage';

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
      default: '#F5F6FA',
      paper: '#F0F1F5',
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
          fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", sans-serif',
          fontWeight: 700,
          letterSpacing: '0.5px',
          textShadow: 'none',
          fontSize: '1.25rem',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: '#234075',
          backgroundColor: 'rgba(255,255,255,0.12)',
          fontWeight: 600,
          fontSize: '1.05rem',
          letterSpacing: '0.2px',
          textTransform: 'none',
          minHeight: '48px',
          padding: '12px 28px',
          borderRadius: '12px 12px 0 0',
          margin: '0 4px',
          transition: 'background-color 0.2s, color 0.2s, box-shadow 0.2s',
          '&:hover': {
            backgroundColor: 'rgba(255,255,255,0.22)',
            color: '#fff',
          },
          '&.Mui-selected': {
            color: '#234075',
            backgroundColor: '#fff',
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
          transition: 'background-color 0.2s, color 0.2s',
          '&:hover': {
            backgroundColor: 'rgba(25, 118, 210, 0.12)',
            color: '#1976d2',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, #e3eafc 0%, #f0f4ff 100%)',
          backgroundColor: '#e3eafc',
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(35, 64, 117, 0.08)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, #e3eafc 0%, #f0f4ff 100%)',
          backgroundColor: '#e3eafc',
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(35, 64, 117, 0.08)',
          border: '1px solid #dbeafe',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(227, 234, 252, 0.7)',
          borderColor: '#dbeafe',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: '#e0e3e8',
          color: '#234075',
          fontWeight: 500,
          borderRadius: 8,
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

  const handleBackup = async () => {
    try {
      const desktop = await desktopDir();
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const savePath = `${desktop}/walnutbook_backup_${timestamp}.db`;
      
      await invoke('backup_database', { savePath });
      
      setSnackbar({
        open: true,
        message: `Backup saved: ${savePath}`,
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

  return (
    <ThemeProvider theme={theme}>
        <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              WalnutBook
            </Typography>
          </Toolbar>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            px: 4, 
            pb: 0, 
            pt: 0,
            position: 'relative',
            background: 'linear-gradient(90deg, #234075 0%, #1976d2 100%)',
            borderBottom: 'none',
            borderRadius: '0 0 20px 20px',
            boxShadow: 'none',
          }}>
            <Tabs 
              value={getActiveTab()} 
              centered
              sx={{
                flexGrow: 1,
                '& .MuiTabs-indicator': {
                  backgroundColor: '#ffffff',
                },
              }}
            >
              <Tab label="Accounts" component={Link} to="/" />
              <Tab label="Transactions" component={Link} to="/transactions" />
              <Tab label="Budgets" component={Link} to="/budgets" />
            </Tabs>
            <IconButton
              color="inherit"
              onClick={handleBackup}
              sx={{ 
                position: 'absolute',
                right: 24,
                top: '50%',
                transform: 'translateY(-50%)',
                backdropFilter: 'blur(8px)',
              }}
              title="Backup Database"
            >
              <BackupIcon />
            </IconButton>
          </Box>
        </AppBar>
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<AccountsPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
          </Routes>
        </Box>
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
};

export default App;
