@echo off
REM EPak Fix Tool - Windows Batch Launcher
REM This batch file launches the PowerShell script

setlocal

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

REM Check if PowerShell is available
where powershell >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: PowerShell is not installed or not in PATH
    echo Please install PowerShell and try again.
    pause
    exit /b 1
)

REM Check if MySQL client is available
where mysql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo WARNING: MySQL client is not installed or not in PATH
    echo.
    echo You need MySQL client to run this tool.
    echo Download from: https://dev.mysql.com/downloads/mysql/
    echo.
    pause
    exit /b 1
)

REM Launch PowerShell script
echo Starting EPak Fix Tool...
echo.

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%EPak-Fix-Tool.ps1" %*

endlocal










