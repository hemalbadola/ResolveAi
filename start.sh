#!/bin/bash

# ═══════════════════════════════════════════
#  SYS_CORE — One-Command Startup Script
# ═══════════════════════════════════════════

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}🛡️  SYS_CORE — Starting all services...${NC}\n"

# 1. Start MongoDB (if not already running)
echo -e "${GREEN}[1/3]${NC} Checking MongoDB..."
if ! pgrep -x mongod > /dev/null 2>&1; then
    brew services start mongodb-community@7.0 > /dev/null 2>&1
    sleep 3
    echo "  ✅ MongoDB started"
else
    echo "  ✅ MongoDB already running"
fi

# 2. Start AI Service (background)
echo -e "${GREEN}[2/3]${NC} Starting AI Service (port 8000)..."
cd "$PROJECT_DIR/ai-service"
pip install -r requirements.txt -q 2>/dev/null
uvicorn main:app --port 8000 &
AI_PID=$!
sleep 2
echo "  ✅ AI Service running (PID: $AI_PID)"

# 3. Start Node.js Server (foreground)
echo -e "${GREEN}[3/3]${NC} Starting Node.js Server (port 3000)..."
cd "$PROJECT_DIR/server"
npm install --silent 2>/dev/null

echo -e "\n${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 Open: http://localhost:3000${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "Press Ctrl+C to stop all services.\n"

# Cleanup on exit — kill AI service when Node stops
trap "kill $AI_PID 2>/dev/null; echo -e '\n${RED}All services stopped.${NC}'" EXIT

node server.js
