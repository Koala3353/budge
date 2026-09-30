import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseClient.js";

const HASH_KEY = "budget.hash";
const LEGACY_CACHE_PREFIX = "budget.cache."; // old localStorage cache (pre-IndexedDB)
const PENDING_PREFIX = "budget.pending.";
const RPC_URL = `${SUPABASE_URL}/rest/v1/rpc`;

/** Generate a 128-bit random account hash (32 hex chars). Acts as the credential. */
export function genHash() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getStoredHash() {
  try {
    return localStorage.getItem(HASH_KEY);
  } catch {
    return null;
  }
}

export function storeHash(hash) {
  try {
    localStorage.setItem(HASH_KEY, hash);
  } catch {
    /* private mode */
  }
}

/**
 * Call a Supabase SECURITY DEFINER RPC via PostgREST. Replaces the
 * @supabase/supabase-js client — we only need a handful of functions, so a bare
 * fetch keeps the bundle small and skips the auth/realtime/storage modules.
 *
 * Every call has a timeout. Without one, a phone on "lie-fi" (bars showing, no
 * packets moving — common on mobile data and captive-portal wifi) holds the
 * request open for a minute or more, and everything waiting on it waits too.
 *
 * `keepalive` lets a write outlive the page: used for the flush when the app is
 * backgrounded or swiped away. Browsers cap keepalive bodies at 64 KB, so a
 * larger blob falls back to an ordinary request.
 */
