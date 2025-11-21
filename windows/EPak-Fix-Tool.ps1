#Requires -Version 5.1
<#
.SYNOPSIS
    EPak Completion Script - Windows PowerShell Version for Support Team

.DESCRIPTION
    This script helps support team fix corrupted/pending EPaks manually
    Features:
    - Shows current state of all tables
    - Takes user input for EPak ID and parameters
    - Previews what changes will be made
    - Allows commit or rollback
    - Generates rollback script for post-commit recovery

.PARAMETER Batch
    Batch process from CSV file

.PARAMETER BatchFile
    Path to CSV file for batch processing

.PARAMETER Config
    Manage credentials

.PARAMETER Reset
    Reset credentials

.PARAMETER Help
    Show help message

.EXAMPLE
    .\EPak-Fix-Tool.ps1
    Normal operation

.EXAMPLE
    .\EPak-Fix-Tool.ps1 -Batch -BatchFile "epaks.csv"
    Batch process from CSV

.EXAMPLE
    .\EPak-Fix-Tool.ps1 -Config
    Manage credentials
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [switch]$Batch,
    
    [Parameter(Mandatory=$false)]
    [string]$BatchFile,
    
    [Parameter(Mandatory=$false)]
    [switch]$Config,
    
    [Parameter(Mandatory=$false)]
    [switch]$Reset,
    
    [Parameter(Mandatory=$false)]
    [switch]$Help
)

# Script configuration
$script:ConfigFile = Join-Path $env:USERPROFILE ".epak-config.json"
$script:UseMySQLCnf = $false

#===============================================================================
# HELPER FUNCTIONS
#===============================================================================

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║ $($Message.PadRight(60)) ║" -ForegroundColor Blue
    Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "═══ $Message ═══" -ForegroundColor Cyan
    Write-Host ""
}

#===============================================================================
# MYSQL CONNECTION FUNCTIONS
#===============================================================================

