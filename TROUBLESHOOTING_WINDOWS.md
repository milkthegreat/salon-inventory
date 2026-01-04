# Windows build troubleshooting

## The error you hit (better-sqlite3 / node-gyp / Python)
This happens when you're using a very new Node.js version (like **Node 24**).
`better-sqlite3` ships prebuilt binaries for LTS Node versions, but not always for newest releases.
When no prebuilt binary exists, npm tries to compile it, which requires Python + build tools.

**Fix:** Use **Node.js 20 LTS** (recommended) or Node 22.

### Step-by-step fix (recommended)
1. Uninstall Node.js 24 from Windows Apps.
2. Install **Node.js 20 LTS** from the official Node site.
3. Move the project folder to a short path like:
   `C:\SalonInventoryBuild\`
   (Avoid Downloads/OneDrive — permissions/antivirus often interfere.)
4. Double-click `build_windows.bat` again.

## EPERM / operation not permitted (cleanup errors)
Usually caused by:
- Antivirus scanning node_modules
- OneDrive “controlled folder access”
- Files locked by VS Code/Explorer previews

Fixes:
- Close VS Code and any terminals using the folder
- Move folder to `C:\SalonInventoryBuild\`
- Temporarily disable antivirus real-time scanning
- Re-run `build_windows.bat`

## If you must compile (not recommended)
Install:
- Python 3 (from Microsoft Store)
- Visual Studio Build Tools (C++ build tools)
Then run:
- `npm config set python "C:\Path\To\python.exe"`
But again: easiest is using Node 20 LTS so compilation is not needed.
