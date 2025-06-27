import React, { useState } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Box,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ko } from 'date-fns/locale';
import AccountsPage from './components/AccountsPage';
import TransactionsPage from './components/TransactionsPage';
import BudgetsPage from './components/BudgetsPage';
import ScheduledTransactionsPage from './components/ScheduledTransactionsPage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
});

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ko}>
        <CssBaseline />
        <Box sx={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={currentTab} onChange={handleTabChange}>
              <Tab label="계좌" />
              <Tab label="거래" />
              <Tab label="예산" />
              <Tab label="정기 거래" />
            </Tabs>
          </Box>

          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            {currentTab === 0 && <AccountsPage />}
            {currentTab === 1 && <TransactionsPage />}
            {currentTab === 2 && <BudgetsPage />}
            {currentTab === 3 && <ScheduledTransactionsPage />}
          </Box>
        </Box>
      </LocalizationProvider>
    </ThemeProvider>
  );
};

export default App;
