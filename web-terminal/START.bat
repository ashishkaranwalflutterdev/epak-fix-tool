@echo off
REM EPak Web Terminal - Quick Start Script for Windows

cls

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║          EPak Fix Tool - Web Terminal Launcher                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    echo After installation, run this script again.
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js is installed
node --version
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo 📦 Installing dependencies (first time only)...
    echo.
    call npm install
    echo.
)

echo 🚀 Starting EPak Web Terminal...
echo.
echo The server will start in a moment.
echo Your browser will show the terminal interface.
echo.
echo ⚠️  DO NOT CLOSE THIS WINDOW while using the terminal
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
npm start








