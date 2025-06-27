import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import db from './db';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = async () => {
  try {
    // Initialize database
    await db.initDB();

    // Create the browser window.
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
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

ipcMain.handle('getAccount', async (_event, id: number) => {
  return await db.getAccount(id);
});

ipcMain.handle('createAccount', async (_event, account) => {
  return await db.createAccount(account);
});

ipcMain.handle('updateAccount', async (_event, account) => {
  await db.updateAccount(account);
});

ipcMain.handle('deleteAccount', async (_event, id: number) => {
  await db.deleteAccount(id);
});

// Transaction handlers
ipcMain.handle('getTransactions', async () => {
  return await db.getTransactions();
});

ipcMain.handle('getTransaction', async (_event, id: number) => {
  return await db.getTransaction(id);
});

ipcMain.handle('createTransaction', async (_event, transaction) => {
  return await db.createTransaction(transaction);
});

ipcMain.handle('updateTransaction', async (_event, transaction) => {
  await db.updateTransaction(transaction);
});

ipcMain.handle('deleteTransaction', async (_event, id: number) => {
  await db.deleteTransaction(id);
});

// Budget handlers
ipcMain.handle('getBudgets', async () => {
  return await db.getBudgets();
});

ipcMain.handle('getBudget', async (_event, id: number) => {
  return await db.getBudget(id);
});

ipcMain.handle('createBudget', async (_event, budget) => {
  return await db.createBudget(budget);
});

ipcMain.handle('updateBudget', async (_event, budget) => {
  await db.updateBudget(budget);
});

ipcMain.handle('deleteBudget', async (_event, id: number) => {
  await db.deleteBudget(id);
});

// Scheduled Transaction handlers
ipcMain.handle('getScheduledTransactions', async () => {
  return await db.getScheduledTransactions();
});

ipcMain.handle('getScheduledTransaction', async (_event, id: number) => {
  return await db.getScheduledTransaction(id);
});

ipcMain.handle('createScheduledTransaction', async (_event, transaction) => {
  return await db.createScheduledTransaction(transaction);
});

ipcMain.handle('updateScheduledTransaction', async (_event, transaction) => {
  await db.updateScheduledTransaction(transaction);
});

ipcMain.handle('deleteScheduledTransaction', async (_event, id: number) => {
  await db.deleteScheduledTransaction(id);
});

ipcMain.handle('executeScheduledTransaction', async (_event, transaction) => {
  await db.executeScheduledTransaction(transaction);
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
