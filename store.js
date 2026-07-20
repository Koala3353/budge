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
 * @supabase/supabase-js client — we only need these two functions, so a bare
 * fetch keeps the bundle small and skips the auth/realtime/storage modules.
 */
async function rpc(fn, body) {
  const res = await fetch(`${RPC_URL}/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`rpc ${fn} failed (${res.status}) ${detail}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Load a user's budget blob by hash. Returns the JSON object or null if new. */
export async function loadBudget(hash) {
  const data = await rpc("get_budget", { p_hash: hash });
  return data || null;
}

/** Upsert the full budget blob for a hash. */
export async function saveBudget(hash, payload) {
  await rpc("upsert_budget", { p_hash: hash, p_data: payload });
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

/**
 * Reconcile two blobs without losing data: union transactions by id, and take
 * scalar fields (settings, categories, overrides) from whichever blob is newer.
 * Used when flushing offline edits in case the local cache was trimmed.
 */
export function mergeBlobs(remote, local) {
  if (!remote) return local;
  if (!local) return remote;
  const map = new Map();
  for (const t of remote.transactions || []) map.set(t.id, t);
  for (const t of local.transactions || []) map.set(t.id, t); // local wins on conflict
  const newer = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
  const { _partial, ...clean } = newer;
  return { ...clean, transactions: [...map.values()].sort((a, b) => b.ts - a.ts) };
}
