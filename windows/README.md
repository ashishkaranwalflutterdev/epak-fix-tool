# EPak Fix Tool - Windows Version

PowerShell-based tool for fixing corrupted/pending EPaks on Windows systems.

## 📋 Prerequisites

### Required Software

1. **PowerShell 5.1 or later** (included in Windows 10/11)
   - Check version: `$PSVersionTable.PSVersion` in PowerShell

2. **MySQL Client** (command-line tools)
   - Download from: https://dev.mysql.com/downloads/mysql/
   - Or install MySQL Workbench which includes the client
   - Ensure `mysql.exe` is in your PATH

### Verify MySQL Client Installation

Open PowerShell or Command Prompt and run:
```powershell
mysql --version
```

If you see a version number, you're good to go!

## 🚀 Quick Start

### Method 1: Double-click the Batch File (Easiest)

1. Navigate to the `windows` folder
2. Double-click `EPak-Fix-Tool.bat`
3. Follow the on-screen prompts

### Method 2: Run PowerShell Script Directly

1. Open PowerShell
2. Navigate to the windows folder:
   ```powershell
   cd C:\path\to\epak-tool\windows
   ```
3. Run the script:
   ```powershell
   .\EPak-Fix-Tool.ps1
   ```

### Method 3: Run from Command Prompt

```cmd
cd C:\path\to\epak-tool\windows
EPak-Fix-Tool.bat
```

## 📖 Usage

### Normal Operation (Single EPak)

```powershell
.\EPak-Fix-Tool.ps1
```

or simply double-click `EPak-Fix-Tool.bat`

### Batch Processing (Multiple EPaks)

```powershell
.\EPak-Fix-Tool.ps1 -Batch -BatchFile "C:\path\to\epaks.csv"
```

### Manage Credentials

```powershell
.\EPak-Fix-Tool.ps1 -Config
```

### Reset Credentials

```powershell
.\EPak-Fix-Tool.ps1 -Reset
```

### Show Help

```powershell
.\EPak-Fix-Tool.ps1 -Help
```

## 🔐 Credential Management

Credentials are stored in: `%USERPROFILE%\.epak-config.json`

### Priority Order (same as Mac version):
1. **Environment Variables**
   - `EPAK_DB_HOST`
   - `EPAK_DB_NAME`
   - `EPAK_DB_USER`
   - `EPAK_DB_PASS`

2. **Config File** (`~\.epak-config.json`)

3. **Interactive Prompt** (if none found)

### Using Environment Variables

```powershell
# Set for current session
$env:EPAK_DB_HOST = "your-db-host"
$env:EPAK_DB_USER = "your-username"
$env:EPAK_DB_PASS = "your-password"
$env:EPAK_DB_NAME = "msb"

# Then run the script
.\EPak-Fix-Tool.ps1
```

## 📁 Batch Processing File Format

### CSV Format (Recommended for Excel)

1. Create a CSV file with 3 columns:
   - `epak_id`
   - `operation_type`
   - `sql_statement`

2. Example content:
   ```csv
   epak_id,operation_type,sql_statement
   1513469,UPDATE,UPDATE epak SET status='Completed' WHERE id=1513469;
   1513470,UPDATE,UPDATE epak SET status='Completed' WHERE id=1513470;
   ```

### Tab-Delimited (Excel Export)

1. In Excel, create 3 columns: `epak_id` | `operation_type` | `sql_statement`
2. File → Save As → Text (Tab delimited) (*.txt)
3. Run: `.\EPak-Fix-Tool.ps1 -Batch -BatchFile "your-file.txt"`

### Pipe-Delimited

```
epak_id|operation_type|sql_statement
1513469|UPDATE|UPDATE epak SET status='Completed' WHERE id=1513469;
```

## 🔧 Troubleshooting

### "Cannot be loaded because running scripts is disabled"

If you see this error, you need to change PowerShell execution policy:

1. Open PowerShell as Administrator
2. Run:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
3. Type `Y` to confirm

