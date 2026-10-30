import { useState } from "react";

/**
 * Auth gate shown when no account key is stored on the device.
 * The user either logs in with an existing key or creates a new account.
 * (We never auto-create — that would fill the database with empty rows.)
 */
export default function Welcome({ onSignIn, onCreate, error }) {
  const [mode, setMode] = useState(null); // null | "login"
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitLogin() {
    if (!key.trim() || busy) return;
    setBusy(true);
    await onSignIn(key.trim());
    setBusy(false);
  }
  async function create() {
    if (busy) return;
    setBusy(true);
    await onCreate();
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-3xl font-bold text-on-accent shadow-sm">
            ₱
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            budge<span className="text-accent-ink">·</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            make it to Friday. No email, no password — just an account key.
          </p>
        </div>

        {mode === "login" ? (
          <div className="surface p-5">
            <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
              Account key
            </label>
            <input
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitLogin()}
              placeholder="paste your key"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 font-mono text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-50"
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            <button
              disabled={!key.trim() || busy}
              onClick={submitLogin}
              className={`mt-4 w-full rounded-2xl py-3.5 text-base font-semibold transition ${
                key.trim() && !busy
                  ? "bg-accent text-on-accent active:scale-[0.99]"
                  : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-800"
              }`}
            >
              {busy ? "Loading…" : "Log in"}
            </button>
            <button
              onClick={() => setMode(null)}
              className="mt-2 w-full rounded-2xl py-3 text-sm font-medium text-gray-500 dark:text-gray-400"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              disabled={busy}
              onClick={create}
              className="w-full rounded-2xl bg-accent py-4 text-base font-semibold text-on-accent transition active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create new account"}
            </button>
            <button
              disabled={busy}
              onClick={() => setMode("login")}
              className="w-full rounded-2xl border border-gray-300 py-4 text-base font-semibold text-gray-800 transition active:scale-[0.99] dark:border-gray-700 dark:text-gray-100"
            >
              I have an account key
            </button>
            <p className="px-2 pt-2 text-center text-xs text-gray-400">
              Your key is the only way back into your data — you'll be able to copy and save it from
              Settings. There's no password recovery.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
