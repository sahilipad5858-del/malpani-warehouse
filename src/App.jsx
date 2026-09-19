import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { genDemo } from "./data/demo";
import {
  LS_THEME, TEMPLATE_CSV, computeSummaries, dailySeries, downloadCSV,
  dstr, fmt, initials, loadLibrary, mergeRecords, parseTextFile,
  gridToRecords, recKey, saveLibrary, shiftDate, todayStr,
} from "./lib/warehouse";

/* ---------------- small atoms ---------------- */

const GRAD = {
  emerald: "from-emerald-500 to-teal-500",
  violet: "from-violet-500 to-purple-500",
  amber: "from-amber-500 to-orange-500",
  rose: "from-rose-500 to-red-500",
  sky: "from-sky-500 to-blue-500",
  indigo: "from-indigo-500 to-violet-500",
};

function StatusPill({ s }) {
  const map = {
    Stockout: "bg-red-600 text-white",
    Critical: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    Low: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    OK: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    Overstock: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    Dead: "bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300",
  };
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${map[s] || map.Dead}`}>
      {s}
    </span>
  );
}

function KpiCard({ grad, label, big, sub, foot, dark }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-lg shadow-slate-900/10`}>
      <div className="animate-drift pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-black/10" />
      <div className="relative">
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">{label}</div>
        <div className="mt-1 text-3xl font-extrabold tabular-nums">{big}</div>
        <div className="mt-0.5 text-[13px] font-semibold text-white/90">{sub}</div>
        {foot && <div className="mt-1.5 text-[11.5px] text-white/75">{foot}</div>}
      </div>
    </div>
  );
}

