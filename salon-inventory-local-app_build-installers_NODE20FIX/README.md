# Salon Inventory (Standalone Desktop App)

This is a **desktop app** (Windows/Mac/Linux) for salon inventory, per-product profit & loss, and a money-in/money-out ledger.
It stores everything locally in SQLite.

## For your customers (non-technical)
They should **never** run any commands.

You will give them:
- **Windows**: `Salon Inventory Setup.exe` (installer)
- **Mac**: `Salon Inventory.dmg`
- **Linux**: `Salon Inventory.AppImage`

They just **download → double-click → install → open**.

## For you (the builder)
You build installers one time, then share the installer files.

### Windows easiest path
1. Install Node.js (LTS) once.
2. Double-click: `build_windows.bat`
3. Your installer will be in: `dist_electron/`

### macOS/Linux
```bash
chmod +x build_mac_linux.sh
./build_mac_linux.sh
```

## Zero-hassle cloud builds (recommended)
If you don't want to build on your own computer, use **GitHub Actions**:

1. Create a GitHub repo and upload this folder.
2. Push a tag like `v1.0.0`
3. GitHub will automatically build installers for:
   - Windows
   - macOS
   - Linux
4. Download the artifacts from the workflow or the Release assets.

Workflow file: `.github/workflows/build-and-release.yml`

## Database location
The SQLite file is created on first launch:
- Windows: `%APPDATA%/Salon Inventory/salon_inventory.sqlite`
- macOS: `~/Library/Application Support/Salon Inventory/salon_inventory.sqlite`
- Linux: `~/.config/Salon Inventory/salon_inventory.sqlite`

## What’s inside
- Products (price, avg cost, reorder point, on-hand)
- Receive shipments (updates moving average cost + records OUT inventory purchase)
- Retail sales (records IN retail revenue + per-product COGS + decrements stock)
- Backbar usage (records OUT backbar supply expense + decrements stock)
- Adjustments/shrink
- Reports (Product P&L, expenses by category) + CSV export
