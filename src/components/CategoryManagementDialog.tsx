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
  type: 'income' | 'expense';
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
  const [editType, setEditType] = useState<'income' | 'expense'>('expense');
  const [newName, setNewName] = useState<string>('');
  const [newType, setNewType] = useState<'income' | 'expense'>('expense');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  useEffect(() => {
    setNewType(currentTab === 0 ? 'income' : 'expense');
  }, [currentTab]);

  const incomeCategories = categories
    .filter(c => c.type === 'income')
    .sort((a, b) => a.name.localeCompare(b.name));
  const expenseCategories = categories
    .filter(c => c.type === 'expense')
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
      await invoke<Category[]>('add_category', { name: newName.trim(), categoryType: newType });
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
    setEditType(cat.type);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName('');
    setEditType('expense');
  };

  const handleUpdate = async () => {
    if (editId == null || !editName.trim()) return;
    try {
      await invoke<Category[]>('update_category', { id: editId, name: editName.trim(), categoryType: editType });
      setEditId(null);
      setEditName('');
      setEditType('expense');
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
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Manage {currentTab === 0 ? 'Income' : 'Expense'} Categories
        </DialogTitle>
        <DialogContent>
          <Tabs
            value={currentTab}
            onChange={(_e, v) => setCurrentTab(v)}
            textColor="primary"
            indicatorColor="primary"
            centered
          >
            <Tab 
              label="Income" 
              sx={{ 
                color: 'text.secondary',
                '&.Mui-selected': {
                  color: 'primary.main'
                }
              }} 
            />
            <Tab 
              label="Expense" 
              sx={{ 
                color: 'text.secondary',
                '&.Mui-selected': {
                  color: 'primary.main'
                }
              }} 
            />
          </Tabs>
          <Box sx={{ display: 'flex', gap: 1, mt: 2, mb: 1, alignItems: 'center' }}>
            <TextField
              label={`New ${currentTab === 0 ? 'Income' : 'Expense'} Category`}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              size="small"
              fullWidth
              sx={{
                '& .MuiFormLabel-root': {
                  backgroundColor: 'background.paper',
                  px: 0.5,
                }
              }}
            />
            <Button variant="contained" onClick={handleAdd}>Add</Button>
          </Box>
          <Box sx={{ height: 360, overflowY: 'auto', mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(currentTab === 0 ? incomeCategories : expenseCategories).map(cat => (
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
                      {editId === cat.id ? (
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                          <InputLabel>Type</InputLabel>
                          <Select
                            value={editType}
                            label="Type"
                            onChange={e => setEditType(e.target.value as 'income' | 'expense')}
                          >
                            <MenuItem value="expense">Expense</MenuItem>
                            <MenuItem value="income">Income</MenuItem>
                          </Select>
                        </FormControl>
                      ) : (
                        cat.type === 'income' ? 'Income' : 'Expense'
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {editId === cat.id ? (
                        <>
                          <IconButton size="small" onClick={handleUpdate} color="primary">
                            <Check />
                          </IconButton>
                          <IconButton size="small" onClick={cancelEdit} color="error">
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
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Category</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the category "{categoryToDelete?.name}"?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CategoryManagementDialog; 