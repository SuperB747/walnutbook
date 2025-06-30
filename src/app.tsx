import React from 'react';
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
} from '@mui/material';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import AccountsPage from './components/AccountsPage';
import TransactionsPage from './components/TransactionsPage';
import BudgetsPage from './components/BudgetsPage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#f50057',
    },
  },
  components: {
    MuiTab: {
      styleOverrides: {
        root: {
          color: '#ffffff',
          '&.Mui-selected': {
            color: '#ffffff',
            fontWeight: 'bold',
          },
        },
      },
    },
  },
});

const App: React.FC = () => {
  const location = useLocation();

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
              SuperBudget
            </Typography>
          </Toolbar>
          <Tabs 
            value={getActiveTab()} 
            centered 
            sx={{
              '& .MuiTabs-indicator': {
                backgroundColor: '#ffffff',
              },
            }}
          >
            <Tab label="Accounts" component={Link} to="/" />
            <Tab label="Transactions" component={Link} to="/transactions" />
            <Tab label="Budgets" component={Link} to="/budgets" />
            </Tabs>
        </AppBar>
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<AccountsPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
          </Routes>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
