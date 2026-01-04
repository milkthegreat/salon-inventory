#!/usr/bin/env bash
set -euo pipefail
echo "================================"
echo "Salon Inventory - Build Installer (macOS/Linux)"
echo "================================"
echo "This will create an installer in dist_electron/"
echo
npm install
npm run dist
echo
echo "DONE. Look in: dist_electron/"
