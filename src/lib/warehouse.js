// Warehouse data helpers — parsing, grouping, maths, persistence.
// Record shape: { date:'YYYY-MM-DD', plant, article, code, uom, opening, receipt, cons, closing, hasCons? }

export const LS_RECORDS = "mtc_warehouse_records_v1";
export const LS_META = "mtc_warehouse_meta_v1";
export const LS_THEME = "mtc_warehouse_theme_v1";

export function fmt(n, d) {
  n = +n || 0;
  const auto = d == null ? (Math.abs(n) < 10 && n % 1 !== 0 ? 1 : 0) : d;
  return n.toLocaleString("en-IN", { maximumFractionDigits: auto });
}

export function f2(dt) {
  return (
    dt.getFullYear() +
    "-" +
    String(dt.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getDate()).padStart(2, "0")
  );
}

export function todayStr() {
  return f2(new Date());
}

const MONTHS = { "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun", "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec" };
export function dstr(s) {
  if (!s) return "-";
  const p = String(s).split("-");
  if (p.length < 3) return s;
  return `${p[2].replace(/^0/, "")} ${MONTHS[p[1]] || p[1]} ${p[0]}`;
}

export function parseNum(s) {
  if (s == null || s === "") return 0;
  const v = String(s).trim().replace(/,/g, "");
  if (v === "-" || v === "") return 0;
  const m = v.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

export function parseDate(s) {
  if (s == null || s === "") return "";
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const n = parseFloat(String(s).replace(/,/g, ""));
  if (n > 20000 && n < 80000) {
    const t = Date.UTC(1899, 11, 30) + Math.round(n * 864e5);
    const d = new Date(t);
    return f2(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return "";
}

/* ---------------- categories (auto-detect) ---------------- */

const PACK_WORDS = [
  "film", "polyester", "poly", "carton", "box", "hdpe", "bag", "tape",
  "liner", "sachet", "corrugat", "thread", "pouch", "laminat", "foil",
  "chest", "stitch", "bopp", "outer", "jar",
];

export function categorize(article) {
  const a = String(article || "").toLowerCase();
  if (PACK_WORDS.some((w) => a.includes(w))) return "Packing Material";
  return "Tea & Flavours";
}

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/* ---------------- generic grid parsing (CSV path) ---------------- */

function splitCells(text, d) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else {
      if (c === '"' && cur === "") q = true;
      else if (c === d) { row.push(cur); cur = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") {
        row.push(cur); cur = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else cur += c;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const norm = (s) =>
  String(s ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[._\-/\\()[\]:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ARTICLE_NAMES = [
  "short text", "short descr", "material description", "mat description",
  "material desc", "mat desc", "article name", "item name", "product name",
  "material name", "item description", "article description", "stock description",
  "description", "article", "product", "item", "goods", "commodity",
  "particular", "particulars", "nomenclature", "name", "material",
];
const PLANT_NAMES = [
  "plant", "plnt", "location", "site", "depot", "warehouse",
  "godown", "branch", "storage location", "sloc", "division",
];
const DATE_NAMES = [
  "posting date", "document date", "doc date", "stock date",
  "as on", "on date", "date of stock", "date", "day", "posting",
];
const CLOSE_NAMES = [
  "currant stock qty", "current stock qty", "currant stock", "current stock",
  "stock qty", "stock quantity", "closing stock", "close stock", "closing qty",
  "available stock", "total stock", "ending stock", "physical stock",
  "system stock", "book stock", "in stock", "hand stock", "on hand",
  "unrestricted", "balance qty", "net stock", "current", "currant",
  "closing", "balance", "stock", "quantity", "qty", "close", "ending",
];
const OPEN_NAMES = ["opening", "open stock", "open qty", "start", "beginning"];
const REC_NAMES = ["receipt", "inward", "grn", "received", "receipt qty", "purchase qty", "purchase", "in qty"];
const CONS_NAMES = ["consumption", "consumption qty", "usage", "issue", "issued", "consumed", "dispatch", "dispatched", "sales", "sale", "utilization", "utilisation", "out qty"];
const UOM_NAMES = ["uom", "oun", "unit", "uom code", "base uom"];
const CODE_NAMES = ["material code", "article code", "item code", "product code", "material no", "material number", "mat code", "mat no", "code", "sku"];
const VENDOR_NAMES = [
  "vendor name", "supplier name", "supplier", "vendor", "seller",
  "party", "party name", "manufacturer", "brand", "source",
];

function findCol(H, names) {
  const clean = names.map(norm).filter(Boolean).sort((a, b) => b.length - a.length);
  let best = -1, bestScore = -1;
  for (let i = 0; i < H.length; i++) {
    const h = H[i];
    if (!h) continue;
    for (const n of clean) {
      let score = -1;
      if (h === n) score = 1000 + n.length; // exact header wins
      else if (h.includes(n)) score = n.length; // longer (more specific) name wins
      // Skip dangerously-generic short names unless nothing better matches.
      // e.g. "Item Code" must NOT beat "Item Name" via generic "item".
      if (score > bestScore) { bestScore = score; best = i; }
      if (score >= 1000) break; // can't beat exact match in this column
    }
  }
  // Reject weak generic-stub matches (score < 4 means only a 1-3 char fragment
  // matched, e.g. "day" inside "Monday"). Exact matches always score >= 1000.
  if (best >= 0 && bestScore < 4) return -1;
  return best;
}

function headerScore(H) {
  let s = 0;
  if (findCol(H, ARTICLE_NAMES) >= 0) s += 3;
  if (findCol(H, CLOSE_NAMES) >= 0) s += 2;
  if (findCol(H, DATE_NAMES) >= 0) s += 1;
  if (findCol(H, PLANT_NAMES) >= 0) s += 1;
  if (findCol(H, OPEN_NAMES) >= 0) s += 1;
  if (findCol(H, REC_NAMES) >= 0) s += 1;
  if (findCol(H, CONS_NAMES) >= 0) s += 1;
  if (findCol(H, VENDOR_NAMES) >= 0) s += 1;
  return s;
}

function headerLabel(grid, hi) {
  const row = grid[hi] || [];
  const txt = row.map((c) => String(c ?? "").trim()).join(" | ").slice(0, 220);
  return txt || "(blank row)";
}

// Fallback: column with the most text-like values (for Article when header wording is unknown)
function guessTextColumn(grid, hi) {
  const width = Math.max(...grid.slice(hi, hi + 30).map((r) => r.length));
  let best = -1, bestN = 0;
  for (let c = 0; c < width; c++) {
    let n = 0;
    for (let r = hi + 1; r < Math.min(grid.length, hi + 31); r++) {
      const v = String(grid[r][c] ?? "").trim();
      if (v.length < 3) continue;
      if (parseDate(v)) continue;
      if (v !== "" && isNaN(Number(v.replace(/,/g, "")))) n++;
    }
    if (n > bestN) { bestN = n; best = c; }
  }
  return bestN >= 1 ? best : -1;
}

// Fallback: right-most mostly-numeric column (for Closing when header wording is unknown)
function guessNumericColumn(grid, hi, skip = new Set()) {
  const width = Math.max(...grid.slice(hi, hi + 30).map((r) => r.length));
  for (let c = width - 1; c >= 0; c--) {
    if (skip.has(c)) continue;
    let num = 0, total = 0;
    for (let r = hi + 1; r < Math.min(grid.length, hi + 31); r++) {
      const v = String(grid[r][c] ?? "").trim();
      if (!v) continue;
      total++;
      if (v === "-" || !isNaN(Number(v.replace(/,/g, "")))) num++;
    }
    if (total >= 1 && num / total > 0.6) return c;
  }
  return -1;
}

/** Convert a 2D grid (first rows = headers) into stock records. Supports LONG + WIDE. */
export function gridToRecords(grid) {
  if (!grid || !grid.length) return { error: "Empty sheet — nothing to import." };
  grid = grid.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c))) : []));
  // Score every candidate header row (first 30) — old code stopped at the first
  // row mentioning plant/date, so title rows like "Plant: Sangamner" were
  // mistaken for headers and triggered the Article error.
  let hi = 0, best = -1;
  const scanN = Math.min(30, grid.length);
  for (let i = 0; i < scanN; i++) {
    const H = grid[i].map(norm);
    if (H.every((h) => !h)) continue;
    const s = headerScore(H);
    if (s > best) { best = s; hi = i; }
  }
  if (best <= 0) {
    // No recognisable header — fall back to first non-blank row so the
    // error below can show what was actually found.
    for (let i = 0; i < scanN; i++) {
      if (grid[i].some((c) => String(c ?? "").trim() !== "")) { hi = i; break; }
    }
  }
  const H = grid[hi].map(norm);

  // WIDE detection: ≥3 date-like headers
  const dateCols = [];
  for (let i = 0; i < H.length; i++) {
    if (parseDate(grid[hi][i])) dateCols.push(i);
  }
  if (dateCols.length >= 3) {
    let cArt = findCol(H, ARTICLE_NAMES);
    if (cArt < 0) cArt = guessTextColumn(grid, hi);
    const cPlant = findCol(H, PLANT_NAMES);
    const cUom = findCol(H, UOM_NAMES);
    const cVendor = findCol(H, VENDOR_NAMES);
    let cCode = H.indexOf("material");
    if (cCode === cArt) cCode = -1;
    if (cCode < 0) cCode = findCol(H, CODE_NAMES);
    if (cCode === cArt) cCode = -1;
    if (cArt < 0) return { error: `Could not find Article/Item column (row ${hi + 1}: ${headerLabel(grid, hi)}). Need: Date | Plant | Article | Closing.` };
    const out = [];
    for (let r = hi + 1; r < grid.length; r++) {
      const row = grid[r];
      const art = (row[cArt] || "").trim();
      if (!art) continue;
      const plant = (cPlant >= 0 ? (row[cPlant] || "").trim() : "Main") || "Main";
      for (const ci of dateCols) {
        const ds = parseDate(grid[hi][ci]);
        if (!ds) continue;
        out.push({
          date: ds, plant, article: art,
          code: cCode >= 0 ? (row[cCode] || "").trim() : "",
          vendor: cVendor >= 0 ? (row[cVendor] || "").trim() : "",
          uom: cUom >= 0 ? (row[cUom] || "").trim() : "",
          opening: 0, receipt: 0, cons: 0, closing: parseNum(row[ci]),
        });
      }
    }
    if (!out.length) return { error: "No data rows found in wide-format sheet." };
    return { records: finalizeDerived(out) };
  }

  // LONG format
  const cDate = findCol(H, DATE_NAMES);
  const cPlant = findCol(H, PLANT_NAMES);
  let cArt = findCol(H, ARTICLE_NAMES);
  let cCode = H.indexOf("material");
  if (cCode === cArt) cCode = -1;
  if (cCode < 0) cCode = findCol(H, CODE_NAMES);
  if (cCode === cArt) cCode = -1;
  const cUom = findCol(H, UOM_NAMES);
  const cVendor = findCol(H, VENDOR_NAMES);
  const cOpen = findCol(H, OPEN_NAMES);
  const cRec = findCol(H, REC_NAMES);
  const cCons = findCol(H, CONS_NAMES);
  let cClose = findCol(H, CLOSE_NAMES);

  if (cArt < 0) {
    const guess = guessTextColumn(grid, hi);
    if (guess >= 0) cArt = guess;
    else return { error: `Could not find Article/Item column (row ${hi + 1}: ${headerLabel(grid, hi)}). Need: Date | Plant | Article | Closing.` };
  }
  if (cClose < 0) {
    const skip = new Set([cArt, cDate, cPlant, cCode, cUom, cVendor, cOpen, cRec, cCons].filter((v) => v >= 0));
    const guess = guessNumericColumn(grid, hi, skip);
    if (guess >= 0) cClose = guess;
  }
  if (cDate < 0 && cClose < 0) return { error: `Need at least Date and Stock columns (row ${hi + 1}: ${headerLabel(grid, hi)}).` };

  const fallbackDate = todayStr();
  const out = [];
  for (let r = hi + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
    const artRaw = String(row[cArt] ?? "").trim();
    if (!artRaw) continue;
    // Skip repeated header rows / total rows that sneak into the body
    const artN = norm(artRaw);
    if (ARTICLE_NAMES.includes(artN) || artN === "short text" || artN === "total" || artN === "grand total") continue;
    let ds = cDate >= 0 ? parseDate(row[cDate]) : "";
    if (cDate >= 0 && !ds) continue;
    if (!ds) ds = fallbackDate; // Plant|Article|Closing snapshot without a Date column
    const plant = cPlant >= 0 ? ((row[cPlant] || "").trim() || "Main") : "Main";
    out.push({
      date: ds, plant, article: artRaw,
      code: cCode >= 0 ? (row[cCode] || "").trim() : "",
      vendor: cVendor >= 0 ? (row[cVendor] || "").trim() : "",
      uom: cUom >= 0 ? (row[cUom] || "").trim() : "",
      opening: cOpen >= 0 ? parseNum(row[cOpen]) : 0,
      receipt: cRec >= 0 ? parseNum(row[cRec]) : 0,
      cons: cCons >= 0 ? parseNum(row[cCons]) : 0,
      closing: cClose >= 0 ? parseNum(row[cClose]) : 0,
      hasCons: cCons >= 0 && String(row[cCons] ?? "").trim() !== "",
    });
  }
  if (!out.length) return { error: `No data rows found below row ${hi + 1}. Check the Excel Help tab — need Date | Plant | Article | Closing.` };
  return { records: finalizeDerived(out) };
}

function finalizeDerived(recs) {
  const groups = {};
  recs.forEach((r) => {
    const k = r.article + "||" + r.plant;
    (groups[k] = groups[k] || []).push(r);
  });
  for (const k in groups) {
    const g = groups[k].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (let i = 0; i < g.length; i++) {
      if (!g[i].hasCons) {
        if (i === 0) g[i].cons = 0;
        else g[i].cons = Math.max(0, (g[i - 1].closing || 0) - (g[i].closing || 0) + (g[i].receipt || 0));
      }
    }
  }
  return recs
    .filter((r) => r.date && r.date !== "9999-12-31")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function parseTextFile(text) {
  text = String(text || "").replace(/^\uFEFF/, "");
  if (text.indexOf("\x00") >= 0) {
    let s = "";
    for (let i = 0; i < text.length; i += 2) s += text[i];
    text = s;
  }
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  let d = "\t", best = 0;
  ["\t", ",", ";", "|"].forEach((x) => {
    const n = sample.split(x).length - 1;
    if (n > best) { best = n; d = x; }
  });
  if (best < 2) return { error: "No columns detected — export the sheet as CSV and retry." };
  return gridToRecords(splitCells(text, d));
}

export function recKey(r) {
  return `${r.date}||${String(r.plant || "").trim().toLowerCase()}||${String(r.article || "").trim().toLowerCase()}`;
}

/** Merge new records into existing (dedupe by Date×Plant×Article). Returns {merged, added, updated}. */
export function mergeRecords(existing, incoming) {
  const idx = new Map(existing.map((r, i) => [recKey(r), i]));
  const merged = existing.slice();
  let added = 0, updated = 0;
  for (const r of incoming) {
    const k = recKey(r);
    if (idx.has(k)) {
      merged[idx.get(k)] = r;
      updated++;
    } else {
      idx.set(k, merged.length);
      merged.push(r);
      added++;
    }
  }
  merged.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { merged, added, updated };
}

/* ---------------- maths ---------------- */

function avg(a) {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}

export function statusOf(stock, days, adu) {
  if (stock <= 0) return "Stockout";
  if (adu <= 0.0001) return "Dead";
  if (days < 7) return "Critical";
  if (days < 15) return "Low";
  if (days <= 45) return "OK";
  return "Overstock";
}

/** Per Article×Plant summary over the whole library (ADU = all-history average). */
export function computeSummaries(records, cover = 30) {
  const groups = {};
  for (const r of records) {
    const k = r.article + "||" + r.plant;
    (groups[k] = groups[k] || []).push(r);
  }
  const lastDate = records.length ? records[records.length - 1].date : todayStr();
  const out = [];
  for (const k in groups) {
    const g = groups[k].slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const histN = new Set(g.map((r) => r.date)).size;
    const adu = avg(g.map((r) => +r.cons || 0));
    const latest = g[g.length - 1];
    const stock = +latest.closing || 0;
    const days = adu > 0.0001 ? stock / adu : stock > 0 ? 9999 : 0;
    const monthly = adu * 30;
    const target = adu * (cover + 7) * 1.1;
    const order = Math.max(0, Math.ceil(target - stock));
    const runout = adu > 0.0001 ? new Date(new Date(lastDate + "T00:00:00").getTime() + days * 864e5) : null;
    const totRec = g.reduce((s, r) => s + (+r.receipt || 0), 0);
    const totCons = g.reduce((s, r) => s + (+r.cons || 0), 0);
    const vendors = [...new Set(g.map((r) => (r.vendor || "").trim()).filter(Boolean))];
    out.push({
      key: k, article: g[0].article, code: g[0].code, uom: g[0].uom || "", plant: g[0].plant,
      vendor: (latest.vendor || "").trim(), vendors,
      category: categorize(g[0].article),
      latest: stock, latestDate: latest.date, adu, totRec, totCons,
      days, monthly, order,
      runout: runout ? f2(runout) : "-",
      status: statusOf(stock, days, adu),
      rows: g, histN,
    });
  }
  return { list: out, lastDate };
}

/** Daily totals (receipt vs consumption) for trend chart, clipped to [from,to]. */
export function dailySeries(records, from, to) {
  const map = {};
  for (const r of records) {
    if (from && r.date < from) continue;
    if (to && r.date > to) continue;
    (map[r.date] = map[r.date] || { date: r.date, receipt: 0, usage: 0 });
    map[r.date].receipt += +r.receipt || 0;
    map[r.date].usage += +r.cons || 0;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export function shiftDate(dateStr, deltaDays) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return f2(d);
}

/* ---------------- persistence (LAST SAVED EXCEL DATA) ---------------- */

export function saveLibrary(records, meta) {
  try {
    localStorage.setItem(LS_RECORDS, JSON.stringify(records));
    localStorage.setItem(LS_META, JSON.stringify(meta || {}));
  } catch (e) {
    // storage full — keep running in-memory
    console.warn("localStorage save failed", e);
  }
}

export function loadLibrary() {
  try {
    const raw = localStorage.getItem(LS_RECORDS);
    const meta = JSON.parse(localStorage.getItem(LS_META) || "{}");
    if (!raw) return { records: [], meta: {} };
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) return { records: [], meta: {} };
    return { records, meta };
  } catch (e) {
    return { records: [], meta: {} };
  }
}

export function downloadCSV(filename, rows) {
  const esc = (v) => {
    v = String(v ?? "");
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const TEMPLATE_CSV =
  "Date,Plant,Article,Code,Vendor,UOM,Opening,Receipt,Consumption,Closing\n" +
  "10-08-2026,Sangamner,Poly Film Family Elaichi 250g,44000260,Yuva Polyprint & Packaging,KG,520,0,38,482\n" +
  "11-08-2026,Sangamner,Poly Film Family Elaichi 250g,44000260,Yuva Polyprint & Packaging,KG,482,0,41,441\n" +
  "10-08-2026,Mumbai,CTC Tea Bulk - Grade BP,71002033,Laxmi Steel - Sangamner,KG,1400,200,72,1528\n";
