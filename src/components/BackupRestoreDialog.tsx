import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  Typography, 
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Chip,
  Alert,
} from '@mui/material';
import { Refresh as RefreshIcon, RestoreFromTrash as RestoreIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { desktopDir } from '@tauri-apps/api/path';

interface BackupInfo {
  timestamp: string;
  file_size: number;
  version: string;
  is_compressed: boolean;
}



interface BackupRestoreDialogProps {
  open: boolean;
  onClose: () => void;
  onRestore?: () => void;
}

const BackupRestoreDialog: React.FC<BackupRestoreDialogProps> = ({ open, onClose, onRestore }) => {
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);


  // Load backup history when dialog opens
  useEffect(() => {
    if (open) {
      loadBackupHistory();
    }
  }, [open]);

  const loadBackupHistory = async () => {
    try {
      const history = await invoke<BackupInfo[]>('get_backup_history');
      setBackupHistory(history);
    } catch (error) {
      console.error('Failed to load backup history:', error);
    }
  };



  // Function to find OneDrive path and create backup folder
  const findOneDrivePath = async (): Promise<string> => {
    try {
      // Try to find OneDrive path from environment variables
      const oneDrivePath = await invoke<string>('get_onedrive_path');
      if (oneDrivePath) {
        // Create WalnutBook backup folder in OneDrive
        const backupFolder = `${oneDrivePath}/WalnutBook_Backups`;
        await invoke('create_backup_folder', { folderPath: backupFolder });
        return backupFolder;
      }
    } catch (error) {

    }

    // Fallback to desktop if OneDrive not found
    return await desktopDir();
  };

  const handleManualBackup = async () => {
    setStatus({ message: 'Creating manual backup...', error: false });
    setIsLoading(true);
    try {
      // Invoke Rust to create manual backup in Manual_Save folder
      const backupInfo = await invoke<BackupInfo>('manual_backup_to_onedrive');
      setStatus({ 
        message: `✅ Manual backup successful! Created: ${backupInfo.timestamp} (${(backupInfo.file_size / 1024).toFixed(1)} KB)`, 
        error: false 
      });
      
      // Refresh backup history
      await loadBackupHistory();
    } catch (err) {
      console.error('Manual backup failed:', err);
      setStatus({ message: '❌ Manual backup failed: ' + String(err), error: true });
    } finally {
      setIsLoading(false);
    }
  };



  const handleRestore = () => {
    setStatus({ message: 'Selecting backup file...', error: false });
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db';
    let done = false;
    const cleanup = () => {
      input.removeEventListener('change', onChange);
      window.removeEventListener('focus', onFocus);
    };
    const onChange = async () => {
      done = true;
      cleanup();
      const file = input.files?.[0];
      if (!file) {
        setStatus({ message: 'Restore cancelled', error: true });
        return;
      }
      try {
        setStatus({ message: 'Verifying backup file...', error: false });
        const buffer = await file.arrayBuffer();
        
        setStatus({ message: 'Restoring database...', error: false });
        await invoke('import_database', { data: Array.from(new Uint8Array(buffer)) });
        
        setStatus({ message: '✅ Restore successful! Database has been restored.', error: false });
        onRestore?.();
        // 복원 완료 후 즉시 다이얼로그 닫기
        setTimeout(() => {
          handleClose();
        }, 2000);
      } catch (e) {
        console.error('Restore failed:', e);
        setStatus({ message: '❌ Restore failed: ' + String(e), error: true });
      }
    };
    // onFocus를 약간 지연시켜 race condition 방지
    const onFocus = () => {
      setTimeout(() => {
        if (!done) {
          cleanup();
          setStatus({ message: 'Restore cancelled', error: true });
        }
      }, 200);
    };
    input.addEventListener('change', onChange);
    window.addEventListener('focus', onFocus);
    input.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp: string): string => {
    // Handle different timestamp formats
    if (timestamp.length === 15) {
      // Format: YYYYMMDD_HHMMSS
      const year = timestamp.substring(0, 4);
      const month = timestamp.substring(4, 6);
      const day = timestamp.substring(6, 8);
      const hour = timestamp.substring(9, 11);
      const minute = timestamp.substring(11, 13);
      const second = timestamp.substring(13, 15);
      
      // Create a more readable format with English date/time
      const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      const now = new Date();
      const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
      
      if (diffInHours < 1) {
        return `Just now (${hour}:${minute})`;
      } else if (diffInHours < 24) {
        return `${diffInHours} hours ago (${month}/${day} ${hour}:${minute})`;
      } else if (diffInHours < 24 * 7) {
        const days = Math.floor(diffInHours / 24);
        return `${days} days ago (${month}/${day} ${hour}:${minute})`;
      } else {
        return `${year}-${month}-${day} ${hour}:${minute}`;
      }
    } else if (timestamp.length === 31) {
      // Handle the duplicated timestamp format: YYYYMMDD_HHMMSS_YYYYMMDD_HHMMSS
      // Extract the first part (YYYYMMDD_HHMMSS)
      const firstPart = timestamp.substring(0, 15);
      const year = firstPart.substring(0, 4);
      const month = firstPart.substring(4, 6);
      const day = firstPart.substring(6, 8);
      const hour = firstPart.substring(9, 11);
      const minute = firstPart.substring(11, 13);
      const second = firstPart.substring(13, 15);
      
      // Create a more readable format with English date/time
      const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      const now = new Date();
      const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
      
      if (diffInHours < 1) {
        return `Just now (${hour}:${minute})`;
      } else if (diffInHours < 24) {
        return `${diffInHours} hours ago (${month}/${day} ${hour}:${minute})`;
      } else if (diffInHours < 24 * 7) {
        const days = Math.floor(diffInHours / 24);
        return `${days} days ago (${month}/${day} ${hour}:${minute})`;
      } else {
        return `${year}-${month}-${day} ${hour}:${minute}`;
      }
    }
    // Fallback for other formats
    return timestamp;
  };

  const handleDeleteBackup = async (timestamp: string) => {
    try {
      await invoke('delete_backup_from_history', { timestamp });
      setStatus({ message: '✅ Backup deleted successfully', error: false });
      await loadBackupHistory();
    } catch (error) {
      setStatus({ message: '❌ Failed to delete backup: ' + String(error), error: true });
    }
  };

  const handleRestoreBackup = async (timestamp: string) => {
    try {
      setStatus({ message: 'Restoring backup...', error: false });
      await invoke('restore_backup_from_history', { timestamp });
      setStatus({ message: '✅ Backup restored successfully', error: false });
      onRestore?.();
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      setStatus({ message: '❌ Failed to restore backup: ' + String(error), error: true });
    }
  };

  const handleClose = () => {
    setStatus(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Backup & Restore Database</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          
          {/* Backup Actions */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Button 
              variant="contained" 
              onClick={handleManualBackup}
              disabled={isLoading}
              fullWidth
            >
              Backup Now to OneDrive
            </Button>
          </Box>

          {/* Status Message */}
          {status && (
            <Alert severity={status.error ? 'error' : 'success'} sx={{ mb: 2 }}>
              {status.message}
            </Alert>
          )}



          {/* Backup History */}
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">Backup History</Typography>
              <IconButton onClick={loadBackupHistory} disabled={isLoading}>
                <RefreshIcon />
              </IconButton>
            </Box>
            
            {backupHistory.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No backups found. Create your first backup using the "Backup Now to OneDrive" button.
              </Typography>
            ) : (
              <List sx={{ maxHeight: 300, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                {backupHistory.map((backup, index) => (
                  <React.Fragment key={backup.timestamp}>
                    <ListItem>
                      <ListItemText
                        primary={formatTimestamp(backup.timestamp)}
                        secondary={
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Chip label={formatFileSize(backup.file_size)} size="small" />
                            <Chip label={`v${backup.version}`} size="small" variant="outlined" />
                            {backup.is_compressed && (
                              <Chip label="Compressed" size="small" color="primary" />
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton 
                          edge="end" 
                          aria-label="restore"
                          onClick={() => handleRestoreBackup(backup.timestamp)}
                          sx={{ mr: 1 }}
                        >
                          <RestoreIcon />
                        </IconButton>
                        <IconButton 
                          edge="end" 
                          aria-label="delete"
                          onClick={() => handleDeleteBackup(backup.timestamp)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                    {index < backupHistory.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Box>

          {/* Manual Restore */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>Manual Restore</Typography>
            <Button 
              variant="contained" 
              color="secondary" 
              onClick={handleRestore}
              disabled={isLoading}
              fullWidth
            >
              Restore from File
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BackupRestoreDialog; 