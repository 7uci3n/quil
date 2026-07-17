#!/bin/bash
set -e

echo "Verifying project tooling..."

# Node.js
if command -v node &> /dev/null; then
  echo "✓ Node.js $(node --version)"
else
  echo "✗ Node.js not installed (v20+ required)"
  exit 1
fi

# npm dependencies installed
if [ -d "node_modules" ]; then
  echo "✓ Dependencies installed"
else
  echo "⚠ node_modules missing. Run: npm ci"
fi

# TypeScript
if npx --no-install tsc --version &> /dev/null; then
  echo "✓ TypeScript $(npx --no-install tsc --version)"
else
  echo "⚠ TypeScript not available. Run: npm ci"
fi

# GitHub CLI (optional)
if command -v gh &> /dev/null; then
  if gh auth status &> /dev/null; then
    echo "✓ GitHub CLI authenticated"
  else
    echo "⚠ GitHub CLI not authenticated. Run: gh auth login"
  fi
else
  echo "⚠ GitHub CLI not installed (optional)"
fi

# .env present
if [ -f ".env" ]; then
  echo "✓ .env present"
else
  echo "⚠ .env missing. Run: cp .env.example .env  (then fill in DISCORD_TOKEN, APP_ID, GUILD_ID)"
fi

echo ""
echo "Tooling verification complete!"
