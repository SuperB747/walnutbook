import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as db from './db';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = async () => {
  try {
    // Initialize database
    const dbPath = path.join(app.getPath('userData'), 'superbudget.db');
    db.connect(dbPath);
    await db.initializeDatabase();

    // Create the browser window.
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false, // Don't show until ready
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Maximize the window
    mainWindow.maximize();

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
      if (mainWindow) {
        mainWindow.show();
      }
    });

    // and load the index.html of the app.
    await mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Open the DevTools in development mode.
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
  } catch (error) {
    console.error('Failed to initialize application:', error);
    app.quit();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Account handlers
ipcMain.handle('getAccounts', async () => {
  return await db.getAccounts();
});

ipcMain.handle('createAccount', async (_event, account) => {
  await db.addAccount(account);
  return await db.getAccounts();
});

ipcMain.handle('updateAccount', async (_event, account) => {
  await db.updateAccount(account);
  return await db.getAccounts();
});

ipcMain.handle('deleteAccount', async (_event, id: number) => {
  await db.deleteAccount(id);
  return await db.getAccounts();
});

// Transaction handlers
ipcMain.handle('getTransactions', async () => {
  return await db.getTransactions();
});

ipcMain.handle('createTransaction', async (_event, transaction) => {
  await db.addTransaction(transaction);
  return await db.getTransactions();
});

ipcMain.handle('updateTransaction', async (_event, transaction) => {
  await db.updateTransaction(transaction);
  return await db.getTransactions();
});

ipcMain.handle('deleteTransaction', async (_event, id: number) => {
  await db.deleteTransaction(id);
  return await db.getTransactions();
});

// Category rules handlers
ipcMain.handle('getCategoryRules', async () => {
  return await db.getCategoryRules();
});

ipcMain.handle('addCategoryRule', async (_event, rule) => {
  await db.addCategoryRule(rule);
  return await db.getCategoryRules();
});

ipcMain.handle('deleteCategoryRule', async (_event, id: number) => {
  await db.deleteCategoryRule(id);
  return await db.getCategoryRules();
});

ipcMain.handle('findMatchingCategory', async (_event, payee: string) => {
  return await db.findMatchingCategory(payee);
});

// Bulk operations handlers
ipcMain.handle('bulkUpdateTransactions', async (_event, updates) => {
  await db.bulkUpdateTransactions(updates);
  return await db.getTransactions();
});

ipcMain.handle('importTransactions', async (_event, transactions) => {
  await db.importTransactions(transactions);
  return await db.getTransactions();
});

// Budget handlers
ipcMain.handle('getBudgets', async (_event, month?: string) => {
  return await db.getBudgets(month);
});

ipcMain.handle('addBudget', async (_event, budget) => {
  await db.addBudget(budget);
  return await db.getBudgets(budget.month);
});

ipcMain.handle('updateBudget', async (_event, budget) => {
  await db.updateBudget(budget);
  return await db.getBudgets(budget.month);
});

ipcMain.handle('deleteBudget', async (_event, id: number) => {
  const budget = (await db.getBudgets()).find(b => b.id === id);
  if (budget) {
    await db.deleteBudget(id);
    return await db.getBudgets(budget.month);
  }
  return [];
});

// Add handler to fetch categories
ipcMain.handle('getCategories', async () => {
  return await db.getCategories();
});

// Report handlers
ipcMain.handle('getSpendingByCategory', async (_event, startDate, endDate) => {
  return await db.getSpendingByCategory(startDate, endDate);
});

ipcMain.handle('getIncomeVsExpenses', async (_event, startDate, endDate) => {
  return await db.getIncomeVsExpenses(startDate, endDate);
});

ipcMain.handle('getNetWorthHistory', async (_event, startDate, endDate) => {
  return await db.getNetWorthHistory(startDate, endDate);
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
