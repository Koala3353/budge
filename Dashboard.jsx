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
import {
  todaySpend,
  lastWeekDelta,
  biggest,
  monthTotal,
  noSpendDays,
  dowHeatmap,
  categoryTrend,
  streaks,
  leftover,
  lastWeekRecap,
} from "./insights.js";
import ProgressRing from "./ProgressRing.jsx";
import RingAmount from "./RingAmount.jsx";
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

const card =
  "rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm";

function Tile({ label, value, sub, subColor, accent, onClick, action }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={`${card} p-4 text-left ${onClick ? "active:scale-[0.99]" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        {action && <span className="text-xs font-semibold text-matcha">{action}</span>}
      </div>
      <p
        className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub != null && (
        <p className="mt-0.5 font-mono text-xs" style={{ color: subColor || "#9CA3AF" }}>
          {sub}
        </p>
      )}
    </Comp>
  );
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

  // spend-days pacing (over days still left)
  const defaultSpendDays = settings.spendDaysPerWeek || 7;
  const spendDays = weekSpendDays?.[curKey] ?? defaultSpendDays;
  const hasDaysOverride = weekSpendDays?.[curKey] != null;
  const todayStart0 = new Date();
  todayStart0.setHours(0, 0, 0, 0);
  const daysElapsed = Math.max(0, Math.floor((todayStart0.getTime() - range.start) / DAY));
  const calDaysLeft = Math.max(1, Math.round((range.end - todayStart0.getTime()) / DAY));
  const spendDaysLeft = Math.min(calDaysLeft, Math.max(1, spendDays - daysElapsed));
  const dailyLimit = Math.max(0, Math.floor(remaining / spendDaysLeft));

  // --- insights ---
  const today = todaySpend(transactions, now);
  const lwd = lastWeekDelta(transactions, settings, weekOverrides, now);

  // Pacing stats are based on SPEND DAYS (the setting / per-week override),
  // not the 7-day calendar week — so they line up with the daily limit.
  const spendDaysUsed = Math.min(spendDays, Math.max(1, spendDays - spendDaysLeft + 1));
  const avg = Math.round(spent / spendDaysUsed);
  const projectedTotal = Math.round((spent * spendDays) / spendDaysUsed);
  const projOver = projectedTotal - allowance;
  const expectedByNow = Math.round((allowance * spendDaysUsed) / spendDays);
  const paceDiff = expectedByNow - spent; // > 0 = under pace

  const big = biggest(weekTx);
  const month = monthTotal(transactions, now);
  const noSpend = noSpendDays(transactions, settings, now);
  const heat = dowHeatmap(transactions, settings, now);
  const trend = categoryTrend(transactions, categories, settings, now);
  const stk = streaks(transactions, settings, weekOverrides, now);
  const saved = leftover(transactions, settings, weekOverrides, now);
  const recap = lastWeekRecap(transactions, settings, weekOverrides, categories, now);
  const catById = (id) => categories.find((c) => c.id === id);
  const recent = [...transactions].sort((a, b) => b.ts - a.ts).slice(0, 3);

  const [mode, setMode] = useState("month");
  const history = computeHistory(transactions, mode, settings, weekOverrides, now);
  const rangeTotal = history.buckets.reduce((s, b) => s + b.spent, 0);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [draft, setDraft] = useState((allowance / 100).toString());
  const [daysOpen, setDaysOpen] = useState(false);
  const [daysDraft, setDaysDraft] = useState(spendDays);
  const [hideNudge, setHideNudge] = useState(false);

  const paceText = paceDiff >= 0
    ? `${formatMoney(paceDiff, symbol)} under pace`
    : `${formatMoney(-paceDiff, symbol)} over pace`;
  const deltaText = lwd.hasPrev
    ? `${lwd.delta <= 0 ? "↓" : "↑"} ${formatMoney(Math.abs(lwd.delta), symbol)} vs last week`
    : "first week";

  // --- shareable recap card (client-side canvas -> PNG download) ---
  function shareRecap() {
    if (!recap) return;
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1080;
    const x = c.getContext("2d");
    x.fillStyle = "#0a0f0c";
    x.fillRect(0, 0, 1080, 1080);
    x.textBaseline = "alphabetic";
    x.fillStyle = "#8cb281";
    x.font = "600 32px Inter, Arial, sans-serif";
    x.fillText("last week · budge·", 80, 140);
    x.fillStyle = "#f9fafb";
    x.font = "700 150px Inter, Arial, sans-serif";
    x.fillText(formatMoney(recap.spent, symbol), 80, 360);
    x.fillStyle = "#97a6ba";
    x.font = "400 44px Inter, Arial, sans-serif";
    x.fillText("of " + formatMoney(recap.allowance, symbol) + " budget", 84, 430);
    const over = recap.over > 0;
    x.fillStyle = over ? "#ef4444" : "#7ba87a";
    x.font = "700 64px Inter, Arial, sans-serif";
    x.fillText(
      over ? "over by " + formatMoney(recap.over, symbol) : "under by " + formatMoney(-recap.over, symbol) + "  🌱",
      80,
      560
    );
    if (recap.top) {
      x.fillStyle = "#cbd6c6";
      x.font = "400 40px Inter, Arial, sans-serif";
      x.fillText(`top: ${recap.top.icon} ${recap.top.name}  ${formatMoney(recap.topAmt, symbol)}`, 80, 660);
    }
    x.fillStyle = "#5b8c5a";
    x.fillRect(80, 900, 920, 4);
    x.fillStyle = "#97a6ba";
    x.font = "500 36px Inter, Arial, sans-serif";
    x.fillText("budge· — make it to Friday", 80, 980);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "budge-week.png";
    a.click();
  }

  return (
    <div className="min-h-full bg-gray-50 px-4 pt-5 pb-4 dark:bg-gray-950">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">This Week</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Resets {WEEK_DAYS[settings.weekStartDay]}</p>
        </div>
        {stk.current >= 1 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-400">
            🔥 {stk.current}-week streak{stk.longest > stk.current ? ` · best ${stk.longest}` : ""}
          </span>
        )}
      </header>

      {/* gentle reminder if nothing logged today */}
      {today === 0 && transactions.length > 0 && !hideNudge && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-matcha/10 px-4 py-3">
          <span className="text-sm font-medium text-matcha">📝 Nothing logged today — got any spends?</span>
          <button onClick={() => setHideNudge(true)} className="text-matcha/70 active:opacity-60">✕</button>
        </div>
      )}

      {/* HERO */}
      <section className={`${card} mb-4 p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Budget {formatMoney(allowance, symbol)}
            {hasOverride && <span className="ml-1 text-matcha">· adjusted</span>}
          </div>
          <button
            onClick={() => { setDraft((allowance / 100).toString()); setAdjustOpen(true); }}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 active:scale-95 dark:bg-white/5 dark:text-gray-200"
          >
            Adjust
          </button>
        </div>

        <div className="flex flex-col items-center">
          <ProgressRing pct={pct} isOver={isOver}>
            {isOver ? (
              <>
                <RingAmount cents={remaining} symbol={symbol} max={48} min={22} className="font-extrabold tracking-tight" style={{ color: DANGER }} />
                <span className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: DANGER }}>over budget</span>
              </>
            ) : (
              <>
                <RingAmount cents={remaining} symbol={symbol} max={60} min={24} className="font-extrabold tracking-tight text-gray-900 dark:text-gray-50" />
                <span className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">left of {formatMoney(allowance, symbol)}</span>
              </>
            )}
          </ProgressRing>

          <div className="mt-5 w-full space-y-2">
            {isOver ? (
              <div className="rounded-2xl px-4 py-3 text-center text-sm font-medium" style={{ backgroundColor: DANGER + "1a", color: DANGER }}>
                Over for now — let's reset next week 🌱
              </div>
            ) : (
              <div className={`rounded-2xl px-4 py-3 text-center text-sm font-medium ${pct >= 0.8 ? "bg-amber-400/10 text-amber-600 dark:text-amber-400" : "bg-matcha/10 text-matcha"}`}>
                Daily limit: <span className="font-bold">{formatMoney(dailyLimit, symbol)}/day</span> · {spendDaysLeft} spend day{spendDaysLeft === 1 ? "" : "s"} left
              </div>
            )}
            {/* today + pace */}
            <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-2.5 text-sm dark:bg-white/5">
              <span className="text-gray-500 dark:text-gray-400">
                Today <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">{formatMoney(today, symbol)}</span>
              </span>
              {!isOver && (
                <span className="font-medium" style={{ color: paceDiff >= 0 ? "#5B8C5A" : "#F59E0B" }}>{paceText}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stat tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Tile label="Spent this week" value={formatMoney(spent, symbol)}
          sub={`${pctSpent}% · ${deltaText}`} subColor={lwd.hasPrev && lwd.delta > 0 ? "#F59E0B" : "#9CA3AF"} />
        <Tile label="Spend days" value={`${spendDays} / wk`} sub={hasDaysOverride ? "this week" : "default"}
          action="Edit" onClick={() => { setDaysDraft(spendDays); setDaysOpen(true); }} />
        <Tile label="Projected end" value={formatMoney(projectedTotal, symbol)}
          sub={projOver > 0 ? `${formatMoney(projOver, symbol)} over` : `${formatMoney(-projOver, symbol)} under`}
          subColor={projOver > 0 ? "#EF4444" : "#5B8C5A"} />
        <Tile label="Avg / spend day" value={formatMoney(avg, symbol)} sub="this week" />
        <Tile label="This month" value={formatMoney(month, symbol)} sub="all weeks" />
        <Tile label="No-spend days" value={`${noSpend}`} sub="this week" />
        <Tile label="Saved so far" value={formatMoney(saved.total, symbol)}
          sub={`${saved.weeks} week${saved.weeks === 1 ? "" : "s"}`} subColor="#5B8C5A" />
        <Tile label="Biggest spend" value={big ? formatMoney(big.amount, symbol) : "—"}
          sub={big ? `${catById(big.categoryId)?.icon || "💸"} ${big.note || catById(big.categoryId)?.name || ""}` : "nothing yet"} />
      </div>

      {/* Category breakdown + trend */}
      <section className={`${card} mb-4 p-5`}>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Expense by Category</h2>
          {breakdown.top && (
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Top: {breakdown.top.icon} {breakdown.top.name}</span>
          )}
        </div>
        {trend && trend.pct != null && (
          <p className="mb-3 text-xs font-medium" style={{ color: trend.pct > 0 ? "#F59E0B" : "#5B8C5A" }}>
            {trend.cat?.icon} {trend.cat?.name} {trend.pct >= 0 ? "↑" : "↓"}{Math.abs(trend.pct)}% vs 4-wk avg
          </p>
        )}
        {isEmpty ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Nothing logged yet this week.</p>
            <button onClick={onAdd} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-matcha px-5 py-3 font-semibold text-white active:scale-95">
              <PlusIcon size={20} /> Add an expense
            </button>
          </div>
        ) : (
          <CategoryBreakdown breakdown={breakdown} symbol={symbol} />
        )}
      </section>

      {/* Spend by day — avg per weekday */}
      <section className={`${card} mb-4 p-5`}>
        <h2 className="mb-1 text-base font-bold text-gray-900 dark:text-gray-50">Spend by day</h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Which weekdays you spend the most.</p>
        {heat.avg.filter((v) => v > 0).length < 2 ? (
          <div className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-white/5 dark:text-gray-400">
            Keep logging across more days — your weekly pattern shows up here.
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2" style={{ height: 132 }}>
              {heat.avg.map((v, i) => {
                const h = heat.max > 0 ? (v / heat.max) * 100 : 0;
                const isMax = v > 0 && v === heat.max;
                return (
                  <div key={i} title={`${heat.labels[i]}: ${formatMoney(v, symbol)} avg`}
                    className="flex h-full flex-1 flex-col items-center justify-end">
                    {v > 0 && (
                      <span
                        className="mb-1 whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums"
                        style={{ color: isMax ? "#D97706" : "#5E6E63" }}
                      >
                        {formatMoney(v, symbol)}
                      </span>
                    )}
                    <div className="w-full rounded-md transition-all duration-500" style={{
                      height: `${v > 0 ? Math.max(h, 8) : 4}%`,
                      backgroundColor: v > 0 ? (isMax ? "#F59E0B" : "#5B8C5A") : "rgba(148,163,184,0.22)",
                    }} />
                    <span className="mt-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">{heat.labels[i]}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 font-mono text-xs text-gray-400">
              avg per weekday · {heat.weeks <= 1 ? "1 week" : `last ${heat.weeks} weeks`} of data
            </p>
          </>
        )}
      </section>

      {/* Spending over time */}
      <section className={`${card} mb-4 p-5`}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Spending over time</h2>
          <span className="font-mono text-sm font-medium text-gray-500 dark:text-gray-400">{formatMoney(rangeTotal, symbol)}</span>
        </div>
        <div className="mb-4 flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-white/5">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setMode(r.key)}
              className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${mode === r.key ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-50" : "text-gray-500 dark:text-gray-400"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <HistoryChart data={history} symbol={symbol} />
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-matcha" /> within budget</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: DANGER }} /> over budget</span>
        </div>
      </section>

      {/* Last week recap + share */}
      {recap && (
        <section className={`${card} mb-4 p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Last week recap</h2>
            <button onClick={shareRecap} className="rounded-full bg-matcha/10 px-3 py-1.5 text-xs font-semibold text-matcha active:scale-95">↓ Share</button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Spent <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">{formatMoney(recap.spent, symbol)}</span> of {formatMoney(recap.allowance, symbol)} —{" "}
            <span className="font-semibold" style={{ color: recap.over > 0 ? "#EF4444" : "#5B8C5A" }}>
              {recap.over > 0 ? `${formatMoney(recap.over, symbol)} over` : `${formatMoney(-recap.over, symbol)} under 🌱`}
            </span>
          </p>
          {recap.top && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Top: {recap.top.icon} {recap.top.name} · {formatMoney(recap.topAmt, symbol)}</p>
          )}
        </section>
      )}

      {/* Recent */}
      <section className={`${card} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Recent</h2>
          <button onClick={() => onViewAll?.()} className="text-sm font-semibold text-matcha active:opacity-70">View all</button>
        </div>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">No transactions yet.</p>
        ) : (
          <div className="space-y-1">
            {recent.map((t) => {
              const c = catById(t.categoryId);
              return (
                <div key={t.id} className="flex items-center gap-3 py-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg" style={{ backgroundColor: (c?.color || "#888") + "22" }}>
                    {c?.icon || "💸"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{t.note || c?.name || "Expense"}</p>
                    <p className="text-xs text-gray-400">{c?.name || "Uncategorized"} · {formatTime(t.ts)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">-{formatMoney(t.amount, symbol)}</span>
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
            Set a one-off allowance for this week. Other weeks keep the default of {formatMoney(settings.weeklyAllowance, symbol)}.
          </p>
          <div className="flex items-center rounded-xl border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-950">
            <span className="text-gray-400">{symbol}</span>
            <input autoFocus type="text" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)}
              className="w-full bg-transparent px-2 py-3 text-right font-mono text-lg font-semibold tabular-nums text-gray-900 focus:outline-none dark:text-gray-50" />
          </div>
          <div className="mt-4 space-y-2">
            <button onClick={() => { onSetWeekAllowance(curKey, parseAmount(draft)); setAdjustOpen(false); }}
              className="w-full rounded-2xl bg-matcha py-3.5 text-base font-semibold text-white active:scale-[0.99]">Save this week's budget</button>
            {hasOverride && (
              <button onClick={() => { onSetWeekAllowance(curKey, null); setAdjustOpen(false); }}
                className="w-full rounded-2xl py-3 text-base font-medium text-gray-500 dark:text-gray-400">Reset to default</button>
            )}
          </div>
        </Modal>
      )}

      {/* Edit spend days */}
      {daysOpen && (
        <Modal title="Spend days this week" onClose={() => setDaysOpen(false)}>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            How many days will you actually spend this week? Your daily limit splits the remaining budget across the days left. Default ({defaultSpendDays}/week) is in Settings.
          </p>
          <div className="flex items-center justify-center gap-6">
            <button onClick={() => setDaysDraft((dd) => Math.max(1, dd - 1))} className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-gray-700 active:scale-95 dark:bg-gray-800 dark:text-gray-100">−</button>
            <div className="w-16 text-center">
              <div className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50">{daysDraft}</div>
              <div className="text-xs text-gray-400">days</div>
            </div>
            <button onClick={() => setDaysDraft((dd) => Math.min(7, dd + 1))} className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-gray-700 active:scale-95 dark:bg-gray-800 dark:text-gray-100">+</button>
          </div>
          <div className="mt-5 space-y-2">
            <button onClick={() => { onSetWeekSpendDays(curKey, daysDraft); setDaysOpen(false); }}
              className="w-full rounded-2xl bg-matcha py-3.5 text-base font-semibold text-white active:scale-[0.99]">Save for this week</button>
            {hasDaysOverride && (
              <button onClick={() => { onSetWeekSpendDays(curKey, null); setDaysOpen(false); }}
                className="w-full rounded-2xl py-3 text-base font-medium text-gray-500 dark:text-gray-400">Use default ({defaultSpendDays})</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
