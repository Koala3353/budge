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
  contentSig,
  readJournal,
  writeJournal,
  clearJournal,
  FIELDS,
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
// Admin is never prefetched: almost nobody opens it, so nobody else pays for it.
const Admin = lazy(() => import("./Admin.jsx"));

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
  const [deleted, setDeleted] = useState({}); // tombstones: { txId: deletedAt }

  const loadedRef = useRef(false);
  const cachePartialRef = useRef(false);
  const hashRef = useRef(null);
  // The latest state, readable from async code (a push that started three
  // renders ago must send what's on screen NOW, not what it closed over).
  const stateRef = useRef(null);
  stateRef.current = { categories, settings, transactions, weekOverrides, weekSpendDays, deleted };
  // When each top-level field last changed, so a merge can keep the newer one
  // per field. `seenRef` holds the objects last seen, to detect which changed.
  const fieldTimesRef = useRef({});
  const seenRef = useRef({});
  // What the server is known to hold (content signature), and the last known
  // server copy itself. A change whose signature matches needs no push.
  const syncedSigRef = useRef(null);
  const remoteRef = useRef(null);
  const cachedSigRef = useRef(null);

  function buildBlob() {
    const s = stateRef.current;
    return {
      version: 5,
      updatedAt: Date.now(),
      fieldTimes: { ...fieldTimesRef.current },
      categories: s.categories,
      settings: s.settings,
      transactions: s.transactions,
      weekOverrides: s.weekOverrides,
      weekSpendDays: s.weekSpendDays,
      deleted: s.deleted,
    };
  }

  // Load a blob into state WITHOUT it registering as an edit: the field objects
  // are recorded as already seen, and their timestamps come from the blob.
  function applyState(data) {
    const next = {
      categories: data.categories || DEFAULT_CATEGORIES,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      weekOverrides: data.weekOverrides || {},
      weekSpendDays: data.weekSpendDays || {},
    };
    const ft = {};
    for (const k of FIELDS) ft[k] = data.fieldTimes?.[k] ?? data.updatedAt ?? 0;
    fieldTimesRef.current = ft;
    seenRef.current = next;
    // Update the ref now, not at the next render: code that runs before React
    // re-renders (the rest of a hydrate or push) must see what we just applied.
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    stateRef.current = { ...next, transactions, deleted: data.deleted || {} };
    setCategories(next.categories);
    setSettings(next.settings);
    setTransactions(transactions);
    setWeekOverrides(next.weekOverrides);
    setWeekSpendDays(next.weekSpendDays);
    setDeleted(stateRef.current.deleted);
  }

  // Load an account: paint the local copy instantly (works offline), then
  // reconcile with the server by MERGING — never by replacing.
  //
  // The app is live from the moment the local copy paints. It used to wait for
  // the server before it would save anything, so on a slow connection an entry
  // typed while the spinner was hidden behind cached data went nowhere: not to
  // the device, not to the server. Swipe the app away, and it was gone; wait,
  // and the server's copy landed on top of it.
  async function hydrate(h) {
    // Only the newest hydrate may apply anything; an older one still awaiting
    // the network bails out when it wakes.
    const run = ++hydrateRunRef.current;
    const stale = () => hydrateRunRef.current !== run || hashRef.current !== h;
    loadedRef.current = false;
    hashRef.current = h;
    syncedSigRef.current = null;
    remoteRef.current = null;
    cachedSigRef.current = null;
    clearRetry();

    const cached = await readCache(h);
    // A journal is what was on screen when the app was last hidden. It can be
    // newer than IndexedDB if the app was killed before a write committed.
    const journal = readJournal(h);
    let local = cached?.blob || null;
    if (journal?.categories) local = local ? mergeBlobs(local, journal) : journal;
    if (stale()) return;

    if (local?.categories) {
      applyState(local);
      cachePartialRef.current = !!cached?.partial;
      if (!isPending(h) && !journal) syncedSigRef.current = contentSig(local);
      if (!journal) cachedSigRef.current = contentSig(local);
      loadedRef.current = true;
      setStatus("ready");
      setSync(isPending(h) || journal ? "error" : "saved");
    } else {
      setStatus("loading");
    }

    try {
      const remote = await loadBudget(h);
      if (stale()) return;
      if (remote && remote.categories) {
        remoteRef.current = remote;
        syncedSigRef.current = contentSig(remote);
        cachePartialRef.current = false;
        // Merge with what's on screen now — including anything typed while
        // this request was in flight. The persist effect then pushes only if
        // the result differs from what the server already has.
        const merged = loadedRef.current ? mergeBlobs(remote, buildBlob()) : remote;
        applyState(merged);
        loadedRef.current = true;
        setStatus("ready");
        if (contentSig(merged) === syncedSigRef.current) {
          setPending(h, false);
          setSync("saved");
        }
      } else if (!loadedRef.current) {
        // No server data and nothing local: a new account. Paint immediately;
        // the persist effect seeds the server in the background.
        const now = Date.now();
        applyState({
          version: 5,
          updatedAt: now,
          fieldTimes: Object.fromEntries(FIELDS.map((k) => [k, now])),
          categories: DEFAULT_CATEGORIES,
          settings: DEFAULT_SETTINGS,
          transactions: [],
          weekOverrides: {},
          weekSpendDays: {},
          deleted: {},
        });
        loadedRef.current = true;
        setStatus("ready");
      } else {
        // Local data but no server row (e.g. the first sync never landed):
        // leave the signature null so the persist effect uploads it.
        syncedSigRef.current = null;
      }
      lastPullRef.current = Date.now();
    } catch (e) {
      if (stale()) return;
      // Offline or server error. With local data we carry on offline and keep
      // retrying; without it there is nothing to show.
      if (loadedRef.current) {
        setSync("error");
        reconcileLaterRef.current = true;
        scheduleRetry(h);
      } else {
        console.error(e);
        setStatus("error");
      }
    }
  }
  // Set when the launch-time fetch failed: the next successful push must pull
  // too, or edits made on another device while we were offline never arrive.
  const reconcileLaterRef = useRef(false);
  const hydrateRunRef = useRef(0);
  const lastPullRef = useRef(0);

  // First load: auto sign-in if a key is stored, else show the Welcome screen.
  useEffect(() => {
    const h = getStoredHash();
    if (h) {
      setHash(h);
      hydrate(h);
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
  // Every push is read → merge → write. Writing the device's copy straight over
  // the server's (as it used to) was fine for one phone, but a phone that had
  // been offline would erase whatever another device had synced meanwhile.
  //
  // Every edit bumps a generation counter. A push records the generation it is
  // carrying and only clears the "pending" flag if that is STILL the newest one,
  // so a slow push that lands after a newer edit can't mark that edit as synced.
  // Pushes are single-flight; the in-flight one chains to the newest state.
  const genRef = useRef(0);
  const savingRef = useRef(false);
  const retryRef = useRef(null);
  const attemptRef = useRef(0);
  const debounceRef = useRef(null);

  function clearRetry() {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  }

  // Back off on repeated failure rather than hammering a network that is down:
  // 5s, 10s, 20s, 40s, then every minute. Scheduled even when the browser says
  // it's offline — iOS in particular often never fires `online` for a
  // home-screen app, so waiting for that event could mean waiting forever.
  function scheduleRetry(h) {
    clearRetry();
    const wait = Math.min(60000, 5000 * 2 ** Math.min(attemptRef.current, 3));
    attemptRef.current += 1;
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      push(h, { reason: "retry" });
    }, wait);
  }

  function needsSync(h) {
    return isPending(h) || reconcileLaterRef.current;
  }

  async function push(h, { reason, keepalive = false } = {}) {
    if (!h || hashRef.current !== h || !loadedRef.current || !needsSync(h)) return;
    if (savingRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSync("error");
      scheduleRetry(h);
      return;
    }
    savingRef.current = true;
    const gen = genRef.current;
    // A pull with nothing of ours to send shouldn't flash "Saving…".
    if (isPending(h)) setSync("saving");
    try {
      // The hide-time flush can't afford a round trip — the page may be frozen
      // before it returns — so it merges against the last server copy we saw.
      // Anything newer on the server survives anyway: its own device still
      // holds it and merges it back on its next sync.
      const remote = keepalive && remoteRef.current ? remoteRef.current : await loadBudget(h);
      if (hashRef.current !== h) return;
      const local = buildBlob();
      const merged = mergeBlobs(remote, local);
      lastPullRef.current = Date.now();
      // Nothing to add to the server (a pull that found us already current, or
      // only another device's changes to take in): skip the write.
      if (!remote || contentSig(merged) !== contentSig(remote)) {
        await saveBudget(h, merged, { keepalive });
      }
      if (hashRef.current !== h) return;
      remoteRef.current = merged;
      syncedSigRef.current = contentSig(merged);
      reconcileLaterRef.current = false;
      attemptRef.current = 0;
      clearRetry();
      if (genRef.current === gen) {
        setPending(h, false);
        // Pull in what the server had that we didn't (another device's edits).
        if (contentSig(merged) !== contentSig(local)) applyState(merged);
        cachedSigRef.current = contentSig(merged);
        writeCache(h, merged).then((r) => r === "full" && clearJournal(h));
        setSync("saved");
      } else {
        // A newer edit landed mid-flight: don't overwrite it with `merged`.
        // Push again; that merge will fold the server's side in.
        setSync("saving");
        setTimeout(() => push(h, { reason: "chain" }), 0);
      }
    } catch {
      if (hashRef.current !== h) return;
      setSync("error");
      scheduleRetry(h);
    } finally {
      savingRef.current = false;
    }
  }

  // Persist on every change: stamp which fields changed, write through to the
  // device, and — only if the server doesn't already have this exact content —
  // flag pending (synchronously, before any async write) and debounce a push.
  useEffect(() => {
    if (!loadedRef.current || !hash) return;
    const now = Date.now();
    const seen = seenRef.current;
    const cur = { categories, settings, weekOverrides, weekSpendDays };
    for (const k of FIELDS) if (seen[k] !== cur[k]) fieldTimesRef.current[k] = now;
    seenRef.current = cur;

    const blob = buildBlob();
    const sig = contentSig(blob);
    if (sig !== cachedSigRef.current) {
      cachedSigRef.current = sig;
      // The journal is only a stopgap until IndexedDB has the same state.
      writeCache(hash, blob).then((r) => r === "full" && clearJournal(hash));
    }
    if (sig === syncedSigRef.current) return;
    genRef.current += 1;
    setPending(hash, true);
    setSync("saving");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => push(hash, { reason: "edit" }), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, settings, transactions, weekOverrides, weekSpendDays, deleted, hash]);

  // Connectivity & lifecycle. `online` alone is not enough: it tracks the
  // network interface, not whether Supabase is reachable, and a phone that
  // slept through a reconnect may never fire it. So we also try on focus.
  //
  // Going to the background is the last moment we're guaranteed to run — on a
  // phone, "closing" the app is usually just hiding it, and the OS may kill it
  // later without another word. So on hide we (1) write a synchronous journal
  // copy so nothing depends on an async write finishing, and (2) flush now,
  // skipping the debounce, with a request that may outlive the page.
  useEffect(() => {
    if (!hash) return;
    const onOnline = () => {
      attemptRef.current = 0; // a fresh connection deserves an immediate try
      push(hash, { reason: "online" });
    };
    const onHide = () => {
      if (!loadedRef.current || hashRef.current !== hash) return;
      if (isPending(hash)) {
        writeJournal(hash, buildBlob());
        clearTimeout(debounceRef.current);
        push(hash, { reason: "hide", keepalive: true });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
      else {
        attemptRef.current = 0;
        // Back from the background: also pick up anything another device
        // synced meanwhile, at most once a minute.
        if (Date.now() - lastPullRef.current > 60000) reconcileLaterRef.current = true;
        push(hash, { reason: "visible" });
      }
    };
    const onFocus = () => push(hash, { reason: "focus" });
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      clearRetry();
      clearTimeout(debounceRef.current);
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
    await hydrate(h);
    setView("dashboard");
  }
  async function createAccount() {
    const h = genHash();
    setAuthError("");
    storeHash(h);
    setHash(h);
    await hydrate(h);
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
    hashRef.current = null;
    setHash(null);
    setTransactions([]);
    setDeleted({});
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
      mt: Date.now(),
    };
    setTransactions((prev) => [tx, ...prev]);
    setView("dashboard");
  }
  function deleteTransaction(tx) {
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    setDeleted((prev) => ({ ...prev, [tx.id]: Date.now() }));
  }
  function updateTransaction(updated) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, ...updated, mt: Date.now() } : t))
    );
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
        txs.map((t) => (t.categoryId === id ? { ...t, categoryId: fallback, mt: Date.now() } : t))
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
          if (Array.isArray(s.transactions)) {
            // Entries the backup doesn't have are deleted, not just hidden —
            // otherwise the next sync would merge them straight back in.
            const keep = new Set(s.transactions.map((t) => t.id));
            const now = Date.now();
            setDeleted((prev) => {
              const next = { ...prev };
              for (const t of stateRef.current.transactions) if (!keep.has(t.id)) next[t.id] = now;
              for (const id of keep) delete next[id];
              return next;
            });
            setTransactions(s.transactions.map((t) => ({ ...t, mt: now })));
          }
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
        {view === "help" && <Help onOpenAdmin={() => setView("admin")} />}
        {view === "admin" && <Admin hash={hash} onBack={() => setView("help")} />}
        </Suspense>
      </div>

      <BottomNav view={view === "admin" ? "help" : view} onChange={setView} />
      <InstallPrompt />
    </div>
  );
}
