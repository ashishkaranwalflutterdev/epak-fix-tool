#!/bin/bash
# EPak Web Terminal - Quick Start Script
# Works on Mac, Linux, and Git Bash on Windows

clear

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          EPak Fix Tool - Web Terminal Launcher                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo ""
    echo "Please install Node.js from: https://nodejs.org/"
    echo ""
    echo "After installation, run this script again."
    echo ""
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (first time only)..."
    echo ""
    npm install
    echo ""
fi

echo "🔍 Checking port 3000..."
echo ""

# Check if port 3000 is in use
PORT_IN_USE=$(lsof -ti:3000)

if [ ! -z "$PORT_IN_USE" ]; then
    echo "⚠️  Port 3000 is already in use by process(es): $PORT_IN_USE"
    echo ""
    echo "Killing existing processes..."
    kill -9 $PORT_IN_USE 2>/dev/null
    sleep 1
    echo "✅ Port 3000 is now free"
    echo ""
fi

echo "🚀 Starting EPak Web Terminal..."
echo ""
echo "The server will start in a moment."
echo "Your browser will show the terminal interface."
echo ""
echo "Server will be available at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start








