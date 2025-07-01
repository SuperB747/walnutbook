import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  SelectChangeEvent,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { CategoryRule } from '../db';
import { invoke } from '@tauri-apps/api/core';

export interface AutoCategoryRulesProps {
  open: boolean;
  onClose: () => void;
  rules: CategoryRule[];
  onRulesChange: () => Promise<void>;
}

const AutoCategoryRules: React.FC<AutoCategoryRulesProps> = ({
  open,
  onClose,
  rules,
  onRulesChange,
}) => {
  const [newPattern, setNewPattern] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const handleAddRule = async () => {
    if (!newPattern || !newCategory) return;

    try {
      await invoke('add_category_rule', {
        pattern: newPattern,
        category: newCategory,
      });
      setNewPattern('');
      setNewCategory('');
      await onRulesChange();
    } catch (error) {
      console.error('Failed to add category rule:', error);
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await invoke('delete_category_rule', { id });
      await onRulesChange();
    } catch (error) {
      console.error('Failed to delete category rule:', error);
    }
  };

  const handlePatternChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPattern(e.target.value);
  };

  const handleCategoryChange = (e: SelectChangeEvent) => {
    setNewCategory(e.target.value);
  };

  const categories = Array.from(new Set(rules.map(rule => rule.category))).sort();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Auto-Category Rules</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Add New Rule
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Pattern"
              value={newPattern}
              onChange={handlePatternChange}
              fullWidth
              size="small"
              helperText="Enter text to match in transaction descriptions"
            />
            <FormControl fullWidth size="small">
              <InputLabel>Category</InputLabel>
              <Select
                value={newCategory}
                onChange={handleCategoryChange}
                label="Category"
              >
                {categories.map(category => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={handleAddRule}
              disabled={!newPattern || !newCategory}
              startIcon={<AddIcon />}
            >
              Add
            </Button>
          </Box>
        </Box>

        <Typography variant="subtitle2" gutterBottom>
          Existing Rules
        </Typography>
        <List>
          {rules.map(rule => (
            <ListItem
              key={rule.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemText
                primary={rule.pattern}
                secondary={rule.category}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AutoCategoryRules; 