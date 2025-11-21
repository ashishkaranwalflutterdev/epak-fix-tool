<#
.SYNOPSIS
    Check Prerequisites for EPak Fix Tool

.DESCRIPTION
    This script checks if all required software is installed and properly configured
    for running the EPak Fix Tool on Windows.
#>

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          EPak Fix Tool - Prerequisites Checker                ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check PowerShell Version
Write-Host "Checking PowerShell Version..." -NoNewline
$psVersion = $PSVersionTable.PSVersion
if ($psVersion.Major -ge 5) {
    Write-Host " ✅ OK" -ForegroundColor Green
    Write-Host "  Version: $($psVersion.ToString())" -ForegroundColor Gray
} else {
    Write-Host " ❌ FAILED" -ForegroundColor Red
    Write-Host "  Current version: $($psVersion.ToString())" -ForegroundColor Yellow
    Write-Host "  Required: PowerShell 5.1 or later" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# Check MySQL Client
Write-Host "Checking MySQL Client..." -NoNewline
$mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
if ($mysqlPath) {
    Write-Host " ✅ OK" -ForegroundColor Green
    try {
        $mysqlVersion = & mysql --version 2>&1
        Write-Host "  Version: $mysqlVersion" -ForegroundColor Gray
        Write-Host "  Path: $($mysqlPath.Source)" -ForegroundColor Gray
    } catch {
        Write-Host "  Found but version check failed" -ForegroundColor Yellow
    }
} else {
    Write-Host " ❌ FAILED" -ForegroundColor Red
    Write-Host "  MySQL client is not installed or not in PATH" -ForegroundColor Yellow
    Write-Host "  Download from: https://dev.mysql.com/downloads/mysql/" -ForegroundColor Yellow
    $allGood = $false
}
Write-Host ""

# Check Execution Policy
Write-Host "Checking PowerShell Execution Policy..." -NoNewline
$execPolicy = Get-ExecutionPolicy -Scope CurrentUser
if ($execPolicy -eq "Unrestricted" -or $execPolicy -eq "RemoteSigned" -or $execPolicy -eq "Bypass") {
    Write-Host " ✅ OK" -ForegroundColor Green
    Write-Host "  Policy: $execPolicy" -ForegroundColor Gray
} else {
    Write-Host " ⚠️  WARNING" -ForegroundColor Yellow
    Write-Host "  Current policy: $execPolicy" -ForegroundColor Yellow
    Write-Host "  You may need to run scripts with '-ExecutionPolicy Bypass'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  To fix permanently, run PowerShell as Administrator and execute:" -ForegroundColor Cyan
    Write-Host "    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor White
}
Write-Host ""

# Check if config file exists
Write-Host "Checking for existing configuration..." -NoNewline
$configFile = Join-Path $env:USERPROFILE ".epak-config.json"
if (Test-Path $configFile) {
    Write-Host " ✅ FOUND" -ForegroundColor Green
    Write-Host "  Location: $configFile" -ForegroundColor Gray
    try {
        $config = Get-Content $configFile | ConvertFrom-Json
        Write-Host "  Host: $($config.DBHost)" -ForegroundColor Gray
        Write-Host "  Database: $($config.DBName)" -ForegroundColor Gray
        Write-Host "  User: $($config.DBUser)" -ForegroundColor Gray
    } catch {
        Write-Host "  Config file exists but may be corrupted" -ForegroundColor Yellow
    }
} else {
    Write-Host " ⚠️  NOT FOUND" -ForegroundColor Yellow
    Write-Host "  No saved credentials - you'll be prompted on first run" -ForegroundColor Gray
}
Write-Host ""

# Check network connectivity (optional)
Write-Host "Checking network connectivity (example check)..." -NoNewline
try {
    $null = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet -ErrorAction Stop
    Write-Host " ✅ OK" -ForegroundColor Green
    Write-Host "  Internet connection available" -ForegroundColor Gray
} catch {
    Write-Host " ⚠️  WARNING" -ForegroundColor Yellow
    Write-Host "  Network connectivity issue detected" -ForegroundColor Yellow
}
Write-Host ""

# Check environment variables
Write-Host "Checking environment variables..." -NoNewline
$envVarsSet = @()
if ($env:EPAK_DB_HOST) { $envVarsSet += "EPAK_DB_HOST" }
if ($env:EPAK_DB_NAME) { $envVarsSet += "EPAK_DB_NAME" }
if ($env:EPAK_DB_USER) { $envVarsSet += "EPAK_DB_USER" }
if ($env:EPAK_DB_PASS) { $envVarsSet += "EPAK_DB_PASS" }

if ($envVarsSet.Count -gt 0) {
    Write-Host " ✅ FOUND" -ForegroundColor Green
    Write-Host "  Set variables: $($envVarsSet -join ', ')" -ForegroundColor Gray
} else {
    Write-Host " ℹ️  NONE SET" -ForegroundColor Cyan
    Write-Host "  This is normal - credentials will be loaded from config or prompted" -ForegroundColor Gray
}
Write-Host ""

# Summary
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($allGood) {
    Write-Host "✅ All prerequisites met! You're ready to run EPak Fix Tool." -ForegroundColor Green
    Write-Host ""
    Write-Host "To start, run:" -ForegroundColor Cyan
    Write-Host "  .\EPak-Fix-Tool.bat" -ForegroundColor White
    Write-Host "or" -ForegroundColor Cyan
    Write-Host "  .\EPak-Fix-Tool.ps1" -ForegroundColor White
} else {
    Write-Host "❌ Some prerequisites are missing. Please install required software." -ForegroundColor Red
    Write-Host ""
    Write-Host "Required installations:" -ForegroundColor Yellow
    if ($psVersion.Major -lt 5) {
        Write-Host "  • PowerShell 5.1 or later" -ForegroundColor White
    }
    if (-not $mysqlPath) {
        Write-Host "  • MySQL Client - https://dev.mysql.com/downloads/mysql/" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "For detailed setup instructions, see README.md" -ForegroundColor Cyan
Write-Host ""

# Offer to open README
$openReadme = Read-Host "Would you like to open the README? (yes/no)"
if ($openReadme -eq "yes" -or $openReadme -eq "y") {
    $readmePath = Join-Path $PSScriptRoot "README.md"
    if (Test-Path $readmePath) {
        Start-Process notepad.exe $readmePath
    } else {
        Write-Host "README.md not found in current directory" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")








