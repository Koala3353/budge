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

// A returning user's screens used to be requested only AFTER hydrate resolved,
// which put the chunk download behind the Supabase round trip — the browser sat
// idle on a spinner with the network free, then fetched the UI. Kicking the
// imports off at module scope starts them before React even mounts, in parallel
// with everything else. Only for a signed-in visitor: a first-timer still gets
// the small login path and is prefetched once Welcome renders.
if (getStoredHash()) prefetchScreens();

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
          saveBudget(h, merged)
            .then(() => setPending(h, false))
            .catch(() => {}); // stays pending; the retry loop picks it up
        } else {
          applyState(remote);
          cachePartialRef.current = false;
          setPending(h, false);
          writeCache(h, remote); // local mirror; nothing waits on it
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
        // Paint immediately and seed the server in the background: a new account
        // has nothing to lose, and blocking "ready" on an upsert meant staring at
        // a spinner through a second round trip.
        applyState(init);
        cachePartialRef.current = false;
        writeCache(h, init);
        saveBudget(h, init)
          .then(() => setPending(h, false))
          .catch(() => setPending(h, true));
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

  // --- Sync engine ------------------------------------------------------------
  //
  // Every edit bumps a generation counter. A push records the generation it is
  // carrying and only clears the "pending" flag if that is STILL the newest one.
  // Without this, a slow push that finished after a newer edit had landed would
  // clear the flag while unsynced data existed — and that data would never be
  // flushed, because nothing knew it was owed.
  //
  // Pushes are single-flight: overlapping writes could otherwise land out of
  // order and let an older payload win.
  const genRef = useRef(0);
  const savingRef = useRef(false);
  const retryRef = useRef(null);
  const attemptRef = useRef(0);

  function clearRetry() {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  }

  // Back off on repeated failure rather than hammering a network that is down:
  // 5s, 10s, 20s, 40s, then every minute.
  function scheduleRetry(h) {
    clearRetry();
    const wait = Math.min(60000, 5000 * 2 ** Math.min(attemptRef.current, 3));
    attemptRef.current += 1;
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      push(h, "retry");
    }, wait);
  }

  async function push(h, reason) {
    if (!h || !isPending(h)) return;
    // Single-flight: overlapping pushes can land out of order and let an older
    // payload win. The in-flight one chains to the newest state when it lands.
    if (savingRef.current) return;
    // A known-offline device should not spend a request to find out.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSync("error");
      return;
    }
    savingRef.current = true;
    const gen = genRef.current;
    setSync("saving");
    try {
      const cached = await readCache(h);
      let toSave = cached?.blob;
      if (!toSave) return;
      // If the cache was ever trimmed we may be missing already-synced rows, so
      // reconcile with the server before writing, or we would delete them.
      if (cachePartialRef.current || cached.partial) {
        const remote = await loadBudget(h);
        toSave = mergeBlobs(remote, toSave);
        applyState(toSave);
        cachePartialRef.current = false;
        await writeCache(h, toSave);
      }
      await saveBudget(h, toSave);
      attemptRef.current = 0;
      clearRetry();
      if (genRef.current === gen) {
        // Nothing changed while we were pushing — we are genuinely in sync.
        setPending(h, false);
        setSync("saved");
      } else {
        // A newer edit landed mid-flight. Leave the flag set and push again —
        // that edit's own debounce was swallowed by the single-flight guard
        // above, so if we don't chain here nothing else will.
        setSync("saving");
        setTimeout(() => push(h, "chain"), 0);
      }
    } catch {
      setSync("error");
      scheduleRetry(h);
    } finally {
      savingRef.current = false;
    }
  }

  // On any data change: flag pending FIRST (so a crash mid-write still knows
  // something is owed), write through to the local cache, then debounce a push.
  useEffect(() => {
    if (!loadedRef.current || !hash) return;
    const blob = buildBlob();
    genRef.current += 1;
    setPending(hash, true);
    writeCache(hash, blob);
    setSync("saving");
    const t = setTimeout(() => push(hash, "edit"), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, settings, transactions, weekOverrides, weekSpendDays, hash]);

  // Flush whenever the device plausibly regained connectivity. `online` alone is
  // not enough: it tracks the network interface, not whether Supabase is
  // reachable, and a phone that slept through a reconnect may never fire it. So
  // we also try when the app is brought back to the foreground.
  useEffect(() => {
    if (!hash) return;
    const onOnline = () => {
      attemptRef.current = 0; // a fresh connection deserves an immediate try
      push(hash, "online");
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") push(hash, "visible");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    // Anything left over from a previous session flushes on mount.
    push(hash, "mount");
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearRetry();
    };
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
