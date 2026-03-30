#!/usr/bin/env bash
# Astra-AI Linux/macOS Launcher
# Starts the Python backend and launches the CLI

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  ======================================${RESET}"
echo -e "${CYAN}   Astra-AI — Linux/macOS Launcher${RESET}"
echo -e "${CYAN}  ======================================${RESET}"
echo ""

# ── Dependency checks ──────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
  echo -e "${RED}[ERROR] Python not found. Please install Python 3.10+${RESET}"
  exit 1
fi
PYTHON=$(command -v python3 || command -v python)

if ! command -v node &>/dev/null; then
  echo -e "${RED}[ERROR] Node.js not found. Please install Node.js 18+${RESET}"
  exit 1
fi

# ── .env setup ─────────────────────────────────────────────────────────────────
if [ ! -f "server/.env" ]; then
  echo -e "${YELLOW}[SETUP] Creating server/.env from template...${RESET}"
  cp server/.env.example server/.env
  echo -e "${YELLOW}[SETUP] Please open server/.env and set your GEMINI_API_KEY${RESET}"
  echo ""
  echo -e "  ${CYAN}nano server/.env${RESET}  or  ${CYAN}vim server/.env${RESET}"
  echo ""
  read -rp "  Press ENTER after editing the file... "
fi

# ── Install dependencies ───────────────────────────────────────────────────────
echo -e "${CYAN}[SETUP] Installing Python dependencies...${RESET}"
$PYTHON -m pip install -r server/requirements.txt -q

echo -e "${CYAN}[SETUP] Installing Node.js dependencies...${RESET}"
(cd cli && npm install --silent)

# ── Start Python server in background ─────────────────────────────────────────
echo -e "${GREEN}[START] Launching Astra-AI engine in background...${RESET}"
$PYTHON server/main.py &
SERVER_PID=$!
echo -e "  PID: ${SERVER_PID}"

# Write PID for cleanup
echo "$SERVER_PID" > /tmp/astra_server.pid

# Trap to clean up on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}[STOP] Shutting down engine (PID $SERVER_PID)...${RESET}"
  kill "$SERVER_PID" 2>/dev/null || true
  rm -f /tmp/astra_server.pid
}
trap cleanup EXIT INT TERM

# ── Wait for server ────────────────────────────────────────────────────────────
echo -e "${CYAN}[WAIT] Waiting for engine to start...${RESET}"
for i in {1..15}; do
  if curl -sf http://127.0.0.1:7771/health &>/dev/null; then
    echo -e "${GREEN}  ✓ Engine is ready!${RESET}"
    break
  fi
  sleep 1
done

echo ""

# ── Launch CLI ─────────────────────────────────────────────────────────────────
echo -e "${GREEN}[START] Launching Astra-AI CLI...${RESET}"
echo ""
node cli/agent.js init