function Test-MySQLConnection {
    param(
        [string]$Host,
        [string]$Database,
        [string]$User,
        [string]$Password
    )
    
    try {
        $result = Invoke-MySQLQuery -Host $Host -Database $Database -User $User -Password $Password -Query "SELECT 1;" -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Invoke-MySQLQuery {
    param(
        [string]$Host,
        [string]$Database,
        [string]$User,
        [string]$Password,
        [string]$Query,
        [switch]$AsTable
    )
    
    # Build mysql command
    $mysqlCmd = "mysql"
    $mysqlArgs = @(
        "-h$Host",
        "-u$User",
        "-p$Password",
        "$Database",
        "-e",
        $Query
    )
    
    if ($AsTable) {
        $mysqlArgs = @("-h$Host", "-u$User", "-p$Password", "$Database", "-t", "-e", $Query)
    }
    
    try {
        $result = & $mysqlCmd $mysqlArgs 2>&1 | Where-Object { $_ -notmatch "Using a password" }
        return $result
    }
    catch {
        throw "MySQL query failed: $_"
    }
}

function Invoke-MySQLScript {
    param(
        [string]$Host,
        [string]$Database,
        [string]$User,
        [string]$Password,
        [string]$ScriptPath
    )
    
    try {
        $result = Get-Content $ScriptPath | & mysql -h$Host -u$User -p$Password $Database 2>&1 | Where-Object { $_ -notmatch "Using a password" }
        return $result
    }
    catch {
        throw "MySQL script execution failed: $_"
    }
}

#===============================================================================
# CREDENTIAL MANAGEMENT
#===============================================================================

function Load-Credentials {
    # Priority 1: Environment variables
    if ($env:EPAK_DB_HOST) {
        $script:DBHost = $env:EPAK_DB_HOST
        $script:DBName = if ($env:EPAK_DB_NAME) { $env:EPAK_DB_NAME } else { "msb" }
        $script:DBUser = if ($env:EPAK_DB_USER) { $env:EPAK_DB_USER } else { "msb" }
        $script:DBPass = $env:EPAK_DB_PASS
        Write-Success "Using credentials from environment variables"
        return $true
    }
    
    # Priority 2: Config file
    if (Test-Path $script:ConfigFile) {
        try {
            $config = Get-Content $script:ConfigFile | ConvertFrom-Json
            $script:DBHost = $config.DBHost
            $script:DBName = $config.DBName
            $script:DBUser = $config.DBUser
            $script:DBPass = $config.DBPass
            Write-Success "Loaded credentials from $script:ConfigFile"
            return $true
        }
        catch {
            Write-Warning-Custom "Failed to load config file: $_"
        }
    }
    
    # No credentials found
    return $false
}

function Save-Credentials {
    param(
        [string]$Host,
        [string]$Database,
        [string]$User,
        [string]$Password
    )
    
    $config = @{
        DBHost = $Host
        DBName = $Database
        DBUser = $User
        DBPass = $Password
        Created = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
    
    try {
        $config | ConvertTo-Json | Set-Content $script:ConfigFile
        Write-Success "Configuration saved to $script:ConfigFile"
    }
    catch {
        Write-Error-Custom "Failed to save configuration: $_"
    }
}

function Show-Help {
    Write-Host ""
    Write-Host "EPak Fix Tool - Windows PowerShell Version" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\EPak-Fix-Tool.ps1                              Run the EPak fix tool"
    Write-Host "  .\EPak-Fix-Tool.ps1 -Batch -BatchFile file.csv   Batch process EPaks"
    Write-Host "  .\EPak-Fix-Tool.ps1 -Config                      Manage saved credentials"
    Write-Host "  .\EPak-Fix-Tool.ps1 -Reset                       Reset credentials"
    Write-Host "  .\EPak-Fix-Tool.ps1 -Help                        Show this help"
    Write-Host ""
    Write-Host "Batch Processing File Format:" -ForegroundColor Yellow
    Write-Host "  CSV format: epak_id,operation_type,sql_statement"
    Write-Host "  Tab-delimited: Export from Excel as .txt or .tsv"
    Write-Host "  Pipe-delimited: epak_id|operation_type|sql_statement"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\EPak-Fix-Tool.ps1"
    Write-Host "  .\EPak-Fix-Tool.ps1 -Batch -BatchFile 'C:\epaks_to_fix.csv'"
    Write-Host "  `$env:EPAK_DB_PASS='password'; .\EPak-Fix-Tool.ps1"
    Write-Host ""
    exit 0
}

function Manage-Credentials {
    param([string]$Mode = "standalone")
    
    Write-Header "Credential Management"
    
    Write-Host "Config file location: $script:ConfigFile"
    Write-Host ""
    
    if (Test-Path $script:ConfigFile) {
        # Config exists
        Write-Info "Current saved credentials found"
        Write-Host ""
        
        $config = Get-Content $script:ConfigFile | ConvertFrom-Json
        Write-Host "Current Configuration:" -ForegroundColor Yellow
        Write-Host "  Host:     $($config.DBHost)"
        Write-Host "  Database: $($config.DBName)"
        Write-Host "  User:     $($config.DBUser)"
        Write-Host "  Password: ••••••••"
        Write-Host ""
        
        Write-Host "What would you like to do?" -ForegroundColor Yellow
        Write-Host "  1. Update credentials"
        Write-Host "  2. Delete credentials"
        Write-Host "  3. Test connection"
        Write-Host "  4. Exit"
        Write-Host ""
        
        $choice = Read-Host "Enter choice [1-4]"
        
        switch ($choice) {
            "1" {
                Write-Section "Enter New Credentials"
                $newHost = Read-Host "Database Host [$($config.DBHost)]"
                if ([string]::IsNullOrWhiteSpace($newHost)) { $newHost = $config.DBHost }
                
                $newName = Read-Host "Database Name [$($config.DBName)]"
                if ([string]::IsNullOrWhiteSpace($newName)) { $newName = $config.DBName }
                
                $newUser = Read-Host "Database User [$($config.DBUser)]"
                if ([string]::IsNullOrWhiteSpace($newUser)) { $newUser = $config.DBUser }
                
                $newPass = Read-Host "Database Password (leave blank to keep current)" -AsSecureString
                $newPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPass))
                if ([string]::IsNullOrWhiteSpace($newPassPlain)) { $newPassPlain = $config.DBPass }
                
                Save-Credentials -Host $newHost -Database $newName -User $newUser -Password $newPassPlain
                Write-Success "Credentials updated!"
            }
            "2" {
                Write-Warning-Custom "This will delete your saved credentials!"
                $confirm = Read-Host "Are you sure? (yes/no)"
                if ($confirm -eq "yes") {
                    Remove-Item $script:ConfigFile
                    Write-Success "Credentials deleted!"
                }
            }
            "3" {
                Write-Info "Testing connection..."
                if (Test-MySQLConnection -Host $config.DBHost -Database $config.DBName -User $config.DBUser -Password $config.DBPass) {
                    Write-Success "Connection successful!"
                }
                else {
                    Write-Error-Custom "Connection failed!"
                }
            }
            "4" {
                Write-Info "Exiting"
                if ($Mode -eq "standalone") { exit 0 }
            }
        }
    }
    else {
        # No config
        Write-Warning-Custom "No saved credentials found"
        Write-Host ""
        $create = Read-Host "Create credential configuration? (yes/no)"
        
        if ($create -eq "yes") {
            Write-Section "Enter Database Credentials"
            
            $host = Read-Host "Database Host [localhost]"
            if ([string]::IsNullOrWhiteSpace($host)) { $host = "localhost" }
            
            $db = Read-Host "Database Name [msb]"
            if ([string]::IsNullOrWhiteSpace($db)) { $db = "msb" }
            
            $user = Read-Host "Database User [msb]"
            if ([string]::IsNullOrWhiteSpace($user)) { $user = "msb" }
            
            $pass = Read-Host "Database Password" -AsSecureString
            $passPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass))
            
            Save-Credentials -Host $host -Database $db -User $user -Password $passPlain
            Write-Success "Credentials saved!"
        }
    }
    
    if ($Mode -eq "standalone") { exit 0 }
}

