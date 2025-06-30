import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
} from '@mui/material';
import { Edit, Delete } from '@mui/icons-material';
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
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editType, setEditType] = useState<'income' | 'expense'>('expense');
  const [newName, setNewName] = useState<string>('');
  const [newType, setNewType] = useState<'income' | 'expense'>('expense');

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
    await invoke<Category[]>('add_category', { name: newName.trim(), category_type: newType });
    setNewName('');
    setNewType('expense');
    load(); onChange();
  };

  const startEdit = (cat: Category) => {
    setEditId(cat.id);
    setEditName(cat.name);
    setEditType(cat.type);
  };

  const handleUpdate = async () => {
    if (editId == null || !editName.trim()) return;
    await invoke<Category[]>('update_category', { id: editId, name: editName.trim(), category_type: editType });
    setEditId(null);
    setEditName('');
    setEditType('expense');
    load(); onChange();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this category?')) return;
    await invoke<Category[]>('delete_category', { id });
    load(); onChange();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage Categories</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mt: 2, mb: 2, alignItems: 'flex-end' }}>
          <TextField
            label="New Category"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            size="small"
            fullWidth
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={newType}
              label="Type"
              onChange={e => setNewType(e.target.value as 'income' | 'expense')}
            >
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="income">Income</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" onClick={handleAdd}>Add</Button>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {categories.map(cat => (
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
                    <IconButton size="small" onClick={handleUpdate}><Edit /></IconButton>
                  ) : (
                    <IconButton size="small" onClick={() => startEdit(cat)}><Edit /></IconButton>
                  )}
                  <IconButton size="small" onClick={() => handleDelete(cat.id)}><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CategoryManagementDialog; 