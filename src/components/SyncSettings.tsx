import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Slider,
  TextField,
} from '@mui/material';
import {
  CloudSync,
  CloudOff,
  CheckCircle,
  Error,
  Warning,
  Refresh,
  Download,
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

interface SyncConfig {
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  onedrive_path: string | null;
  fallback_to_local: boolean;
}

const SyncSettings: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSyncStatus = async () => {
    try {
      const status = await invoke<SyncStatus>('get_sync_status');
      setSyncStatus(status);
    } catch (err) {
      console.error('Failed to load sync status:', err);
    }
  };

  const loadSyncConfig = async () => {
    try {
      const config = await invoke<SyncConfig>('get_sync_config');
      setSyncConfig(config);
    } catch (err) {
      console.error('Failed to load sync config:', err);
    }
  };

  const updateSyncConfig = async (newConfig: Partial<SyncConfig>) => {
    if (!syncConfig) return;
    
    try {
      const updatedConfig = { ...syncConfig, ...newConfig };
      await invoke('update_sync_config', { config: updatedConfig });
      setSyncConfig(updatedConfig);
    } catch (err) {
      console.error('Failed to update sync config:', err);
      setError('Failed to update sync configuration');
    }
  };

  const manualSync = async () => {
    try {
      await invoke('manual_sync');
      await loadSyncStatus();
    } catch (err) {
      console.error('Manual sync failed:', err);
      setError('Manual sync failed');
    }
  };

  const loadFromOneDrive = async () => {
    try {
      await invoke('load_from_onedrive');
      await loadSyncStatus();
    } catch (err) {
      console.error('Load from OneDrive failed:', err);
      setError('Failed to load from OneDrive');
    }
  };

  const startAutoSync = async () => {
    try {
      await invoke('start_auto_sync');
      await loadSyncStatus();
    } catch (err) {
      console.error('Failed to start auto sync:', err);
      setError('Failed to start auto sync');
    }
  };

  const stopAutoSync = async () => {
    try {
      await invoke('stop_auto_sync');
      await loadSyncStatus();
    } catch (err) {
      console.error('Failed to stop auto sync:', err);
      setError('Failed to stop auto sync');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadSyncStatus(), loadSyncConfig()]);
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
      return <CircularProgress size={20} />;
    }
    
    if (syncStatus.error_message) {
      return <Error color="error" />;
    }
    
    if (syncStatus.onedrive_available) {
      return <CheckCircle color="success" />;
    }
    
    return <Warning color="warning" />;
  };

  const getStatusColor = () => {
    if (!syncStatus) return 'default';
    
    if (syncStatus.sync_in_progress) return 'info';
    if (syncStatus.error_message) return 'error';
    if (syncStatus.onedrive_available) return 'success';
    return 'warning';
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleString();
  };

  const formatLastError = (timestamp: string | null) => {
    if (!timestamp) return null;
    
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, margin: '0 auto', p: 2 }}>
      <Typography variant="h4" gutterBottom>
        <CloudSync sx={{ mr: 1, verticalAlign: 'middle' }} />
        OneDrive 동기화 설정
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Status Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h6">동기화 상태</Typography>
            <Chip
              icon={getStatusIcon()}
              label={
                syncStatus?.sync_in_progress ? '동기화 중...' :
                syncStatus?.error_message ? '오류' :
                syncStatus?.onedrive_available ? '정상' : 'OneDrive 없음'
              }
              color={getStatusColor() as any}
            />
          </Box>

          <Box display="flex" gap={2} flexWrap="wrap">
            <Box>
              <Typography variant="body2" color="text.secondary">
                마지막 동기화
              </Typography>
              <Typography variant="body1">
                {formatLastSync(syncStatus?.last_sync || null)}
              </Typography>
            </Box>

            {syncStatus?.error_message && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  마지막 오류
                </Typography>
                <Typography variant="body1" color="error">
                  {formatLastError(syncStatus.last_error_time || null)}
                </Typography>
              </Box>
            )}

            {syncStatus?.retry_count && syncStatus.retry_count > 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  재시도 횟수
                </Typography>
                <Typography variant="body1">
                  {syncStatus.retry_count}
                </Typography>
              </Box>
            )}
          </Box>

          {syncStatus?.error_message && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {syncStatus.error_message}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            동기화 설정
          </Typography>

          <Box display="flex" flexDirection="column" gap={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={syncConfig?.auto_sync_enabled || false}
                  onChange={(e) => updateSyncConfig({ auto_sync_enabled: e.target.checked })}
                />
              }
              label="자동 동기화 활성화"
            />

            <Box>
              <Typography gutterBottom>
                동기화 간격: {syncConfig?.sync_interval_minutes || 5}분
              </Typography>
              <Slider
                value={syncConfig?.sync_interval_minutes || 5}
                onChange={(_, value) => updateSyncConfig({ sync_interval_minutes: value as number })}
                min={1}
                max={60}
                step={1}
                marks={[
                  { value: 1, label: '1분' },
                  { value: 5, label: '5분' },
                  { value: 15, label: '15분' },
                  { value: 30, label: '30분' },
                  { value: 60, label: '1시간' },
                ]}
                valueLabelDisplay="auto"
              />
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={syncConfig?.fallback_to_local || false}
                  onChange={(e) => updateSyncConfig({ fallback_to_local: e.target.checked })}
                />
              }
              label="OneDrive 실패 시 로컬 저장소 사용"
            />
          </Box>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            동기화 작업
          </Typography>

          <Box display="flex" gap={2} flexWrap="wrap">
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={manualSync}
              disabled={syncStatus?.sync_in_progress}
            >
              지금 동기화
            </Button>

            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={loadFromOneDrive}
              disabled={syncStatus?.sync_in_progress}
            >
              OneDrive에서 로드
            </Button>

            {syncConfig?.auto_sync_enabled ? (
              <Button
                variant="outlined"
                color="warning"
                onClick={stopAutoSync}
              >
                자동 동기화 중지
              </Button>
            ) : (
              <Button
                variant="outlined"
                color="success"
                onClick={startAutoSync}
              >
                자동 동기화 시작
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default SyncSettings;
