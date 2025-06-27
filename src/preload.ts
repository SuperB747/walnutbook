import { contextBridge, ipcRenderer } from 'electron';
import {
  Account,
  Transaction,
  Budget,
  ScheduledTransaction,
} from './db';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    invoke: async (channel: string, ...args: any[]): Promise<any> => {
      const validChannels = [
        'getAccounts',
        'getAccount',
        'createAccount',
        'updateAccount',
        'deleteAccount',
        'getTransactions',
        'getTransaction',
        'createTransaction',
        'updateTransaction',
        'deleteTransaction',
        'getBudgets',
        'getBudget',
        'createBudget',
        'updateBudget',
        'deleteBudget',
        'getScheduledTransactions',
        'getScheduledTransaction',
        'createScheduledTransaction',
        'updateScheduledTransaction',
        'deleteScheduledTransaction',
        'executeScheduledTransaction',
      ];

      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }

      throw new Error(`Invalid IPC channel: ${channel}`);
    }
  }
);

declare global {
  interface Window {
    electron: {
      invoke(channel: 'getAccounts'): Promise<Account[]>;
      invoke(channel: 'getAccount', id: number): Promise<Account | undefined>;
      invoke(channel: 'createAccount', account: Omit<Account, 'id'>): Promise<Account>;
      invoke(channel: 'updateAccount', account: Account): Promise<void>;
      invoke(channel: 'deleteAccount', id: number): Promise<void>;

      invoke(channel: 'getTransactions'): Promise<Transaction[]>;
      invoke(channel: 'getTransaction', id: number): Promise<Transaction | undefined>;
      invoke(channel: 'createTransaction', transaction: Omit<Transaction, 'id'>): Promise<Transaction>;
      invoke(channel: 'updateTransaction', transaction: Transaction): Promise<void>;
      invoke(channel: 'deleteTransaction', id: number): Promise<void>;

      invoke(channel: 'getBudgets'): Promise<Budget[]>;
      invoke(channel: 'getBudget', id: number): Promise<Budget | undefined>;
      invoke(channel: 'createBudget', budget: Omit<Budget, 'id'>): Promise<Budget>;
      invoke(channel: 'updateBudget', budget: Budget): Promise<void>;
      invoke(channel: 'deleteBudget', id: number): Promise<void>;

      invoke(channel: 'getScheduledTransactions'): Promise<ScheduledTransaction[]>;
      invoke(channel: 'getScheduledTransaction', id: number): Promise<ScheduledTransaction | undefined>;
      invoke(channel: 'createScheduledTransaction', transaction: Omit<ScheduledTransaction, 'id'>): Promise<ScheduledTransaction>;
      invoke(channel: 'updateScheduledTransaction', transaction: ScheduledTransaction): Promise<void>;
      invoke(channel: 'deleteScheduledTransaction', id: number): Promise<void>;
      invoke(channel: 'executeScheduledTransaction', transaction: ScheduledTransaction): Promise<void>;
    };
  }
} 