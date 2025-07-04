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
import { format, parse, isValid } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';

interface ImportExportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (transactions: Partial<Transaction>[]) => Promise<void>;
  accounts: Account[];
  transactions: Transaction[];
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
}) => {
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

  // Integrate react-dropzone for drag-and-drop and click-to-select
  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        // Auto-select format based on extension
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
      if (!key) return true; // Include if required field is missing

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
    
    // 공백 제거 및 정리
    const cleanDateStr = dateStr.trim();
    
    // Try different date formats
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

    // Try parsing OFX date format (YYYYMMDD)
    if (/^\d{8}/.test(cleanDateStr)) {
      const year = cleanDateStr.slice(0, 4);
      const month = cleanDateStr.slice(4, 6);
      const day = cleanDateStr.slice(6, 8);
      const parsedDate = new Date(`${year}-${month}-${day}`);
      if (isValid(parsedDate)) {
        return format(parsedDate, 'yyyy-MM-dd');
      }
    }

    // Try parsing with timezone info (e.g., "2025-01-15T00:00:00.000Z")
    if (cleanDateStr.includes('T')) {
      const datePart = cleanDateStr.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
      }
    }

    // Fallback to Date.parse for other formats
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
    let type: TransactionType = transaction.type as TransactionType;
    let amount = Number(transaction.amount);
    if (!type) {
      type = amount < 0 ? 'expense' : 'income';
    }
    if (type === 'expense') {
      amount = -Math.abs(amount);
    } else if (type === 'income') {
      amount = Math.abs(amount);
    }
    // transfer/adjust 등은 별도 처리 가능

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

  // Reset file selection when dialog closes
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
      const validTransactions: Partial<Transaction>[] = transactions
        .filter((t): t is ParsedTransaction => t.date !== null)
        .map(t => validateTransaction({ ...t, date: t.date! }))
        .filter((t): t is Partial<Transaction> => !!t);
      await onImport(validTransactions);
      setImportStatus({ status: 'success', message: 'Import completed successfully' });
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      handleError(error);
    }
  };



  const handleCsvImport = async (content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Strip BOM and split lines
      const sanitizedContent = content.replace(/^\uFEFF/, '');
      const allLines = sanitizedContent.split(/\r?\n/).filter(line => line.trim());
      
      console.log('CSV Import Debug - Raw content preview:', allLines.slice(0, 5));
      
      // 더 강력한 헤더 찾기
      let headerIndex = -1;
      let bestHeaderScore = 0;
      
      // 처음 15줄에서 헤더 찾기
      for (let i = 0; i < Math.min(15, allLines.length); i++) {
        const line = allLines[i];
        
        // 다양한 구분자 시도
        const delimiters = [',', ';', '\t', '|'];
        let bestDelimiter = ',';
        let bestFields: string[] = [];
        let bestFieldCount = 0;
        
        for (const delim of delimiters) {
          const fields = line.split(delim).map(f => f.trim());
          if (fields.length > bestFieldCount) {
            bestFieldCount = fields.length;
            bestDelimiter = delim;
            bestFields = fields;
          }
        }
        
        // 헤더 점수 계산
        let score = 0;
        const lowerFields = bestFields.map(f => f.toLowerCase());
        
        // 날짜 필드 찾기
        if (lowerFields.some(f => /^date$/i.test(f))) score += 3;
        else if (lowerFields.some(f => /date/i.test(f))) score += 2;
        else if (lowerFields.some(f => /transaction.*date/i.test(f))) score += 2;
        
        // 금액 필드 찾기
        if (lowerFields.some(f => /^amount$/i.test(f))) score += 3;
        else if (lowerFields.some(f => /amount/i.test(f))) score += 2;
        else if (lowerFields.some(f => /debit|credit/i.test(f))) score += 2;
        else if (lowerFields.some(f => /withdrawal|deposit/i.test(f))) score += 1;
        
        // 설명 필드 찾기
        if (lowerFields.some(f => /^description$/i.test(f))) score += 2;
        else if (lowerFields.some(f => /description/i.test(f))) score += 1;
        else if (lowerFields.some(f => /^payee$/i.test(f))) score += 2;
        else if (lowerFields.some(f => /payee/i.test(f))) score += 1;
        else if (lowerFields.some(f => /^memo$/i.test(f))) score += 1;
        else if (lowerFields.some(f => /memo/i.test(f))) score += 1;
        else if (lowerFields.some(f => /^details$/i.test(f))) score += 1;
        else if (lowerFields.some(f => /^narrative$/i.test(f))) score += 1;
        
        // 카테고리 필드 찾기
        if (lowerFields.some(f => /^category$/i.test(f))) score += 1;
        else if (lowerFields.some(f => /category/i.test(f))) score += 1;
        
        // 숫자가 아닌 필드가 많을수록 헤더일 가능성이 높음
        const nonNumericFields = lowerFields.filter(f => !/^\d+\.?\d*$/.test(f));
        score += nonNumericFields.length * 0.3;
        
        if (score > bestHeaderScore) {
          bestHeaderScore = score;
          headerIndex = i;
        }
      }
      
      // 최소 점수가 없으면 첫 번째 라인 사용
      if (headerIndex < 0 || bestHeaderScore < 2) {
        headerIndex = 0;
      }
      
      const headerLine = allLines[headerIndex];
      console.log('Selected header line:', headerLine);
      console.log('Header score:', bestHeaderScore);
      
      // 구분자 결정
      const delimiters = [',', ';', '\t', '|'];
      let bestDelimiter = ',';
      let bestFieldCount = 0;
      
      for (const delim of delimiters) {
        const fields = headerLine.split(delim).map(f => f.trim());
        if (fields.length > bestFieldCount) {
          bestFieldCount = fields.length;
          bestDelimiter = delim;
        }
      }
      
      console.log('Selected delimiter:', bestDelimiter);
      
      // Only parse from the header onward
      const contentToParse = allLines.slice(headerIndex).join('\n');
      
      Papa.parse<CSVTransaction>(contentToParse, {
        header: true,
        skipEmptyLines: true,
        delimiter: bestDelimiter,
        transformHeader: header => header.trim().toLowerCase(),
        complete: async (results) => {
          // Debug: inspect parsed CSV data
          console.log('CSV import header line:', headerLine);
          console.log('Detected delimiter:', bestDelimiter);
          console.log('Parsed raw rows:', results.data.length, 'fields:', results.meta.fields);
          console.log('Sample data:', results.data.slice(0, 3));
          
          try {
            // 더 강력한 필드 매핑
            const fields = results.meta.fields as string[];
            console.log('Available fields:', fields);
            
            // 날짜 필드 찾기
            const dateKey = fields.find(f => /^date$/i.test(f.trim())) || 
                           fields.find(f => /date/i.test(f) && !/amount/i.test(f)) ||
                           fields.find(f => /transaction.*date/i.test(f)) || '';
            
            // 금액 필드 찾기
            const amountKey = fields.find(f => /^amount$/i.test(f.trim())) || 
                             fields.find(f => /amount/i.test(f)) ||
                             fields.find(f => /^debit$/i.test(f.trim())) ||
                             fields.find(f => /^credit$/i.test(f.trim())) || '';
            
            // 설명 필드 찾기
            const payeeKey = fields.find(f => /^description$/i.test(f.trim())) || 
                            fields.find(f => /^payee$/i.test(f.trim())) ||
                            fields.find(f => /^memo$/i.test(f.trim())) ||
                            fields.find(f => /^details$/i.test(f.trim())) ||
                            fields.find(f => /^narrative$/i.test(f.trim())) ||
                            fields.find(f => /description/i.test(f)) ||
                            fields.find(f => /payee/i.test(f)) ||
                            fields[0] || '';
            
            // 카테고리 필드 찾기
            const categoryKey = fields.find(f => /^category$/i.test(f.trim())) || 
                               fields.find(f => /category/i.test(f)) || '';
            
            // 메모 필드 찾기
            const notesKey = fields.find(f => /^notes$/i.test(f.trim())) || 
                            fields.find(f => /^memo$/i.test(f.trim())) ||
                            fields.find(f => /notes/i.test(f)) ||
                            fields.find(f => /memo/i.test(f)) || '';
            
            console.log('Mapped CSV keys:', { dateKey, amountKey, payeeKey, categoryKey, notesKey });
            // Filter and parse rows
            const validRows = (results.data as any[]).filter(row => row[dateKey] && row[amountKey]);
            console.log('Valid rows after dynamic filtering:', validRows.length);
            // 계좌별 CSV 부호 로직 가져오기
            let csvSignLogic = 'standard'; // 기본값
            try {
              csvSignLogic = await invoke('get_csv_sign_logic_for_account', { accountId: selectedAccount });
            } catch (error) {
              console.warn('Failed to get CSV sign logic for account:', error);
            }
            
            const parsedTransactions: ParsedTransaction[] = validRows.map((row) => {
              // Extract and sanitize
              const rawDate = row[dateKey];
              
              // 더 강력한 금액 파싱
              let amt = 0;
              let rawAmt = '';
              
              if (amountKey) {
                rawAmt = row[amountKey]?.toString() || '';
              } else {
                // Debit/Credit 별도 컬럼 처리
                const debitKey = fields.find(f => /^debit$/i.test(f.trim()));
                const creditKey = fields.find(f => /^credit$/i.test(f.trim()));
                
                if (debitKey && creditKey) {
                  const debit = parseFloat(row[debitKey]?.toString().replace(/[^0-9.\-]/g, '') || '0');
                  const credit = parseFloat(row[creditKey]?.toString().replace(/[^0-9.\-]/g, '') || '0');
                  amt = debit > 0 ? -debit : credit; // Debit은 지출(음수), Credit은 수입(양수)
                  rawAmt = amt.toString();
                }
              }
              
              // 일반 금액 파싱
              if (!rawAmt && amountKey) {
                rawAmt = row[amountKey]?.toString() || '';
              }
              
              // 금액에서 통화 기호, 괄호, 공백 제거
              if (rawAmt) {
                // 괄호는 음수로 처리 (예: (100.00) -> -100.00)
                const hasParentheses = /\([^)]*\)/.test(rawAmt);
                rawAmt = rawAmt.replace(/[^\d.\-]/g, '');
                amt = parseFloat(rawAmt);
                if (hasParentheses && amt > 0) {
                  amt = -amt;
                }
              }
              
              const parsedDate = parseDate(rawDate);
              
              // 선택된 계좌 정보 가져오기
              const selectedAccountObj = accounts.find(acc => acc.id === selectedAccount);
              const isCreditCard = selectedAccountObj?.type === 'credit';
              
              // 계좌별 CSV 부호 로직에 따른 트랜잭션 타입 결정
              let type: TransactionType;
              if (isNaN(amt)) {
                type = 'expense';
              } else {
                // 디버깅 로그 추가
                console.log('CSV Import Debug:', {
                  accountName: selectedAccountObj?.name,
                  isCreditCard,
                  csvSignLogic,
                  amount: amt,
                  payee: row[payeeKey] || ''
                });
                
                switch (csvSignLogic) {
                  case 'reversed':
                    // PC MC 등: 크레딧 카드이지만 부호가 반대
                    if (isCreditCard) {
                      // 크레딧 카드: 음수 = 빚 감소(수입), 양수 = 빚 증가(지출)
                      // 하지만 PC MC는 부호가 반대이므로: 음수 = 빚 증가(지출), 양수 = 빚 감소(수입)
                      type = amt < 0 ? 'expense' : 'income';
                    } else {
                      // 일반 계좌: 음수 = 지출, 양수 = 수입
                      type = amt < 0 ? 'expense' : 'income';
                    }
                    break;
                  case 'standard':
                  default:
                    // BMO MC 등: 기존 로직
                    if (isCreditCard) {
                      // 크레딧 카드: 음수 = 빚 감소(수입), 양수 = 빚 증가(지출)
                      type = amt < 0 ? 'income' : 'expense';
                    } else {
                      // 일반 계좌: 음수 = 지출, 양수 = 수입
                      type = amt < 0 ? 'expense' : 'income';
                    }
                    break;
                }
                
                console.log('Determined type:', type);
              }
              
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

      if (fileType === 'csv') {
        await handleCsvImport(content);
      } else {
        setImportStatus({
          status: 'error',
          message: 'Only CSV files are supported for import.',
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