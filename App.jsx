import { lazy, Suspense, useEffect, useRef, useState } from "react";
import BottomNav from "./BottomNav.jsx";
import InstallPrompt from "./InstallPrompt.jsx";
import Welcome from "./Welcome.jsx";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from "./seed.js";
import {
  genHash,
  getStoredHash,
  storeHash,
  loadBudget,
  saveBudget,
  readCache,
  writeCache,
  clearCache,
  setPending,
  isPending,
  mergeBlobs,
} from "./store.js";

// Code-split the signed-in app away from the login path. A first-time visitor
// (no stored key) only downloads React + the Welcome screen, so initial paint
// is fast; the heavy screens + charts load lazily and are prefetched the moment
// the Welcome screen renders, so tapping "create account" still feels instant.
const importQuickAdd = () => import("./QuickAdd.jsx");
const importDashboard = () => import("./Dashboard.jsx");
const importHistory = () => import("./History.jsx");
const importSettings = () => import("./Settings.jsx");
const importHelp = () => import("./Help.jsx");
const QuickAdd = lazy(importQuickAdd);
const Dashboard = lazy(importDashboard);
const History = lazy(importHistory);
const Settings = lazy(importSettings);
const Help = lazy(importHelp);

function prefetchScreens() {
  importQuickAdd();
  importDashboard();
  importHistory();
  importSettings();
  importHelp();
}

const Spinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-matcha border-t-transparent" />
  </div>
);

/**
 * Root component. Client-side only; persistence is in Supabase.
 *
 * Auth: no email/password. A random hash is the account credential, kept in
 * localStorage for auto sign-in. On a device with no stored key we show the
 * Welcome screen (log in with a key OR create a new account) — we do NOT
 * auto-create an account on every visit, so the database doesn't fill with
 * empty rows.
 *
 * Data is one JSON blob per account:
 * { categories, settings, transactions, weekOverrides, weekSpendDays }.
 */