function Card({ title, sub, children, action, dark }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-extrabold text-slate-900 dark:text-white">{title}</h3>
          {sub && <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Avatar({ name, cat }) {
  const g = cat === "Packing Material" ? GRAD.amber : GRAD.emerald;
  return (
    <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br ${g} text-[12px] font-extrabold text-white`}>
      {initials(name)}
    </span>
  );
}

function useToast() {
  const [msg, setMsg] = useState("");
  const t = useRef(null);
  const show = (m) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(""), 2800);
  };
  return [msg, show];
}

/* ---------------- main app ---------------- */

export default function App() {
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState({ source: "demo", isDemo: true });
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem(LS_THEME) === "dark"; } catch { return false; }
  });
  const [view, setView] = useState("overview");
  const [search, setSearch] = useState("");
  const [plantF, setPlantF] = useState("");
  const [catF, setCatF] = useState("");
  const [preset, setPreset] = useState(30);
  const [cover, setCover] = useState(30);
  const [sortK, setSortK] = useState("days");
  const [sideOpen, setSideOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [liveDelta, setLiveDelta] = useState({});
  const [feed, setFeed] = useState([]);
  const [detailKey, setDetailKey] = useState(null);
  const [uploadMode, setUploadMode] = useState("merge");
  const [toast, showToast] = useToast();
  const fileRef = useRef(null);

  /* load LAST SAVED EXCEL DATA (or demo on first run) */
  useEffect(() => {
    const { records: saved, meta: m } = loadLibrary();
    if (saved && saved.length) {
      setRecords(saved);
      setMeta({ ...m, isDemo: false });
      setFeed([{ t: new Date().toLocaleString(), msg: `Restored last saved data — ${saved.length.toLocaleString("en-IN")} daily rows from ${m.fileName || "previous Excel import"}.` }]);
    } else {
      const demo = genDemo();
      setRecords(demo);
      setMeta({ source: "demo", isDemo: true, at: new Date().toLocaleString() });
      setFeed([{ t: new Date().toLocaleString(), msg: `Loaded demo library — ${demo.length.toLocaleString("en-IN")} daily rows (2 plants × 14 articles × 45 days). Import your Excel to replace.` }]);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem(LS_THEME, dark ? "dark" : "light"); } catch { /* noop */ }
  }, [dark]);

  /* live simulation: random consumption ticks */
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      setRecords((prev) => {
        if (!prev.length) return prev;
        const pick = prev[Math.floor(Math.random() * prev.length)];
        const k = recKey(pick);
        const tick = 1 + Math.floor(Math.random() * 4);
        setLiveDelta((d) => ({ ...d, [k]: (d[k] || 0) + tick }));
        setFeed((f) =>
          [{ t: new Date().toLocaleTimeString(), msg: `Live · ${pick.article} (${pick.plant}) −${tick} ${pick.uom || "units"} consumed` }, ...f].slice(0, 30)
        );
        return prev;
      });
    }, 4000);
    return () => clearInterval(id);
  }, [live]);

  const { list: summaries, lastDate } = useMemo(
    () => computeSummaries(records, Math.max(7, +cover || 30)),
    [records, cover]
  );

  const plants = useMemo(() => [...new Set(summaries.map((r) => r.plant))].sort(), [summaries]);

  const from = preset === 0 ? null : shiftDate(lastDate || todayStr(), -(preset - 1));

  const scopedRecords = useMemo(
    () => records.filter((r) => (!plantF || r.plant === plantF)),
    [records, plantF]
  );

  const trend = useMemo(() => dailySeries(scopedRecords, from, lastDate), [scopedRecords, from, lastDate]);

  const winRec = scopedRecords.filter((r) => !from || r.date >= from);
  const winReceipt = winRec.reduce((s, r) => s + (+r.receipt || 0), 0);
  const winUsage = winRec.reduce((s, r) => s + (+r.cons || 0), 0);

  const adj = (s) => {
    const d = liveDelta[s.key] || 0;
    const stock = Math.max(0, s.latest - d);
    const days = s.adu > 0.0001 ? stock / s.adu : stock > 0 ? 9999 : 0;
    return { ...s, latest: stock, days };
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summaries.map(adj).filter(
      (r) =>
        (!plantF || r.plant === plantF) &&
        (!catF || r.category === catF) &&
        (!q || r.article.toLowerCase().includes(q) || r.plant.toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, search, plantF, catF, liveDelta]);

  const sorted = useMemo(() => {
    const L = filtered.slice();
    const dir = sortK === "article" ? 1 : 1;
    L.sort((a, b) => {
      if (sortK === "days") return (a.days - b.days) * dir;
      if (sortK === "order") return b.order - a.order;
      if (sortK === "monthly") return b.monthly - a.monthly;
      if (sortK === "adu") return b.adu - a.adu;
      if (sortK === "stock") return a.latest - b.latest;
      return a.article.localeCompare(b.article);
    });
    return L;
  }, [filtered, sortK]);

  /* KPIs */
  const totalStock = filtered.reduce((s, r) => s + r.latest, 0);
  const crit = filtered.filter((r) => r.status === "Critical" || r.status === "Stockout");
  const low = filtered.filter((r) => r.status === "Low");
  const out = filtered.filter((r) => r.status === "Stockout");
  const toOrder = filtered.reduce((s, r) => s + r.order, 0);
  const avgDaysRaw = filtered.length ? filtered.reduce((s, r) => s + Math.min(r.days, 120), 0) / filtered.length : 0;

  const catStock = useMemo(() => {
    const m = {};
    filtered.forEach((r) => { m[r.category] = (m[r.category] || 0) + r.latest; });
    return Object.entries(m).map(([name, stock]) => ({ name, stock }));
  }, [filtered]);

  const plantShare = useMemo(() => {
    const m = {};
    filtered.forEach((r) => { m[r.plant] = (m[r.plant] || 0) + r.latest; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const topUsed = useMemo(() => filtered.slice().sort((a, b) => b.totCons - a.totCons).slice(0, 8), [filtered]);

  const detail = detailKey ? summaries.map(adj).find((r) => r.key === detailKey) : null;

  const tickColor = dark ? "#94a3b8" : "#64748b";
  const gridColor = dark ? "#1e293b" : "#e2e8f0";

  /* ---------------- file import ---------------- */
  const persist = (recs, m) => {
    setRecords(recs);
    setMeta(m);
    saveLibrary(recs, m);
  };

  const applyIncoming = (incoming, fileName) => {
    if (!incoming.length) {
      showToast("No data rows found in that file.");
      return;
    }
    if (uploadMode === "replace") {
      const m = { source: "excel", fileName, at: new Date().toLocaleString(), added: incoming.length, updated: 0, isDemo: false };
      persist(incoming, m);
      setLiveDelta({});
      setFeed((f) => [{ t: new Date().toLocaleString(), msg: `Replace import · ${fileName} — ${incoming.length.toLocaleString("en-IN")} rows loaded.` }, ...f]);
      showToast(`Loaded ${incoming.length} rows (replace).`);
    } else {
      const { merged, added, updated } = mergeRecords(records, incoming);
      const m = { source: "excel", fileName, at: new Date().toLocaleString(), added, updated, isDemo: false };
      persist(merged, m);
      setFeed((f) => [{ t: new Date().toLocaleString(), msg: `Merge import · ${fileName} — +${added} new, ${updated} updated. Library now ${merged.length.toLocaleString("en-IN")} rows.` }, ...f]);
      showToast(`Merged: +${added} new, ${updated} updated.`);
    }
  };

  const onFiles = async (files) => {
    for (const f of files) {
      try {
        const name = f.name.toLowerCase();
        if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          const buf = await f.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const { records: recs, error } = gridToRecords(grid);
          if (error) showToast(error);
          else applyIncoming(recs, f.name);
        } else {
          const text = await f.text();
          const { records: recs, error } = parseTextFile(text);
          if (error) showToast(error);
          else applyIncoming(recs, f.name);
        }
      } catch (e) {
        showToast(`Could not read ${f.name}: ${e.message}`);
      }
    }
  };

  const exportTableCSV = () => {
    downloadCSV(`malpani-warehouse-${todayStr()}.csv`, [
      ["Article", "Plant", "Code", "UOM", "Category", "Stock", "PerDayUse", "DaysCover", "MonthlyNeed", "ToOrder", "RunoutBy", "Status"],
      ...sorted.map((r) => [r.article, r.plant, r.code, r.uom, r.category, Math.round(r.latest), r.adu.toFixed(1), r.days > 9000 ? "INF" : r.days.toFixed(1), Math.round(r.monthly), r.order, r.runout, r.status]),
    ]);
    showToast("CSV exported.");
  };

  const exportPlanCSV = () => {
    const need = sorted.filter((r) => r.order > 0);
    downloadCSV(`malpani-purchase-plan-${todayStr()}.csv`, [
      ["Article", "Plant", "Code", "UOM", "Stock", "DaysCover", "MonthlyNeed", "ToOrder", "RunoutBy"],
      ...need.map((r) => [r.article, r.plant, r.code, r.uom, Math.round(r.latest), r.days > 9000 ? "INF" : r.days.toFixed(1), Math.round(r.monthly), r.order, r.runout]),
    ]);
    showToast(`Purchase plan exported (${need.length} lines).`);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Stock_Template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const clearAll = () => {
    if (!window.confirm("Clear all imported data and start fresh? (Demo will reload)")) return;
    try { localStorage.removeItem("mtc_warehouse_records_v1"); localStorage.removeItem("mtc_warehouse_meta_v1"); } catch { /* noop */ }
    const demo = genDemo();
    setRecords(demo);
    setMeta({ source: "demo", isDemo: true, at: new Date().toLocaleString() });
    setLiveDelta({});
    showToast("Cleared — demo reloaded.");
  };

  const nav = [
    { id: "overview", label: "Overview" },
    { id: "inventory", label: "Inventory" },
    { id: "activity", label: "Activity & Data" },
    { id: "help", label: "Excel Help" },
  ];

  const PIE_COLORS = ["#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#0ea5e9", "#6366f1"];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        {/* ---------- sidebar ---------- */}
        <aside className={`no-print fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200/70 bg-white/95 backdrop-blur transition-transform dark:border-slate-800 dark:bg-slate-900/95 lg:static lg:translate-x-0 ${sideOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-full flex-col p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-extrabold text-white shadow-lg">M</div>
              <div>
                <div className="text-[14px] font-extrabold leading-tight">Malpani Tea Corp.</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Warehouse Dashboard</div>
              </div>
            </div>

            <div className="mt-6 text-[11px] font-bold uppercase tracking-wider text-slate-400">Menu</div>
            <nav className="mt-2 flex flex-col gap-1">
              {nav.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { setView(n.id); setSideOpen(false); }}
                  className={`rounded-xl px-3.5 py-2.5 text-left text-[13.5px] font-semibold transition ${view === n.id ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                >
                  {n.label}
                </button>
              ))}
            </nav>

            <div className="mt-6 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 p-4 text-white shadow-lg">
              <div className="text-[12px] font-bold">Data source</div>
              <div className="mt-1 text-[11.5px] leading-snug text-white/85">
                {meta.isDemo ? "Demo library — import Excel to replace." : `Last saved: ${meta.fileName || "Excel import"}`}
              </div>
              <div className="mt-1 text-[11px] text-white/70">{records.length.toLocaleString("en-IN")} rows · {summaries.length} lines</div>
              <button onClick={() => fileRef.current?.click()} className="mt-3 w-full rounded-xl bg-white/95 py-2 text-[12.5px] font-bold text-violet-700 hover:bg-white">
                Import Excel / CSV
              </button>
            </div>

            <div className="mt-auto pt-6 text-[11px] leading-relaxed text-slate-400">
              Sangamner · Mumbai<br />Stock_Template.csv compatible
            </div>
          </div>
        </aside>
        {sideOpen && <div className="no-print fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSideOpen(false)} />}

        {/* ---------- main ---------- */}
        <div className="print-full mx-auto w-full max-w-[1280px] flex-1 px-4 pb-16 pt-4 sm:px-6">
          {/* header */}
          <header className="no-print flex flex-wrap items-center gap-3">
            <button onClick={() => setSideOpen(true)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-900 lg:hidden">☰</button>
            <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <span className="text-slate-400">⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search article / plant / code — e.g. Elaichi, Sangamner" className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-slate-400" />
            </div>
            <button onClick={() => setDark(!dark)} title="Toggle dark mode" className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold shadow-sm dark:border-slate-700 dark:bg-slate-900">
              {dark ? "☀ Light" : "◑ Dark"}
            </button>
            <button onClick={() => { setLive(!live); if (!live) showToast("Live simulation ON — consumption ticks every 4s."); }} className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold shadow-sm ${live ? "bg-red-600 text-white" : "border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}>
              <span className={`live-dot inline-block h-2 w-2 rounded-full ${live ? "bg-white" : "bg-red-500"}`} />
              {live ? "Live ON" : "Go Live"}
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[13px] font-bold text-white">MT</div>
              <div className="hidden sm:block">
                <div className="text-[13px] font-bold leading-tight">Warehouse Team</div>
                <div className="text-[11px] text-slate-500">Malpani Tea Corp.</div>
              </div>
            </div>
          </header>

          {/* title + actions */}
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="bg-gradient-to-r from-emerald-600 via-teal-600 to-violet-600 bg-clip-text text-2xl font-extrabold text-transparent sm:text-[28px] dark:from-emerald-300 dark:via-teal-200 dark:to-violet-300">
                {view === "overview" ? "Warehouse Overview" : view === "inventory" ? "Inventory Ledger" : view === "activity" ? "Activity & Data" : "Excel Help"}
              </h1>
              <p className="mt-1 text-[12.5px] text-slate-500 dark:text-slate-400">
                {lastDate ? `${dstr(lastDate)} · ` : ""}{summaries.length} article×plant lines · {from ? `last ${preset} days` : "all history"} · {meta.isDemo ? "DEMO data" : `last saved: ${meta.fileName || "Excel"}`} {live && "· LIVE"}
              </p>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              <select value={uploadMode} onChange={(e) => setUploadMode(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] font-semibold dark:border-slate-700 dark:bg-slate-900" title="Merge keeps history, Replace starts fresh">
                <option value="merge">Merge: keep history</option>
                <option value="replace">Replace: fresh start</option>
              </select>
              <button onClick={() => fileRef.current?.click()} className="rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-[13px] font-bold text-emerald-700 hover:bg-emerald-50 dark:bg-slate-900 dark:text-emerald-300">⇩ Import Excel</button>
              <button onClick={downloadTemplate} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-600 hover:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Template</button>
              <button onClick={exportPlanCSV} className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-md">⇪ Export Plan</button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

          {/* preset chips */}
          {(view === "overview" || view === "inventory") && (
            <div className="no-print mt-4 flex flex-wrap gap-2">
              {[[7, "Last 7 days"], [14, "Last 14 days"], [30, "Last 30 days"], [0, "All data"]].map(([v, l]) => (
                <button key={v} onClick={() => setPreset(v)} className={`rounded-full px-4 py-1.5 text-[12.5px] font-bold transition ${preset === v ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "border border-slate-200 bg-white text-slate-500 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {view === "help" && <HelpView onTemplate={downloadTemplate} />}

          {view === "activity" && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card title="Import & storage" sub="Your LAST SAVED EXCEL DATA is kept in this browser (localStorage) and restores on reload.">
                <div className="mt-2 space-y-2 text-[13px]">
                  <Row k="Status" v={meta.isDemo ? "Demo (no Excel yet)" : `Saved · ${meta.fileName || ""}`} />
                  <Row k="Last import" v={meta.at || "—"} />
                  <Row k="Rows stored" v={records.length.toLocaleString("en-IN")} />
                  <Row k="Lines tracked" v={String(summaries.length)} />
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button onClick={() => fileRef.current?.click()} className="rounded-xl bg-slate-900 px-4 py-2 text-[12.5px] font-bold text-white dark:bg-white dark:text-slate-900">+ Add Excel</button>
                    <button onClick={exportTableCSV} className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-bold dark:border-slate-700">Export merged CSV</button>
                    <button onClick={() => window.print()} className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-bold dark:border-slate-700">Export PDF (print)</button>
                    <button onClick={clearAll} className="rounded-xl border border-red-300 px-4 py-2 text-[12.5px] font-bold text-red-600">Clear all</button>
                  </div>
                </div>
              </Card>
              <Card title="Live activity" sub={live ? "Simulating consumption ticks every 4 seconds." : "Turn on Go Live to simulate real-time consumption."}>
                <FeedList feed={feed} />
              </Card>
            </div>
          )}

          {(view === "overview" || view === "inventory") && (
            <>
              {/* KPI row */}
              <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard grad={GRAD.emerald} label="Total stock (filtered)" big={fmt(totalStock)} sub={`${filtered.length} lines · ${plants.length} plants`} foot={`Receipt ${fmt(winReceipt)} · Usage ${fmt(winUsage)} in window`} />
                <KpiCard grad={GRAD.violet} label="Plant-wise stock" big={plants.length + " plants"} sub={plantShare.map((p) => `${p.name} ${fmt(p.value)}`).join(" · ") || "—"} foot={meta.isDemo ? "Demo data" : `Saved ${meta.at || ""}`} />
                <KpiCard grad={GRAD.sky} label="Receipt vs usage" big={`${fmt(winReceipt)} / ${fmt(winUsage)}`} sub={winUsage > 0 ? `Cover ratio ${(winReceipt / winUsage).toFixed(2)}×` : "No usage in window"} foot={from ? `${dstr(from)} → ${dstr(lastDate)}` : "All history"} />
                <KpiCard grad={GRAD.amber} label="Avg days of cover" big={avgDaysRaw > 900 ? "∞" : avgDaysRaw.toFixed(1) + "d"} sub={`${crit.length} critical · ${low.length} low`} foot={`Target cover ${cover}d · to order ${fmt(toOrder)}`} />
              </section>
              <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniStat tone="red" label="Critical ≤ 7 days" value={`${crit.length} lines`} sub={`${fmt(crit.reduce((s, r) => s + r.order, 0))} units to order`} />
                <MiniStat tone="amber" label="Low 7–15 days" value={`${low.length} lines`} sub={`${fmt(low.reduce((s, r) => s + r.order, 0))} units to order`} />
                <MiniStat tone="slate" label="Stockout (zero)" value={`${out.length} lines`} sub={out.length ? "Raise PO today" : "No nil-stock line"} />
                <MiniStat tone="green" label="Suggested purchase" value={fmt(toOrder)} sub={`units to reach ${cover}d cover`} />
              </section>

              {view === "overview" && (
                <>
                  {/* charts row 1 */}
                  <section className="mt-4 grid gap-4 xl:grid-cols-5">
                    <div className="xl:col-span-3">
                      <Card title="Receipt vs consumption trend" sub={`Daily inward vs usage · ${from ? dstr(from) + " → " + dstr(lastDate) : "all history"}`}>
                        <div className="h-[260px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="date" tick={{ fill: tickColor, fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} minTickGap={28} />
                              <YAxis tick={{ fill: tickColor, fontSize: 11 }} />
                              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} labelFormatter={(d) => dstr(d)} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Area type="monotone" dataKey="receipt" name="Receipt" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2.5} />
                              <Area type="monotone" dataKey="usage" name="Usage" stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2.5} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                    </div>
                    <div className="xl:col-span-2">
                      <Card title="Plant-wise stock share" sub="Closing stock split across warehouses">
                        <div className="h-[260px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={plantShare} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3} strokeWidth={0}>
                                {plantShare.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                              </Pie>
                              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v) => fmt(v)} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                    </div>
                  </section>

                  {/* charts row 2 */}
                  <section className="mt-4 grid gap-4 xl:grid-cols-5">
                    <div className="xl:col-span-3">
                      <Card title="Stock by category" sub="Packing Material vs Tea & Flavours — auto-detected from article names">
                        <div className="h-[240px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={catStock} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} layout="vertical">
                              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
                              <XAxis type="number" tick={{ fill: tickColor, fontSize: 11 }} />
                              <YAxis type="category" dataKey="name" width={130} tick={{ fill: tickColor, fontSize: 12, fontWeight: 700 }} />
                              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v) => fmt(v)} />
                              <Bar dataKey="stock" radius={[8, 8, 8, 8]} barSize={26}>
                                {catStock.map((_, i) => <Cell key={i} fill={i === 0 ? "#f59e0b" : "#10b981"} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                    </div>
                    <div className="xl:col-span-2">
                      <Card title="Top consumed articles" sub="Highest usage in the selected window">
                        <div className="mt-2 max-h-[240px] space-y-2.5 overflow-auto pr-1">
                          {topUsed.map((r) => (
                            <div key={r.key} className="flex items-center gap-2.5">
                              <Avatar name={r.article} cat={r.category} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[12.5px] font-bold">{r.article}</div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${Math.min(100, (r.totCons / Math.max(1, topUsed[0]?.totCons || 1)) * 100)}%` }} />
                                </div>
                              </div>
                              <div className="text-[12px] font-extrabold tabular-nums">{fmt(r.totCons)}</div>
                            </div>
                          ))}
                          {!topUsed.length && <div className="text-[12px] text-slate-400">No data in this filter.</div>}
                        </div>
                      </Card>
                    </div>
                  </section>
                </>
              )}

              {/* filters + table */}
              <section className="mt-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <div className="mb-1 text-[11px] font-bold text-slate-500">Plant</div>
                    <select value={plantF} onChange={(e) => setPlantF(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold dark:border-slate-700 dark:bg-slate-800">
                      <option value="">All plants ({plants.length})</option>
                      {plants.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-bold text-slate-500">Category</div>
                    <select value={catF} onChange={(e) => setCatF(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold dark:border-slate-700 dark:bg-slate-800">
                      <option value="">All categories</option>
                      <option>Tea & Flavours</option>
                      <option>Packing Material</option>
                    </select>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-bold text-slate-500">Target cover (days)</div>
                    <input type="number" min={7} max={120} value={cover} onChange={(e) => setCover(e.target.value)} className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                  <div className="no-print ml-auto flex gap-2">
                    <button onClick={exportTableCSV} className="rounded-xl border border-slate-200 px-3.5 py-2 text-[12.5px] font-bold hover:border-emerald-500 dark:border-slate-700">Export CSV</button>
                    <button onClick={() => window.print()} className="rounded-xl border border-slate-200 px-3.5 py-2 text-[12.5px] font-bold hover:border-emerald-500 dark:border-slate-700">PDF</button>
                  </div>
                </div>
                <p className="mt-2 text-[11.5px] text-slate-400">Showing {sorted.length} of {summaries.length} lines · click column heads to sort · click a row for day-wise detail</p>

                <div className="mt-3 overflow-auto rounded-xl border border-slate-100 dark:border-slate-800" style={{ maxHeight: 460 }}>
                  <table className="w-full min-w-[1080px] border-collapse text-[12.5px]">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-300">
                        <Th label="Article / Plant" k="article" sortK={sortK} setSortK={setSortK} />
                        <Th label="Stock" k="stock" num sortK={sortK} setSortK={setSortK} />
                        <Th label="Per-day use" k="adu" num sortK={sortK} setSortK={setSortK} />
                        <Th label="Days cover" k="days" num sortK={sortK} setSortK={setSortK} />
                        <th className="px-3 py-2.5 font-bold">Cover bar</th>
                        <Th label="Monthly need" k="monthly" num sortK={sortK} setSortK={setSortK} />
                        <Th label="To order" k="order" num sortK={sortK} setSortK={setSortK} />
                        <th className="px-3 py-2.5 font-bold">Runout by</th>
                        <th className="px-3 py-2.5 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => (
                        <tr key={r.key} onClick={() => setDetailKey(r.key)} className={`cursor-pointer border-t border-slate-100 transition hover:bg-emerald-50/60 dark:border-slate-800 dark:hover:bg-slate-800/70 ${r.status === "Critical" || r.status === "Stockout" ? "bg-red-50/50 dark:bg-red-500/5" : r.status === "Low" ? "bg-amber-50/40 dark:bg-amber-500/5" : ""}`}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.article} cat={r.category} />
                              <div className="min-w-0">
                                <div className="truncate font-bold">{r.article}</div>
                                <div className="truncate text-[11px] text-slate-400">{r.plant}{r.code ? ` · ${r.code}` : ""}{r.uom ? ` · ${r.uom}` : ""} · {r.category}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">{fmt(r.latest)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmt(r.adu, 1)}</td>
                          <td className="px-3 py-2.5 text-right font-extrabold tabular-nums" style={{ color: daysColor(r.days) }}>{r.days > 9000 ? "∞" : fmt(r.days, 1)}</td>
                          <td className="px-3 py-2.5"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (Math.min(r.days, 60) / 60) * 100)}%`, background: daysColor(r.days) }} /></div></td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmt(r.monthly)}</td>
                          <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">{r.order > 0 ? fmt(r.order) : "–"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5">{r.runout === "-" ? "–" : dstr(r.runout)}</td>
                          <td className="px-3 py-2.5"><StatusPill s={r.status} /></td>
                        </tr>
                      ))}
                      {!sorted.length && (
                        <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">No lines match — clear search/filters or import Excel.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* activity strip on overview */}
              {view === "overview" && (
                <section className="mt-4 grid gap-4 xl:grid-cols-3">
                  <div className="xl:col-span-2">
                    <Card title="Days-cover watchlist" sub="Lowest cover first — act on red before the runout date.">
                      <div className="mt-2 max-h-[220px] space-y-2 overflow-auto pr-1">
                        {sorted.slice(0, 10).map((r) => (
                          <div key={r.key} className="flex items-center gap-3 text-[12.5px]">
                            <span className="h-2 w-2 flex-none rounded-full" style={{ background: daysColor(r.days) }} />
                            <span className="min-w-0 flex-1 truncate font-semibold">{r.article} <span className="font-normal text-slate-400">· {r.plant}</span></span>
                            <span className="font-extrabold tabular-nums">{r.days > 9000 ? "∞" : fmt(r.days, 1) + "d"}</span>
                            <StatusPill s={r.status} />
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                  <Card title="Live activity" sub={live ? "Streaming consumption ticks." : "Import events & alerts appear here."}>
                    <FeedList feed={feed} compact />
                  </Card>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* detail modal */}
      {detail && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetailKey(null)}>
          <div className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-extrabold">{detail.article}</h3>
                <p className="text-[12px] text-slate-500">{detail.plant}{detail.code ? ` · ${detail.code}` : ""}{detail.uom ? ` · ${detail.uom}` : ""} · {detail.category}</p>
              </div>
              <button onClick={() => setDetailKey(null)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-[12.5px] font-bold dark:border-slate-700">Close</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatBox k="Stock" v={fmt(detail.latest)} />
              <StatBox k="Per-day use" v={fmt(detail.adu, 1)} />
              <StatBox k="Days cover" v={detail.days > 9000 ? "∞" : fmt(detail.days, 1)} />
              <StatBox k="To order" v={fmt(detail.order)} />
            </div>
            <h4 className="mb-2 mt-5 text-[13px] font-extrabold">Day-wise history (latest 20)</h4>
            <div className="max-h-[300px] overflow-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[480px] border-collapse text-[12px]">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr className="text-left text-[11px] text-slate-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Opening</th><th className="px-3 py-2 text-right">Receipt</th><th className="px-3 py-2 text-right">Used</th><th className="px-3 py-2 text-right">Closing</th></tr>
                </thead>
                <tbody>
                  {detail.rows.slice(-20).reverse().map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-1.5">{dstr(r.date)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.opening)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.receipt)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.cons)}</td>
                      <td className="px-3 py-1.5 text-right font-bold tabular-nums">{fmt(r.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="no-print fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-[13px] font-semibold text-white shadow-2xl dark:bg-white dark:text-slate-900">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- view fragments ---------------- */

function Th({ label, k, num, sortK, setSortK }) {
  return (
    <th onClick={() => setSortK(k)} className={`cursor-pointer select-none px-3 py-2.5 font-bold hover:text-emerald-600 ${num ? "text-right" : "text-left"}`}>
      {label}{sortK === k ? " ▾" : ""}
    </th>
  );
}

function MiniStat({ tone, label, value, sub }) {
  const ring = { red: "border-red-200 dark:border-red-500/30", amber: "border-amber-200 dark:border-amber-500/30", slate: "border-slate-200 dark:border-slate-700", green: "border-emerald-200 dark:border-emerald-500/30" }[tone];
  const dot = { red: "bg-red-500", amber: "bg-amber-500", slate: "bg-slate-400", green: "bg-emerald-500" }[tone];
  return (
    <div className={`rounded-2xl border ${ring} bg-white p-4 shadow-sm dark:bg-slate-900`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[12px] text-slate-500">{sub}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 dark:bg-slate-800/70">
      <span className="text-slate-500 dark:text-slate-400">{k}</span>
      <span className="text-right font-bold">{v}</span>
    </div>
  );
}

function StatBox({ k, v }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center dark:bg-slate-800/70">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{k}</div>
      <div className="text-[17px] font-extrabold tabular-nums">{v}</div>
    </div>
  );
}

function FeedList({ feed, compact }) {
  return (
    <div className={`${compact ? "max-h-[220px]" : "max-h-[420px]"} mt-2 space-y-2 overflow-auto pr-1`}>
      {feed.map((e, i) => (
        <div key={i} className="flex gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] leading-snug dark:bg-slate-800/70">
          <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-emerald-500" />
          <div><div>{e.msg}</div><div className="mt-0.5 text-[10.5px] text-slate-400">{e.t}</div></div>
        </div>
      ))}
      {!feed.length && <div className="text-[12px] text-slate-400">No events yet.</div>}
    </div>
  );
}

function HelpView({ onTemplate }) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card title="Option A — daily rows (recommended, LONG format)" sub="Row 1 = headers (order doesn't matter, extra columns ignored). Minimum that works: Date | Plant | Article | Closing.">
        <code className="mt-2 block overflow-auto rounded-xl bg-slate-50 p-3 text-[12px] dark:bg-slate-800">Date · Plant · Short Text (name) · Material (number) · UOM · Opening · Receipt/Inward · Consumption/Usage/Issue · Closing/Stock</code>
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">SAP style works directly: name from <b>Short Text</b>, number from <b>Material</b>. Dates accept DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD and Excel serials. Upload one file every working day — holidays need no file.</p>
        <button onClick={onTemplate} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-[12.5px] font-bold text-white dark:bg-white dark:text-slate-900">Download Template</button>
      </Card>
      <Card title="Formulas (so purchase can defend the numbers)" sub="Same logic as your existing stock board.">
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-slate-500">
          <li><b>Per-day use</b> = total consumption ÷ days with data (or derived from stock drops when no Consumption column).</li>
          <li><b>Days cover</b> = latest closing ÷ per-day use.</li>
          <li><b>Monthly need</b> = per-day × 30. <b>Runout</b> = last date + days cover.</li>
          <li><b>To order</b> = per-day × (cover + 7 lead) × 1.10 safety − stock (min 0).</li>
          <li><b>Status</b>: 0 = Stockout · ≤7 Critical · 7–15 Low · 15–45 OK · &gt;45 Overstock · no usage Dead.</li>
          <li><b>Merge</b> dedupes by Date×Plant×Article — re-imports update, never duplicate.</li>
        </ul>
      </Card>
    </div>
  );
}

function daysColor(d) {
  if (d > 9000) return "#94a3b8";
  if (d < 7) return "#dc2626";
  if (d < 15) return "#f59e0b";
  if (d <= 45) return "#10b981";
  return "#0ea5e9";
}