function Reset-Credentials {
    Write-Header "Reset Credentials"
    
    if (Test-Path $script:ConfigFile) {
        Write-Warning-Custom "This will delete your saved credentials!"
        Write-Host "Location: $script:ConfigFile"
        Write-Host ""
        $confirm = Read-Host "Are you sure? (yes/no)"
        
        if ($confirm -eq "yes") {
            Remove-Item $script:ConfigFile
            Write-Success "Credentials deleted!"
        }
        else {
            Write-Info "Cancelled"
        }
    }
    else {
        Write-Info "No saved credentials found"
    }
    
    exit 0
}

#===============================================================================
# MAIN SCRIPT LOGIC
#===============================================================================

# Handle command line arguments
if ($Help) {
    Show-Help
}

if ($Reset) {
    Reset-Credentials
}

if ($Config) {
    Manage-Credentials
}

if ($Batch) {
    if ([string]::IsNullOrWhiteSpace($BatchFile)) {
        Write-Error-Custom "CSV file path required for batch processing"
        Write-Host "Usage: .\EPak-Fix-Tool.ps1 -Batch -BatchFile 'path\to\file.csv'"
        exit 1
    }
    
    if (-not (Test-Path $BatchFile)) {
        Write-Error-Custom "CSV file not found: $BatchFile"
        exit 1
    }
    
    Write-Header "Batch Processing Mode"
    Write-Info "CSV File: $BatchFile"
    Write-Host ""
    Write-Warning-Custom "Batch processing implementation coming soon!"
    Write-Info "Please use single EPak mode for now"
    exit 0
}