**Note:** The batch file (`EPak-Fix-Tool.bat`) automatically bypasses this with `-ExecutionPolicy Bypass` flag.

### "mysql is not recognized as an internal or external command"

MySQL client is not installed or not in PATH.

**Solution 1 - Install MySQL Client:**
1. Download from: https://dev.mysql.com/downloads/mysql/
2. During installation, select "MySQL Command Line Client"
3. Add MySQL bin directory to PATH

**Solution 2 - Add to PATH manually:**
1. Find your MySQL installation (usually `C:\Program Files\MySQL\MySQL Server 8.0\bin`)
2. Add it to your system PATH:
   - Windows 11: Settings → System → About → Advanced system settings → Environment Variables
   - Add the MySQL bin path to the `Path` variable

### Connection Failures

1. **Check MySQL is running:**
   ```powershell
   Get-Service -Name MySQL*
   ```

2. **Verify credentials:**
   ```powershell
   .\EPak-Fix-Tool.ps1 -Config
   ```

3. **Test manual connection:**
   ```powershell
   mysql -h your-host -u your-user -p
   ```

### Config File Issues

If credentials aren't saving or loading properly:

1. Check if file exists:
   ```powershell
   Test-Path "$env:USERPROFILE\.epak-config.json"
   ```

2. View current config:
   ```powershell
   Get-Content "$env:USERPROFILE\.epak-config.json" | ConvertFrom-Json
   ```

3. Delete and recreate:
   ```powershell
   .\EPak-Fix-Tool.ps1 -Reset
   .\EPak-Fix-Tool.ps1 -Config
   ```

## 🆚 Differences from Mac/Linux Version

1. **File Format:** PowerShell (`.ps1`) instead of Bash (`.sh`)
2. **Config Location:** `%USERPROFILE%\.epak-config.json` instead of `~/.epak-config`
3. **Batch Launcher:** Includes `.bat` file for easier double-click execution
4. **Execution Policy:** May require PowerShell execution policy changes

## 🎯 Features

✅ Credential management (save/load/update)  
✅ Environment variable support  
✅ Interactive prompts  
✅ Connection testing  
✅ Display current EPak state  
🔄 Full manual operations menu (coming soon)  
🔄 Complete batch processing (coming soon)  
🔄 Rollback script generation (coming soon)  

## 📝 Examples

### Example 1: First-time Setup

```powershell
# Navigate to folder
cd C:\epak-tool\windows

# Run with config
.\EPak-Fix-Tool.ps1 -Config

# Follow prompts to save credentials
```

### Example 2: Quick EPak Check

```powershell
# Run the tool
.\EPak-Fix-Tool.ps1

# Enter EPak ID when prompted
# View current state
```

### Example 3: Using Environment Variables

```powershell
# Set credentials for session
$env:EPAK_DB_HOST = "production-db.company.com"
$env:EPAK_DB_USER = "msb_user"
$env:EPAK_DB_PASS = "SecureP@ssw0rd"

# Run tool (will use env vars)
.\EPak-Fix-Tool.ps1
```

## 🔒 Security Notes

1. **Config File:** Stores credentials in JSON format in your user profile
2. **Permissions:** Only the current user can read the config file
3. **Environment Variables:** Most secure for automation/scripts
4. **Never commit:** Don't commit `.epak-config.json` to version control

## 📞 Support

For issues or questions:
1. Check the Troubleshooting section above
2. Verify all prerequisites are installed
3. Test MySQL connection manually first
4. Check PowerShell version compatibility

## 🔄 Updates

Current Version: 1.0.0 (Windows Port)

### What's Working:
- Credential management
- Database connection
- EPak state viewing
- Configuration storage

### Coming Soon:
- Full interactive operations menu
- Complete batch processing
- Rollback script generation
- Corruption testing mode

---

**Note:** This is the Windows version of the EPak Fix Tool. For Mac/Linux, use the Bash script in the parent directory.








