import { useEffect, useRef, useState } from "react";
import QuickAdd from "./QuickAdd.jsx";
import Dashboard from "./Dashboard.jsx";
import History from "./History.jsx";
import Settings from "./Settings.jsx";
import BottomNav from "./BottomNav.jsx";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, buildDemoTransactions } from "./seed.js";
import { genHash, getStoredHash, storeHash, loadBudget, saveBudget } from "./store.js";

// DEMO_MODE feeds mock data to every screen for UI preview (no Supabase calls).
// Set to false to run live on Supabase (hash accounts, cloud sync) — all of
// that logic is preserved below and simply bypassed while demoing.
const DEMO_MODE = false;

/**
 * Root component. Client-side only, but persistence is now in Supabase instead
 * of localStorage — so the same account works across devices.
 *
 * Auth: no email/password. A random hash identifies the account; it's kept in
 * localStorage for auto sign-in. Enter an existing hash on another device to
 * access the same data. Access is scoped server-side by the hash via RPC.
 *
 * Data is held as one JSON blob per account ({categories, settings,
 * transactions, weekOverrides}) and synced (debounced) on every change.
 */
export default function App() {
  const [view, setView] = useState("add");
  const [hash, setHash] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error | auth
  const [sync, setSync] = useState("idle"); // idle | saving | saved | error

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [transactions, setTransactions] = useState([]);
  const [weekOverrides, setWeekOverrides] = useState({});

  const loadedRef = useRef(false);

  function applyState(data) {
    setCategories(data.categories || DEFAULT_CATEGORIES);
    setSettings(data.settings || DEFAULT_SETTINGS);
    setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    setWeekOverrides(data.weekOverrides || {});
  }

  // Hydrate a hash: load from Supabase, or initialize a fresh account.
  async function hydrate(h) {
    loadedRef.current = false;
    setStatus("loading");
    try {
      const data = await loadBudget(h);
      if (data && data.categories) {
        applyState(data);
      } else {
        const init = {
          categories: DEFAULT_CATEGORIES,
          settings: DEFAULT_SETTINGS,
          transactions: [],
          weekOverrides: {},
        };
        applyState(init);
        await saveBudget(h, { version: 3, ...init });
      }
      loadedRef.current = true;
      setStatus("ready");
      setSync("saved");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  // First load: demo data, or get/create hash and hydrate from Supabase.
  useEffect(() => {
    if (DEMO_MODE) {
      setCategories(DEFAULT_CATEGORIES);
      setSettings(DEFAULT_SETTINGS);
      setTransactions(buildDemoTransactions(DEFAULT_CATEGORIES, DEFAULT_SETTINGS));
      setWeekOverrides({});
      setHash("demo000000000000000000000000demo");
      setSync("saved");
      setStatus("ready");
      return;
    }
    const h = getStoredHash();
    if (!h) {
      setStatus("auth");
      return;
    }
    setHash(h);
    hydrate(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced sync to Supabase on any data change (after initial load).
  useEffect(() => {
    if (DEMO_MODE) return; // demo edits stay in-memory only
    if (!loadedRef.current || !hash) return;
    setSync("saving");
    const t = setTimeout(async () => {
      try {
        await saveBudget(hash, { version: 3, categories, settings, transactions, weekOverrides });
        setSync("saved");
      } catch (e) {
        console.error(e);
        setSync("error");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [categories, settings, transactions, weekOverrides, hash]);

  // --- Account switching ---
  function useAccount(rawHash) {
    const h = (rawHash || "").trim();
    if (!h) return;
    storeHash(h);
    setHash(h);
    hydrate(h);
    setView("dashboard");
  }
  function newAccount() {
    const h = genHash();
    storeHash(h);
    setHash(h);
    hydrate(h);
    setView("add");
  }

  // --- Transactions ---
  function addTransaction({ amount, categoryId, note }) {
    const tx = {
      id: "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      amount,
      categoryId,
      note,
      ts: Date.now(),
    };
    setTransactions((prev) => [tx, ...prev]);
    setView("dashboard");
  }
  function deleteTransaction(tx) {
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
  }
  function editTransaction() {
    setView("add");
  }

  // --- Categories ---
  function addCategory({ name, icon, color }) {
    const id = "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    setCategories((prev) => [...prev, { id, name, icon, color }]);
  }
  function editCategory(id, { name, icon, color }) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name, icon, color } : c)));
  }
  function deleteCategory(id) {
    setCategories((prev) => {
      if (prev.length <= 1) return prev;
      const remaining = prev.filter((c) => c.id !== id);
      const fallback = remaining[0].id;
      setTransactions((txs) =>
        txs.map((t) => (t.categoryId === id ? { ...t, categoryId: fallback } : t))
      );
      return remaining;
    });
  }

  // --- Settings & per-week budget ---
  function updateSettings(patch) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }
  function setWeekAllowance(key, cents) {
    setWeekOverrides((prev) => {
      const next = { ...prev };
      if (cents == null) delete next[key];
      else next[key] = cents;
      return next;
    });
  }

  // --- Backups ---
  function exportData() {
    try {
      const blob = new Blob(
        [JSON.stringify({ version: 3, categories, settings, transactions, weekOverrides }, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "weekly-budget-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const s = JSON.parse(reader.result);
          if (s.categories) setCategories(s.categories);
          if (s.settings) setSettings(s.settings);
          if (Array.isArray(s.transactions)) setTransactions(s.transactions);
          if (s.weekOverrides) setWeekOverrides(s.weekOverrides);
        } catch {
          /* ignore */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // --- Loading / error gates ---
  if (status === "auth") {
    return <AuthGate onUseAccount={useAccount} onNewAccount={newAccount} />;
  }

  if (status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center">
        {status === "loading" ? (
          <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-matcha border-t-transparent" />
            <p className="text-sm">Loading your budget…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-gray-700 dark:text-gray-200">Couldn't reach your data.</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Check your connection — your changes are safe.
            </p>
            <button
              onClick={() => hash && hydrate(hash)}
              className="rounded-2xl bg-matcha px-5 py-3 font-semibold text-white active:scale-95"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col pb-24">
        {view === "add" && (
          <QuickAdd
            categories={categories}
            transactions={transactions}
            settings={settings}
            weekOverrides={weekOverrides}
            onAdd={addTransaction}
            onGoDashboard={() => setView("dashboard")}
          />
        )}
        {view === "dashboard" && (
          <Dashboard
            categories={categories}
            transactions={transactions}
            settings={settings}
            weekOverrides={weekOverrides}
            onSetWeekAllowance={setWeekAllowance}
            onAdd={() => setView("add")}
            onViewAll={() => setView("history")}
          />
        )}
        {view === "history" && (
          <History
            categories={categories}
            transactions={transactions}
            settings={settings}
            onEdit={editTransaction}
            onDelete={deleteTransaction}
          />
        )}
        {view === "settings" && (
          <Settings
            categories={categories}
            settings={settings}
            hash={hash}
            sync={sync}
            onUpdateSettings={updateSettings}
            onAddCategory={addCategory}
            onEditCategory={editCategory}
            onDeleteCategory={deleteCategory}
            onUseAccount={useAccount}
            onNewAccount={newAccount}
            onExport={exportData}
            onImport={importData}
          />
        )}
      </div>

      <BottomNav view={view} onChange={setView} />
    </div>
  );
}

function AuthGate({ onUseAccount, onNewAccount }) {
  const [hashInput, setHashInput] = useState("");
  const canSubmit = hashInput.trim().length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-10 text-gray-900 dark:bg-gray-950 dark:text-gray-50">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-matcha">Weekly Budget</p>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter an existing account key or create a new one to start tracking.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Account key
          </label>
          <input
            autoFocus
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
            placeholder="paste account key"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-matcha/40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-50"
          />
          <button
            disabled={!canSubmit}
            onClick={() => onUseAccount(hashInput)}
            className={`w-full rounded-2xl py-3 text-base font-semibold transition ${
              canSubmit
                ? "bg-matcha text-white active:scale-[0.99]"
                : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-800"
            }`}
          >
            Use existing key
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">or</span>
          <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        </div>

        <button
          onClick={() => onNewAccount()}
          className="w-full rounded-2xl border border-gray-200 bg-white py-3 text-base font-semibold text-gray-900 active:scale-[0.99] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50"
        >
          Create new account
        </button>
      </div>
    </div>
  );
}
