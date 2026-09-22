/* Shared relay-cloud sync (same protocol as purchase.html).
 * Local-first: localStorage stays the source of truth on-screen;
 * cloud is last-write-wins via updatedAt. Works offline — syncs when online.
 */
import { bytesToHex, hexToBytes, schnorr } from "@noble/secp256k1";

const TIMEOUT_MS = 9000;

function b64enc(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
}
function b64dec(s) {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function packBody(str) {
  try {
    if (typeof CompressionStream !== "undefined") {
      const cs = new CompressionStream("gzip");
      const w = cs.writable.getWriter();
      w.write(new TextEncoder().encode(str));
      w.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      return "z:" + b64enc(new Uint8Array(buf));
    }
  } catch { /* fall through */ }
  try {
    return "b:" + b64enc(new TextEncoder().encode(str));
  } catch {
    return "j:" + str;
  }
}
async function unpackBody(body) {
  try {
    if (!body) return null;
    if (body.indexOf("z:") === 0) {
      const ds = new DecompressionStream("gzip");
      const w = ds.writable.getWriter();
      w.write(b64dec(body.slice(2)));
      w.close();
      return await new Response(ds.readable).text();
    }
    if (body.indexOf("b:") === 0) return new TextDecoder().decode(b64dec(body.slice(2)));
    return body;
  } catch {
    return null;
  }
}
async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function openWs(url) {
  return new Promise((resolve) => {
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve(null);
      return;
    }
    const to = setTimeout(() => { try { ws.close(); } catch { /* noop */ } resolve(null); }, TIMEOUT_MS);
    ws.onopen = () => { clearTimeout(to); resolve(ws); };
    ws.onerror = () => { clearTimeout(to); try { ws.close(); } catch { /* noop */ } resolve(null); };
  });
}
function waitOk(ws, id) {
  return new Promise((resolve) => {
    const to = setTimeout(() => { cleanup(); resolve(null); }, TIMEOUT_MS);
    function cleanup() {
      clearTimeout(to);
      try { ws.removeEventListener("message", onm); } catch { /* noop */ }
      try { ws.removeEventListener("error", onx); } catch { /* noop */ }
      try { ws.removeEventListener("close", onx); } catch { /* noop */ }
    }
    function onm(ev) {
      let d = null;
      try { d = JSON.parse(ev.data); } catch { return; }
      if (d && d[0] === "OK" && d[1] === id) { cleanup(); resolve(d); }
    }
    function onx() { cleanup(); resolve(null); }
    try {
      ws.addEventListener("message", onm);
      ws.addEventListener("error", onx);
      ws.addEventListener("close", onx);
    } catch { cleanup(); resolve(null); }
  });
}

/**
 * @param {object} opts
 * @param {string[]} opts.relays
 * @param {string} opts.pub  hex pubkey
 * @param {string} opts.priv hex privkey
 * @param {string} opts.dtag addressable-event "d" tag (dataset id)
 * @param {string} opts.tsKey localStorage key for last-seen cloud timestamp
 * @param {() => object|null} opts.collect returns { updatedAt, ...dataset } or null to skip
 * @param {(st: object) => boolean} opts.apply adopt remote state, return true if adopted
 * @param {(mode: "local"|"saving"|"synced"|"offline", text: string) => void} [opts.onStatus]
 */
