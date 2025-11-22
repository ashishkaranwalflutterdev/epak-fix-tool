@echo off
REM EPak Fix Tool - First Run Setup
REM This script helps you set up the tool for the first time

setlocal enabledelayedexpansion

color 0B
title EPak Fix Tool - First Run Setup

echo.
echo ========================================================================
echo                   EPak Fix Tool - First Run Setup
echo ========================================================================
echo.
echo This wizard will help you set up the EPak Fix Tool on Windows.
echo.
pause

REM Step 1: Check PowerShell
echo.
echo [Step 1/4] Checking PowerShell...
echo.
where powershell >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] PowerShell is not installed or not in PATH
    echo Please install PowerShell and run this setup again.
    pause
    exit /b 1
)
echo [OK] PowerShell is installed
powershell -Command "Write-Host '  Version:' $PSVersionTable.PSVersion.ToString()" 2>nul
echo.

REM Step 2: Check MySQL Client
echo.
echo [Step 2/4] Checking MySQL Client...
echo.
where mysql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0E
    echo [WARNING] MySQL client is not installed or not in PATH
    echo.
    echo You need MySQL client to run this tool.
    echo.
    echo Download MySQL from: https://dev.mysql.com/downloads/mysql/
    echo.
    echo After installation:
    echo   1. Add MySQL bin folder to your PATH
    echo   2. Common path: C:\Program Files\MySQL\MySQL Server 8.0\bin
    echo.
    echo Would you like to continue anyway? (You'll need to install MySQL later)
    echo.
    set /p CONTINUE="Continue? (Y/N): "
    if /i "!CONTINUE!" neq "Y" (
        echo Setup cancelled.
        pause
        exit /b 1
    )
) else (
    echo [OK] MySQL client is installed
    mysql --version 2>nul
    echo.
)

REM Step 3: Check Execution Policy
echo.
echo [Step 3/4] Checking PowerShell Execution Policy...
echo.
powershell -Command "$policy = Get-ExecutionPolicy -Scope CurrentUser; Write-Host '  Current policy:' $policy; if ($policy -eq 'Restricted' -or $policy -eq 'AllSigned') { exit 1 } else { exit 0 }" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0E
    echo [WARNING] PowerShell execution policy may block scripts
    echo.
    echo Would you like to fix this? (Requires running as Administrator)
    echo This will set ExecutionPolicy to RemoteSigned for current user.
    echo.
    set /p FIX_POLICY="Fix now? (Y/N): "
    if /i "!FIX_POLICY!" equ "Y" (
        powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-Command Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force'" 2>nul
        echo.
        echo Policy change attempted. Please check if successful.
        pause
    ) else (
        echo.
        echo No problem! The .bat launcher uses -ExecutionPolicy Bypass flag.
        echo Use EPak-Fix-Tool.bat instead of .ps1 file directly.
    )
) else (
    echo [OK] Execution policy is properly configured
)
echo.

REM Step 4: Run Prerequisites Check
echo.
echo [Step 4/4] Running detailed prerequisites check...
echo.
pause
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0Check-Prerequisites.ps1"

REM Final Step: Offer to configure credentials
echo.
echo ========================================================================
echo.
echo Setup complete! 
echo.
echo Would you like to configure database credentials now?
echo (You can also do this later by running: EPak-Fix-Tool.bat -Config)
echo.
set /p CONFIG_NOW="Configure credentials now? (Y/N): "

if /i "!CONFIG_NOW!" equ "Y" (
    echo.
    echo Starting credential configuration...
    echo.
    powershell -ExecutionPolicy Bypass -File "%~dp0EPak-Fix-Tool.ps1" -Config
) else (
    echo.
    echo No problem! You'll be prompted for credentials when you first run the tool.
)

echo.
echo ========================================================================
echo                          Setup Complete!
echo ========================================================================
echo.
echo To start using the tool:
echo   1. Double-click: EPak-Fix-Tool.bat
echo   2. Or run in PowerShell: .\EPak-Fix-Tool.ps1
echo.
echo For help:
echo   .\EPak-Fix-Tool.ps1 -Help
echo.
echo Enjoy using EPak Fix Tool!
echo.
pause

endlocal










