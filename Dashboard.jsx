import { useState } from "react";
import {
  computeTotals,
  computeCategoryBreakdown,
  computeHistory,
  formatMoney,
  parseAmount,
  formatTime,
  getWeekRange,
  weekTransactions,
  weekKey,
  getAllowanceForWeek,
} from "./budget.js";
import ProgressRing from "./ProgressRing.jsx";
import CategoryBreakdown from "./CategoryBreakdown.jsx";
import HistoryChart from "./HistoryChart.jsx";
import Modal from "./Modal.jsx";
import { PlusIcon } from "./icons.jsx";

const DANGER = "#EF4444";
const DAY = 86400000;
const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RANGES = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "3m", label: "3 Months" },
  { key: "year", label: "1 Year" },
];

/** Consecutive weeks (back to the account's first activity) that ended under
 *  budget. Empty weeks within that span count as under budget; we stop at the
 *  first over-budget week and never look before any data exists. */
function computeStreak(transactions, settings, overrides, now) {
  if (!transactions.length) return 0;
  const earliest = Math.min(...transactions.map((t) => t.ts));
  let streak = 0;
  for (let i = 1; i <= 104; i++) {
    const r = getWeekRange(now - i * 7 * DAY, settings.weekStartDay);
    if (r.end <= earliest) break;
    const wt = weekTransactions(transactions, r);
    const spent = wt.reduce((s, t) => s + t.amount, 0);
    const allw = getAllowanceForWeek(weekKey(r.start, settings.weekStartDay), settings, overrides);
    if (spent <= allw) streak++;
    else break;
  }
  return streak;
}

