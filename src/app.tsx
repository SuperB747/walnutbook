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
  Menu,
  MenuItem,
} from '@mui/material';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import BackupIcon from '@mui/icons-material/Backup';
import BuildIcon from '@mui/icons-material/Build';
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
      default: '#f4f5f7',
      paper: '#e3eafc',
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
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="static">
          <Toolbar sx={{ minHeight: 64, px: 4, py: 0 }}>
            <Typography variant="h6" component="div" sx={{ 
              fontFamily: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", sans-serif',
              fontWeight: 700,
              color: 'white'
            }}>
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
            <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
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
          <MenuItem onClick={closeToolsMenu}>
            Manage Categories
          </MenuItem>
          <MenuItem onClick={closeToolsMenu}>
            Bulk Edit
          </MenuItem>
          <MenuItem onClick={closeToolsMenu}>
            Import/Export
          </MenuItem>
          <MenuItem onClick={closeToolsMenu}>
            Backup & Restore
          </MenuItem>
        </Menu>
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
