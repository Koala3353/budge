import { lazy, Suspense, useEffect, useRef, useState } from "react";
import BottomNav from "./BottomNav.jsx";
import Welcome from "./Welcome.jsx";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from "./seed.js";
import { genHash, getStoredHash, storeHash, loadBudget, saveBudget } from "./store.js";

// Code-split the signed-in app away from the login path. A first-time visitor
// (no stored key) only downloads React + the Welcome screen, so initial paint
// is fast; the heavy screens + charts load lazily and are prefetched the moment
// the Welcome screen renders, so tapping "create account" still feels instant.
const importQuickAdd = () => import("./QuickAdd.jsx");
const importDashboard = () => import("./Dashboard.jsx");
const importHistory = () => import("./History.jsx");
const importSettings = () => import("./Settings.jsx");
const QuickAdd = lazy(importQuickAdd);
const Dashboard = lazy(importDashboard);
const History = lazy(importHistory);
const Settings = lazy(importSettings);

function prefetchScreens() {
  importQuickAdd();
  importDashboard();
  importHistory();
  importSettings();
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

  function applyState(data) {
    setCategories(data.categories || DEFAULT_CATEGORIES);
    setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
    setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    setWeekOverrides(data.weekOverrides || {});
    setWeekSpendDays(data.weekSpendDays || {});
  }

  // Load an existing account, or create it on first sign-in/new-account.
  async function hydrate(h, { createIfMissing }) {
    loadedRef.current = false;
    setStatus("loading");
    try {
      const data = await loadBudget(h);
      if (data && data.categories) {
        applyState(data);
      } else if (createIfMissing) {
        const init = {
          categories: DEFAULT_CATEGORIES,
          settings: DEFAULT_SETTINGS,
          transactions: [],
          weekOverrides: {},
          weekSpendDays: {},
        };
        applyState(init);
        await saveBudget(h, { version: 4, ...init });
      } else {
        // Signed in with a key that has no data yet — start it as a fresh account.
        const init = {
          categories: DEFAULT_CATEGORIES,
          settings: DEFAULT_SETTINGS,
          transactions: [],
          weekOverrides: {},
          weekSpendDays: {},
        };
        applyState(init);
        await saveBudget(h, { version: 4, ...init });
      }
      loadedRef.current = true;
      setStatus("ready");
      setSync("saved");
    } catch (e) {
      console.error(e);
      setStatus("error");
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

  // Debounced sync to Supabase on any data change (after load).
  useEffect(() => {
    if (!loadedRef.current || !hash) return;
    setSync("saving");
    const t = setTimeout(async () => {
      try {
        await saveBudget(hash, {
          version: 4,
          categories,
          settings,
          transactions,
          weekOverrides,
          weekSpendDays,
        });
        setSync("saved");
      } catch (e) {
        console.error(e);
        setSync("error");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [categories, settings, transactions, weekOverrides, weekSpendDays, hash]);

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
            onUseAccount={signIn}
            onNewAccount={createAccount}
            onSignOut={signOut}
            onExport={exportData}
            onImport={importData}
          />
        )}
        </Suspense>
      </div>

      <BottomNav view={view} onChange={setView} />
    </div>
  );
}
