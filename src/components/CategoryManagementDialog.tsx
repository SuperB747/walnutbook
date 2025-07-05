import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  IconButton,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { Edit, Delete, Check, Close } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';

interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense' | 'adjust' | 'transfer';
  is_reimbursement?: boolean;
  reimbursement_target_category_id?: number;
}

interface CategoryManagementDialogProps {
  open: boolean;
  onClose: () => void;
  onChange: () => void;
}

const CategoryManagementDialog: React.FC<CategoryManagementDialogProps> = ({ open, onClose, onChange }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentTab, setCurrentTab] = useState<number>(0);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editIsReimbursement, setEditIsReimbursement] = useState<boolean>(false);
  const [editReimbursementTargetCategoryId, setEditReimbursementTargetCategoryId] = useState<number | ''>('');
  const [newName, setNewName] = useState<string>('');
  const [isReimbursement, setIsReimbursement] = useState<boolean>(false);
  const [reimbursementTargetCategoryId, setReimbursementTargetCategoryId] = useState<number | ''>('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const incomeCategories = useMemo(() => categories.filter(c => c.type === 'income').sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  const expenseCategories = useMemo(() => categories.filter(c => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name)), [categories]);

  useEffect(() => {
    if (open) {
      invoke<Category[]>("get_categories_full").then(setCategories).catch(() => {});
    }
  }, [open]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      const type = currentTab === 0 ? 'income' : 'expense';
      await invoke<Category[]>('add_category', {
        name: newName.trim(),
        categoryType: type,
        isReimbursement: currentTab === 0 ? isReimbursement : false,
        reimbursementTargetCategoryId: currentTab === 0 && isReimbursement ? reimbursementTargetCategoryId : null,
      });
      setNewName('');
      setIsReimbursement(false);
      setReimbursementTargetCategoryId('');
      const result = await invoke<Category[]>("get_categories_full");
      setCategories(result);
      onChange();
    } catch {}
  };

  const handleUpdate = async () => {
    if (editId == null || !editName.trim()) return;
    try {
      const type = currentTab === 0 ? 'income' : 'expense';
      await invoke<Category[]>('update_category', {
        id: editId,
        name: editName.trim(),
        categoryType: type,
        isReimbursement: currentTab === 0 ? editIsReimbursement : false,
        reimbursementTargetCategoryId: currentTab === 0 && editIsReimbursement ? editReimbursementTargetCategoryId : null,
      });
      setEditId(null);
      setEditName('');
      setEditIsReimbursement(false);
      setEditReimbursementTargetCategoryId('');
      const result = await invoke<Category[]>("get_categories_full");
      setCategories(result);
      onChange();
    } catch {}
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      const result = await invoke<Category[]>('delete_category', { id: categoryToDelete.id });
      setCategories(result);
      onChange();
    } catch {}
    setDeleteConfirmOpen(false);
    setCategoryToDelete(null);
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth={false}
      PaperProps={{
        sx: {
          width: '50vw',
          height: '80vh',
          maxHeight: '80vh',
          minWidth: '600px',
          minHeight: '500px',
        }
      }}
    >
      <DialogTitle>Manage Categories</DialogTitle>
      <DialogContent>
        <Tabs
          value={currentTab}
          onChange={(_, newValue) => setCurrentTab(newValue)}
          sx={{ 
            mb: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
          variant="fullWidth"
        >
          <Tab 
            label={<span style={{ color: 'black', fontSize: '0.875rem', fontWeight: 'normal' }}>Income Categories</span>}
            sx={{ 
              minHeight: 48,
              py: 2,
            }}
          />
          <Tab 
            label={<span style={{ color: 'black', fontSize: '0.875rem', fontWeight: 'normal' }}>Expense Categories</span>}
            sx={{ 
              minHeight: 48,
              py: 2,
            }}
          />
        </Tabs>

        <Box sx={{ display: 'flex', gap: 1, mb: 2, px: 2, py: 2, mt: 1 }}>
          <TextField
            size="small"
            label="New Category Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            sx={{ 
              flexGrow: 1,
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'white'
              },
              '& .MuiFormLabel-root': {
                backgroundColor: 'white',
                px: 0.5,
              }
            }}
            variant="outlined"
          />
          {currentTab === 0 && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={isReimbursement}
                  onChange={(e) => setIsReimbursement(e.target.checked)}
                />
              }
              label="Reimbursement"
            />
          )}
          {currentTab === 0 && isReimbursement && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="reim-target-label">Target Expense Category</InputLabel>
              <Select
                labelId="reim-target-label"
                value={reimbursementTargetCategoryId}
                label="Target Expense Category"
                onChange={(e) => setReimbursementTargetCategoryId(e.target.value as number)}
              >
                {expenseCategories.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={!newName.trim()}
          >
            Add
          </Button>
        </Box>

        <Box sx={{ height: 480, overflowY: 'auto', mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '60%', minWidth: '300px' }}>Name</TableCell>
                <TableCell sx={{ width: '20%', minWidth: '100px' }}>Type</TableCell>
                <TableCell align="right" sx={{ width: '20%', minWidth: '120px' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(currentTab === 0 ? incomeCategories : expenseCategories)
                .filter(cat => cat.type !== 'adjust' && cat.type !== 'transfer')
                .map(cat => (
                <TableRow key={cat.id}>
                  <TableCell>
                    {editId === cat.id ? (
                      <>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap:1 }}>
                          <TextField
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            size="small"
                            sx={{ width: '40%' }}
                            variant="outlined"
                          />
                          {currentTab === 0 && (
                            <FormControlLabel
                              control={<Checkbox checked={editIsReimbursement} onChange={e => setEditIsReimbursement(e.target.checked)} />}
                              label="Reimbursement"
                            />
                          )}
                          {currentTab === 0 && editIsReimbursement && (
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                              <InputLabel id="edit-reim-target-label">Target</InputLabel>
                              <Select
                                labelId="edit-reim-target-label"
                                value={editReimbursementTargetCategoryId}
                                label="Target"
                                onChange={e => setEditReimbursementTargetCategoryId(e.target.value as number)}
                              >
                                {expenseCategories.map(ec => (
                                  <MenuItem key={ec.id} value={ec.id}>{ec.name}</MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          )}
                        </Box>
                      </>
                    ) : (
                      cat.name
                    )}
                  </TableCell>
                  <TableCell>
                    {cat.type === 'income' ? 'Income' : 'Expense'}
                  </TableCell>
                  <TableCell align="right">
                    {editId === cat.id ? (
                      <>
                        <IconButton size="small" onClick={handleUpdate}>
                          <Check />
                        </IconButton>
                        <IconButton size="small" onClick={() => { setEditId(null); setEditName(''); setEditIsReimbursement(false); setEditReimbursementTargetCategoryId(''); }}>
                          <Close />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton size="small" onClick={() => { setEditId(cat.id); setEditName(cat.name); setEditIsReimbursement(cat.is_reimbursement || false); setEditReimbursementTargetCategoryId(cat.reimbursement_target_category_id || ''); }}>
                          <Edit />
                        </IconButton>
                        <IconButton size="small" onClick={() => { setCategoryToDelete(cat); setDeleteConfirmOpen(true); }}>
                          <Delete />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the category "{categoryToDelete?.name}"?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default CategoryManagementDialog; 