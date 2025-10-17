import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  CloudSync,
  CloudOff,
  CheckCircle,
  Error,
  Warning,
  Refresh,
  Schedule,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';

interface SyncStatus {
  is_enabled: boolean;
  last_sync: string | null;
  sync_in_progress: boolean;
  error_message: string | null;
  error_type: string | null;
  onedrive_available: boolean;
  retry_count: number;
  last_error_time: string | null;
}

interface DatabaseInfo {
  last_modified: number;
  file_size: number;
  record_count: number;
}

interface SyncStatusHeaderProps {
  onSnackbar?: (message: string, severity: 'success' | 'error' | 'warning' | 'info') => void;
}

const SyncStatusHeader: React.FC<SyncStatusHeaderProps> = ({ onSnackbar }) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSyncStatus = async () => {
    try {
      const status = await invoke<SyncStatus>('get_sync_status');
      setSyncStatus(status);
    } catch (err) {
      console.error('Failed to load sync status:', err);
    }
  };

  const loadDatabaseInfo = async () => {
    try {
      const info = await invoke<DatabaseInfo>('get_database_info');
      setDbInfo(info);
    } catch (err) {
      console.error('Failed to load database info:', err);
    }
  };

  const manualSync = async () => {
    try {
      await invoke('manual_sync');
      await loadSyncStatus();
      if (onSnackbar) {
        onSnackbar('Sync completed successfully!', 'success');
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
      if (onSnackbar) {
        onSnackbar('Manual sync failed: ' + String(err), 'error');
      }
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadSyncStatus(), loadDatabaseInfo()]);
      setLoading(false);
    };
    
    loadData();
    
    // Refresh status every 30 seconds
    const interval = setInterval(loadSyncStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    if (!syncStatus) return <CloudOff />;
    
    if (syncStatus.sync_in_progress) {
      return <CircularProgress size={16} />;
    }
    
    if (syncStatus.error_message) {
      return <Error color="error" />;
    }
    
    if (syncStatus.onedrive_available && syncStatus.is_enabled) {
      return <CheckCircle color="success" />;
    }
    
    return <Warning color="warning" />;
  };

  const getStatusColor = () => {
    if (!syncStatus) return 'default';
    
    if (syncStatus.sync_in_progress) return 'info';
    if (syncStatus.error_message) return 'error';
    if (syncStatus.onedrive_available && syncStatus.is_enabled) return 'success';
    return 'warning';
  };

  const getStatusText = () => {
    if (!syncStatus) return 'Checking sync status...';
    
    if (syncStatus.sync_in_progress) return 'Syncing...';
    if (syncStatus.error_message) return 'Sync Error';
    if (syncStatus.onedrive_available && syncStatus.is_enabled) return 'OneDrive Sync Active';
    if (syncStatus.onedrive_available) return 'OneDrive Available (Sync Disabled)';
    return 'OneDrive Not Available';
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    
    const date = new Date(parseInt(timestamp) * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Box display="flex" alignItems="center" gap={1}>
        <CircularProgress size={16} />
        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box display="flex" alignItems="center" gap={2}>
      {/* Sync Status */}
      <Box display="flex" alignItems="center" gap={1}>
        <Chip
          icon={getStatusIcon()}
          label={getStatusText()}
          color={getStatusColor() as any}
          size="small"
          variant="outlined"
          sx={{
            backgroundColor: 'transparent',
            borderColor: syncStatus?.onedrive_available && syncStatus?.is_enabled 
              ? 'rgba(76, 175, 80, 0.9)' // 성공 상태 - 밝은 초록색 테두리
              : syncStatus?.sync_in_progress 
                ? 'rgba(33, 150, 243, 0.9)' // 진행 중 - 밝은 파란색 테두리
                : syncStatus?.error_message 
                  ? 'rgba(244, 67, 54, 0.9)' // 에러 - 밝은 빨간색 테두리
                  : 'rgba(255, 152, 0, 0.9)', // 경고 - 밝은 주황색 테두리
            color: syncStatus?.onedrive_available && syncStatus?.is_enabled 
              ? 'rgba(76, 175, 80, 1)' // 성공 상태 - 밝은 초록색 텍스트
              : syncStatus?.sync_in_progress 
                ? 'rgba(33, 150, 243, 1)' // 진행 중 - 밝은 파란색 텍스트
                : syncStatus?.error_message 
                  ? 'rgba(244, 67, 54, 1)' // 에러 - 밝은 빨간색 텍스트
                  : 'rgba(255, 152, 0, 1)', // 경고 - 밝은 주황색 텍스트
            fontWeight: 'bold',
            fontSize: '0.75rem',
            borderWidth: '2px',
            '& .MuiChip-label': {
              color: syncStatus?.onedrive_available && syncStatus?.is_enabled 
                ? 'rgba(76, 175, 80, 1)'
                : syncStatus?.sync_in_progress 
                  ? 'rgba(33, 150, 243, 1)'
                  : syncStatus?.error_message 
                    ? 'rgba(244, 67, 54, 1)'
                    : 'rgba(255, 152, 0, 1)',
              fontWeight: 'bold',
            },
            '& .MuiChip-icon': {
              color: syncStatus?.onedrive_available && syncStatus?.is_enabled 
                ? 'rgba(76, 175, 80, 1)'
                : syncStatus?.sync_in_progress 
                  ? 'rgba(33, 150, 243, 1)'
                  : syncStatus?.error_message 
                    ? 'rgba(244, 67, 54, 1)'
                    : 'rgba(255, 152, 0, 1)',
            }
          }}
        />
        
        {syncStatus?.last_sync && (
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            Last sync: {formatLastSync(syncStatus.last_sync)}
          </Typography>
        )}
        
        {syncStatus?.sync_in_progress && (
          <LinearProgress 
            sx={{ width: 100, height: 4 }} 
            color="primary"
          />
        )}
      </Box>

      {/* Database Info */}
      {dbInfo && (
        <Box display="flex" alignItems="center" gap={1}>
          <Schedule fontSize="small" sx={{ color: 'rgba(255, 255, 255, 0.8)' }} />
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            DB: {new Date(dbInfo.last_modified * 1000).toLocaleString()}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            ({dbInfo.record_count} records)
          </Typography>
        </Box>
      )}

      {/* Manual Sync Button */}
      <Tooltip title="Manual Sync">
        <IconButton 
          size="small" 
          onClick={manualSync}
          disabled={syncStatus?.sync_in_progress}
          sx={{ color: 'rgba(255, 255, 255, 0.8)' }}
        >
          <Refresh fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Error Display */}
      {syncStatus?.error_message && (
        <Tooltip title={syncStatus.error_message}>
          <IconButton size="small" color="error">
            <Error fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default SyncStatusHeader;
