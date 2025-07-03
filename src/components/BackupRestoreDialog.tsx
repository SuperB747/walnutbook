import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import { invoke } from '@tauri-apps/api/core';
import { desktopDir } from '@tauri-apps/api/path';

interface BackupRestoreDialogProps {
  open: boolean;
  onClose: () => void;
  onRestore?: () => void;
}

const BackupRestoreDialog: React.FC<BackupRestoreDialogProps> = ({ open, onClose, onRestore }) => {
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);

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
      console.log('Could not get OneDrive path from environment:', error);
    }

    // Fallback to desktop if OneDrive not found
    return await desktopDir();
  };

  const handleBackup = async () => {
    setStatus({ message: 'Backing up to OneDrive...', error: false });
    try {
      // Determine OneDrive path
      const backupDir = await findOneDrivePath();
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const savePath = `${backupDir}/walnutbook_backup_${timestamp}.db`;
      // Invoke Rust to copy the DB file to OneDrive
      await invoke('backup_database', { savePath });
      setStatus({ message: `Backup saved to OneDrive/WalnutBook_Backups: ${savePath}`, error: false });
    } catch (err) {
      console.error('Backup failed:', err);
      setStatus({ message: 'Backup failed: ' + String(err), error: true });
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
        const buffer = await file.arrayBuffer();
        await invoke('import_database', { data: Array.from(new Uint8Array(buffer)) });
        setStatus({ message: 'Restore successful!', error: false });
        onRestore?.();
        // 복원 완료 후 즉시 다이얼로그 닫기
        setTimeout(() => {
          handleClose();
        }, 1000);
      } catch (e) {
        console.error('Restore failed:', e);
        setStatus({ message: 'Restore failed: ' + String(e), error: true });
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

  const handleClose = () => {
    setStatus(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Backup & Restore Database</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Button variant="contained" onClick={handleBackup}>
            Backup Database
          </Button>
          <Button variant="contained" onClick={handleRestore}>
            Restore Database
          </Button>
          {status && (
            <Typography color={status.error ? 'error' : 'text.primary'}>
              {status.message}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BackupRestoreDialog; 