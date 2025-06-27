interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
  created_at: string;
}

interface Transaction {
  id: number;
  account_id: number;
  date: string;
  payee: string;
  category: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  notes?: string;
  status: 'cleared' | 'uncleared' | 'reconciled';
  created_at: string;
}

interface Budget {
  id: number;
  category: string;
  amount: number;
  month: string;
  notes?: string;
}

interface ScheduledTransaction {
  id: number;
  account_id: number;
  payee: string;
  category: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  frequency: string;
  next_date: string;
  notes?: string;
}

interface Window {
  api: {
    // Account operations
    getAccounts: () => Promise<Account[]>;
    createAccount: (account: Partial<Account>) => Promise<Account>;

    // Transaction operations
    getTransactions: (accountId?: number) => Promise<Transaction[]>;
    createTransaction: (transaction: Partial<Transaction>) => Promise<Transaction>;

    // Budget operations
    getBudgets: (month: string) => Promise<Budget[]>;
    setBudget: (budget: Partial<Budget>) => Promise<void>;

    // Scheduled Transaction operations
    getScheduledTransactions: () => Promise<ScheduledTransaction[]>;
    createScheduledTransaction: (scheduled: Partial<ScheduledTransaction>) => Promise<void>;

    // Report operations
    getSpendingByCategory: (startDate: string, endDate: string) => Promise<any[]>;
    getIncomeVsExpenses: (startDate: string, endDate: string) => Promise<any>;
    getNetWorthHistory: (startDate: string, endDate: string) => Promise<any[]>;
  };
  electron: {
    ipcRenderer: {
      invoke(channel: string, ...args: any[]): Promise<any>;
    };
  };
}

declare module 'lowdb/adapters/FileSync' {
  import { AdapterSync } from 'lowdb';
  export default class FileSync<T> implements AdapterSync<T> {
    constructor(source: string);
    read(): T;
    write(data: T): void;
  }
}

declare global {
  interface Window {
    electron: {
      invoke(channel: string, ...args: any[]): Promise<any>;
    };
  }
}

declare module 'qif2json' {
  interface QIFTransaction {
    date: Date;
    amount: number;
    payee: string;
    category?: string;
    memo?: string;
  }

  interface QIFData {
    transactions: QIFTransaction[];
  }

  export function parse(content: string): QIFData;
}

declare module 'ofx' {
  interface OFXTransaction {
    DTPOSTED: string;
    TRNAMT: string;
    NAME?: string;
    MEMO?: string;
  }

  interface OFXData {
    OFX: {
      BANKMSGSRSV1: {
        STMTTRNRS: {
          STMTRS: {
            BANKTRANLIST: {
              STMTTRN: OFXTransaction[];
            };
          };
        };
      };
    };
  }

  export function parse(content: string): OFXData;
}

interface CategoryRule {
  id: number;
  pattern: string;
  category: string;
  created_at: string;
}

interface Budget {
  id: number;
  category: string;
  amount: number;
  month: string;
  notes?: string;
  created_at: string;
}

export {}; 