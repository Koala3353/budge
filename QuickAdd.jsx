import { useState } from "react";
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

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

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
  onAdd,
  onGoDashboard,
}) {
  const symbol = settings.currencySymbol;
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [note, setNote] = useState("");

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

  return (
    <div className="flex min-h-full flex-col bg-gray-50 dark:bg-gray-950">
      {/* Sticky techy status banner -> Dashboard */}
      <button
        onClick={onGoDashboard}
        className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200/70 bg-white/80 px-4 py-3 text-left backdrop-blur-md dark:border-gray-800/70 dark:bg-gray-950/80"
      >
        <span className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isOver ? "#EF4444" : "#5B8C5A" }} />
          <span className="text-gray-500 dark:text-gray-400">
            {isOver ? "Over budget" : "Left this week"}
          </span>
          <span
            className="font-mono font-semibold tabular-nums"
            style={{ color: isOver ? "#EF4444" : "#5B8C5A" }}
          >
            {isOver ? `-${formatMoney(Math.abs(remaining), symbol)}` : formatMoney(remaining, symbol)}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-matcha">
          <ChartIcon size={16} /> Dashboard
        </span>
      </button>

      {/* Amount readout */}
      <div className="px-4 pt-8 pb-2 text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Amount</div>
        <div className="mt-1 text-6xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50">
          {amountStr === "" ? `${symbol}0` : formatMoney(cents, symbol)}
        </div>
      </div>

      {/* Category chips */}
      <div className="px-4 pt-4">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const active = categoryId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${
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
      <div className="px-4 pt-4">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (e.g. JSEC lunch, Grab to Ateneo)"
          className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-matcha/40 dark:bg-gray-900 dark:text-gray-50"
        />
      </div>

      {/* Borderless numpad */}
      <div className="px-4 pt-5">
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-16 rounded-2xl text-2xl font-semibold text-gray-900 transition active:scale-95 active:bg-gray-200 dark:text-gray-50 dark:active:bg-gray-800"
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky save */}
      <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-gray-50 px-4 pb-4 pt-3 dark:from-gray-950">
        <button
          onClick={save}
          disabled={!canSave}
          className={`w-full rounded-2xl py-4 text-base font-semibold transition ${
            canSave
              ? "bg-matcha text-white active:scale-[0.99]"
              : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-800"
          }`}
        >
          {canSave ? `Save ${formatMoney(cents, symbol)}` : "Enter amount & category"}
        </button>
      </div>
    </div>
  );
}