async function rpc(fn, body, { timeout = 10000, keepalive = false } = {}) {
  const payload = JSON.stringify(body);
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const res = await fetch(`${RPC_URL}/${fn}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload,
      keepalive: keepalive && payload.length < 60000,
      signal: ctrl?.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const err = new Error(`rpc ${fn} failed (${res.status}) ${detail}`);
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Load a user's budget blob by hash. Returns the JSON object or null if new. */
export async function loadBudget(hash, opts) {
  const data = await rpc("get_budget", { p_hash: hash }, opts);
  return data || null;
}

/** Upsert the full budget blob for a hash. */
export async function saveBudget(hash, payload, opts) {
  await rpc("upsert_budget", { p_hash: hash, p_data: payload }, opts);
}

/**
 * App-wide statistics for the admin screen. The server decides whether this
 * hash is an admin (see supabase-schema.sql) — the hidden gesture that opens the
 * screen is only a way in, not the lock. Returns aggregate numbers only.
 */
export async function loadAdminStats(hash) {
  return rpc("admin_stats", { p_hash: hash, p_tz: "Asia/Manila" }, { timeout: 20000 });
}

// ---------------------------------------------------------------------------
// Offline durability: an IndexedDB write-through cache + a "pending" flag.
//
// The cache holds one blob per account so the app opens and shows your data
// instantly and fully offline. IndexedDB (async, hundreds of MB) replaces the
// old localStorage cache (sync, ~5 MB) — far more headroom and it never blocks
// the main thread. The tiny "pending" flag and the account hash stay in
// localStorage: they're a few bytes, quota is irrelevant, and keeping them
// synchronous keeps the reconnect/startup checks simple.
//
// When a write happens we store it here immediately (durable, offline-safe) and
// set "pending"; App.jsx debounces a push to Supabase and, on reconnect or next
// launch, flushes anything still pending. Nothing is lost if you're offline.
// ---------------------------------------------------------------------------

const DB_NAME = "budge";
const STORE = "cache";

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // If opening fails, allow a later retry instead of caching the rejection.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function idb(mode, run) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        const req = run(store);
        if (req) req.onsuccess = () => (result = req.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

const idbGet = (key) => idb("readonly", (s) => s.get(key));
const idbPut = (key, val) => idb("readwrite", (s) => s.put(val, key));
const idbDel = (key) => idb("readwrite", (s) => s.delete(key));

/**
 * Read the cached blob for a hash. Returns { blob, partial } or null.
 * On first run after upgrading, migrates any old localStorage cache into
 * IndexedDB so unsynced offline edits from before the upgrade aren't lost.
 */
export async function readCache(hash) {
  try {
    let blob = await idbGet(hash);
    if (!blob) {
      const migrated = migrateLegacy(hash);
      if (migrated) {
        blob = migrated;
        idbPut(hash, blob).catch(() => {}); // best-effort copy into IndexedDB
        removeLegacy(hash);
      }
    }
    if (!blob) return null;
    return { blob, partial: !!blob._partial };
  } catch {
    // IndexedDB blocked (e.g. some private-mode browsers) — fall back to the
    // legacy localStorage cache so the app still works offline.
    const blob = migrateLegacy(hash);
    return blob ? { blob, partial: !!blob._partial } : null;
  }
}

/**
 * Write the blob to the cache. IndexedDB has ample room, so we store the object
 * directly; only if the browser rejects it (quota) do we trim the oldest
 * transactions and retry, marking the copy _partial so a later flush reconciles
 * against the server. Returns "full" | "partial" | false.
 */
export async function writeCache(hash, blob) {
  try {
    await idbPut(hash, blob);
    return blob._partial ? "partial" : "full";
  } catch {
    try {
      const txs = Array.isArray(blob.transactions)
        ? [...blob.transactions].sort((a, b) => b.ts - a.ts).slice(0, 2000)
        : [];
      await idbPut(hash, { ...blob, transactions: txs, _partial: true });
      return "partial";
    } catch {
      // IndexedDB fully unavailable — last-ditch hard-trimmed localStorage copy
      // so the most recent activity still survives a reload.
      try {
        const txs = Array.isArray(blob.transactions)
          ? [...blob.transactions].sort((a, b) => b.ts - a.ts).slice(0, 500)
          : [];
        localStorage.setItem(
          LEGACY_CACHE_PREFIX + hash,
          JSON.stringify({ ...blob, transactions: txs, _partial: true })
        );
        return "partial";
      } catch {
        return false;
      }
    }
  }
}

export async function clearCache(hash) {
  try {
    await idbDel(hash);
  } catch {
    /* ignore */
  }
  removeLegacy(hash);
  clearJournal(hash);
  setPending(hash, false);
}

// --- legacy localStorage cache helpers (read-only, for migration/fallback) ---
function migrateLegacy(hash) {
  try {
    const raw = localStorage.getItem(LEGACY_CACHE_PREFIX + hash);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function removeLegacy(hash) {
  try {
    localStorage.removeItem(LEGACY_CACHE_PREFIX + hash);
  } catch {
    /* ignore */
  }
}

// --- pending flag: stays in localStorage (tiny, sync, quota-free) ------------

export function setPending(hash, val) {
  try {
    if (val) localStorage.setItem(PENDING_PREFIX + hash, "1");
    else localStorage.removeItem(PENDING_PREFIX + hash);
  } catch {
    /* ignore */
  }
}

export function isPending(hash) {
  try {
    return localStorage.getItem(PENDING_PREFIX + hash) === "1";
  } catch {
    return false;
  }
}

// --- close-safe journal ------------------------------------------------------
//
// IndexedDB writes are asynchronous: an edit made a moment before the app is
// swiped away can be lost if the process dies before the transaction commits.
// localStorage is synchronous, so when the page is being hidden we copy the
// current state there too — a write that returns has happened. The next launch
// merges it back in and clears it once IndexedDB holds it.

const JOURNAL_PREFIX = "budget.journal.";

export function writeJournal(hash, blob) {
  try {
    localStorage.setItem(JOURNAL_PREFIX + hash, JSON.stringify(blob));
    return true;
  } catch {
    return false; // quota — IndexedDB still has everything but the last moment
  }
}

export function readJournal(hash) {
  try {
    const raw = localStorage.getItem(JOURNAL_PREFIX + hash);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearJournal(hash) {
  try {
    localStorage.removeItem(JOURNAL_PREFIX + hash);
  } catch {
    /* ignore */
  }
}

// --- merging --------------------------------------------------------------------
//
// Two copies of an account meet whenever a device reconnects: the server's and
// the device's. Merging must never lose a change from either side, so it works
// per item rather than per blob:
//
//   - Transactions: union by id. When both sides have one, the later edit wins
//     (`mt`, falling back to `ts` for entries written before edits were stamped).
//   - Deletions: a tombstone { id: deletedAt } travels with the blob. Without it
//     a union can't tell "deleted here" from "not seen yet there", and every
//     entry deleted offline came back on reconnect.
//   - Settings, categories and the per-week maps: each has its own timestamp, so
//     changing your budget on one phone and adding a category on another keeps
//     both, instead of the whole newer blob winning.
//
// Because every push merges before writing and every device keeps its own copy,
// the rare case where two devices write at once heals itself: the next time the
// other device syncs, its copy merges its changes back in.

export const FIELDS = ["categories", "settings", "weekOverrides", "weekSpendDays"];
const TOMBSTONE_TTL = 180 * 86400000;

const modTime = (t) => t.mt ?? t.ts ?? 0;
const fieldTime = (blob, k) => blob.fieldTimes?.[k] ?? blob.updatedAt ?? 0;

export function mergeBlobs(remote, local) {
  if (!remote) return local;
  if (!local) return remote;

  const deleted = {};
  for (const src of [remote.deleted, local.deleted]) {
    for (const [id, at] of Object.entries(src || {})) {
      if (!(deleted[id] >= at)) deleted[id] = at;
    }
  }
  const cutoff = Date.now() - TOMBSTONE_TTL;
  for (const id of Object.keys(deleted)) if (deleted[id] < cutoff) delete deleted[id];

  const map = new Map();
  for (const t of remote.transactions || []) map.set(t.id, t);
  for (const t of local.transactions || []) {
    const other = map.get(t.id);
    if (!other || modTime(t) >= modTime(other)) map.set(t.id, t); // tie → local
  }
  for (const [id, t] of map) if (deleted[id] != null && deleted[id] >= modTime(t)) map.delete(id);

  const out = {
    version: Math.max(remote.version || 0, local.version || 0),
    updatedAt: Math.max(remote.updatedAt || 0, local.updatedAt || 0),
    fieldTimes: {},
    deleted,
    transactions: [...map.values()].sort((a, b) => b.ts - a.ts),
  };
  for (const k of FIELDS) {
    const rt = fieldTime(remote, k);
    const lt = fieldTime(local, k);
    const pick = lt >= rt ? local : remote; // tie → local
    out[k] = pick[k] ?? (pick === local ? remote[k] : local[k]);
    out.fieldTimes[k] = Math.max(rt, lt);
  }
  return out;
}

/**
 * The part of a blob that matters for "is the server up to date?": content
 * only, no timestamps, so re-saving identical data compares equal. Used to skip
 * pushes that would change nothing — previously every app launch re-uploaded
 * the whole account and re-stamped it as the newest copy.
 */
export function contentSig(blob) {
  if (!blob) return "";
  return JSON.stringify([
    blob.categories,
    blob.settings,
    blob.transactions,
    blob.weekOverrides,
    blob.weekSpendDays,
    blob.deleted || {},
  ]);
}
