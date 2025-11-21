# EPak Fix Tool

A cross-platform tool for fixing corrupted/pending EPaks. Available for both Mac/Linux (Bash) and Windows (PowerShell).

## 🚀 Choose Your Version

### 🍎 Mac / Linux Users
Use the **main.sh** script in the root directory.

```bash
./main.sh
```

📖 [Mac/Linux Documentation](#maclinux-version)

### 🪟 Windows Users
Use the **windows** folder contents.

```powershell
cd windows
.\EPak-Fix-Tool.bat
```

📖 [Windows Documentation](windows/README.md)

---

## Mac/Linux Version

### Quick Start

```bash
# Make executable (first time only)
chmod +x main.sh

# Run the tool
./main.sh
```

### Features

✅ Interactive EPak fixing  
✅ Batch processing from CSV  
✅ Credential management  
✅ Manual database operations  
✅ Corruption testing mode  
✅ Automatic rollback script generation  
✅ Multi-document EPak support  

### Usage

```bash
# Normal operation
./main.sh

# Batch process from CSV
./main.sh --batch epaks_to_fix.csv

# Manage credentials
./main.sh --config

# Reset credentials
./main.sh --reset

# Show help
./main.sh --help
```

### Requirements

- Bash 4.0 or later
- MySQL client (`mysql` command-line tool)
- Database access credentials

### Credential Management

Credentials are loaded in this priority order:

1. **Environment variables**
   ```bash
   export EPAK_DB_HOST="your-host"
   export EPAK_DB_USER="your-user"
   export EPAK_DB_PASS="your-password"
   export EPAK_DB_NAME="msb"
   ./main.sh
   ```

2. **Config file** (`~/.epak-config`)
   - Automatically created when you save credentials
   - Secured with 600 permissions

3. **MySQL config** (`~/.my.cnf`)
   - Uses existing MySQL client configuration

4. **Interactive prompt**
   - Asks for credentials if none found

### Batch Processing

Create a CSV or TSV file with columns:
- `epak_id`
- `operation_type`
- `sql_statement`

**Excel/Google Sheets method:**
1. Create spreadsheet with 3 columns
2. Save As → Tab Delimited Text (.txt or .tsv)
3. Run: `./main.sh --batch your-file.txt`

**Manual CSV method:**
```csv
epak_id|operation_type|sql_statement
1513469|UPDATE|UPDATE epak SET status='Completed' WHERE id=1513469;
1513470|UPDATE|UPDATE epak SET status='Completed' WHERE id=1513470;
```

### Manual Operations

The tool provides a menu-driven interface for:

1. **UPDATE operations** - Modify existing records
   - EPak status and progress
   - Signer status
   - Document user actions
   - Activity records

2. **INSERT operations** - Add new records
   - Document activity entries
   - EPak activity entries
   - Custom records

3. **DELETE operations** - Remove records
   - Activity cleanup
   - Test data removal
   - Error correction

4. **VIEW operations** - Query and inspect data
   - Real-time table viewing
   - Custom queries

### Safety Features

- ✅ **Transaction-based** - All operations in a transaction
- ✅ **Preview before commit** - Review all changes
- ✅ **Rollback capability** - Cancel anytime
- ✅ **Rollback script generation** - Undo changes post-commit
- ✅ **Detailed logging** - Track all operations

### Examples

#### Example 1: Fix a Single EPak
```bash
./main.sh
# Enter EPak ID: 1513469
# Follow menu to build operations
# Preview and confirm
# Automatic rollback script generated
```

#### Example 2: Batch Process Multiple EPaks
```bash
# Create file: fix-list.csv
echo "epak_id|operation_type|sql_statement" > fix-list.csv
echo "1513469|UPDATE|UPDATE epak SET status='Completed' WHERE id=1513469;" >> fix-list.csv
echo "1513470|UPDATE|UPDATE epak SET status='Completed' WHERE id=1513470;" >> fix-list.csv

# Process batch
./main.sh --batch fix-list.csv
```

#### Example 3: Using Environment Variables
```bash
export EPAK_DB_HOST="production-db.company.com"
export EPAK_DB_USER="msb_user"
export EPAK_DB_PASS="SecurePassword"
export EPAK_DB_NAME="msb"

./main.sh
```

---

## Windows Version

### Quick Start

```powershell
cd windows
.\EPak-Fix-Tool.bat
```

Or double-click `EPak-Fix-Tool.bat` in Windows Explorer.

### Features

✅ Credential management  
✅ Database connection testing  
✅ EPak state viewing  
✅ Interactive prompts  
✅ PowerShell-native implementation  
🔄 Full manual operations (coming soon)  
🔄 Batch processing (coming soon)  

### Requirements

- Windows 10/11
- PowerShell 5.1 or later (included)
- MySQL client for Windows

### Files

- **EPak-Fix-Tool.ps1** - Main PowerShell script
- **EPak-Fix-Tool.bat** - Batch launcher (double-click friendly)
- **Check-Prerequisites.ps1** - Verify system requirements
- **README.md** - Detailed Windows documentation

### Usage

```powershell
# Normal operation
.\EPak-Fix-Tool.ps1

# Manage credentials
.\EPak-Fix-Tool.ps1 -Config

# Reset credentials
.\EPak-Fix-Tool.ps1 -Reset

# Show help
.\EPak-Fix-Tool.ps1 -Help
```

### Check Prerequisites

Before first run:

```powershell
.\Check-Prerequisites.ps1
```

This will verify:
- PowerShell version
- MySQL client installation
- Execution policy
- Network connectivity

### Credential Storage

Windows version stores credentials in:
```
%USERPROFILE%\.epak-config.json
```

For detailed Windows setup, see [windows/README.md](windows/README.md)

---

## 📁 Project Structure

```
epak-tool/
├── main.sh                           # Mac/Linux version (Bash)
├── README.md                         # This file
└── windows/
    ├── EPak-Fix-Tool.ps1            # Windows version (PowerShell)
    ├── EPak-Fix-Tool.bat            # Windows launcher
    ├── Check-Prerequisites.ps1       # System checker
    └── README.md                     # Windows documentation
```

## 🔐 Security Best Practices

### For All Versions

1. **Never commit credentials** to version control
2. **Use environment variables** for automation
3. **Restrict config file permissions**
   - Mac/Linux: `chmod 600 ~/.epak-config`
   - Windows: Config stored in user profile (secure by default)
4. **Use separate credentials** for production vs. testing
5. **Audit trail** - All operations are logged

### Gitignore

Add these to your `.gitignore`:
```
.epak-config
.epak-config.json
.my.cnf
*.sql
rollback_*.sql
/tmp/epak_*
```

## 🆚 Version Comparison

| Feature | Mac/Linux | Windows |
|---------|-----------|---------|
| Single EPak Fix | ✅ Full | ✅ Partial |
| Batch Processing | ✅ Full | 🔄 Coming |
| Manual Operations | ✅ Full | 🔄 Coming |
| Credential Management | ✅ | ✅ |
| Rollback Scripts | ✅ | 🔄 Coming |
| Corruption Testing | ✅ | 🔄 Coming |
| Multi-document EPaks | ✅ | 🔄 Coming |

## 🐛 Troubleshooting

### Mac/Linux

**Permission denied:**
```bash
chmod +x main.sh
```

**MySQL not found:**
```bash
# Install MySQL client
# macOS:
brew install mysql-client

# Ubuntu/Debian:
sudo apt-get install mysql-client

# RHEL/CentOS:
sudo yum install mysql
```

**Connection failed:**
```bash
# Test manually
mysql -h your-host -u your-user -p

# Update config
./main.sh --config
```

### Windows

**Script execution disabled:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**MySQL not found:**
- Download from: https://dev.mysql.com/downloads/mysql/
- Add MySQL bin folder to PATH

**Config issues:**
```powershell
# Delete and recreate
.\EPak-Fix-Tool.ps1 -Reset
.\EPak-Fix-Tool.ps1 -Config
```

For detailed troubleshooting, see platform-specific README files.

## 📊 Supported Operations

### EPak Table
- Update status (Pending → Completed)
- Update progress percentage
- Update modified timestamp

### EPak Workflow State Signer
- Update signer status
- Update progress
- Update status modified timestamp

### Document User Action
- Update action status
- Update acted on timestamp

### Document Activity
- Insert signed activity records
- Delete incorrect records
- Update activity details

### EPak Activity
- Insert completion records
- Delete test records
- Update activity status

## 🎯 Use Cases

1. **Stuck EPaks** - EPak shows as Pending but all signers completed
2. **Progress Mismatch** - Progress percentage doesn't match actual state
3. **Missing Activities** - Signed activity not recorded
4. **Testing Cleanup** - Remove test data from production
5. **Bulk Fixes** - Fix multiple EPaks with same issue
6. **Emergency Recovery** - Quick fix for critical business issues

## 📈 Workflow

```
┌─────────────────┐
│  Start Tool     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Load Credentials│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Enter EPak ID  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ View Current    │
│ State           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Build Operations│
│ (UPDATE/INSERT/ │
│  DELETE)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Preview Changes │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Confirm Execute │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Execute in      │
│ Transaction     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate        │
│ Rollback Script │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Show Final State│
└─────────────────┘
```

## 🔄 Roadmap

### Version 1.1 (In Progress)
- [ ] Complete Windows PowerShell version
- [ ] Windows batch processing
- [ ] Windows rollback script generation

### Version 1.2 (Planned)
- [ ] GUI wrapper (Electron-based)
- [ ] Real-time validation
- [ ] Enhanced error messages
- [ ] Audit log export

### Version 2.0 (Future)
- [ ] Web-based interface
- [ ] Multi-user support
- [ ] Scheduled batch jobs
- [ ] Integration with ticketing system

## 📝 Contributing

To contribute:
1. Test thoroughly on your platform
2. Maintain cross-platform compatibility
3. Update relevant README files
4. Follow existing code style
5. Add comments for complex logic

## 📄 License

Internal tool - For company use only.

## 👥 Support

For issues:
1. Check platform-specific troubleshooting
2. Verify prerequisites are met
3. Test database connection manually
4. Check credentials configuration

---

**Version:** 1.0.0  
**Last Updated:** November 2025  
**Platforms:** macOS, Linux, Windows 10/11








