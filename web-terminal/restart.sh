#!/bin/bash
# Quick restart script - kills port 3000 and restarts server

echo ""
echo "🔄 Restarting EPak Web Terminal..."
echo ""

# Check and kill processes on port 3000
echo "🔍 Checking port 3000..."
PORT_IN_USE=$(lsof -ti:3000)

if [ ! -z "$PORT_IN_USE" ]; then
    echo "⚠️  Killing processes on port 3000: $PORT_IN_USE"
    kill -9 $PORT_IN_USE 2>/dev/null
    sleep 2
    echo "✅ Port 3000 cleared"
else
    echo "✅ Port 3000 is free"
fi

echo ""
echo "🚀 Starting server..."
echo ""

cd /Users/ashishkaranwal/Documents/dev/projects/epak-tool/web-terminal
npm start



