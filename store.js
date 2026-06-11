import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseClient.js";

const HASH_KEY = "budget.hash";
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
