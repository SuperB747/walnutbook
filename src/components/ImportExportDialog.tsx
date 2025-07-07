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
  onImport: (transactions: Partial<Transaction>[]) => Promise<{ imported: Transaction[]; imported_count: number; duplicate_count: number }>;
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

interface HeaderMapping {
  type: number;
  date: number;
  amount: number;
  payee: number;
}

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
    if (!transaction.payee || !transaction.date || transaction.amount === undefined) {
      return '';
    }

    const formattedAmount = transaction.amount.toFixed(2);
    const formattedDate = transaction.date;
    const payee = transaction.payee.trim();

    // 날짜, 금액, 설명만으로 키 생성
    return `${formattedDate}-${formattedAmount}-${payee}`;
  };

  const removeDuplicateTransactions = (
    newTransactions: Partial<Transaction>[],
    existingTransactions: Partial<Transaction>[]
  ): Partial<Transaction>[] => {
    if (!removeDuplicates) return newTransactions;

    console.log('[CSV_DEBUG] Checking duplicates. New transactions:', newTransactions);
    console.log('[CSV_DEBUG] Existing transactions:', existingTransactions);

    const existingKeys = new Set<string>();

    // 기존 거래 내역의 키를 Set에 저장
    existingTransactions.forEach(transaction => {
      const key = getTransactionKey(transaction);
      if (key) {
        existingKeys.add(key);
        console.log('[CSV_DEBUG] Adding existing key:', key);
      }
    });

    // 새로운 거래 내역 중 중복되지 않은 것만 필터링
    const uniqueTransactions = newTransactions.filter(transaction => {
      const key = getTransactionKey(transaction);
      const isDuplicate = key && existingKeys.has(key);
      console.log('[CSV_DEBUG] Checking new transaction:', {
        key,
        isDuplicate,
        transaction
      });
      return !isDuplicate;
    });

    setDuplicatesFound(newTransactions.length - uniqueTransactions.length);
    console.log('[CSV_DEBUG] Unique transactions:', uniqueTransactions);
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
    if (!transaction.date?.toString().trim() || !transaction.amount || !transaction.payee?.toString().trim()) {
      return null;
    }
    let type: TransactionType = transaction.type as TransactionType;
    let amount = Number(transaction.amount);
    if (isNaN(amount) || amount === 0) {
      return null;
    }
    // type이 명확히 들어온 경우(Income/Expense)면 부호만 맞추고, 아니면 amount로 추론
    if (type === 'Income') {
      amount = Math.abs(amount);
    } else if (type === 'Expense') {
      amount = -Math.abs(amount);
    } else {
      type = amount < 0 ? 'Expense' : 'Income';
      if (type === 'Income') amount = Math.abs(amount);
      else amount = -Math.abs(amount);
    }
    
    return {
      date: transaction.date,
      type,
      amount,
      payee: transaction.payee,
      notes: transaction.notes || '',
      account_id: selectedAccount || 0,
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

  const handleImport = async (newTransactions: Partial<Transaction>[]): Promise<void> => {
    if (!selectedAccount) {
      setImportStatus({
        status: 'error',
        message: 'Please select an account',
      });
      return;
    }

    try {
      setImportStatus({ status: 'processing', message: 'Importing transactions...' });
      
      console.log('Starting import with', newTransactions.length, 'transactions');
      
      const validTransactions: Partial<Transaction>[] = newTransactions
        .map(t => {
          const vt = validateTransaction(t);
          if (!vt) {
            console.warn('validateTransaction filtered out:', t);
          }
          return vt;
        })
        .filter((t): t is Partial<Transaction> => !!t);
      
      console.log('Valid transactions after validation:', validTransactions.length);
      
      if (validTransactions.length === 0) {
        setImportStatus({
          status: 'error',
          message: 'No valid transactions found to import. Please check your CSV format.',
        });
        return;
      }

      // Call parent onImport to perform import and get result
      const result = await onImport(validTransactions);
      console.log('ImportExportDialog onImport completed');
      
      // 성공 메시지에 중복 건수 포함
      setImportStatus({
        status: 'success',
        message: `Successfully imported ${result.imported_count} transaction${result.imported_count === 1 ? '' : 's'}${result.duplicate_count > 0 ? ` (${result.duplicate_count} duplicate${result.duplicate_count === 1 ? '' : 's'} skipped)` : ''}`,
      });
      
      // 1.5초 후에 다이얼로그 닫기
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      console.error('Import failed:', error);
      handleError(error);
    }
  };

  const findHeaderIndex = (headers: string[], possibleNames: string[]): number => {
    return headers.findIndex(header => 
      possibleNames.some(name => 
        header.toLowerCase().trim().includes(name.toLowerCase().trim())
      )
    );
  };

  const mapHeaders = (headers: string[]): HeaderMapping => {
    console.log('[CSV_DEBUG] Mapping headers:', headers);
    
    const typeNames = ['type', 'transaction type', 'trans type'];
    const dateNames = ['date', 'date posted', 'trans date', 'transaction date'];
    const amountNames = ['amount', 'transaction amount', 'trans amount'];
    const payeeNames = ['description', 'payee', 'merchant', 'details'];

    // First Bank Card 컬럼이 있는 경우 특별 처리
    const firstBankCardIndex = findHeaderIndex(headers, ['first bank card']);
    if (firstBankCardIndex !== -1) {
      // First Bank Card가 있는 경우, 다른 컬럼들의 위치를 찾습니다
      const mapping: HeaderMapping = {
        type: findHeaderIndex(headers, ['transaction type']),
        date: findHeaderIndex(headers, ['date posted']),
        amount: findHeaderIndex(headers, ['transaction amount']),
        payee: findHeaderIndex(headers, ['description']),
      };
      return mapping;
    }

    // 일반적인 경우의 매핑
    const mapping: HeaderMapping = {
      type: findHeaderIndex(headers, typeNames),
      date: findHeaderIndex(headers, dateNames),
      amount: findHeaderIndex(headers, amountNames),
      payee: findHeaderIndex(headers, payeeNames),
    };

    console.log('[CSV_DEBUG] Header mapping result:', mapping);
    return mapping;
  };

  const handleCsvImport = async (content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const sanitizedContent = content.replace(/^\uFEFF/, '');
        const allLines = sanitizedContent.split(/\r?\n/);
        
        console.log('[CSV_DEBUG] All lines:', allLines);
        
        // 네 번째 줄이 헤더 (인덱스 3)
        const headerLineIndex = 3;
        if (allLines.length <= headerLineIndex) {
          throw new Error('CSV file is too short');
        }
        
        // 실제 헤더 라인 사용
        const headers = allLines[headerLineIndex].split(',').map(h => h.trim());
        console.log('[CSV_DEBUG] Headers:', headers);
        
        const mapping = mapHeaders(headers);
        console.log('[CSV_DEBUG] Column mapping:', mapping);
        
        // 매핑 유효성 검사
        if (mapping.type === -1 || mapping.date === -1 || mapping.amount === -1 || mapping.payee === -1) {
          console.error('[CSV_DEBUG] Invalid column mapping:', mapping);
          throw new Error('Could not map all required columns in CSV file');
        }
        
        const parsedTransactions: Partial<Transaction>[] = [];
        
        // 빈 줄을 건너뛰고 실제 데이터 행부터 처리
        for (let i = 6; i < allLines.length; i++) {  // 데이터는 7번째 줄부터 시작 (인덱스 6)
          const line = allLines[i];
          if (!line.trim()) continue;
          
          const fields = line.split(',').map(f => f.trim().replace(/^['"]|['"]$/g, ''));  // 따옴표 제거
          console.log(`[CSV_DEBUG] Processing line ${i}:`, fields);
          
          if (fields.length >= Math.max(mapping.type, mapping.date, mapping.amount, mapping.payee) + 1) {
            const transaction = processCSVRow(fields, mapping);
            console.log(`[CSV_DEBUG] Parsed transaction:`, transaction);
            if (transaction.date && transaction.amount !== undefined && transaction.payee) {
              parsedTransactions.push(transaction);
            } else {
              console.log(`[CSV_DEBUG] Skipping invalid transaction:`, transaction);
            }
          } else {
            console.log(`[CSV_DEBUG] Skipping invalid line ${i}, expected ${Math.max(mapping.type, mapping.date, mapping.amount, mapping.payee) + 1} fields but got ${fields.length}:`, fields);
          }
        }
        
        console.log('[CSV_DEBUG] All parsed transactions:', parsedTransactions);
        
        if (parsedTransactions.length === 0) {
          setImportStatus({
            status: 'error',
            message: 'No valid transactions found in the CSV file.',
          });
          resolve();
          return;
        }
        
        // 중복 제거는 handleImport에서 처리하므로 여기서는 하지 않습니다.
        handleImport(parsedTransactions)
          .then(() => resolve())
          .catch(reject);
          
      } catch (error) {
        console.error('[CSV_DEBUG] Error during CSV import:', error);
        setImportStatus({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to import CSV file',
        });
        reject(error);
      }
    });
  };

  const processCSVRow = (row: string[], mapping: HeaderMapping): Partial<Transaction> => {
    const rawType = row[mapping.type]?.trim().toUpperCase() || '';
    const rawAmount = row[mapping.amount]?.trim() || '0';
    const rawDate = row[mapping.date]?.trim() || '';
    
    // 금액에서 쉼표 제거하고 파싱
    let amount = parseFloat(rawAmount.replace(/[^0-9.-]/g, ''));
    
    console.log('[CSV_DEBUG] Processing row data:', {
      rawType,
      rawAmount,
      amount,
      rawDate,
      mappingType: mapping.type,
      mappingAmount: mapping.amount,
      fullRow: row
    });

    // 거래 유형 결정
    let type: TransactionType;
    if (rawType === 'CREDIT' || rawType.includes('CREDIT')) {
      type = 'Income';
      amount = Math.abs(amount);
    } else if (rawType === 'DEBIT' || rawType.includes('DEBIT')) {
      type = 'Expense';
      amount = -Math.abs(amount);
    } else {
      // 금액 기반 판단
      type = amount >= 0 ? 'Income' : 'Expense';
    }

    // 날짜 형식 변환 (YYYYMMDD -> YYYY-MM-DD)
    let formattedDate = rawDate;
    if (/^\d{8}$/.test(rawDate)) {
      formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    }

    const transaction = {
      type,
      date: formattedDate,
      amount,
      payee: row[mapping.payee]?.trim() || '',
    };

    console.log('[CSV_DEBUG] Created transaction:', transaction);
    return transaction;
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