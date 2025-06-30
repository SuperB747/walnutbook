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
import { Transaction, Account, TransactionType } from '../db';
import * as ofx from 'ofx';
import * as qif2json from 'qif2json';
import { format, parse, isValid } from 'date-fns';

interface ImportExportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (transactions: Partial<Transaction>[]) => Promise<void>;
  accounts: Account[];
  transactions: Transaction[];
}

interface FileFormat {
  id: string;
  name: string;
  extensions: string[];
  description: string;
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

interface OFXTransaction {
  DTPOSTED: string;
  TRNAMT: string;
  NAME?: string;
  MEMO?: string;
}

interface QIFTransaction {
  date: Date;
  amount: number;
  payee: string;
  category?: string;
  memo?: string;
}

interface CSVTransaction {
  Date: string;
  Amount: string;
  Payee: string;
  Category?: string;
  Notes?: string;
}

const FILE_FORMATS: FileFormat[] = [
  {
    id: 'qif',
    name: 'Quicken Interchange Format (QIF)',
    extensions: ['.qif'],
    description: 'Import transactions from Quicken or other QIF files'
  },
  {
    id: 'ofx',
    name: 'Open Financial Exchange (OFX)',
    extensions: ['.ofx', '.qfx'],
    description: 'Import transactions from bank or credit card OFX/QFX files'
  },
  {
    id: 'csv',
    name: 'Comma Separated Values (CSV)',
    extensions: ['.csv'],
    description: 'Import transactions from CSV spreadsheet files'
  }
];

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

// Simple OFX parser function
function parseOFXContent(ofxContent: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = [];
  // Split by STMTTRN (opening tag) to get each record after header
  const parts = ofxContent.split(/<STMTTRN>/i);
  parts.shift(); // drop header before first transaction
  parts.forEach(part => {
    // Limit segment to end of this record before next STMTTRN start or closing tag
    const segment = part.split(/<\/?STMTTRN>/i)[0];
    // extract fields
    const dtMatch = /<DTPOSTED>([^<\r\n]+)/i.exec(segment);
    const amtMatch = /<TRNAMT>([^<\r\n]+)/i.exec(segment);
    const nameMatch = /<NAME>([^<\r\n]+)/i.exec(segment);
    // Extract memo: try full XML-style <MEMO>...</MEMO>
    let memo: string | undefined;
    const xmlMemoMatch = /<MEMO>([\s\S]*?)<\/MEMO>/i.exec(segment);
    if (xmlMemoMatch) {
      memo = xmlMemoMatch[1].trim();
    } else {
      // Fallback: manual substring after <MEMO> up to next tag
      const tagIndex = segment.search(/<MEMO>/i);
      if (tagIndex >= 0) {
        let rawMemo = segment.substring(tagIndex + 6);
        const nextTag = rawMemo.search(/<\w+/);
        if (nextTag >= 0) rawMemo = rawMemo.substring(0, nextTag);
        memo = rawMemo.trim();
      }
    }
    if (dtMatch && amtMatch) {
      transactions.push({
        DTPOSTED: dtMatch[1].trim(),
        TRNAMT: amtMatch[1].trim(),
        NAME: nameMatch ? nameMatch[1].trim() : undefined,
        MEMO: memo,
      });
    }
  });
  return transactions;
}

const ImportExportDialog: React.FC<ImportExportDialogProps> = ({
  open,
  onClose,
  onImport,
  accounts,
  transactions,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>('csv');
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [duplicatesFound, setDuplicatesFound] = useState(0);
  const [transferConflicts, setTransferConflicts] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    status: 'ready',
    message: '',
  });

