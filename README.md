# WalnutBook - Personal Budget Management Application

A comprehensive personal budget management application built with Tauri, React, and TypeScript.

## Features

### 📊 Financial Management
- **Transaction Tracking**: Record income, expenses, transfers, and adjustments
- **Account Management**: Support for Checking, Savings, and Credit accounts
- **Category Management**: Customizable expense and income categories
- **Budget Planning**: Set monthly budgets by category with overage alerts

### 📈 Advanced Reporting
- **Monthly Reports**: Income vs expense analysis with category breakdowns
- **Yearly Reports**: Comprehensive yearly analysis with monthly trends
- **Account Balance Tracking**: Real-time balance monitoring with historical data
- **Category Monthly Breakdown**: Detailed category-wise monthly analysis
- **Account Balance Changes**: Visual tracking of Checking and Savings account balances

### 🔄 Import/Export
- **CSV Import**: Import transactions from various bank formats
- **Multiple Bank Support**: Pre-configured importers for major banks
- **Data Export**: Export transactions and reports

### 💾 Backup & Restore System
- **OneDrive Integration**: Automatic backup to OneDrive
- **Backup History**: Track and manage backup versions
- **Auto Backup**: Scheduled automatic backups with cleanup
- **Manual Backup**: On-demand backup creation
- **Safe Restore**: Verified database restoration with rollback protection

## Installation & Development

### Prerequisites
- Node.js (v16 or higher)
- Rust (latest stable)
- Tauri CLI

### Development Setup
```bash
# Clone the repository
git clone <repository-url>
cd walnutbook

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

#### Development Build
```bash
npm run tauri:dev
```

#### Production Build
```bash
# Build for current platform
npm run package

# Build for specific platform
npm run tauri:build
```

## Data Storage & Backup

### Local Database
- **Location**: OS standard data directory
  - Windows: `%APPDATA%/WalnutBook/walnutbook.db`
  - macOS: `~/Library/Application Support/WalnutBook/walnutbook.db`
  - Linux: `~/.local/share/WalnutBook/walnutbook.db`

### OneDrive Backup System
- **Automatic Backups**: Stored in `OneDrive/WalnutBook_Backups/`
- **Backup Retention**: Keeps last 10 automatic backups
- **File Naming**: `walnutbook_auto_backup_YYYYMMDD_HHMMSS.db`
- **Backup History**: View and manage backup versions in the app

### Backup Features
- **Data Integrity Verification**: Ensures database integrity before backup
- **Safe Restore**: Automatic rollback if restore fails
- **Version Tracking**: Backup metadata with timestamps and file sizes
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Application Architecture

### Frontend (React + TypeScript)
- **UI Framework**: Material-UI (MUI)
- **Charts**: Chart.js with React wrapper
- **Routing**: React Router DOM
- **State Management**: React hooks and context

### Backend (Rust + Tauri)
- **Database**: SQLite with Rusqlite
- **File System**: Cross-platform file operations
- **Security**: Tauri's built-in security model

### Key Components
- **AccountsPage**: Account management and balance tracking
- **TransactionsPage**: Transaction entry and management
- **BudgetsPage**: Budget planning and monitoring
- **ReportsPage**: Comprehensive financial reporting
- **BackupRestoreDialog**: Advanced backup and restore functionality

## Database Schema

### Core Tables
- **accounts**: Account information and balances
- **transactions**: All financial transactions
- **categories**: Expense and income categories
- **budgets**: Monthly budget allocations
- **account_import_settings**: CSV import configurations

### Data Relationships
- Transactions link to accounts and categories
- Budgets link to categories and months
- Import settings link to accounts

## Security & Data Protection

### Local Data Security
- **Encrypted Storage**: Database stored in secure OS directories
- **Access Control**: OS-level file permissions
- **Data Integrity**: SQLite integrity checks

### Backup Security
- **OneDrive Encryption**: Leverages OneDrive's built-in encryption
- **Backup Verification**: Integrity checks before and after restore
- **Safe Rollback**: Automatic restoration of previous state on failure

## Deployment & Distribution

### Packaging
The app is packaged using Tauri, which creates native executables:
- **Windows**: `.exe` installer
- **macOS**: `.dmg` or `.app`
- **Linux**: `.AppImage` or `.deb`

### Distribution
- **Self-contained**: No external dependencies required
- **Cross-platform**: Single codebase for all platforms
- **Auto-updates**: Built-in update mechanism (configurable)

## Troubleshooting

### Common Issues

#### Backup Issues
- **OneDrive Not Found**: App falls back to Desktop directory
- **Permission Errors**: Ensure OneDrive folder is accessible
- **Backup Failures**: Check available disk space

#### Database Issues
- **Corruption**: Use restore from backup
- **Missing Tables**: Run database reset from app menu
- **Performance**: Large databases may slow down (consider archiving old data)

### Support
For issues and feature requests, please check the project documentation or create an issue in the repository.

## License

This project is licensed under the ISC License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**WalnutBook** - Your personal financial companion for better money management.