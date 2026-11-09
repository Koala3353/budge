import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// Categories wrap onto as many rows as they need when the screen has the room.
// When they can't all fit without squeezing the keypad below COMFY_KEY, they
// scroll sideways instead, in as many rows as the space allows (often two), so
// no screen is left with an empty band. Decided by measuring, not a breakpoint.
const COMFY_KEY = 56; // px; full-size keys are 64
const DAY = 86400000;

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

  // First guess before measuring: scroll on short screens. The layout effect
  // below corrects it before the first paint, so there's no visible jump.
  const [chipLayout, setChipLayout] = useState(() => ({
    scroll: typeof window !== "undefined" && window.innerHeight <= 780,
    rows: 1,
  }));
  const scrollRow = chipLayout.scroll;
  const rootRef = useRef(null);
  const [fitH, setFitH] = useState(null);
  const rowRef = useRef(null);
  const wrapRef = useRef(null);
  const noteRef = useRef(null);
  const gridRef = useRef(null);
  const saveRef = useRef(null);
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

  // Size the screen to end just above the tab bar, measured from where the tab
  // bar actually is. 100dvh alone isn't trustworthy: on some Android installed
  // apps it counts the system navigation bar, which pushed Save under the tab
  // bar and left a band of empty space above the keypad. The CSS min-height
  // stays as the first-paint fallback; this measured value replaces it.
  function fitToTabBar() {
    const root = rootRef.current;
    const bar = document.querySelector('nav[aria-label="Main"] > div');
    if (!root || !bar) return;
    // the note's keyboard can shrink the viewport on some phones; don't reflow under the user's thumbs
    if (document.activeElement === noteRef.current) return;
    const top = root.getBoundingClientRect().top + window.scrollY;
    const h = Math.floor(bar.getBoundingClientRect().top - top - 12);
    if (h > 0) setFitH((prev) => (prev != null && Math.abs(prev - h) < 2 ? prev : h));
  }
  useLayoutEffect(() => {
    fitToTabBar();
    window.addEventListener("resize", fitToTabBar);
    window.addEventListener("orientationchange", fitToTabBar);
    return () => {
      window.removeEventListener("resize", fitToTabBar);
      window.removeEventListener("orientationchange", fitToTabBar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrap or scroll? Work out how many rows the chips would need wrapped (from
  // their real widths), how much the keypad would shrink to make room, and keep
  // the wrapped grid only if keys stay comfortable. The sum is done in
  // "scroll-row terms" whichever mode is showing, so the answer can't flip-flop.
  function decideLayout() {
    const row = rowRef.current, wrap = wrapRef.current, noteEl = noteRef.current;
    const grid = gridRef.current, saveEl = saveRef.current;
    if (!row || !wrap || !noteEl || !grid || !saveEl) return;
    const chips = [...row.querySelectorAll("[data-id]")];
    if (!chips.length) return;
    const width = {};
    for (const c of chips) width[c.dataset.id] = c.offsetWidth;
    const chipH = chips[0].offsetHeight;
    const gap = 8;
    const avail = wrap.clientWidth - 32; // the px-4 gutter on each side
    let rows = 1, line = 0;
    for (const c of categories) {
      const w = width[c.id] || 0;
      if (line && line + gap + w > avail) { rows++; line = w; } else line += (line ? gap : 0) + w;
    }
    const perRow = chipH + gap;
    const space = saveEl.getBoundingClientRect().top - noteEl.getBoundingClientRect().bottom;
    // normalise to "one chip row" whatever is showing, so the answer is stable
    const shownRows = scrollRow ? chipLayout.rows : rows;
    const base = space + (shownRows - 1) * perRow;
    const cs = getComputedStyle(grid);
    const keyWith = (r) => (base - (r - 1) * perRow - parseFloat(cs.paddingTop) - 3 * parseFloat(cs.rowGap)) / 4;
    let fit = 1; // how many chip rows the keypad can spare room for
    while (fit < rows && keyWith(fit + 1) >= COMFY_KEY) fit++;
    const next = rows <= fit ? { scroll: false, rows } : { scroll: true, rows: fit };
    if (next.scroll !== chipLayout.scroll || (next.scroll && next.rows !== chipLayout.rows)) setChipLayout(next);
  }
  useLayoutEffect(() => {
    decideLayout();
    window.addEventListener("resize", decideLayout);
    return () => window.removeEventListener("resize", decideLayout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipLayout, categories, fitH]);

  // Scrolling rows: deal the chips column by column (1st to row 1, 2nd to row 2,
  // ...), so the most-used ones are all at the visible left edge.
  const scrollRows = useMemo(() => {
    const n = Math.max(1, chipLayout.rows);
    const out = Array.from({ length: n }, () => []);
    ordered.forEach((c, i) => out[i % n].push(c));
    return out;
  }, [ordered, chipLayout.rows]);

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
    <div
      ref={rootRef}
      className="flex min-h-[calc(100dvh-var(--nav-clear))] flex-col"
      style={fitH != null ? { minHeight: fitH } : undefined}
    >
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
      <div ref={wrapRef} className="px-4 pt-[clamp(0.5rem,2dvh,1rem)] [@media(max-height:780px)]:pt-2">
        <div
          ref={rowRef}
          onScroll={measureEdges}
          className={
            scrollRow
              ? "no-scrollbar relative -mx-4 flex flex-col gap-2 overflow-x-auto overscroll-x-contain px-4"
              : "flex flex-wrap gap-2"
          }
          style={fade ? { WebkitMaskImage: fade, maskImage: fade } : undefined}
        >
          {(scrollRow ? scrollRows : [ordered]).map((rowChips, ri) => (
            <div key={ri} className={scrollRow ? "flex w-max gap-2" : "contents"}>
          {rowChips.map((c) => {
            const active = categoryId === c.id;
            return (
              <button
                key={c.id}
                data-id={c.id}
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
          ))}
        </div>
      </div>

      {/* Borderless note */}
      <div className="px-4 pt-[clamp(0.5rem,2dvh,1rem)] [@media(max-height:780px)]:pt-2">
        <input
          ref={noteRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (e.g. JSEC lunch, Grab to Ateneo)"
          className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 [@media(max-height:780px)]:py-2.5 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:bg-gray-900 dark:text-gray-50"
        />
      </div>

      {/* Borderless numpad: rows flex between a 44px touch target and 64px */}
      <div
        ref={gridRef}
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
      <div ref={saveRef} className="shrink-0 px-4 pb-2 pt-2.5">
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
