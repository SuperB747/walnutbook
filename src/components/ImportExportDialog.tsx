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
} from '@mui/material';
import { useDropzone } from 'react-dropzone';
import { Transaction, Account, Category } from '../db';
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
    onClose();
  };

  const handlePreview = async () => {
    if (!selectedFile || !selectedAccount) {
      setImportStatus({
        status: 'error',
        message: selectedAccount ? 'Please select a file' : 'Please select an account',
      });
      return;
    }

    try {
      setImportStatus({ status: 'processing', message: 'Analyzing CSV file...' });
      
      const content = await selectedFile.text();
      const sanitizedContent = content.replace(/^\uFEFF/, ''); // Remove BOM
      
      const result = await importService.importCSV(
        sanitizedContent,
        selectedImporter || undefined,
        transactions
      );

      setImportPreview(result.imported);
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
        message: error instanceof Error ? error.message : 'Failed to analyze CSV file',
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
        message: 'No transactions to import. Please preview the file first.',
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
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Import/Export Transactions
      </DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Import" />
            <Tab label="Export" />
          </Tabs>
        </Box>

        {activeTab === 0 && (
          <Box>
            {/* Account Selection */}
            <FormControl fullWidth sx={{ mb: 2 }}>
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

            {/* Importer Selection */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>CSV Format (Auto-detect)</InputLabel>
              <Select
                value={selectedImporter?.name || ''}
                onChange={handleImporterChange}
                label="CSV Format (Auto-detect)"
              >
                <MenuItem value="">
                  <em>Auto-detect format</em>
                </MenuItem>
                {availableImporters.map((importer) => (
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
                border: '2px dashed #ccc',
                borderRadius: 1,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                mb: 2,
                backgroundColor: isDragActive ? '#f0f0f0' : 'transparent',
              }}
            >
              <input {...getInputProps()} />
              {selectedFile ? (
                <Typography>Selected: {selectedFileName}</Typography>
              ) : (
                <Typography>
                  {isDragActive ? 'Drop the CSV file here' : 'Drag and drop a CSV file here, or click to select'}
                </Typography>
              )}
            </Box>

            {/* Options */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={removeDuplicates}
                  onChange={(e) => setRemoveDuplicates(e.target.checked)}
                />
              }
              label="Remove duplicate transactions"
              sx={{ mb: 2 }}
            />

            {/* Status */}
            {importStatus.status !== 'ready' && (
              <Alert severity={importStatus.status === 'error' ? 'error' : importStatus.status === 'success' ? 'success' : 'info'} sx={{ mb: 2 }}>
                {importStatus.status === 'processing' && <CircularProgress size={20} sx={{ mr: 1 }} />}
                {importStatus.message}
              </Alert>
            )}

            {/* Errors and Warnings */}
            {importErrors.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Errors:</Typography>
                <List dense>
                  {importErrors.map((error, index) => (
                    <ListItem key={index}>
                      <ListItemText primary={error} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}

            {importWarnings.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Warnings:</Typography>
                <List dense>
                  {importWarnings.map((warning, index) => (
                    <ListItem key={index}>
                      <ListItemText primary={warning} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}

            {/* Preview */}
            {showPreview && (importPreview.length > 0 || skippedTransactions.length > 0) && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Preview ({importPreview.length} to import, {skippedTransactions.length} skipped)
                </Typography>
                
                {/* Transactions to import */}
                {importPreview.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, color: 'success.main' }}>
                      To Import ({importPreview.length}):
                    </Typography>
                    <Box sx={{ maxHeight: 150, overflow: 'auto', border: 1, borderColor: 'success.main', p: 1, backgroundColor: 'success.50' }}>
                      {importPreview.slice(0, 8).map((transaction, index) => (
                        <Box key={index} sx={{ mb: 1, p: 1, backgroundColor: 'success.100' }}>
                          <Typography variant="body2">
                            {transaction.date} - {transaction.payee} - ${transaction.amount?.toFixed(2)}
                          </Typography>
                        </Box>
                      ))}
                      {importPreview.length > 8 && (
                        <Typography variant="body2" color="text.secondary">
                          ... and {importPreview.length - 8} more
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}
                
                {/* Skipped transactions */}
                {skippedTransactions.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, color: 'warning.main' }}>
                      Skipped ({skippedTransactions.length}):
                    </Typography>
                    <Box sx={{ maxHeight: 150, overflow: 'auto', border: 1, borderColor: 'warning.main', p: 1, backgroundColor: 'warning.50' }}>
                      {skippedTransactions.slice(0, 8).map((transaction, index) => (
                        <Box key={index} sx={{ mb: 1, p: 1, backgroundColor: 'warning.100' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {transaction.date} - {transaction.payee} - ${transaction.amount?.toFixed(2)}
                          </Typography>
                        </Box>
                      ))}
                      {skippedTransactions.length > 8 && (
                        <Typography variant="body2" color="text.secondary">
                          ... and {skippedTransactions.length - 8} more
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}

        {activeTab === 1 && (
          <Box>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Export all transactions to CSV format.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This will export {transactions.length} transactions.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {activeTab === 0 && (
          <>
            <Button 
              onClick={handlePreview}
              disabled={!selectedFile || !selectedAccount || importStatus.status === 'processing'}
              variant="outlined"
            >
              Preview
            </Button>
            <Button 
              onClick={handleImport}
              disabled={importPreview.length === 0 || importStatus.status === 'processing'}
              variant="contained"
            >
              Import
            </Button>
          </>
        )}
        {activeTab === 1 && (
          <Button onClick={handleExport} variant="contained">
            Export
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ImportExportDialog; 