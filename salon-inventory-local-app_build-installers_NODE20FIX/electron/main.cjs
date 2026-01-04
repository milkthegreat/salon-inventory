const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const isDev = !app.isPackaged;

const { db, initDb, api } = require("./db.cjs");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 800,
    backgroundColor: "#0b0f19",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  initDb();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC wiring
ipcMain.handle("app.ping", () => ({ ok: true, version: app.getVersion() }));
ipcMain.handle("db.path", () => ({ path: api.getDbPath() }));

ipcMain.handle("products.list", () => api.products.list());
ipcMain.handle("products.upsert", (e, payload) => api.products.upsert(payload));
ipcMain.handle("products.delete", (e, id) => api.products.delete(id));

ipcMain.handle("inventory.adjust", (e, payload) => api.inventory.adjust(payload));
ipcMain.handle("inventory.receive", (e, payload) => api.inventory.receive(payload));
ipcMain.handle("inventory.useBackbar", (e, payload) => api.inventory.useBackbar(payload));
ipcMain.handle("sales.create", (e, payload) => api.sales.create(payload));

ipcMain.handle("expenses.list", (e, payload) => api.expenses.list(payload));
ipcMain.handle("expenses.create", (e, payload) => api.expenses.create(payload));
ipcMain.handle("expenses.delete", (e, id) => api.expenses.delete(id));

ipcMain.handle("reports.dashboard", (e, payload) => api.reports.dashboard(payload));
ipcMain.handle("reports.productPL", (e, payload) => api.reports.productPL(payload));
ipcMain.handle("reports.expensesByCategory", (e, payload) => api.reports.expensesByCategory(payload));

ipcMain.handle("notes.exportCsv", async (e, { filename, csv }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename || "export.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    require("fs").writeFileSync(filePath, csv, "utf-8");
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
