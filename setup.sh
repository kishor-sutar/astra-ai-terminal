#!/usr/bin/env bash
# Astra-AI Global Setup
# Installs `astra-agent` as a global CLI command

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  Installing Astra-AI globally..."

# Ensure agent.js is executable
chmod +x cli/agent.js

# Install CLI globally via npm link
cd cli
npm install
npm link

cd "$SCRIPT_DIR"

echo ""
echo "  ✓ Done! You can now run:"
echo "      astra-agent init"
echo "      astra-agent help"
echo ""
echo "  Don't forget to start the Python engine first:"
echo "      cd server && python main.py"
echo ""
