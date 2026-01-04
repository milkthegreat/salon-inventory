const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("salon", {
  ping: () => ipcRenderer.invoke("app.ping"),
  dbPath: () => ipcRenderer.invoke("db.path"),

  products: {
    list: () => ipcRenderer.invoke("products.list"),
    upsert: (p) => ipcRenderer.invoke("products.upsert", p),
    delete: (id) => ipcRenderer.invoke("products.delete", id),
  },

  inventory: {
    adjust: (x) => ipcRenderer.invoke("inventory.adjust", x),
    receive: (x) => ipcRenderer.invoke("inventory.receive", x),
    useBackbar: (x) => ipcRenderer.invoke("inventory.useBackbar", x),
  },

  sales: {
    create: (x) => ipcRenderer.invoke("sales.create", x),
  },

  expenses: {
    list: (x) => ipcRenderer.invoke("expenses.list", x),
    create: (x) => ipcRenderer.invoke("expenses.create", x),
    delete: (id) => ipcRenderer.invoke("expenses.delete", id),
  },

  reports: {
    dashboard: (x) => ipcRenderer.invoke("reports.dashboard", x),
    productPL: (x) => ipcRenderer.invoke("reports.productPL", x),
    expensesByCategory: (x) => ipcRenderer.invoke("reports.expensesByCategory", x),
  },

  exportCsv: (x) => ipcRenderer.invoke("notes.exportCsv", x),
});