export default function App() {
  const [view, setView] = useState("add");
  const [hash, setHash] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | auth | ready | error
  const [sync, setSync] = useState("idle"); // idle | saving | saved | error
  const [authError, setAuthError] = useState("");

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [transactions, setTransactions] = useState([]);
  const [weekOverrides, setWeekOverrides] = useState({});
  const [weekSpendDays, setWeekSpendDays] = useState({});

  const loadedRef = useRef(false);
  const cachePartialRef = useRef(false);

  function buildBlob() {
    return {
      version: 4,
      updatedAt: Date.now(),
      categories,
      settings,
      transactions,
      weekOverrides,
      weekSpendDays,
    };
  }

  function applyState(data) {
    setCategories(data.categories || DEFAULT_CATEGORIES);
    setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
    setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    setWeekOverrides(data.weekOverrides || {});
    setWeekSpendDays(data.weekSpendDays || {});
  }

  // Load an account: show the local cache instantly (works offline), then
  // reconcile with the server. Unsynced offline edits are merged, not lost.
  async function hydrate(h, { createIfMissing }) {
    loadedRef.current = false;

    // 1) Instant paint from cache if we have it — no network needed.
    const cached = await readCache(h);
    if (cached?.blob?.categories) {
      applyState(cached.blob);
      cachePartialRef.current = cached.partial;
      setStatus("ready");
      setSync(isPending(h) ? "error" : "saved");
    } else {
      setStatus("loading");
    }

    // 2) Reconcile with Supabase.
    try {
      const remote = await loadBudget(h);
      if (remote && remote.categories) {
        if (cached?.blob && isPending(h)) {
          // We had offline edits — union them with the server copy so nothing
          // is lost, then push the merged result back.
          const merged = mergeBlobs(remote, cached.blob);
          applyState(merged);
          cachePartialRef.current = false;
          await writeCache(h, merged);
          await saveBudget(h, merged);
          setPending(h, false);
        } else {
          applyState(remote);
          cachePartialRef.current = false;
          await writeCache(h, remote);
          setPending(h, false);
        }
      } else {
        // No server data yet (new key / new account) — seed it.
        const init = {
          version: 4,
          updatedAt: Date.now(),
          categories: DEFAULT_CATEGORIES,
          settings: DEFAULT_SETTINGS,
          transactions: [],
          weekOverrides: {},
          weekSpendDays: {},
        };
        applyState(init);
        cachePartialRef.current = false;
        await writeCache(h, init);
        await saveBudget(h, init);
        setPending(h, false);
      }
      loadedRef.current = true;
      setStatus("ready");
      setSync("saved");
    } catch (e) {
      // Offline or server error. If the cache already painted, stay on it and
      // mark unsynced; otherwise we have nothing to show.
      if (cached?.blob?.categories) {
        loadedRef.current = true;
        setStatus("ready");
        setSync("error");
      } else {
        console.error(e);
        setStatus("error");
      }
    }
  }

  // First load: auto sign-in if a key is stored, else show the Welcome screen.
  useEffect(() => {
    const h = getStoredHash();
    if (h) {
      setHash(h);
      hydrate(h, { createIfMissing: true });
    } else {
      setStatus("auth");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warm the lazy app chunks once we're showing the login screen, so creating
  // or entering an account doesn't wait on a download.
  useEffect(() => {
    if (status === "auth") prefetchScreens();
  }, [status]);

  // On any data change: write through to the local cache immediately (durable,
  // offline-safe), then debounce a sync to Supabase. If the sync fails we stay
  // "pending" and flush on reconnect.
  useEffect(() => {
    if (!loadedRef.current || !hash) return;
    const blob = buildBlob();
    writeCache(hash, blob);
    setPending(hash, true);
    setSync("saving");
    const t = setTimeout(async () => {
      try {
        await saveBudget(hash, blob);
        setPending(hash, false);
        cachePartialRef.current = false;
        setSync("saved");
      } catch (e) {
        setSync("error"); // keep pending — the reconnect handler will retry
      }
    }, 600);
    return () => clearTimeout(t);
  }, [categories, settings, transactions, weekOverrides, weekSpendDays, hash]);

  // When the device comes back online, flush any pending offline edits.
  useEffect(() => {
    async function flush() {
      if (!hash || !isPending(hash)) return;
      const cached = await readCache(hash);
      if (!cached?.blob) return;
      setSync("saving");
      try {
        let toSave = cached.blob;
        // If the cache was ever trimmed, reconcile with the server first so we
        // can't overwrite older (already-synced) transactions.
        if (cachePartialRef.current || cached.partial) {
          const remote = await loadBudget(hash);
          toSave = mergeBlobs(remote, cached.blob);
          applyState(toSave);
          cachePartialRef.current = false;
          await writeCache(hash, toSave);
        }
        await saveBudget(hash, toSave);
        setPending(hash, false);
        setSync("saved");
      } catch (e) {
        setSync("error");
      }
    }
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  // --- Auth actions ---
  async function signIn(rawHash) {
    const h = (rawHash || "").trim();
    if (!h) return;
    setAuthError("");
    storeHash(h);
    setHash(h);
    await hydrate(h, { createIfMissing: false });
    setView("dashboard");
  }
  async function createAccount() {
    const h = genHash();
    setAuthError("");
    storeHash(h);
    setHash(h);
    await hydrate(h, { createIfMissing: true });
    setView("add");
  }
  function signOut() {
    try {
      if (hash) clearCache(hash);
      localStorage.removeItem("budget.hash");
    } catch {
      /* ignore */
    }
    loadedRef.current = false;
    setHash(null);
    setTransactions([]);
    setWeekOverrides({});
    setWeekSpendDays({});
    setStatus("auth");
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
  function updateTransaction(updated) {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
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

  // --- Settings, per-week budget, per-week spend days ---
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
  function setWeekSpendDaysFor(key, days) {
    setWeekSpendDays((prev) => {
      const next = { ...prev };
      if (days == null) delete next[key];
      else next[key] = days;
      return next;
    });
  }

  // --- Backups ---
  function exportData() {
    try {
      const blob = new Blob(
        [
          JSON.stringify(
            { version: 4, categories, settings, transactions, weekOverrides, weekSpendDays },
            null,
            2
          ),
        ],
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
          if (s.settings) setSettings({ ...DEFAULT_SETTINGS, ...s.settings });
          if (Array.isArray(s.transactions)) setTransactions(s.transactions);
          if (s.weekOverrides) setWeekOverrides(s.weekOverrides);
          if (s.weekSpendDays) setWeekSpendDays(s.weekSpendDays);
        } catch {
          /* ignore */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // --- Gates ---
  if (status === "auth") {
    return <Welcome onSignIn={signIn} onCreate={createAccount} error={authError} />;
  }
  if (status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center dark:bg-gray-950">
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
              onClick={() => hash && hydrate(hash, { createIfMissing: true })}
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
        <Suspense fallback={<Spinner />}>
        {view === "add" && (
          <QuickAdd
            categories={categories}
            transactions={transactions}
            settings={settings}
            weekOverrides={weekOverrides}
            sync={sync}
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
            weekSpendDays={weekSpendDays}
            sync={sync}
            onSetWeekAllowance={setWeekAllowance}
            onSetWeekSpendDays={setWeekSpendDaysFor}
            onAdd={() => setView("add")}
            onViewAll={() => setView("history")}
          />
        )}
        {view === "history" && (
          <History
            categories={categories}
            transactions={transactions}
            settings={settings}
            onSave={updateTransaction}
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
            onUseAccount={signIn}
            onNewAccount={createAccount}
            onSignOut={signOut}
            onExport={exportData}
            onImport={importData}
          />
        )}
        {view === "help" && <Help />}
        </Suspense>
      </div>

      <BottomNav view={view} onChange={setView} />
      <InstallPrompt />
    </div>
  );
}
