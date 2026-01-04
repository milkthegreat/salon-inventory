const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const Database = require("better-sqlite3");

let db;

function getDbPath() {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "salon_inventory.sqlite");
}

function connect() {
  const p = getDbPath();
  db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function initDb() {
  if (!db) connect();

  const schema = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT,
    brand TEXT,
    category TEXT,
    retail_price_cents INTEGER NOT NULL DEFAULT 0,
    avg_cost_cents INTEGER NOT NULL DEFAULT 0,
    reorder_point INTEGER NOT NULL DEFAULT 0,
    on_hand_qty REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- RECEIVE | SALE | BACKBAR_USE | ADJUSTMENT
    qty_delta REAL NOT NULL,
    unit_cost_cents INTEGER,
    avg_cost_snapshot_cents INTEGER NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    sold_at TEXT NOT NULL,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS sale_lines (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    unit_cost_snapshot_cents INTEGER NOT NULL,
    line_revenue_cents INTEGER NOT NULL,
    line_cogs_cents INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    direction TEXT NOT NULL, -- IN | OUT
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    memo TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_movements_product_time ON inventory_movements(product_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sale_lines_product ON sale_lines(product_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_time ON expenses(occurred_at);
  `;
  db.exec(schema);

  // Seed meta version
  const up = db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)");
  up.run("schema_version", "1");
}

function uid(prefix="") {
  const r = Math.random().toString(16).slice(2);
  return prefix + Date.now().toString(16) + r;
}

function nowIso() {
  return new Date().toISOString();
}

function requireDb() {
  if (!db) connect();
  return db;
}

// --- business logic ---
const api = {
  getDbPath,

  products: {
    list() {
      const d = requireDb();
      return d.prepare("SELECT * FROM products ORDER BY name COLLATE NOCASE").all();
    },
    upsert(p) {
      const d = requireDb();
      const t = nowIso();
      if (!p.id) {
        const id = uid("prd_");
        d.prepare(`
          INSERT INTO products (id,name,sku,brand,category,retail_price_cents,avg_cost_cents,reorder_point,on_hand_qty,created_at,updated_at)
          VALUES (@id,@name,@sku,@brand,@category,@retail_price_cents,@avg_cost_cents,@reorder_point,@on_hand_qty,@created_at,@updated_at)
        `).run({
          id,
          name: String(p.name || "").trim(),
          sku: p.sku || null,
          brand: p.brand || null,
          category: p.category || null,
          retail_price_cents: Number(p.retail_price_cents || 0),
          avg_cost_cents: Number(p.avg_cost_cents || 0),
          reorder_point: Number(p.reorder_point || 0),
          on_hand_qty: Number(p.on_hand_qty || 0),
          created_at: t,
          updated_at: t,
        });
        return { ok: true, id };
      } else {
        d.prepare(`
          UPDATE products SET
            name=@name, sku=@sku, brand=@brand, category=@category,
            retail_price_cents=@retail_price_cents,
            avg_cost_cents=@avg_cost_cents,
            reorder_point=@reorder_point,
            on_hand_qty=@on_hand_qty,
            updated_at=@updated_at
          WHERE id=@id
        `).run({
          id: p.id,
          name: String(p.name || "").trim(),
          sku: p.sku || null,
          brand: p.brand || null,
          category: p.category || null,
          retail_price_cents: Number(p.retail_price_cents || 0),
          avg_cost_cents: Number(p.avg_cost_cents || 0),
          reorder_point: Number(p.reorder_point || 0),
          on_hand_qty: Number(p.on_hand_qty || 0),
          updated_at: t,
        });
        return { ok: true, id: p.id };
      }
    },
    delete(id) {
      const d = requireDb();
      d.prepare("DELETE FROM products WHERE id=?").run(id);
      return { ok: true };
    }
  },

  inventory: {
    // manual adjustment (+ or -)
    adjust({ product_id, qty_delta, note }) {
      const d = requireDb();
      const p = d.prepare("SELECT * FROM products WHERE id=?").get(product_id);
      if (!p) throw new Error("Product not found");
      const newQty = Number(p.on_hand_qty) + Number(qty_delta);
      d.prepare("UPDATE products SET on_hand_qty=?, updated_at=? WHERE id=?").run(newQty, nowIso(), product_id);

      d.prepare(`
        INSERT INTO inventory_movements (id,product_id,type,qty_delta,unit_cost_cents,avg_cost_snapshot_cents,reference_type,reference_id,note,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(uid("mov_"), product_id, "ADJUSTMENT", Number(qty_delta), null, Number(p.avg_cost_cents), null, null, note || null, nowIso());
      return { ok: true, on_hand_qty: newQty };
    },

    // receive purchase: updates moving average cost
    receive({ product_id, qty_received, unit_cost_cents, note }) {
      const d = requireDb();
      const p = d.prepare("SELECT * FROM products WHERE id=?").get(product_id);
      if (!p) throw new Error("Product not found");
      const oldQty = Number(p.on_hand_qty);
      const oldAvg = Number(p.avg_cost_cents);
      const q = Number(qty_received);
      const c = Number(unit_cost_cents);

      if (q <= 0) throw new Error("qty_received must be > 0");
      if (c < 0) throw new Error("unit_cost_cents must be >= 0");

      const newQty = oldQty + q;
      // weighted average cost
      const newAvg = newQty === 0 ? 0 : Math.round(((oldQty * oldAvg) + (q * c)) / newQty);

      const tx = d.transaction(() => {
        d.prepare("UPDATE products SET on_hand_qty=?, avg_cost_cents=?, updated_at=? WHERE id=?")
          .run(newQty, newAvg, nowIso(), product_id);

        d.prepare(`
          INSERT INTO inventory_movements (id,product_id,type,qty_delta,unit_cost_cents,avg_cost_snapshot_cents,reference_type,reference_id,note,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        `).run(uid("mov_"), product_id, "RECEIVE", q, c, newAvg, null, null, note || null, nowIso());

        // create expense OUT for inventory purchase line total
        const amount = Math.round(q * c);
        d.prepare(`
          INSERT INTO expenses (id,occurred_at,direction,category,amount_cents,memo)
          VALUES (?,?,?,?,?,?)
        `).run(uid("exp_"), nowIso(), "OUT", "Inventory Purchases", amount, note ? `Receive: ${note}` : "Inventory receive");
      });

      tx();
      return { ok: true, on_hand_qty: newQty, avg_cost_cents: newAvg };
    },

    useBackbar({ product_id, qty_used, note }) {
      const d = requireDb();
      const p = d.prepare("SELECT * FROM products WHERE id=?").get(product_id);
      if (!p) throw new Error("Product not found");
      const q = Number(qty_used);
      if (q <= 0) throw new Error("qty_used must be > 0");

      const newQty = Number(p.on_hand_qty) - q;
      d.prepare("UPDATE products SET on_hand_qty=?, updated_at=? WHERE id=?").run(newQty, nowIso(), product_id);

      const cogs = Math.round(q * Number(p.avg_cost_cents));

      const tx = d.transaction(() => {
        d.prepare(`
          INSERT INTO inventory_movements (id,product_id,type,qty_delta,unit_cost_cents,avg_cost_snapshot_cents,reference_type,reference_id,note,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        `).run(uid("mov_"), product_id, "BACKBAR_USE", -q, null, Number(p.avg_cost_cents), null, null, note || null, nowIso());

        d.prepare(`
          INSERT INTO expenses (id,occurred_at,direction,category,amount_cents,memo)
          VALUES (?,?,?,?,?,?)
        `).run(uid("exp_"), nowIso(), "OUT", "Backbar Supplies", cogs, note ? `Backbar: ${note}` : "Backbar use");
      });
      tx();

      return { ok: true, on_hand_qty: newQty };
    }
  },

  sales: {
    create({ sold_at, note, lines }) {
      const d = requireDb();
      const saleId = uid("sal_");
      const t = sold_at ? new Date(sold_at).toISOString() : nowIso();
      const tx = d.transaction(() => {
        d.prepare("INSERT INTO sales(id,sold_at,note) VALUES (?,?,?)").run(saleId, t, note || null);

        let totalRevenue = 0;

        for (const ln of (lines || [])) {
          const product = d.prepare("SELECT * FROM products WHERE id=?").get(ln.product_id);
          if (!product) throw new Error("Product not found in sale line");

          const qty = Number(ln.qty);
          if (qty <= 0) throw new Error("Line qty must be > 0");

          const unitPrice = Number(ln.unit_price_cents ?? product.retail_price_cents ?? 0);
          const unitCost = Number(product.avg_cost_cents ?? 0);

          const revenue = Math.round(qty * unitPrice);
          const cogs = Math.round(qty * unitCost);

          totalRevenue += revenue;

          // reduce stock
          const newQty = Number(product.on_hand_qty) - qty;
          d.prepare("UPDATE products SET on_hand_qty=?, updated_at=? WHERE id=?").run(newQty, nowIso(), product.id);

          // sale line
          d.prepare(`
            INSERT INTO sale_lines (id,sale_id,product_id,qty,unit_price_cents,unit_cost_snapshot_cents,line_revenue_cents,line_cogs_cents)
            VALUES (?,?,?,?,?,?,?,?)
          `).run(uid("sln_"), saleId, product.id, qty, unitPrice, unitCost, revenue, cogs);

          // inventory movement
          d.prepare(`
            INSERT INTO inventory_movements (id,product_id,type,qty_delta,unit_cost_cents,avg_cost_snapshot_cents,reference_type,reference_id,note,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
          `).run(uid("mov_"), product.id, "SALE", -qty, null, unitCost, "SALE", saleId, note || null, nowIso());
        }

        // ledger incoming for retail revenue
        d.prepare(`
          INSERT INTO expenses (id,occurred_at,direction,category,amount_cents,memo)
          VALUES (?,?,?,?,?,?)
        `).run(uid("exp_"), t, "IN", "Retail Sales", totalRevenue, note ? `Sale: ${note}` : `Sale ${saleId}`);
      });

      tx();
      return { ok: true, id: saleId };
    }
  },

  expenses: {
    list({ from, to } = {}) {
      const d = requireDb();
      const f = from ? new Date(from).toISOString() : "1970-01-01T00:00:00.000Z";
      const tt = to ? new Date(to).toISOString() : "2999-12-31T00:00:00.000Z";
      return d.prepare(`
        SELECT * FROM expenses
        WHERE occurred_at BETWEEN ? AND ?
        ORDER BY occurred_at DESC
      `).all(f, tt);
    },
    create({ occurred_at, direction, category, amount_cents, memo }) {
      const d = requireDb();
      const id = uid("exp_");
      const t = occurred_at ? new Date(occurred_at).toISOString() : nowIso();
      d.prepare(`
        INSERT INTO expenses (id,occurred_at,direction,category,amount_cents,memo)
        VALUES (?,?,?,?,?,?)
      `).run(id, t, direction, category, Number(amount_cents || 0), memo || null);
      return { ok: true, id };
    },
    delete(id) {
      const d = requireDb();
      d.prepare("DELETE FROM expenses WHERE id=?").run(id);
      return { ok: true };
    }
  },

  reports: {
    dashboard({ from, to } = {}) {
      const d = requireDb();
      const f = from ? new Date(from).toISOString() : "1970-01-01T00:00:00.000Z";
      const tt = to ? new Date(to).toISOString() : "2999-12-31T00:00:00.000Z";

      const inv = d.prepare(`
        SELECT
          COUNT(*) as product_count,
          SUM(on_hand_qty) as units_on_hand,
          SUM(on_hand_qty * avg_cost_cents) as inventory_value_cents
        FROM products
      `).get();

      const ledger = d.prepare(`
        SELECT
          SUM(CASE WHEN direction='IN' THEN amount_cents ELSE 0 END) as incoming_cents,
          SUM(CASE WHEN direction='OUT' THEN amount_cents ELSE 0 END) as outgoing_cents
        FROM expenses
        WHERE occurred_at BETWEEN ? AND ?
      `).get(f, tt);

      const net = Number(ledger.incoming_cents || 0) - Number(ledger.outgoing_cents || 0);
      return { ...inv, ...ledger, net_cents: net };
    },

    productPL({ from, to } = {}) {
      const d = requireDb();
      const f = from ? new Date(from).toISOString() : "1970-01-01T00:00:00.000Z";
      const tt = to ? new Date(to).toISOString() : "2999-12-31T00:00:00.000Z";

      // Revenue/COGS from sale_lines
      const rows = d.prepare(`
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.brand,
          p.category,
          SUM(sl.qty) as units_sold,
          SUM(sl.line_revenue_cents) as revenue_cents,
          SUM(sl.line_cogs_cents) as cogs_cents
        FROM sale_lines sl
        JOIN sales s ON s.id = sl.sale_id
        JOIN products p ON p.id = sl.product_id
        WHERE s.sold_at BETWEEN ? AND ?
        GROUP BY p.id
        ORDER BY revenue_cents DESC
      `).all(f, tt);

      // Backbar and shrink costs from movements (optional detail)
      const backbar = d.prepare(`
        SELECT product_id, SUM(ABS(qty_delta) * avg_cost_snapshot_cents) as backbar_cents
        FROM inventory_movements
        WHERE type='BACKBAR_USE' AND created_at BETWEEN ? AND ?
        GROUP BY product_id
      `).all(f, tt);

      const shrink = d.prepare(`
        SELECT product_id, SUM(ABS(qty_delta) * avg_cost_snapshot_cents) as shrink_cents
        FROM inventory_movements
        WHERE type='ADJUSTMENT' AND qty_delta < 0 AND created_at BETWEEN ? AND ?
        GROUP BY product_id
      `).all(f, tt);

      const bMap = new Map(backbar.map(r => [r.product_id, Number(r.backbar_cents || 0)]));
      const sMap = new Map(shrink.map(r => [r.product_id, Number(r.shrink_cents || 0)]));

      return rows.map(r => {
        const revenue = Number(r.revenue_cents || 0);
        const cogs = Number(r.cogs_cents || 0);
        const gp = revenue - cogs;
        const margin = revenue > 0 ? gp / revenue : 0;
        const bb = bMap.get(r.product_id) || 0;
        const sh = sMap.get(r.product_id) || 0;
        return { ...r, revenue_cents: revenue, cogs_cents: cogs, gross_profit_cents: gp, gross_margin: margin, backbar_cents: bb, shrink_cents: sh };
      });
    },

    expensesByCategory({ from, to } = {}) {
      const d = requireDb();
      const f = from ? new Date(from).toISOString() : "1970-01-01T00:00:00.000Z";
      const tt = to ? new Date(to).toISOString() : "2999-12-31T00:00:00.000Z";
      return d.prepare(`
        SELECT category,
          SUM(CASE WHEN direction='IN' THEN amount_cents ELSE 0 END) as incoming_cents,
          SUM(CASE WHEN direction='OUT' THEN amount_cents ELSE 0 END) as outgoing_cents
        FROM expenses
        WHERE occurred_at BETWEEN ? AND ?
        GROUP BY category
        ORDER BY outgoing_cents DESC
      `).all(f, tt);
    }
  }
};

module.exports = { db, initDb, api };
