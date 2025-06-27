import { contextBridge, ipcRenderer } from 'electron';

// Define valid channels for IPC
const validChannels = [
  'getAccounts',
  'createAccount',
  'updateAccount',
  'deleteAccount',
  'getTransactions',
  'createTransaction',
  'updateTransaction',
  'deleteTransaction',
  'bulkUpdateTransactions',
  'getCategoryRules',
  'addCategoryRule',
  'deleteCategoryRule',
  'importTransactions',
  'exportTransactions',
  'getBudgets',
  'addBudget',
  'updateBudget',
  'deleteBudget',
  'getCategories',
  'findMatchingCategory',
] as const;

const api = {
  invoke: (channel: string, ...args: any[]): Promise<any> => {
    if (validChannels.includes(channel as any)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Invalid channel: ${channel}`);
  },
};

contextBridge.exposeInMainWorld('electron', api); 