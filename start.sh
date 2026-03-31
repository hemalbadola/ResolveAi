#!/bin/bash

# ─── ResolveAI Startup Script ───────────────────────────────────────────────────
# Prerequisites: Node.js 18+, MongoDB running locally

echo "🚀 Starting ResolveAI..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check .env exists
if [ ! -f ".env" ]; then
    echo "❌ Missing .env file. Copy .env.example and configure your keys."
    exit 1
fi

# Kill any existing process on port 3000
if lsof -ti:3000 &> /dev/null; then
    echo "⚠️  Port 3000 in use — killing existing process..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    sleep 1
fi

# Start the server
echo "✅ Server starting on http://localhost:3000"
echo "   Classification: NVIDIA NIM API → Keyword fallback"
echo ""
node backend/server.js
