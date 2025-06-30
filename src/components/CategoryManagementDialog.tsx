import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { Edit, Delete, Check, Close } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';

interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense' | 'adjust' | 'transfer';
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
  const [newName, setNewName] = useState<string>('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const incomeCategories = categories
    .filter(c => c.type === 'income')
    .sort((a, b) => a.name.localeCompare(b.name));
  const expenseCategories = categories
    .filter(c => c.type === 'expense')
    .sort((a, b) => a.name.localeCompare(b.name));
  const adjustCategories = categories
    .filter(c => c.type === 'adjust')
    .sort((a, b) => a.name.localeCompare(b.name));

  const load = async () => {
    try {
      const result = await invoke<Category[]>('get_categories_full');
      setCategories(result);
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      const type = currentTab === 0 ? 'income' : 'expense';
      await invoke<Category[]>('add_category', { name: newName.trim(), categoryType: type });
      setNewName('');
      load(); 
      onChange();
    } catch (e) {
      console.error('Failed to add category:', e);
    }
  };

  const startEdit = (cat: Category) => {
    setEditId(cat.id);
    setEditName(cat.name);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName('');
  };

  const handleUpdate = async () => {
    if (editId == null || !editName.trim()) return;
    try {
      const type = currentTab === 0 ? 'income' : 'expense';
      await invoke<Category[]>('update_category', { id: editId, name: editName.trim(), categoryType: type });
      setEditId(null);
      setEditName('');
      load(); 
      onChange();
    } catch (e) {
      console.error('Failed to update category:', e);
    }
  };

  const openDeleteConfirm = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    
    try {
      console.log('Attempting to delete category:', categoryToDelete.id);
      const result = await invoke<Category[]>('delete_category', { id: categoryToDelete.id });
      console.log('Delete successful, new categories:', result);
      setCategories(result);
      onChange();
    } catch (e) {
      console.error('Failed to delete category:', e);
      alert('Failed to delete category. Please try again.');
    } finally {
      setDeleteConfirmOpen(false);
      setCategoryToDelete(null);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth={false}
      PaperProps={{
        sx: {
          width: '30vw',
          height: '80vh',
          maxHeight: '80vh',
          minWidth: '400px',
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
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(currentTab === 0 ? incomeCategories : expenseCategories)
                .filter(cat => cat.type !== 'adjust' && cat.type !== 'transfer')
                .map(cat => (
                <TableRow key={cat.id}>
                  <TableCell>
                    {editId === cat.id ? (
                      <TextField
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        size="small"
                      />
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
                        <IconButton size="small" onClick={cancelEdit}>
                          <Close />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton size="small" onClick={() => startEdit(cat)}>
                          <Edit />
                        </IconButton>
                        <IconButton size="small" onClick={() => openDeleteConfirm(cat)}>
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