export default function Dashboard({
  categories,
  transactions,
  settings,
  weekOverrides,
  weekSpendDays,
  onSetWeekAllowance,
  onSetWeekSpendDays,
  onAdd,
  onViewAll,
}) {
  const symbol = settings.currencySymbol;
  const now = Date.now();

  const range = getWeekRange(now, settings.weekStartDay);
  const curKey = weekKey(now, settings.weekStartDay);
  const weekTx = weekTransactions(transactions, range);
  const allowance = getAllowanceForWeek(curKey, settings, weekOverrides);
  const { spent, remaining, pct, isOver } = computeTotals(weekTx, allowance);
  const breakdown = computeCategoryBreakdown(weekTx, categories);
  const isEmpty = weekTx.length === 0;
  const hasOverride = weekOverrides[curKey] != null;
  const pctSpent = Math.round(pct * 100);

  // Spend days: per-week override (this week) falls back to the settings default.
  const defaultSpendDays = settings.spendDaysPerWeek || 7;
  const spendDays = weekSpendDays?.[curKey] ?? defaultSpendDays;
  const hasDaysOverride = weekSpendDays?.[curKey] != null;
  const dailyLimit = Math.max(0, Math.floor(remaining / Math.max(1, spendDays)));

  const streak = computeStreak(transactions, settings, weekOverrides, now);
  const recent = [...transactions].sort((a, b) => b.ts - a.ts).slice(0, 3);
  const catById = (id) => categories.find((c) => c.id === id);

  const [mode, setMode] = useState("month");
  const history = computeHistory(transactions, mode, settings, weekOverrides, now);
  const rangeTotal = history.buckets.reduce((s, b) => s + b.spent, 0);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [draft, setDraft] = useState((allowance / 100).toString());
  const [daysOpen, setDaysOpen] = useState(false);
  const [daysDraft, setDaysDraft] = useState(spendDays);

  const card =
    "rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm";

  return (
    <div className="min-h-full bg-gray-50 px-4 pt-5 pb-4 dark:bg-gray-950">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            This Week
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Resets {WEEK_DAYS[settings.weekStartDay]}
          </p>
        </div>
        {streak >= 1 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-400">
            🔥 {streak}-week budget streak!
          </span>
        )}
      </header>

      {/* HERO */}
      <section className={`${card} mb-4 p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Budget {formatMoney(allowance, symbol)}
            {hasOverride && <span className="ml-1 text-matcha">· adjusted</span>}
          </div>
          <button
            onClick={() => {
              setDraft((allowance / 100).toString());
              setAdjustOpen(true);
            }}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 active:scale-95 dark:bg-white/5 dark:text-gray-200"
          >
            Adjust
          </button>
        </div>

        <div className="flex flex-col items-center">
          <ProgressRing pct={pct} isOver={isOver}>
            {isOver ? (
              <>
                <span className="text-5xl font-extrabold tracking-tight" style={{ color: DANGER }}>
                  -{formatMoney(Math.abs(remaining), symbol)}
                </span>
                <span
                  className="mt-1 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: DANGER }}
                >
                  over budget
                </span>
              </>
            ) : (
              <>
                <span className="text-6xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50">
                  {formatMoney(remaining, symbol)}
                </span>
                <span className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  left of {formatMoney(allowance, symbol)}
                </span>
              </>
            )}
          </ProgressRing>

          <div className="mt-5 w-full">
            {isOver ? (
              <div
                className="rounded-2xl px-4 py-3 text-center text-sm font-medium"
                style={{ backgroundColor: DANGER + "1a", color: DANGER }}
              >
                Over for now — let's reset next week 🌱
              </div>
            ) : (
              <div
                className={`rounded-2xl px-4 py-3 text-center text-sm font-medium ${
                  pct >= 0.8
                    ? "bg-amber-400/10 text-amber-600 dark:text-amber-400"
                    : "bg-matcha/10 text-matcha"
                }`}
              >
                Daily limit:{" "}
                <span className="font-bold">{formatMoney(dailyLimit, symbol)}/day</span> over{" "}
                {spendDays} spend day{spendDays === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bento stat row */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className={`${card} p-4`}>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Spent this week</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            {formatMoney(spent, symbol)}
          </p>
          <p className="mt-0.5 font-mono text-xs text-gray-400">{pctSpent}% of budget</p>
        </div>
        <button
          onClick={() => {
            setDaysDraft(spendDays);
            setDaysOpen(true);
          }}
          className={`${card} p-4 text-left active:scale-[0.99]`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Spend days</p>
            <span className="text-xs font-semibold text-matcha">Edit</span>
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            {spendDays}
            <span className="ml-1 text-sm font-medium text-gray-400">/ week</span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-gray-400">
            {hasDaysOverride ? "this week" : "default"}
          </p>
        </button>
      </div>

      {/* Category breakdown */}
      <section className={`${card} mb-4 p-5`}>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Expense by Category</h2>
          {breakdown.top && (
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Top: {breakdown.top.icon} {breakdown.top.name}
            </span>
          )}
        </div>
        {isEmpty ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Nothing logged yet this week.</p>
            <button
              onClick={onAdd}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-matcha px-5 py-3 font-semibold text-white active:scale-95"
            >
              <PlusIcon size={20} /> Add an expense
            </button>
          </div>
        ) : (
          <CategoryBreakdown breakdown={breakdown} symbol={symbol} />
        )}
      </section>

      {/* Spending over time */}
      <section className={`${card} mb-4 p-5`}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Spending over time</h2>
          <span className="font-mono text-sm font-medium text-gray-500 dark:text-gray-400">
            {formatMoney(rangeTotal, symbol)}
          </span>
        </div>
        <div className="mb-4 flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-white/5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setMode(r.key)}
              className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${
                mode === r.key
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-50"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <HistoryChart data={history} symbol={symbol} />
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-matcha" /> within budget
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: DANGER }} />{" "}
            over budget
          </span>
        </div>
      </section>

      {/* Recent transactions */}
      <section className={`${card} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Recent</h2>
          <button
            onClick={() => onViewAll?.()}
            className="text-sm font-semibold text-matcha active:opacity-70"
          >
            View all
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No transactions yet.
          </p>
        ) : (
          <div className="space-y-1">
            {recent.map((t) => {
              const c = catById(t.categoryId);
              return (
                <div key={t.id} className="flex items-center gap-3 py-2">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg"
                    style={{ backgroundColor: (c?.color || "#888") + "22" }}
                  >
                    {c?.icon || "💸"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                      {t.note || c?.name || "Expense"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {c?.name || "Uncategorized"} · {formatTime(t.ts)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    -{formatMoney(t.amount, symbol)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Adjust this week's budget */}
      {adjustOpen && (
        <Modal title="Adjust this week's budget" onClose={() => setAdjustOpen(false)}>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
            Set a one-off allowance for this week. Other weeks keep the default of{" "}
            {formatMoney(settings.weeklyAllowance, symbol)}.
          </p>
          <div className="flex items-center rounded-xl border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-950">
            <span className="text-gray-400">{symbol}</span>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full bg-transparent px-2 py-3 text-right font-mono text-lg font-semibold tabular-nums text-gray-900 focus:outline-none dark:text-gray-50"
            />
          </div>
          <div className="mt-4 space-y-2">
            <button
              onClick={() => {
                onSetWeekAllowance(curKey, parseAmount(draft));
                setAdjustOpen(false);
              }}
              className="w-full rounded-2xl bg-matcha py-3.5 text-base font-semibold text-white active:scale-[0.99]"
            >
              Save this week's budget
            </button>
            {hasOverride && (
              <button
                onClick={() => {
                  onSetWeekAllowance(curKey, null);
                  setAdjustOpen(false);
                }}
                className="w-full rounded-2xl py-3 text-base font-medium text-gray-500 dark:text-gray-400"
              >
                Reset to default
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Edit spend days (this week) */}
      {daysOpen && (
        <Modal title="Spend days this week" onClose={() => setDaysOpen(false)}>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            How many days will you actually spend this week? Your daily limit is the remaining
            budget split across these days. The default ({defaultSpendDays}/week) is set in Settings.
          </p>
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => setDaysDraft((d) => Math.max(1, d - 1))}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-gray-700 active:scale-95 dark:bg-gray-800 dark:text-gray-100"
            >
              −
            </button>
            <div className="w-16 text-center">
              <div className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50">
                {daysDraft}
              </div>
              <div className="text-xs text-gray-400">days</div>
            </div>
            <button
              onClick={() => setDaysDraft((d) => Math.min(7, d + 1))}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-gray-700 active:scale-95 dark:bg-gray-800 dark:text-gray-100"
            >
              +
            </button>
          </div>
          <div className="mt-5 space-y-2">
            <button
              onClick={() => {
                onSetWeekSpendDays(curKey, daysDraft);
                setDaysOpen(false);
              }}
              className="w-full rounded-2xl bg-matcha py-3.5 text-base font-semibold text-white active:scale-[0.99]"
            >
              Save for this week
            </button>
            {hasDaysOverride && (
              <button
                onClick={() => {
                  onSetWeekSpendDays(curKey, null);
                  setDaysOpen(false);
                }}
                className="w-full rounded-2xl py-3 text-base font-medium text-gray-500 dark:text-gray-400"
              >
                Use default ({defaultSpendDays})
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