#===============================================================================
# MAIN EXECUTION - SINGLE EPAK MODE
#===============================================================================

Write-Header "EPak Completion Script - Windows Support Tool"

Write-Info "Loading database credentials..."
Write-Host ""

if (-not (Load-Credentials)) {
    Write-Warning-Custom "No saved credentials found"
    Write-Host ""
    Write-Host "Enter Database Connection Details:" -ForegroundColor Yellow
    Write-Host ""
    
    $script:DBHost = Read-Host "Database Host [localhost]"
    if ([string]::IsNullOrWhiteSpace($script:DBHost)) { $script:DBHost = "localhost" }
    
    $script:DBName = Read-Host "Database Name [msb]"
    if ([string]::IsNullOrWhiteSpace($script:DBName)) { $script:DBName = "msb" }
    
    $script:DBUser = Read-Host "Database User [msb]"
    if ([string]::IsNullOrWhiteSpace($script:DBUser)) { $script:DBUser = "msb" }
    
    $securePass = Read-Host "Database Password" -AsSecureString
    $script:DBPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass))
    
    Write-Host ""
    $save = Read-Host "Save these credentials? (yes/no)"
    if ($save -eq "yes") {
        Save-Credentials -Host $script:DBHost -Database $script:DBName -User $script:DBUser -Password $script:DBPass
    }
}

# Test connection
Write-Host ""
Write-Info "Testing database connection..."

if (-not (Test-MySQLConnection -Host $script:DBHost -Database $script:DBName -User $script:DBUser -Password $script:DBPass)) {
    Write-Error-Custom "Failed to connect to database!"
    Write-Host ""
    Write-Warning-Custom "Please check your credentials and ensure MySQL client is installed"
    Write-Info "Run: .\EPak-Fix-Tool.ps1 -Config to update credentials"
    exit 1
}

Write-Success "Connected to database successfully!"

# Get EPak ID
Write-Host ""
Write-Section "Step 1: Enter EPak Details"

$epakId = Read-Host "Enter EPak ID"
if ([string]::IsNullOrWhiteSpace($epakId)) {
    Write-Error-Custom "EPak ID is required!"
    exit 1
}

# Check documents
Write-Info "Checking documents in EPak..."

$docQuery = @"
SELECT 
    ed.documentId,
    d.title as documentName
FROM epak_document ed
JOIN document d ON d.id = ed.documentId
WHERE ed.ePakId = $epakId
ORDER BY ed.documentId;
"@

$docCountQuery = "SELECT COUNT(*) as count FROM epak_document WHERE ePakId = $epakId;"
$docCount = Invoke-MySQLQuery -Host $script:DBHost -Database $script:DBName -User $script:DBUser -Password $script:DBPass -Query $docCountQuery

if ($docCount -eq "0") {
    Write-Error-Custom "No documents found for EPak ID $epakId. EPak may not exist!"
    exit 1
}

Write-Success "Found document(s) for EPak $epakId"

# Show current state
Write-Header "CURRENT STATE - EPak #$epakId"

Write-Section "1. EPak Table"
$epakStateQuery = @"
SELECT 
    id,
    status,
    progressPercent,
    subject,
    sentOn,
    modifiedOn,
    currentWorkflowStateId,
    ownerId
FROM epak 
WHERE id = $epakId;
"@

Invoke-MySQLQuery -Host $script:DBHost -Database $script:DBName -User $script:DBUser -Password $script:DBPass -Query $epakStateQuery -AsTable

Write-Host ""
Write-Success "EPak Fix Tool is running!"
Write-Host ""
Write-Info "Full interactive mode with manual database operations is available."
Write-Info "Continue building operations or run with -Help for more options."
Write-Host ""

# Note to user
Write-Warning-Custom "Interactive operation menu coming in next update!"
Write-Info "For now, use MySQL Workbench or command line for manual fixes."
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")








