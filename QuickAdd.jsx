import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseAmount,
  formatMoney,
  computeTotals,
  getWeekRange,
  weekTransactions,
  weekKey,
  getAllowanceForWeek,
} from "./budget.js";
import { ChartIcon } from "./icons.jsx";
import SyncStatus from "./SyncStatus.jsx";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

// Short screens (the same cutoff the layout tightens at) put the categories in
// one horizontally scrolling row, so the keypad keeps its room. Tall screens
// have space for every chip at once and keep the wrapped grid.
const SHORT = "(max-height: 780px)";
const DAY = 86400000;

function useMedia(query) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/**
 * Quick-Add — the default landing screen, built for one-handed speed.
 * Sticky techy banner (shortcut to Dashboard), massive amount readout,
 * pill category chips, borderless note + numpad, sticky Save (disabled until
 * an amount > 0 and a category are chosen).
 */
export default function QuickAdd({
  categories,
  transactions,
  settings,
  weekOverrides = {},
  sync,
  onAdd,
  onGoDashboard,
}) {
  const symbol = settings.currencySymbol;
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [note, setNote] = useState("");

  const scrollRow = useMedia(SHORT);
  const rowRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // In the scrolling row, the categories you actually use come first, so they're
  // on screen without scrolling: count over the last 30 days, ties keep your own
  // order. The wrapped grid shows everything, so it keeps your order exactly.
  const ordered = useMemo(() => {
    if (!scrollRow) return categories;
    const since = Date.now() - 30 * DAY;
    const uses = {};
    for (const t of transactions) if (t.ts >= since) uses[t.categoryId] = (uses[t.categoryId] || 0) + 1;
    return categories
      .map((c, i) => ({ c, i, n: uses[c.id] || 0 }))
      .sort((a, b) => b.n - a.n || a.i - b.i)
      .map((x) => x.c);
  }, [scrollRow, categories, transactions]);

  // Fade an edge only while there are chips hidden past it.
  function measureEdges() {
    const el = rowRef.current;
    if (!el || !scrollRow) return setEdges({ left: false, right: false });
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }
  useEffect(() => {
    measureEdges();
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measureEdges);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRow, ordered.length]);

  function pickCategory(id, el) {
    setCategoryId(id);
    // keep the chosen chip fully in view (horizontal only; never moves the page)
    const row = rowRef.current;
    if (scrollRow && row && el) {
      const pad = 16;
      const l = el.offsetLeft - pad, r = el.offsetLeft + el.offsetWidth + pad - row.clientWidth;
      if (row.scrollLeft > l) row.scrollTo({ left: l, behavior: "smooth" });
      else if (row.scrollLeft < r) row.scrollTo({ left: r, behavior: "smooth" });
    }
  }

  const fade = scrollRow
    ? `linear-gradient(to right, ${edges.left ? "transparent 0, #000 28px" : "#000 0"}, ${edges.right ? "#000 calc(100% - 36px), transparent 100%" : "#000 100%"})`
    : undefined;

  const cents = parseAmount(amountStr);
  const canSave = cents > 0 && categoryId != null;

  const now = Date.now();
  const range = getWeekRange(now, settings.weekStartDay);
  const allowance = getAllowanceForWeek(weekKey(now, settings.weekStartDay), settings, weekOverrides);
  const { remaining, isOver } = computeTotals(weekTransactions(transactions, range), allowance);

  function press(k) {
    setAmountStr((prev) => {
      if (k === "⌫") return prev.slice(0, -1);
      if (k === ".") {
        if (prev.includes(".")) return prev;
        return prev === "" ? "0." : prev + ".";
      }
      if (prev.includes(".") && prev.split(".")[1].length >= 2) return prev;
      if (prev === "0" && k !== ".") return k;
      return prev + k;
    });
  }

  function save() {
    if (!canSave) return;
    onAdd({ amount: cents, categoryId, note: note.trim() });
    setAmountStr("");
    setCategoryId(null);
    setNote("");
  }

  // The log screen fills the space above the floating tab bar, and the keypad
  // takes whatever is left: its rows share that space (never under a 44px touch
  // target, keys capped at 64px), so on most phones every key and Save are on
  // screen at once without scrolling. If even 44px rows don't fit, the screen
  // grows and scrolls instead of letting anything overlap.
  return (
    <div className="flex min-h-[calc(100dvh-var(--nav-clear))] flex-col">
      {/* Sticky techy status banner -> Dashboard */}
      <div className="glass-bar sticky top-0 z-10 flex items-center justify-between gap-2 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={onGoDashboard} className="flex min-w-0 items-center gap-2 text-left text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: isOver ? "#EF4444" : "rgb(var(--accent-ink))" }} />
          <span className="truncate text-gray-500 dark:text-gray-400">
            {isOver ? "Over budget" : "Left this week"}
          </span>
          <span
            className="font-mono font-semibold tabular-nums"
            style={{ color: isOver ? "#EF4444" : "rgb(var(--accent-ink))" }}
          >
            {isOver ? `-${formatMoney(Math.abs(remaining), symbol)}` : formatMoney(remaining, symbol)}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <SyncStatus sync={sync} />
          <button onClick={onGoDashboard} className="flex items-center gap-1 text-xs font-semibold text-accent-ink">
            <ChartIcon size={16} /> Dashboard
          </button>
        </div>
      </div>

      {/* Amount readout */}
      <div className="px-4 pb-2 pt-[clamp(0.75rem,3.5dvh,2rem)] text-center [@media(max-height:780px)]:pb-1 [@media(max-height:780px)]:pt-2">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Amount</div>
        <div className="mt-1 text-[clamp(2.75rem,8dvh,3.75rem)] font-extrabold leading-tight tracking-tight [@media(max-height:780px)]:mt-0 [@media(max-height:780px)]:text-5xl text-gray-900 dark:text-gray-50">
          {amountStr === "" ? `${symbol}0` : formatMoney(cents, symbol)}
        </div>
      </div>

      {/* Category chips */}
      <div className="px-4 pt-[clamp(0.5rem,2dvh,1rem)] [@media(max-height:780px)]:pt-2">
        <div
          ref={rowRef}
          onScroll={measureEdges}
          className={
            scrollRow
              ? "no-scrollbar relative -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4"
              : "flex flex-wrap gap-2"
          }
          style={fade ? { WebkitMaskImage: fade, maskImage: fade } : undefined}
        >
          {ordered.map((c) => {
            const active = categoryId === c.id;
            return (
              <button
                key={c.id}
                onClick={(e) => pickCategory(c.id, e.currentTarget)}
                className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-[clamp(0.7rem,3.4vw,1rem)] py-2 text-sm font-medium transition active:scale-95 ${
                  active
                    ? "border border-transparent text-white"
                    : "border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200"
                }`}
                style={active ? { backgroundColor: c.color } : undefined}
              >
                {c.icon} {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Borderless note */}
      <div className="px-4 pt-[clamp(0.5rem,2dvh,1rem)] [@media(max-height:780px)]:pt-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (e.g. JSEC lunch, Grab to Ateneo)"
          className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 [@media(max-height:780px)]:py-2.5 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:bg-gray-900 dark:text-gray-50"
        />
      </div>

      {/* Borderless numpad: rows flex between a 44px touch target and 64px */}
      <div
        className="mt-auto grid max-h-[18.75rem] flex-1 grid-cols-3 gap-2 px-4 [@media(max-height:600px)]:gap-1.5 pt-[clamp(0.5rem,2.5dvh,1.25rem)] [@media(max-height:780px)]:pt-2"
        style={{ gridAutoRows: "minmax(44px, 1fr)" }}
      >
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-full max-h-16 self-end rounded-2xl text-2xl font-semibold text-gray-900 transition active:scale-95 active:bg-gray-200 dark:text-gray-50 dark:active:bg-gray-800"
            >
              {k}
            </button>
          ))}
      </div>

      {/* Save: always directly under the keypad, never over it */}
      <div className="shrink-0 px-4 pb-2 pt-2.5">
        <button
          onClick={save}
          disabled={!canSave}
          className={`w-full rounded-2xl py-4 text-base font-semibold transition [@media(max-height:780px)]:py-3.5 ${
            canSave
              ? "bg-accent text-on-accent shadow-float active:scale-[0.98]"
              : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-800"
          }`}
        >
          {canSave ? `Save ${formatMoney(cents, symbol)}` : "Enter amount & category"}
        </button>
      </div>
    </div>
  );
}
