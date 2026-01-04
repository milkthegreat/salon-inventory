export function fmtMoney(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
export function toCents(str) {
  const n = Number(String(str || "").replace(/[^0-9.-]/g, "")) || 0;
  return Math.round(n * 100);
}
