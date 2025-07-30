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
  TableContainer,
} from '@mui/material';
import { Edit, Delete, Check, Close } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { CategoryType, Category } from '../db';

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

  const incomeCategories = useMemo(() => categories.filter(c => c.type === 'Income').sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  const expenseCategories = useMemo(() => categories.filter(c => c.type === 'Expense').sort((a, b) => a.name.localeCompare(b.name)), [categories]);

  useEffect(() => {
    if (open) {
      loadCategories();
    }
  }, [open]);

  const loadCategories = async () => {
    try {
      const cats = await invoke<Category[]>('get_categories_full');
      setCategories(cats);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      const categoryType = currentTab === 0 ? 'Income' : 'Expense';
      const result = await invoke<Category[]>('add_category', {
        name: newName.trim(),
        categoryType,
        isReimbursement: isReimbursement,
        reimbursementTargetCategoryId: isReimbursement ? reimbursementTargetCategoryId : null,
      });
      setNewName('');
      setIsReimbursement(false);
      setReimbursementTargetCategoryId('');
      setCategories(result);
      onChange();
    } catch (error) {
      console.error('Failed to add category:', error);
    }
  };

  const handleUpdate = async () => {
    if (editId == null || !editName.trim()) return;
    

    
    try {
      const categoryType = currentTab === 0 ? 'Income' : 'Expense';
      const result = await invoke<Category[]>('update_category', {
        id: editId,
        name: editName.trim(),
        categoryType,
        isReimbursement: editIsReimbursement,
        reimbursementTargetCategoryId: editIsReimbursement ? editReimbursementTargetCategoryId : null,
      });
      

      
      setEditId(null);
      setEditName('');
      setEditIsReimbursement(false);
      setEditReimbursementTargetCategoryId('');
      setCategories(result);
      onChange();
    } catch (error) {
      console.error('Failed to update category:', error);

    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      const result = await invoke<Category[]>('delete_category', { id: categoryToDelete.id });
      setCategories(result);
      onChange();
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
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
          <FormControlLabel
            control={
              <Checkbox
                checked={isReimbursement}
                onChange={(e) => setIsReimbursement(e.target.checked)}
              />
            }
            label="Reimbursement"
          />
          {isReimbursement && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="reim-target-label">
                {currentTab === 0 ? 'Target Expense Category' : 'Target Income Category'}
              </InputLabel>
              <Select
                labelId="reim-target-label"
                value={reimbursementTargetCategoryId}
                label={currentTab === 0 ? 'Target Expense Category' : 'Target Income Category'}
                onChange={(e) => setReimbursementTargetCategoryId(e.target.value as number)}
              >
                {(currentTab === 0 ? expenseCategories : incomeCategories).map(c => (
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
                .filter(cat => cat.type !== 'Adjust' && cat.type !== 'Transfer')
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
                          <FormControlLabel
                            control={<Checkbox checked={editIsReimbursement} onChange={e => setEditIsReimbursement(e.target.checked)} />}
                            label="Reimbursement"
                          />
                          {editIsReimbursement && (
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                              <InputLabel id="edit-reim-target-label">Target</InputLabel>
                              <Select
                                labelId="edit-reim-target-label"
                                value={editReimbursementTargetCategoryId}
                                label="Target"
                                onChange={e => setEditReimbursementTargetCategoryId(e.target.value as number)}
                              >
                                {(currentTab === 0 ? expenseCategories : incomeCategories).map(ec => (
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
                    {cat.type === 'Income' ? 'Income' : 'Expense'}
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
        <Button
          onClick={async () => {
            try {
              const result = await invoke<string>('test_onedrive_path');
              console.log('OneDrive Path Test Result:', result);
              alert('OneDrive path test completed. Check console for details.');
            } catch (error) {
              console.error('OneDrive Path Test Error:', error);
              alert('OneDrive path test failed: ' + error);
            }
          }}
          color="info"
          variant="outlined"
        >
          Test OneDrive Path
        </Button>
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