  // Integrate react-dropzone for drag-and-drop and click-to-select
  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        // Auto-select format based on extension
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'qif') {
          setSelectedFormat('qif');
        } else if (ext === 'csv') {
          setSelectedFormat('csv');
        } else if (ext === 'ofx' || ext === 'qfx') {
          setSelectedFormat('ofx');
        }
        setSelectedFile(file);
        setImportStatus({ status: 'ready', message: '' });
      }
    },
  });

  // Helper function to check if a transaction is a card payment
  const isCardPayment = (payee: string): boolean => {
    const payeeLower = payee.toLowerCase();
    return PAYMENT_KEYWORDS.some(keyword => payeeLower.includes(keyword.toLowerCase()));
  };

  // Helper function to check if two dates are within 2 days of each other
  const areDatesNear = (date1: string, date2: string): boolean => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  };

  // Helper function to create a unique key for a transaction
  const getTransactionKey = (transaction: Partial<Transaction>): string => {
    if (!transaction.payee || !transaction.date || !transaction.amount) {
      return '';
    }

    // 신용카드 결제 거래인 경우
    if (isCardPayment(transaction.payee)) {
      // 금액만 비교 (타입과 날짜는 다를 수 있음)
      return `payment-${transaction.amount}`;
    }

    // 일반 거래인 경우 기존 로직 사용
    return `${transaction.date}-${transaction.amount}-${transaction.type}-${transaction.payee}`;
  };

  // Helper function to remove duplicate transactions
  const removeDuplicateTransactions = (
    newTransactions: Partial<Transaction>[],
    existingTransactions: Transaction[]
  ): Partial<Transaction>[] => {
    if (!removeDuplicates) return newTransactions;

    const existingPayments = new Map<string, Transaction>();
    const existingRegular = new Map<string, Transaction>();

    // 기존 거래들을 카드 결제와 일반 거래로 분류
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
      if (!key) return true; // 필수 필드가 없는 경우 포함

      if (isCardPayment(transaction.payee!)) {
        // 카드 결제 거래인 경우
        const existingPayment = existingPayments.get(key);
        if (!existingPayment) return true;

        // 날짜가 2일 이내인 경우만 중복으로 처리
        return !areDatesNear(transaction.date!, existingPayment.date);
      } else {
        // 일반 거래인 경우
        return !existingRegular.has(key);
      }
    });

    setDuplicatesFound(newTransactions.length - uniqueTransactions.length);
    return uniqueTransactions;
  };

  // Helper function to parse and validate date
  const parseDate = (dateStr: string | undefined): string | null => {
    if (!dateStr) return null;
    // Try different date formats
    const formats = [
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'dd/MM/yyyy',
      'yyyyMMdd',
      'yyyyMMddHHmmss',
      'yyyyMMddHHmm',
    ];

    for (const formatStr of formats) {
      const parsedDate = parse(dateStr!, formatStr, new Date());
      if (isValid(parsedDate)) {
        return format(parsedDate, 'yyyy-MM-dd');
      }
    }

    // Try parsing OFX date format (YYYYMMDD)
    if (/^\d{8}/.test(dateStr!)) {
      const year = dateStr!.slice(0, 4);
      const month = dateStr!.slice(4, 6);
      const day = dateStr!.slice(6, 8);
      const parsedDate = new Date(`${year}-${month}-${day}`);
      if (isValid(parsedDate)) {
        return format(parsedDate, 'yyyy-MM-dd');
      }
    }

    // Fallback to Date.parse for other formats
    const timestamp = Date.parse(dateStr!);
    if (!isNaN(timestamp)) {
      return format(new Date(timestamp), 'yyyy-MM-dd');
    }

    return null;
  };

  // Helper function to validate transaction data
  const validateTransaction = (transaction: Partial<Transaction>): Partial<Transaction> | null => {
    // Validate required fields
    if (!transaction.date || !transaction.amount || !transaction.payee) {
      return null;
    }

    // Parse and validate date
    const parsedDate = parseDate(transaction.date);
    if (!parsedDate) {
      return null;
    }

    // Determine transaction type based on amount
    const type: TransactionType = transaction.amount < 0 ? 'expense' : 'income';
    const amount = Math.abs(transaction.amount);

    // Return validated transaction
    return {
      date: parsedDate,
      type,
      amount,
      payee: transaction.payee,
      category: transaction.category || '',
      notes: transaction.notes || '',
      account_id: selectedAccount || 0
    };
  };

  const parseQFXData = async (text: string): Promise<Partial<Transaction>[]> => {
    try {
      const transactions = parseOFXContent(text) as OFXTransaction[];
      
      return transactions.map((trn: OFXTransaction) => ({
        date: trn.DTPOSTED,
        type: (parseFloat(trn.TRNAMT) >= 0 ? 'income' : 'expense') as TransactionType,
        amount: Math.abs(parseFloat(trn.TRNAMT)),
        payee: trn.NAME || trn.MEMO || 'Unknown Payee',
        notes: `${trn.MEMO || ''}`.trim(),
        category: 'Uncategorized'
      }));
    } catch (error) {
      console.error('Error parsing QFX:', error);
      throw new Error('Failed to parse QFX file. Please check the file format.');
    }
  };

  const parseQIFData = async (text: string): Promise<Partial<Transaction>[]> => {
    const qifData = qif2json.parse(text) as { transactions: QIFTransaction[] };
    
    const parsedTransactions = qifData.transactions.map((trn: QIFTransaction) => ({
      date: trn.date.toISOString().split('T')[0],
      type: (trn.amount >= 0 ? 'income' : 'expense') as TransactionType,
      amount: Math.abs(trn.amount),
      payee: trn.payee,
      category: trn.category || 'Uncategorized',
      notes: trn.memo || '',
    }));

    return removeDuplicateTransactions(parsedTransactions, []);
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
      const validTransactions: Partial<Transaction>[] = transactions
        .filter((t): t is ParsedTransaction => t.date !== null)
        .map(t => ({
          date: t.date!,            // non-null by filter
          type: t.type,
          amount: t.amount,
          payee: t.payee,
          category: t.category,
          notes: t.notes,
          account_id: selectedAccount
        }));
      await onImport(validTransactions);
      setImportStatus({ status: 'success', message: 'Import completed successfully' });
      setTimeout(() => {
        onClose();
        setImportStatus({ status: 'ready', message: '' });
      }, 1500);
    } catch (error) {
      handleError(error);
    }
  };

  const handleQifImport = async (content: string): Promise<void> => {
    try {
      const data = qif2json.parse(content);
      const transactions = data.transactions.map((t: QIFTransaction) => ({
        date: t.date.toISOString().split('T')[0],
        amount: t.amount,
        payee: t.payee,
        category: t.category || '',
        notes: t.memo || '',
        type: t.amount < 0 ? 'expense' : 'income' as TransactionType,
        account_id: selectedAccount || 0,
      }));

      await handleImport(transactions);
    } catch (error) {
      handleError(error);
    }
  };

  const handleOfxImport = async (content: string): Promise<void> => {
    console.log('[ImportExportDialog] Starting OFX import');
    console.log('[ImportExportDialog] OFX file content (first 200 chars):', content.slice(0, 200));
    try {
      const transactions = parseOFXContent(content);
      console.log('[ImportExportDialog] parseOFXContent returned', transactions.length, 'records:', transactions);
      // Map OFX records to ParsedTransaction, combining NAME and MEMO description
      const parsedTransactions: ParsedTransaction[] = transactions.map((t: OFXTransaction) => {
        // Extract raw date string before fractional seconds and timezone
        const rawPosted = t.DTPOSTED.split('.')[0];
        const rawMemo = t.MEMO || '';
        const nameDesc = t.NAME ? t.NAME.trim() : '';
        let memoDesc = '';
        let memoNotes = '';
        if (rawMemo.trim()) {
          const parts = rawMemo.trim().split(/\s{2,}/);
          memoDesc = parts[0] || '';
          if (parts.length > 1) {
            memoNotes = parts.slice(1).join(' ').trim();
          }
        }
        // Combine NAME and MEMO description without extra spaces
        const combined = (nameDesc + memoDesc).trim();
        const payee = combined || 'Unknown Payee';
        const notes = memoNotes;
        return {
          date: parseDate(rawPosted),
          amount: Math.abs(parseFloat(t.TRNAMT)),
          payee,
          notes,
          type: parseFloat(t.TRNAMT) < 0 ? 'expense' : 'income' as TransactionType,
          account_id: selectedAccount || 0,
          category: '',
        };
      });
      console.log('[ImportExportDialog] parsedTransactions for import', parsedTransactions.length, parsedTransactions);
      await handleImport(parsedTransactions);
    } catch (error) {
      handleError(error);
    }
  };

  const handleCsvImport = async (content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Strip BOM and split lines
      const sanitizedContent = content.replace(/^\uFEFF/, '');
      const allLines = sanitizedContent.split(/\r?\n/);
      // Find header line that contains both Date and Amount
      let headerIndex = allLines.findIndex(line => /date/i.test(line) && /amount/i.test(line));
      if (headerIndex < 0) headerIndex = 0;
      const headerLine = allLines[headerIndex];
      // Determine delimiter based on header line
      const commaCount = (headerLine.match(/,/g) || []).length;
      const semicolonCount = (headerLine.match(/;/g) || []).length;
      const delimiter = semicolonCount > commaCount ? ';' : ',';
      // Only parse from the header onward
      const contentToParse = allLines.slice(headerIndex).join('\n');
      Papa.parse<CSVTransaction>(contentToParse, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        transformHeader: header => header.trim().toLowerCase(),
        complete: async (results) => {
          // Debug: inspect parsed CSV data
          console.log('CSV import header line:', headerLine);
          console.log('Detected delimiter:', delimiter);
          console.log('Parsed raw rows:', results.data.length, 'fields:', results.meta.fields);
          try {
            // Dynamically map header keys
            const fields = results.meta.fields as string[];
            const dateKey = fields.find(f => /date/i.test(f) && !/amount/i.test(f)) || '';
            const amountKey = fields.find(f => /amount/i.test(f)) || '';
            const payeeKey = fields.find(f => /description|payee/i.test(f)) || fields[0] || '';
            const categoryKey = fields.find(f => /category/i.test(f)) || '';
            const notesKey = fields.find(f => /notes|memo/i.test(f)) || '';
            console.log('Mapped CSV keys:', { dateKey, amountKey, payeeKey, categoryKey, notesKey });
            // Filter and parse rows
            const validRows = (results.data as any[]).filter(row => row[dateKey] && row[amountKey]);
            console.log('Valid rows after dynamic filtering:', validRows.length);
            const parsedTransactions: ParsedTransaction[] = validRows.map((row) => {
              // Extract and sanitize
              const rawDate = row[dateKey];
              const rawAmt = row[amountKey]?.toString().replace(/[^0-9.\-]/g, '') || '';
              const parsedDate = parseDate(rawDate);
              const amt = parseFloat(rawAmt);
              const type: TransactionType = isNaN(amt) ? 'expense' : (amt < 0 ? 'expense' : 'income');
              return {
                date: parsedDate,
                amount: isNaN(amt) ? 0 : Math.abs(amt),
                payee: row[payeeKey] || '',
                category: categoryKey ? (row[categoryKey] || '') : '',
                notes: notesKey ? (row[notesKey] || '') : '',
                type,
                account_id: selectedAccount || 0,
              };
            });
            await handleImport(parsedTransactions);
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
    if (!selectedFile || !selectedAccount) {
      setImportStatus({
        status: 'error',
        message: selectedAccount ? 'Please select a file' : 'Please select an account',
      });
      return;
    }

    try {
      const content = await selectedFile.text();
      const fileType = selectedFile.name.split('.').pop()?.toLowerCase();

      switch (fileType) {
        case 'qif':
          await handleQifImport(content);
          break;
        case 'ofx':
        case 'qfx':
          // Support both OFX and QFX extensions
          await handleOfxImport(content);
          break;
        case 'csv':
          await handleCsvImport(content);
          break;
        default:
          setImportStatus({
            status: 'error',
            message: 'Unsupported file type',
          });
      }
    } catch (error) {
      handleError(error);
    }
  };

  const handleExport = () => {
    const csv = Papa.unparse(transactions.map(t => ({
      date: t.date,
      account_id: t.account_id,
      type: t.type,
      category: t.category,
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

  const createTransactionFromParsed = (transaction: ParsedTransaction): Partial<Transaction> => {
    return {
      date: transaction.date!,
      type: transaction.type,
      amount: transaction.amount,
      payee: transaction.payee,
      category: transaction.category || '',
      notes: transaction.notes || '',
      account_id: selectedAccount || 0
    };
  };

  // Helper function to check for transfer conflicts
  const checkTransferConflicts = (
    newTransactions: Partial<Transaction>[],
    existingTransactions: Transaction[]
  ): number => {
    let conflicts = 0;
    
    for (const newTx of newTransactions) {
      if (!newTx.date || !newTx.amount) continue;
      
      // Check if there's a transfer transaction on the same date with the same amount
      const existingTransfer = existingTransactions.find(existing => 
        existing.type === 'transfer' &&
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
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
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>File Format</InputLabel>
            <Select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              label="File Format"
            >
              {FILE_FORMATS.map((format) => (
                <MenuItem key={format.id} value={format.id}>
                  {format.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
            ) : (
              <>
                <Typography>
                  Drag and drop a {FILE_FORMATS.find(f => f.id === selectedFormat)?.name} file here, or click to select a file
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {FILE_FORMATS.find(f => f.id === selectedFormat)?.description}
                </Typography>
              </>
            )}
          </Box>
          {/* Display import status messages */}
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
        <Button onClick={onClose}>Close</Button>
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