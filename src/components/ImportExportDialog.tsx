import React, { useState, useEffect } from 'react';
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
  List,
  ListItem,
  ListItemText,
  Divider,
  TextField,
  Switch,
  FormGroup,
} from '@mui/material';
import { useDropzone } from 'react-dropzone';
import { Transaction, Account, Category, TransactionType } from '../db';
import { invoke } from '@tauri-apps/api/core';
import { ImportService } from '../services/ImportService';
import { BaseImporter } from './importers/BaseImporter';

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

const ImportExportDialog: React.FC<ImportExportDialogProps> = ({
  open,
  onClose,
  onImport,
  accounts,
  transactions,
  categories,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<number | ''>('');
  const [selectedImporter, setSelectedImporter] = useState<BaseImporter | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>({ status: 'ready', message: '' });
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [importPreview, setImportPreview] = useState<Partial<Transaction>[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [skippedTransactions, setSkippedTransactions] = useState<Partial<Transaction>[]>([]);
  
  // Paste functionality
  const [usePaste, setUsePaste] = useState(false);
  const [pastedData, setPastedData] = useState('');
  
  // Reverse toggle functionality
  const [reverseIncomeExpense, setReverseIncomeExpense] = useState(false);

  const importService = new ImportService();
  const availableImporters = importService.getAvailableImporters();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
    },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setSelectedFile(acceptedFiles[0]);
        setSelectedFileName(acceptedFiles[0].name);
        setImportStatus({ status: 'ready', message: '' });
        setImportPreview([]);
        setImportErrors([]);
        setImportWarnings([]);
        setShowPreview(false);
        setUsePaste(false);
      }
    },
  });

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleAccountChange = (event: SelectChangeEvent) => {
    setSelectedAccount(parseInt(event.target.value, 10));
  };

  const handleImporterChange = (event: SelectChangeEvent<string>) => {
    const importerName = event.target.value;
    const importer = availableImporters.find(imp => imp.name === importerName) || null;
    setSelectedImporter(importer);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setSelectedFileName('');
    setSelectedAccount('');
    setSelectedImporter(null);
    setImportStatus({ status: 'ready', message: '' });
    setImportPreview([]);
    setImportErrors([]);
    setImportWarnings([]);
    setShowPreview(false);
    setSkippedTransactions([]);
    setUsePaste(false);
    setPastedData('');
    setReverseIncomeExpense(false);
    onClose();
  };

  const handlePreview = async () => {
    if (!selectedAccount) {
      setImportStatus({
        status: 'error',
        message: 'Please select an account',
      });
      return;
    }

    if (usePaste && !pastedData.trim()) {
      setImportStatus({
        status: 'error',
        message: 'Please paste some data or select a file',
      });
      return;
    }

    if (!usePaste && !selectedFile) {
      setImportStatus({
        status: 'error',
        message: 'Please select a file or use paste mode',
      });
      return;
    }

    try {
      setImportStatus({ status: 'processing', message: 'Analyzing data...' });
      
      let content: string;
      if (usePaste) {
        content = pastedData;
      } else {
        content = await selectedFile!.text();
      }
      
      const sanitizedContent = content.replace(/^\uFEFF/, ''); // Remove BOM
      
      // Get the selected account type
      const selectedAccountData = accounts.find(acc => acc.id === selectedAccount);
      const accountType = selectedAccountData?.type;
      
      const result = await importService.importCSV(
        sanitizedContent,
        selectedImporter || undefined,
        transactions,
        accountType
      );

      // Apply reverse toggle if enabled
      let processedTransactions = result.imported;
      if (reverseIncomeExpense) {
        processedTransactions = result.imported.map(tx => ({
          ...tx,
          type: (tx.type === 'Income' ? 'Expense' : 'Income') as 'Income' | 'Expense',
          amount: tx.amount ? -tx.amount : tx.amount
        }));
      }

      setImportPreview(processedTransactions);
      setSkippedTransactions(result.skipped || []);
      setImportErrors(result.errors);
      setImportWarnings(result.warnings);
      setShowPreview(true);
      
      setImportStatus({
        status: 'success',
        message: `Found ${result.imported_count} transactions to import${result.duplicate_count > 0 ? ` (${result.duplicate_count} duplicates will be skipped)` : ''}`,
      });
      
    } catch (error) {
      console.error('Preview failed:', error);
      setImportStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to analyze data',
      });
    }
  };

  const handleImport = async () => {
    if (!selectedAccount) {
      setImportStatus({
        status: 'error',
        message: 'Please select an account',
      });
      return;
    }

    if (importPreview.length === 0) {
      setImportStatus({
        status: 'error',
        message: 'No transactions to import. Please preview the data first.',
      });
      return;
    }

    try {
      setImportStatus({ status: 'processing', message: 'Importing transactions...' });
      
      // Add account_id to all transactions
      const transactionsToImport = importPreview.map(t => ({
        ...t,
        account_id: selectedAccount,
      }));

      const result = await onImport(transactionsToImport);
      
      // Close dialog immediately after successful import
      handleClose();
      
    } catch (error) {
      console.error('Import failed:', error);
      // Let the parent handle the error message via snackbar
      handleClose();
    }
  };

  const handleExport = () => {
    const csv = [
      'Date,Account,Type,Category,Amount,Payee,Notes',
      ...transactions.map(t => {
        const account = accounts.find(a => a.id === t.account_id);
        const category = categories.find(c => c.id === t.category_id);
        return `${t.date},${account?.name || ''},${t.type},${category?.name || ''},${t.amount},${t.payee},${t.notes || ''}`;
      })
    ].join('\n');

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

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Import/Export Transactions
      </DialogTitle>
      <DialogContent sx={{ px: 2, py: 1 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1.5 }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Import" />
            <Tab label="Export" />
          </Tabs>
        </Box>

        {activeTab === 0 && (
          <Box>
            {/* Account Selection */}
            <FormControl fullWidth sx={{ mb: 1.5 }}>
              <InputLabel>Select Account</InputLabel>
              <Select
                value={selectedAccount.toString()}
                onChange={handleAccountChange}
                label="Select Account"
              >
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Import Mode Selection */}
            <FormGroup sx={{ mb: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={usePaste}
                    onChange={(e) => setUsePaste(e.target.checked)}
                  />
                }
                label="Paste online banking data"
              />
            </FormGroup>

            {usePaste ? (
              /* Paste Mode */
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Paste your online banking transaction data here:
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={8}
                  variant="outlined"
                  placeholder="Paste your banking data here...&#10;Example:&#10;12/15/2023  WALMART STORE  -$45.67&#10;12/14/2023  DEPOSIT  +$500.00"
                  value={pastedData}
                  onChange={(e) => setPastedData(e.target.value)}
                  sx={{ fontFamily: 'monospace' }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Tip: Copy transaction data from your online banking website and paste it here
                </Typography>
              </Box>
            ) : (
              /* File Upload Mode */
              <>
                {/* Importer Selection */}
                <FormControl fullWidth sx={{ mb: 1.5 }}>
                  <InputLabel>CSV Format (Auto-detect)</InputLabel>
                  <Select
                    value={selectedImporter?.name || ''}
                    onChange={handleImporterChange}
                    label="CSV Format (Auto-detect)"
                  >
                    <MenuItem value="">
                      <em>Auto-detect format</em>
                    </MenuItem>
                    {availableImporters
                      .filter(importer => importer.name !== 'Paste') // Remove Paste importer from dropdown
                      .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically
                      .map((importer) => (
                        <MenuItem key={importer.name} value={importer.name}>
                          {importer.name} - {importer.description}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>

                {/* File Upload */}
                <Box
                  {...getRootProps()}
                  sx={{
                    border: '2px dashed',
                    borderColor: isDragActive ? 'primary.main' : 'grey.300',
                    borderRadius: 1,
                    p: 3,
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
                    mb: 1.5,
                  }}
                >
                  <input {...getInputProps()} />
                  {selectedFile ? (
                    <Typography variant="body2" color="primary">
                      Selected: {selectedFileName}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {isDragActive
                        ? 'Drop the CSV file here...'
                        : 'Drag and drop a CSV file here, or click to select'}
                    </Typography>
                  )}
                </Box>
              </>
            )}

            {/* Status and Preview */}
            {importStatus.status !== 'ready' && (
              <Box sx={{ mb: 1.5 }}>
                {importStatus.status === 'processing' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2">{importStatus.message}</Typography>
                  </Box>
                )}
                {importStatus.status === 'success' && (
                  <Alert severity="success" sx={{ mb: 1 }}>
                    {importStatus.message}
                  </Alert>
                )}
                {importStatus.status === 'error' && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    {importStatus.message}
                  </Alert>
                )}
              </Box>
            )}

            {/* Preview Section */}
            {showPreview && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Preview ({importPreview.length} transactions)
                </Typography>
                
                {/* Reverse Toggle */}
                <FormGroup sx={{ mb: 1 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={reverseIncomeExpense}
                        onChange={(e) => {
                          setReverseIncomeExpense(e.target.checked);
                          // Re-apply the reverse logic
                          if (e.target.checked) {
                            const reversedTransactions = importPreview.map(tx => ({
                              ...tx,
                              type: (tx.type === 'Income' ? 'Expense' : 'Income') as 'Income' | 'Expense',
                              amount: tx.amount ? -tx.amount : tx.amount
                            }));
                            setImportPreview(reversedTransactions);
                          } else {
                            // Re-run preview to get original data
                            handlePreview();
                          }
                        }}
                      />
                    }
                    label="Reverse Income/Expense"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Toggle to swap Income and Expense types
                  </Typography>
                </FormGroup>
                
                <List dense sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  {importPreview.slice(0, 10).map((tx, index) => (
                    <ListItem key={index} divider>
                      <ListItemText
                        primary={tx.payee}
                        secondary={`${tx.date} - ${tx.amount?.toFixed(2)} (${tx.type})`}
                      />
                    </ListItem>
                  ))}
                  {importPreview.length > 10 && (
                    <ListItem>
                      <ListItemText
                        primary={`... and ${importPreview.length - 10} more transactions`}
                        sx={{ fontStyle: 'italic' }}
                      />
                    </ListItem>
                  )}
                </List>
                
                {importErrors.length > 0 && (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      Errors: {importErrors.join(', ')}
                    </Typography>
                  </Alert>
                )}
                
                {importWarnings.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      Warnings: {importWarnings.join(', ')}
                    </Typography>
                  </Alert>
                )}
              </Box>
            )}

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button onClick={handleClose}>Cancel</Button>
              <Button 
                onClick={handlePreview} 
                variant="outlined"
                disabled={!selectedAccount || (usePaste ? !pastedData.trim() : !selectedFile)}
              >
                Preview
              </Button>
              <Button 
                onClick={handleImport} 
                variant="contained" 
                color="primary"
                disabled={importPreview.length === 0}
              >
                Import
              </Button>
            </Box>
          </Box>
        )}

        {activeTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Export all transactions to a CSV file
            </Typography>
            <Button onClick={handleExport} variant="contained" color="primary">
              Export Transactions
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportExportDialog; 