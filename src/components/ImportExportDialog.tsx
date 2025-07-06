import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Tab,
  Tabs,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
  SelectChangeEvent,
} from '@mui/material';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Transaction, Account, TransactionType, Category } from '../db';
import { format, parse, isValid } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';

interface ImportExportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (transactions: Partial<Transaction>[]) => Promise<void>;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
}

interface ImportStatus {
  status: 'ready' | 'processing' | 'success' | 'error';
  message: string;
}

interface ParsedTransaction {
  date: string | null;
  type: TransactionType;
  amount: number;
  payee: string;
  category: string;
  notes: string;
  account_id: number;
}

interface CSVTransaction {
  Date: string;
  Amount: string;
  Payee: string;
  Category?: string;
  Notes?: string;
}

const PAYMENT_KEYWORDS = [
  'payment', 
  'autopay', 
  'card payment', 
  'credit card',
  'bill payment',
  'automatic payment',
  'online payment',
  'e-transfer payment',
  'interac payment'
];

const ImportExportDialog: React.FC<ImportExportDialogProps> = ({
  open,
  onClose,
  onImport,
  accounts,
  transactions,
  categories,
}) => {
  console.log('ImportExportDialog received onImport prop:', typeof onImport);
  const [activeTab, setActiveTab] = useState(0);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [duplicatesFound, setDuplicatesFound] = useState(0);
  const [transferConflicts, setTransferConflicts] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    status: 'ready',
    message: '',
  });

  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'csv') {
          setSelectedFile(file);
          setSelectedFileName(file.name);
          setImportStatus({ status: 'ready', message: '' });
        } else {
          setError('Only CSV files are supported for import.');
        }
      }
    },
  });

  const isCardPayment = (payee: string): boolean => {
    const payeeLower = payee.toLowerCase();
    return PAYMENT_KEYWORDS.some(keyword => payeeLower.includes(keyword.toLowerCase()));
  };

  const areDatesNear = (date1: string, date2: string): boolean => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  };

  const getTransactionKey = (transaction: Partial<Transaction>): string => {
    if (!transaction.payee || !transaction.date || !transaction.amount) {
      return '';
    }

    if (isCardPayment(transaction.payee)) {
      return `payment-${transaction.amount}`;
    }

    return `${transaction.date}-${transaction.amount}-${transaction.type}-${transaction.payee}`;
  };

  const removeDuplicateTransactions = (
    newTransactions: Partial<Transaction>[],
    existingTransactions: Transaction[]
  ): Partial<Transaction>[] => {
    if (!removeDuplicates) return newTransactions;

    const existingPayments = new Map<string, Transaction>();
    const existingRegular = new Map<string, Transaction>();

    existingTransactions.forEach(transaction => {
      const key = getTransactionKey(transaction);
      if (isCardPayment(transaction.payee)) {
        existingPayments.set(key, transaction);
      } else {
        existingRegular.set(key, transaction);
      }
    });

    const uniqueTransactions = newTransactions.filter(transaction => {
      const key = getTransactionKey(transaction);
      if (!key) return true;

      if (isCardPayment(transaction.payee!)) {
        const existingPayment = existingPayments.get(key);
        if (!existingPayment) return true;

        return !areDatesNear(transaction.date!, existingPayment.date);
      } else {
        return !existingRegular.has(key);
      }
    });

    setDuplicatesFound(newTransactions.length - uniqueTransactions.length);
    return uniqueTransactions;
  };

  const parseDate = (dateStr: string | undefined): string | null => {
    if (!dateStr) return null;
    
    const cleanDateStr = dateStr.trim();
    
    // For yyyyMMdd format, directly construct the date string without timezone conversion
    if (/^\d{8}$/.test(cleanDateStr)) {
      const year = cleanDateStr.slice(0, 4);
      const month = cleanDateStr.slice(4, 6);
      const day = cleanDateStr.slice(6, 8);
      // Return the date directly in yyyy-MM-dd format without any timezone conversion
      return `${year}-${month}-${day}`;
    }
    
    // Then try other formats
    const formats = [
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'dd/MM/yyyy',
      'yyyy/MM/dd',
      'dd-MM-yyyy',
      'MM-dd-yyyy',
      'yyyyMMdd',
      'yyyyMMddHHmmss',
      'yyyyMMddHHmm',
      'dd/MM/yy',
      'MM/dd/yy',
      'yy/MM/dd',
    ];

    for (const formatStr of formats) {
      try {
        const parsedDate = parse(cleanDateStr, formatStr, new Date());
        if (isValid(parsedDate)) {
          return format(parsedDate, 'yyyy-MM-dd');
        }
      } catch (e) {
        // Continue to next format
      }
    }

    if (cleanDateStr.includes('T')) {
      const datePart = cleanDateStr.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
      }
    }

    try {
      const timestamp = Date.parse(cleanDateStr);
      if (!isNaN(timestamp)) {
        return format(new Date(timestamp), 'yyyy-MM-dd');
      }
    } catch (e) {
      // Continue to next method
    }

    console.warn('Could not parse date:', cleanDateStr);
    return null;
  };

  const validateTransaction = (transaction: Partial<Transaction> & { category?: string }): Partial<Transaction> | null => {
    if (!transaction.date || !transaction.amount || !transaction.payee) {
      console.warn('Invalid transaction - missing required fields:', { 
        date: transaction.date, 
        amount: transaction.amount, 
        payee: transaction.payee 
      });
      return null;
    }

    const parsedDate = parseDate(transaction.date);
    if (!parsedDate) {
      console.warn('Invalid transaction - could not parse date:', transaction.date);
      return null;
    }

    let type: TransactionType = transaction.type as TransactionType;
    let amount = Number(transaction.amount);
    
    // Validate amount
    if (isNaN(amount) || amount === 0) {
      console.warn('Invalid transaction - invalid amount:', transaction.amount);
      return null;
    }
    
    if (!type) {
      type = amount < 0 ? 'Expense' : 'Income';
    }
    if (type === 'Expense') {
      amount = -Math.abs(amount);
    } else if (type === 'Income') {
      amount = Math.abs(amount);
    }

    // For non-transfer transactions, set category_id to undefined if no category is provided
    let categoryId: number | undefined = undefined;
    if (type !== 'Transfer' && transaction.category && transaction.category.trim() !== '') {
      try {
        categoryId = getCategoryId(transaction.category);
      } catch (error) {
        console.warn('Invalid transaction - invalid category:', error);
        return null;
      }
    }
    
    return {
      date: parsedDate,
      type,
      amount,
      payee: transaction.payee,
      notes: transaction.notes || '',
      account_id: selectedAccount || 0,
      category_id: categoryId,
    };
  };

  const handleError = (error: Error | unknown) => {
    console.error('Import error:', error);
    setImportStatus({
      status: 'error',
      message: error instanceof Error ? error.message : 'An unknown error occurred',
    });
  };

  const handleAccountChange = (event: SelectChangeEvent) => {
    setSelectedAccount(parseInt(event.target.value, 10));
  };

  const handleClose = () => {
    setSelectedFile(null);
    setSelectedFileName('');
    setImportStatus({ status: 'ready', message: '' });
    onClose();
  };

  const handleImport = async (transactions: ParsedTransaction[]): Promise<void> => {
    if (!selectedAccount) {
      setImportStatus({
        status: 'error',
        message: 'Please select an account',
      });
      return;
    }

    try {
      setImportStatus({ status: 'processing', message: 'Importing transactions...' });
      
      console.log('Starting import with', transactions.length, 'transactions');
      
      const validTransactions: Partial<Transaction>[] = transactions
        .filter((t): t is ParsedTransaction => t.date !== null)
        .map(t => validateTransaction({ ...t, date: t.date! }))
        .filter((t): t is Partial<Transaction> => !!t);
      
      console.log('Valid transactions after validation:', validTransactions.length);
      
      if (validTransactions.length === 0) {
        setImportStatus({
          status: 'error',
          message: 'No valid transactions found to import. Please check your CSV format.',
        });
        return;
      }
      
      console.log('ImportExportDialog calling onImport with:', validTransactions);
      console.log('onImport function type:', typeof onImport);
      console.log('onImport function name:', onImport.name);
      console.log('onImport function toString:', onImport.toString());
      if (typeof onImport === 'function') {
        await onImport(validTransactions);
        console.log('ImportExportDialog onImport completed');
      } else {
        console.error('onImport is not a function:', onImport);
      }
      setImportStatus({ status: 'success', message: `Import completed successfully. ${validTransactions.length} transactions imported.` });
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      console.error('Import failed:', error);
      handleError(error);
    }
  };

  const handleCsvImport = async (content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const sanitizedContent = content.replace(/^\uFEFF/, '');
      const allLines = sanitizedContent.split(/\r?\n/).filter(line => line.trim());
      
      console.log('CSV Import Debug - Raw content preview:', allLines.slice(0, 5));
      
      // 헤더는 첫 줄!
      const headerLine = allLines[0];
      console.log('Selected header line:', headerLine);
      // 데이터는 그 아래부터!
      const contentToParse = allLines.join('\n'); // 전체를 파싱
      
      Papa.parse<CSVTransaction>(contentToParse, {
        header: true,
        skipEmptyLines: true,
        delimiter: ',',
        transformHeader: header => header.trim().toLowerCase(),
        complete: async (results) => {
          console.log('CSV import header line:', headerLine);
          console.log('Detected delimiter:', ',');
          console.log('Parsed raw rows:', results.data.length, 'fields:', results.meta.fields);
          console.log('Sample data:', results.data.slice(0, 3));
          
          try {
            const fields = results.meta.fields as string[];
            console.log('Available fields:', fields);
            
            const selectedAccountObj = accounts.find(acc => acc.id === selectedAccount);
            const isCreditCard = selectedAccountObj?.type === 'Credit';
            
            // 자동감지 로직: 다양한 은행 포맷 지원
            const lowerFields = fields.map(f => f.toLowerCase());
            function autoDetectField(candidates: string[]) {
              const idx = lowerFields.findIndex(f => candidates.includes(f));
              return idx !== -1 ? fields[idx] : undefined;
            }

            // Payee/Description
            const payeeKey = autoDetectField(['payee', 'description', 'desc', 'merchant']) || fields[0];
            // Amount
            const amountKey = autoDetectField(['amount', 'transaction amount', 'amt']) || fields[1];
            // Date (후보군에 'posted date' 추가)
            const dateKey = autoDetectField(['date', 'transaction date', 'date posted', 'posted date']) || fields[2];
            // Category/Notes(옵션)
            const categoryKey = autoDetectField(['category', 'cat']);
            const notesKey = autoDetectField(['notes', 'memo', 'note']);
            
            console.log('Mapped CSV keys:', { dateKey, amountKey, payeeKey, categoryKey, notesKey, accountType: selectedAccountObj?.type });
            console.log('Sample row:', results.data[0]);
            // 필터 조건 강화: null/undefined/공백 모두 걸러냄
            const validRows = (results.data as any[]).filter(row =>
              row[dateKey] != null && row[dateKey].toString().trim() !== '' &&
              row[amountKey] != null && row[amountKey].toString().trim() !== ''
            );
            console.log('Valid rows after dynamic filtering:', validRows.length);
            let csvSignLogic = 'standard';
            try {
              csvSignLogic = await invoke('get_csv_sign_logic_for_account', { accountId: selectedAccount });
            } catch (error) {
              console.warn('Failed to get CSV sign logic for account:', error);
            }
            
            const parsedTransactions: ParsedTransaction[] = validRows.map((row) => {
              const rawDate = row[dateKey];
              const transactionType = row['transaction type']?.toString().toUpperCase();
              
              let amt = 0;
              let rawAmt = row[amountKey]?.toString() || '';
              
              if (rawAmt) {
                rawAmt = rawAmt.replace(/[^\d.\-]/g, '');
                amt = parseFloat(rawAmt);
              }
              
              const parsedDate = parseDate(rawDate);
              
              let type: TransactionType;
              if (isNaN(amt)) {
                type = 'Expense';
              } else {
                console.log('CSV Import Debug:', {
                  accountName: selectedAccountObj?.name,
                  isCreditCard,
                  csvSignLogic,
                  amount: amt,
                  transactionType,
                  payee: row[payeeKey] || '',
                  rawTransactionType: row['transaction type'],
                  accountType: selectedAccountObj?.type
                });
                
                // 통합된 로직: csvSignLogic에 따라 결정
                if (csvSignLogic === 'reversed') {
                  // Reversed: 양수 = 지출, 음수 = 수입
                  type = amt > 0 ? 'Expense' : 'Income';
                  console.log('Reversed logic - positive=expense, negative=income -> type:', type);
                } else {
                  // Standard: 양수 = 수입, 음수 = 지출
                  type = amt > 0 ? 'Income' : 'Expense';
                  console.log('Standard logic - positive=income, negative=expense -> type:', type);
                }
                
                console.log('Final determined type:', type);
              }
              
              return {
                date: parsedDate,
                amount: isNaN(amt) ? 0 : Math.abs(amt),
                payee: row[payeeKey] || '',
                category: '',
                notes: notesKey ? (row[notesKey] || '') : '',
                type,
                account_id: selectedAccount || 0,
              };
            });
            console.log('handleCsvImport calling handleImport with:', parsedTransactions);
            await handleImport(parsedTransactions);
            console.log('handleCsvImport handleImport completed');
            resolve();
          } catch (err: any) {
            reject(err);
          }
        },
        error: (err: any) => reject(err),
      });
    });
  };

  const handleFileImport = async () => {
    console.log('handleFileImport called');
    if (!selectedFile || !selectedAccount) {
      setImportStatus({
        status: 'error',
        message: selectedAccount ? 'Please select a file' : 'Please select an account',
      });
      return;
    }

    try {
      console.log('Reading file content...');
      const content = await selectedFile.text();
      const fileType = selectedFile.name.split('.').pop()?.toLowerCase();
      console.log('File type:', fileType);

      if (fileType === 'csv') {
        console.log('Calling handleCsvImport...');
        await handleCsvImport(content);
        console.log('handleCsvImport completed');
      } else {
        setImportStatus({
          status: 'error',
          message: 'Only CSV files are supported for import.',
        });
      }
    } catch (error) {
      console.error('handleFileImport error:', error);
      handleError(error);
    }
  };

  const handleExport = () => {
    const csv = Papa.unparse(transactions.map(t => ({
      date: t.date,
      account_id: t.account_id,
      type: t.type,
      category_id: t.category_id,
      amount: t.amount,
      payee: t.payee,
      notes: t.notes || '',
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryId = (categoryName: string): number => {
    if (!categoryName || categoryName.trim() === '') {
      throw new Error('Category is required');
    }
    const found = categories.find(c => c.name === categoryName);
    if (found) return found.id;
    
            // If Undefined is not found, try to find "Other" category
        if (categoryName === 'Undefined') {
      const otherCategory = categories.find(c => c.name === 'Other');
      if (otherCategory) return otherCategory.id;
    }
    
    throw new Error(`Category "${categoryName}" not found`);
  };

  const handleTransferConflicts = (
    newTransactions: Partial<Transaction>[],
    existingTransactions: Transaction[]
  ): number => {
    let conflicts = 0;
    
    for (const newTx of newTransactions) {
      if (!newTx.date || !newTx.amount) continue;
      
      const existingTransfer = existingTransactions.find(existing => 
        existing.type === 'Transfer' &&
        existing.date === newTx.date &&
        Math.abs(existing.amount) === Math.abs(newTx.amount || 0)
      );
      
      if (existingTransfer) {
        conflicts++;
      }
    }
    
    return conflicts;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import/Export Transactions</DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            textColor="primary"
            indicatorColor="primary"
            sx={{
              '& .MuiTab-root': {
                color: 'text.primary',
                '&.Mui-selected': {
                  color: 'text.primary',
                },
              },
            }}
          >
            <Tab label="Import" />
            <Tab label="Export" />
          </Tabs>
        </Box>

        <TabPanel value={activeTab} index={0}>
          <Typography variant="h6" gutterBottom>
            Import CSV File
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Import transactions from a CSV file. The file should contain columns for Date, Amount, and Description/Payee.
          </Typography>

          <FormControlLabel
            control={
              <Checkbox
                checked={removeDuplicates}
                onChange={(e) => setRemoveDuplicates(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography>Automatically Remove Duplicates</Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  • Remove transactions with same date/amount/payee
                  <br />
                  • For card payments, remove matching amounts within 2 days
                </Typography>
              </Box>
            }
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="account-select-label">Account</InputLabel>
            <Select
              labelId="account-select-label"
              value={selectedAccount?.toString() || ''}
              onChange={handleAccountChange}
              label="Account"
            >
              <MenuItem value={0}>Select an account</MenuItem>
              {accounts.map(account => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box {...getRootProps()} sx={{
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 1,
            p: 3,
            textAlign: 'center',
            cursor: 'pointer',
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}>
            <input {...getInputProps()} />
            {importing ? (
              <CircularProgress size={24} />
            ) : selectedFileName ? (
              <>
                <Typography variant="h6" sx={{ mb: 1, color: 'primary.main' }}>
                  ✓ File Selected
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                  {selectedFileName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Click to change file or drag a different CSV file
                </Typography>
              </>
            ) : (
              <>
                <Typography>
                  Drag and drop a CSV file here, or click to select a file
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Import transactions from CSV spreadsheet files
                </Typography>
              </>
            )}
          </Box>
          {importStatus.status === 'processing' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {importStatus.message}
            </Alert>
          )}
          {importStatus.status === 'error' && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {importStatus.message}
            </Alert>
          )}
          {importStatus.status === 'success' && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {importStatus.message}
            </Alert>
          )}
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <Typography gutterBottom>
            Export your transactions to a CSV file that you can use in other applications or import back later.
          </Typography>
          <Button
            variant="contained"
            onClick={handleExport}
            disabled={accounts.length === 0}
          >
            Export to CSV
          </Button>
          {accounts.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              No transactions to export
            </Typography>
          )}
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        <Button
          onClick={handleFileImport}
          disabled={!selectedFile || !selectedAccount || importStatus.status === 'processing'}
          variant="contained"
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};

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
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 2 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default ImportExportDialog; 