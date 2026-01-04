import React, { useEffect, useMemo, useState } from "react";
import { fmtMoney, toCents } from "./money.js";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "receive", label: "Receive" },
  { key: "sales", label: "Retail Sales" },
  { key: "backbar", label: "Backbar Use" },
  { key: "adjust", label: "Adjustments" },
  { key: "expenses", label: "Expenses" },
  { key: "reports", label: "Product P&L" },
];

function isoDate(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function firstOfMonth() {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);

  const [products, setProducts] = useState([]);
  const [dbPath, setDbPath] = useState("");

  // date range for reports/ledger
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(isoDate(new Date()));

  async function refreshProducts() {
    const list = await window.salon.products.list();
    setProducts(list);
  }

  useEffect(() => {
    (async () => {
      const ping = await window.salon.ping();
      const p = await window.salon.dbPath();
      setDbPath(p.path);
      await refreshProducts();
      setToast(`Loaded • v${ping.version}`);
      setTimeout(() => setToast(null), 1500);
    })();
  }, []);

  const productOptions = useMemo(
    () => products.map(p => ({ value: p.id, label: `${p.name}${p.brand ? " • " + p.brand : ""}` })),
    [products]
  );

  return (
    <>
      <div className="topbar">
        <div className="row" style={{ gap: 12 }}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>Salon Inventory</div>
            <div className="small" title={dbPath}>Local DB: {dbPath}</div>
          </div>
        </div>
        <div className="nav">
          {TABS.map(t => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="container">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button onClick={refreshProducts}>Refresh</button>
          </div>
        </div>

        <div style={{ height: 10 }} />

        {tab === "dashboard" && <Dashboard from={from} to={to} />}
        {tab === "products" && <Products products={products} onChanged={refreshProducts} />}
        {tab === "receive" && <Receive products={products} options={productOptions} onDone={refreshProducts} />}
        {tab === "sales" && <Sales products={products} options={productOptions} onDone={refreshProducts} />}
        {tab === "backbar" && <Backbar products={products} options={productOptions} onDone={refreshProducts} />}
        {tab === "adjust" && <Adjust products={products} options={productOptions} onDone={refreshProducts} />}
        {tab === "expenses" && <Expenses from={from} to={to} />}
        {tab === "reports" && <ProductPL from={from} to={to} />}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function Dashboard({ from, to }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      const res = await window.salon.reports.dashboard({ from, to });
      setData(res);
    })();
  }, [from, to]);

  if (!data) return <div className="card">Loading…</div>;

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      <div className="kpi">
        <div className="v">{Number(data.product_count || 0)}</div>
        <div className="k">Products</div>
      </div>
      <div className="kpi">
        <div className="v">{Number(data.units_on_hand || 0).toFixed(0)}</div>
        <div className="k">Units on hand</div>
      </div>
      <div className="kpi">
        <div className="v">{fmtMoney(data.inventory_value_cents || 0)}</div>
        <div className="k">Inventory value (at avg cost)</div>
      </div>
      <div className="kpi">
        <div className="v">{fmtMoney(data.net_cents || 0)}</div>
        <div className="k">Net (Incoming − Outgoing) in range</div>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2>Range totals</h2>
            <div className="small">From {from} to {to}</div>
          </div>
          <div className="row">
            <div className="pill">Incoming: {fmtMoney(data.incoming_cents || 0)}</div>
            <div className="pill">Outgoing: {fmtMoney(data.outgoing_cents || 0)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Products({ products, onChanged }) {
  const blank = { name: "", sku: "", brand: "", category: "", retail_price_cents: 0, avg_cost_cents: 0, reorder_point: 0, on_hand_qty: 0 };
  const [form, setForm] = useState(blank);

  async function save() {
    if (!form.name.trim()) return alert("Name is required.");
    await window.salon.products.upsert(form);
    setForm(blank);
    await onChanged();
  }

  async function edit(p) {
    setForm({ ...p });
  }

  async function del(id) {
    if (!confirm("Delete product? This removes it and its movement history.")) return;
    await window.salon.products.delete(id);
    await onChanged();
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "420px 1fr" }}>
      <div className="card">
        <h2>{form.id ? "Edit product" : "Add product"}</h2>
        <div className="grid" style={{ marginTop: 10 }}>
          <label>Name <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <div className="row">
            <label style={{ flex: 1 }}>SKU <input value={form.sku || ""} onChange={e => setForm({ ...form, sku: e.target.value })} /></label>
            <label style={{ flex: 1 }}>Brand <input value={form.brand || ""} onChange={e => setForm({ ...form, brand: e.target.value })} /></label>
          </div>
          <label>Category <input value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })} /></label>
          <div className="row">
            <label style={{ flex: 1 }}>Retail price ($)
              <input value={(form.retail_price_cents || 0) / 100} onChange={e => setForm({ ...form, retail_price_cents: toCents(e.target.value) })} />
            </label>
            <label style={{ flex: 1 }}>Avg cost ($)
              <input value={(form.avg_cost_cents || 0) / 100} onChange={e => setForm({ ...form, avg_cost_cents: toCents(e.target.value) })} />
            </label>
          </div>
          <div className="row">
            <label style={{ flex: 1 }}>Reorder point
              <input type="number" value={form.reorder_point || 0} onChange={e => setForm({ ...form, reorder_point: Number(e.target.value) })} />
            </label>
            <label style={{ flex: 1 }}>On hand
              <input type="number" value={form.on_hand_qty || 0} onChange={e => setForm({ ...form, on_hand_qty: Number(e.target.value) })} />
            </label>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button onClick={() => setForm(blank)}>Clear</button>
            <div className="row">
              <button onClick={save}>{form.id ? "Save changes" : "Add product"}</button>
            </div>
          </div>
          <div className="small">Tip: When you receive inventory, avg cost auto-updates via moving average.</div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Products</h2>
          <div className="pill">{products.length} items</div>
        </div>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Name</th><th>Brand</th><th>Category</th>
              <th>On hand</th><th>Retail</th><th>Avg cost</th><th>Reorder</th><th></th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 700 }}>{p.name}</td>
                <td>{p.brand || ""}</td>
                <td>{p.category || ""}</td>
                <td>{Number(p.on_hand_qty || 0).toFixed(0)}</td>
                <td>{fmtMoney(p.retail_price_cents || 0)}</td>
                <td>{fmtMoney(p.avg_cost_cents || 0)}</td>
                <td>{Number(p.reorder_point || 0)}</td>
                <td className="row" style={{ justifyContent: "flex-end" }}>
                  <button onClick={() => edit(p)}>Edit</button>
                  <button onClick={() => del(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={8} className="small">No products yet. Add your first product on the left.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({ options, value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select…</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Receive({ products, options, onDone }) {
  const [product_id, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState("10.00");
  const [note, setNote] = useState("");

  const selected = products.find(p => p.id === product_id);

  async function submit() {
    if (!product_id) return alert("Pick a product");
    await window.salon.inventory.receive({
      product_id,
      qty_received: Number(qty),
      unit_cost_cents: toCents(unitCost),
      note
    });
    setQty(1); setUnitCost("10.00"); setNote("");
    await onDone();
    alert("Received.");
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="card">
        <h2>Receive inventory (Purchase)</h2>
        <div className="grid" style={{ marginTop: 10 }}>
          <label>Product <Select options={options} value={product_id} onChange={setProductId} /></label>
          <div className="row">
            <label style={{ flex: 1 }}>Qty received
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>Unit cost ($)
              <input value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            </label>
          </div>
          <label>Note <input value={note} onChange={e => setNote(e.target.value)} placeholder="Vendor / invoice / shipping note…" /></label>
          <button onClick={submit}>Receive</button>
          <div className="small">Receiving also creates an OUT expense under “Inventory Purchases”.</div>
        </div>
      </div>

      <div className="card">
        <h3>Selected product</h3>
        <hr />
        {!selected ? <div className="small">Select a product to see details.</div> : (
          <div className="grid">
            <div className="row">
              <div className="pill">On hand: {Number(selected.on_hand_qty || 0).toFixed(0)}</div>
              <div className="pill">Avg cost: {fmtMoney(selected.avg_cost_cents || 0)}</div>
              <div className="pill">Retail: {fmtMoney(selected.retail_price_cents || 0)}</div>
            </div>
            <div className="small">Weighted average cost updates automatically based on current on-hand quantity.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Sales({ products, options, onDone }) {
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ product_id: "", qty: 1 }]);

  const lineTotals = useMemo(() => {
    let revenue = 0, cogs = 0;
    for (const ln of lines) {
      const p = products.find(x => x.id === ln.product_id);
      if (!p) continue;
      const q = Number(ln.qty || 0);
      revenue += q * Number(p.retail_price_cents || 0);
      cogs += q * Number(p.avg_cost_cents || 0);
    }
    return { revenue, cogs, gp: revenue - cogs };
  }, [lines, products]);

  function setLine(i, patch) {
    setLines(prev => prev.map((l, idx) => idx === i ? ({ ...l, ...patch }) : l));
  }

  async function submit() {
    const clean = lines.filter(l => l.product_id && Number(l.qty) > 0);
    if (clean.length === 0) return alert("Add at least one product line.");
    await window.salon.sales.create({ note, lines: clean });
    setNote("");
    setLines([{ product_id: "", qty: 1 }]);
    await onDone();
    alert("Sale recorded.");
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 420px" }}>
      <div className="card">
        <h2>Retail sale</h2>
        <div className="grid" style={{ marginTop: 10 }}>
          <label>Note <input value={note} onChange={e => setNote(e.target.value)} placeholder="Customer / ticket note…" /></label>

          <table className="table">
            <thead>
              <tr><th>Product</th><th style={{ width: 120 }}>Qty</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => (
                <tr key={i}>
                  <td><Select options={options} value={ln.product_id} onChange={(v) => setLine(i, { product_id: v })} /></td>
                  <td><input type="number" value={ln.qty} onChange={e => setLine(i, { qty: Number(e.target.value) })} /></td>
                  <td className="row" style={{ justifyContent: "flex-end" }}>
                    <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} disabled={lines.length <= 1}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row">
            <button onClick={() => setLines(prev => [...prev, { product_id: "", qty: 1 }])}>Add line</button>
            <button onClick={submit}>Complete sale</button>
          </div>

          <div className="small">
            A sale creates: (1) inventory movements (SALE), (2) product COGS snapshot, (3) an IN ledger entry under “Retail Sales”.
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Preview totals (using current avg cost)</h3>
        <hr />
        <div className="grid">
          <div className="pill">Revenue: {fmtMoney(lineTotals.revenue)}</div>
          <div className="pill">COGS: {fmtMoney(lineTotals.cogs)}</div>
          <div className="pill">Gross profit: {fmtMoney(lineTotals.gp)}</div>
        </div>
      </div>
    </div>
  );
}

function Backbar({ products, options, onDone }) {
  const [product_id, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  const selected = products.find(p => p.id === product_id);
  const est = selected ? Math.round(Number(qty) * Number(selected.avg_cost_cents || 0)) : 0;

  async function submit() {
    if (!product_id) return alert("Pick a product");
    await window.salon.inventory.useBackbar({ product_id, qty_used: Number(qty), note });
    setQty(1); setNote("");
    await onDone();
    alert("Backbar usage recorded.");
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="card">
        <h2>Backbar usage (no revenue)</h2>
        <div className="grid" style={{ marginTop: 10 }}>
          <label>Product <Select options={options} value={product_id} onChange={setProductId} /></label>
          <label>Qty used <input type="number" value={qty} onChange={e => setQty(e.target.value)} /></label>
          <label>Note <input value={note} onChange={e => setNote(e.target.value)} placeholder="Service / stylist / reason…" /></label>
          <button onClick={submit}>Record usage</button>
          <div className="small">Creates an OUT expense under “Backbar Supplies” based on avg cost.</div>
        </div>
      </div>

      <div className="card">
        <h3>Cost preview</h3>
        <hr />
        <div className="grid">
          <div className="pill">Estimated cost: {fmtMoney(est)}</div>
          {selected && <div className="small">Uses current avg cost {fmtMoney(selected.avg_cost_cents || 0)} × qty.</div>}
        </div>
      </div>
    </div>
  );
}

function Adjust({ products, options, onDone }) {
  const [product_id, setProductId] = useState("");
  const [qtyDelta, setQtyDelta] = useState(-1);
  const [note, setNote] = useState("");

  async function submit() {
    if (!product_id) return alert("Pick a product");
    await window.salon.inventory.adjust({ product_id, qty_delta: Number(qtyDelta), note });
    setQtyDelta(-1); setNote("");
    await onDone();
    alert("Adjustment saved.");
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="card">
        <h2>Inventory adjustment (shrink / correction)</h2>
        <div className="grid" style={{ marginTop: 10 }}>
          <label>Product <Select options={options} value={product_id} onChange={setProductId} /></label>
          <label>Qty delta (negative removes, positive adds)
            <input type="number" value={qtyDelta} onChange={e => setQtyDelta(e.target.value)} />
          </label>
          <label>Note <input value={note} onChange={e => setNote(e.target.value)} placeholder="Damage / count correction / shrink…" /></label>
          <button onClick={submit}>Apply adjustment</button>
          <div className="small">Adjustments affect on-hand immediately and are logged as movements for audit.</div>
        </div>
      </div>

      <div className="card">
        <h3>Tip</h3>
        <hr />
        <div className="small">
          Use this for shrink, damaged goods, or cycle count corrections. The movement log keeps an audit trail.
        </div>
      </div>
    </div>
  );
}

function Expenses({ from, to }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ direction: "OUT", category: "Rent", amount: "0.00", memo: "" });

  async function load() {
    const res = await window.salon.expenses.list({ from, to });
    setRows(res);
  }

  useEffect(() => { load(); }, [from, to]);

  async function add() {
    await window.salon.expenses.create({
      direction: form.direction,
      category: form.category,
      amount_cents: toCents(form.amount),
      memo: form.memo
    });
    setForm({ ...form, amount: "0.00", memo: "" });
    await load();
  }

  async function del(id) {
    if (!confirm("Delete expense entry?")) return;
    await window.salon.expenses.delete(id);
    await load();
  }

  const totals = useMemo(() => {
    let inc = 0, out = 0;
    for (const r of rows) {
      if (r.direction === "IN") inc += Number(r.amount_cents || 0);
      else out += Number(r.amount_cents || 0);
    }
    return { inc, out, net: inc - out };
  }, [rows]);

  async function exportCsv() {
    const header = ["occurred_at","direction","category","amount_cents","memo"];
    const lines = [header.join(",")].concat(rows.map(r => header.map(k => JSON.stringify((r[k] ?? ""))).join(",")));
    const csv = lines.join("\n");
    await window.salon.exportCsv({ filename: `expenses_${from}_to_${to}.csv`, csv });
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "420px 1fr" }}>
      <div className="card">
        <h2>Expenses / Income ledger</h2>
        <div className="grid" style={{ marginTop: 10 }}>
          <label>Direction
            <select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}>
              <option value="OUT">OUT (money out)</option>
              <option value="IN">IN (money in)</option>
            </select>
          </label>
          <label>Category <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></label>
          <label>Amount ($) <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
          <label>Memo <input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} /></label>
          <button onClick={add}>Add entry</button>
          <div className="small">Inventory receiving and sales auto-create ledger entries; use this for everything else (rent, payroll, etc.).</div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Ledger entries</h2>
          <div className="row">
            <div className="pill">IN: {fmtMoney(totals.inc)}</div>
            <div className="pill">OUT: {fmtMoney(totals.out)}</div>
            <div className="pill">NET: {fmtMoney(totals.net)}</div>
            <button onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Date</th><th>Dir</th><th>Category</th><th>Amount</th><th>Memo</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{String(r.occurred_at).slice(0,10)}</td>
                <td><span className="pill">{r.direction}</span></td>
                <td>{r.category}</td>
                <td style={{ fontWeight: 700 }}>{fmtMoney(r.amount_cents || 0)}</td>
                <td className="small">{r.memo || ""}</td>
                <td><button onClick={() => del(r.id)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="small">No ledger entries in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductPL({ from, to }) {
  const [rows, setRows] = useState([]);
  const [catRows, setCatRows] = useState([]);

  useEffect(() => {
    (async () => {
      const pl = await window.salon.reports.productPL({ from, to });
      const cats = await window.salon.reports.expensesByCategory({ from, to });
      setRows(pl);
      setCatRows(cats);
    })();
  }, [from, to]);

  const totals = useMemo(() => {
    let rev=0,cogs=0,gp=0,bb=0,sh=0;
    for (const r of rows) {
      rev += r.revenue_cents || 0;
      cogs += r.cogs_cents || 0;
      gp += r.gross_profit_cents || 0;
      bb += r.backbar_cents || 0;
      sh += r.shrink_cents || 0;
    }
    return { rev,cogs,gp,bb,sh };
  }, [rows]);

  async function exportCsv() {
    const header = ["product_name","brand","category","units_sold","revenue_cents","cogs_cents","gross_profit_cents","gross_margin","backbar_cents","shrink_cents"];
    const lines = [header.join(",")].concat(rows.map(r => header.map(k => JSON.stringify((r[k] ?? ""))).join(",")));
    const csv = lines.join("\n");
    await window.salon.exportCsv({ filename: `product_pl_${from}_to_${to}.csv`, csv });
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2>Product P&L</h2>
            <div className="small">Range {from} to {to}</div>
          </div>
          <div className="row">
            <div className="pill">Revenue: {fmtMoney(totals.rev)}</div>
            <div className="pill">COGS: {fmtMoney(totals.cogs)}</div>
            <div className="pill">GP: {fmtMoney(totals.gp)}</div>
            <button onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Product</th><th>Brand</th><th>Category</th>
              <th>Units</th><th>Revenue</th><th>COGS</th><th>GP</th><th>Margin</th>
              <th>Backbar</th><th>Shrink</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.product_id}>
                <td style={{ fontWeight: 800 }}>{r.product_name}</td>
                <td>{r.brand || ""}</td>
                <td>{r.category || ""}</td>
                <td>{Number(r.units_sold || 0).toFixed(0)}</td>
                <td>{fmtMoney(r.revenue_cents || 0)}</td>
                <td>{fmtMoney(r.cogs_cents || 0)}</td>
                <td>{fmtMoney(r.gross_profit_cents || 0)}</td>
                <td>{((r.gross_margin || 0) * 100).toFixed(1)}%</td>
                <td>{fmtMoney(r.backbar_cents || 0)}</td>
                <td>{fmtMoney(r.shrink_cents || 0)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="small">No product sales in this range yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Expenses summary by category (range)</h3>
          <div className="small">Includes auto entries from receiving/sales plus manual ledger entries.</div>
        </div>
        <table className="table" style={{ marginTop: 10 }}>
          <thead><tr><th>Category</th><th>Incoming</th><th>Outgoing</th></tr></thead>
          <tbody>
            {catRows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700 }}>{r.category}</td>
                <td>{fmtMoney(r.incoming_cents || 0)}</td>
                <td>{fmtMoney(r.outgoing_cents || 0)}</td>
              </tr>
            ))}
            {catRows.length === 0 && <tr><td colSpan={3} className="small">No ledger data in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