export function createCloudSync({ relays, pub, priv, dtag, kind = 30078, tsKey, collect, apply, onStatus }) {
  let cloudTs = 0;
  let dirty = false;
  let pushBusy = false;
  let pushTimer = null;
  let pollTimer = null;
  let stopped = false;
  try { cloudTs = +(localStorage.getItem(tsKey) || 0); } catch { /* noop */ }

  const setStatus = (mode, text) => { try { onStatus && onStatus(mode, text); } catch { /* noop */ } };
  const setLocalTs = (t) => { try { localStorage.setItem(tsKey, String(t)); } catch { /* noop */ } };

  async function buildEvent(body) {
    const created = Math.floor(Date.now() / 1000);
    const tags = [["d", dtag]];
    const canon = '[0,"' + pub + '",' + created + "," + kind + "," + JSON.stringify(tags) + "," + JSON.stringify(body) + "]";
    const id = await sha256hex(canon);
    const sig = bytesToHex(await schnorr.sign(hexToBytes(id), hexToBytes(priv)));
    return { obj: { id, pubkey: pub, created_at: created, kind, tags, content: body, sig }, id };
  }
  async function publishTo(url, evObj, id) {
    const ws = await openWs(url);
    if (!ws) return false;
    try { ws.send(JSON.stringify(["EVENT", evObj])); } catch { try { ws.close(); } catch { /* noop */ } return false; }
    const r = await waitOk(ws, id);
    try { ws.close(); } catch { /* noop */ }
    return !!(r && r[2] === true);
  }
  async function fetchFrom(url) {
    const ws = await openWs(url);
    if (!ws) return { list: [], eose: false };
    const sub = "mtc" + Math.floor(Math.random() * 1e9);
    try {
      ws.send(JSON.stringify(["REQ", sub, { kinds: [kind], authors: [pub], "#d": [dtag], limit: 3 }]));
    } catch { try { ws.close(); } catch { /* noop */ } return { list: [], eose: false }; }
    const out = await new Promise((resolve) => {
      const msgs = [];
      let eose = false;
      const to = setTimeout(() => { cleanup(); resolve({ list: msgs, eose }); }, TIMEOUT_MS);
      function cleanup() { clearTimeout(to); try { ws.removeEventListener("message", onm); } catch { /* noop */ } }
      function onm(ev) {
        let d = null;
        try { d = JSON.parse(ev.data); } catch { return; }
        if (d && d[0] === "EVENT" && d[2] && d[2].pubkey === pub) msgs.push(d[2]);
        if (d && d[0] === "EOSE") { eose = true; cleanup(); resolve({ list: msgs, eose }); }
      }
      try { ws.addEventListener("message", onm); } catch { cleanup(); resolve({ list: msgs, eose }); }
    });
    try { ws.close(); } catch { /* noop */ }
    return out;
  }

  async function pushState(st) {
    if (pushBusy || stopped || !st) return;
    pushBusy = true;
    setStatus("saving", "Saving…");
    try {
      const body = await packBody(JSON.stringify(st));
      const ev = await buildEvent(body);
      const results = await Promise.all(relays.map((url) => publishTo(url, ev.obj, ev.id)));
      const ok = results.filter(Boolean).length;
      if (ok > 0) {
        cloudTs = st.updatedAt;
        setLocalTs(st.updatedAt);
        dirty = false;
        setStatus("synced", "Synced");
      } else {
        setStatus("offline", "Offline — saved here");
      }
    } catch {
      setStatus("offline", "Offline — saved here");
    }
    pushBusy = false;
  }

  async function cloudPush() {
    if (pushBusy || stopped) return;
    let st = null;
    try { st = collect(); } catch { st = null; }
    if (!st || st.empty) {
      // Demo / empty state must never overwrite the shared cloud copy.
      dirty = false;
      return;
    }
    await pushState(st);
  }

  function bump() {
    if (stopped) return;
    dirty = true;
    setStatus("saving", "Saving…");
    try { clearTimeout(pushTimer); } catch { /* noop */ }
    pushTimer = setTimeout(() => { cloudPush(); }, 900);
  }

  async function cloudPull(quiet) {
    if (stopped) return { adopted: false };
    let best = null;
    let alive = false;
    let found = false;
    try {
      const all = await Promise.all(relays.map(fetchFrom));
      for (const r of all) {
        if (!r) continue;
        if (r.eose) alive = true;
        for (const ev of r.list) {
          found = true;
          if (!best || ev.created_at > best.created_at) best = ev;
        }
      }
    } catch { /* noop */ }
    if (!best) {
      if (!quiet && !alive) setStatus("offline", "Offline — saved here");
      return { adopted: false, alive, found };
    }
    let st = null;
    try {
      const raw = await unpackBody(best.content);
      st = JSON.parse(raw);
    } catch { return { adopted: false, alive, found }; }
    if (!st || typeof st.updatedAt !== "number") return { adopted: false, alive, found };
    if (st.updatedAt <= cloudTs) return { adopted: false, alive, found };
    if (dirty) { cloudPush(); return { adopted: false, alive, found }; }
    cloudTs = st.updatedAt;
    setLocalTs(st.updatedAt);
    let ok = false;
    try { ok = !!apply(st); } catch { ok = false; }
    if (ok) setStatus("synced", "Synced");
    return { adopted: ok, alive, found };
  }

  async function boot() {
    setStatus("local", "Local");
    try {
      const r = await cloudPull(true);
      if (stopped) return;
      if (!r.adopted && r.alive && !r.found) {
        // Cloud is empty — seed it if this device holds real (non-demo) data.
        let st = null;
        try { st = collect(); } catch { st = null; }
        if (st && st.seedable) await cloudPush();
      }
    } catch { /* stay local */ }
    pollTimer = setInterval(() => { cloudPull(true); }, 60000);
    try {
      document.addEventListener("visibilitychange", () => { if (!document.hidden) cloudPull(true); });
      window.addEventListener("online", () => { cloudPull(true); });
    } catch { /* noop */ }
  }

  function stop() {
    stopped = true;
    try { clearTimeout(pushTimer); } catch { /* noop */ }
    try { clearInterval(pollTimer); } catch { /* noop */ }
  }

  return { bump, pull: () => cloudPull(false), pushNow: () => cloudPush(), pushState, stop, boot };
}

/* Team keypair + relays — same identity as the Purchase page cloud. */
export const TEAM_CLOUD = {
  relays: ["wss://nos.lol", "wss://relay.primal.net", "wss://relay.damus.io"],
  pub: "411cb53177be329894133829b4d2a0e157878fd90115db472193e42862a9c8da",
  priv: "7d8a23d0ec43ae6caccb295534219c70c54846fa20f476b612577074a27c209f",
};

export const WAREHOUSE_DTAG = "mtc-wh-c7f82ae6";
export const WAREHOUSE_TS_KEY = "mtc_wh_cloud_ts";
