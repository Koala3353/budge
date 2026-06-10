// ---------------------------------------------------------------------------
// Dashboard analytics — pure functions derived from transactions. budget.js
// (the money core) is left untouched; this only reads its helpers.
// All money is integer centavos.
// ---------------------------------------------------------------------------
import { getWeekRange, weekKey, getAllowanceForWeek, weekTransactions } from "./budget.js";

const DAY = 86400000;
const sum = (txs) => txs.reduce((s, t) => s + t.amount, 0);
const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function todaySpend(transactions, now = Date.now()) {
  const s = startOfDay(now);
  return sum(transactions.filter((t) => t.ts >= s && t.ts < s + DAY));
}

/** Time elapsed through the current week, 0..1. */
export function weekProgress(now, wsd) {
  const { start, end } = getWeekRange(now, wsd);
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** Are you ahead of or behind a linear spend pace? diff>0 => under pace (good). */
export function paceInfo(transactions, settings, overrides, now = Date.now()) {
  const r = getWeekRange(now, settings.weekStartDay);
  const spent = sum(weekTransactions(transactions, r));
  const allowance = getAllowanceForWeek(weekKey(r.start, settings.weekStartDay), settings, overrides);
  const prog = Math.min(1, Math.max(0, (now - r.start) / (r.end - r.start)));
  const expected = Math.round(allowance * prog);
  return { spent, allowance, expected, diff: expected - spent, prog };
}

export function lastWeekDelta(transactions, settings, overrides, now = Date.now()) {
  const cur = getWeekRange(now, settings.weekStartDay);
  const prev = getWeekRange(cur.start - 7 * DAY, settings.weekStartDay);
  const curTx = weekTransactions(transactions, cur);
  const prevTx = weekTransactions(transactions, prev);
  return { curSpent: sum(curTx), prevSpent: sum(prevTx), delta: sum(curTx) - sum(prevTx), hasPrev: prevTx.length > 0 };
}

/** Projected end-of-week total at the current rate. */
export function projection(transactions, settings, overrides, now = Date.now()) {
  const r = getWeekRange(now, settings.weekStartDay);
  const spent = sum(weekTransactions(transactions, r));
  const allowance = getAllowanceForWeek(weekKey(r.start, settings.weekStartDay), settings, overrides);
  const prog = Math.min(1, Math.max(0, (now - r.start) / (r.end - r.start)));
  const projected = prog > 0.02 ? Math.round(spent / prog) : spent;
  return { projected, allowance, over: projected - allowance };
}

export function avgDaily(transactions, settings, now = Date.now()) {
  const r = getWeekRange(now, settings.weekStartDay);
  const daysSoFar = Math.max(1, Math.floor((startOfDay(now) - r.start) / DAY) + 1);
  return Math.round(sum(weekTransactions(transactions, r)) / daysSoFar);
}

export function biggest(weekTx) {
  if (!weekTx.length) return null;
  return weekTx.reduce((m, t) => (t.amount > m.amount ? t : m));
}

export function monthTotal(transactions, now = Date.now()) {
  const d = new Date(now);
  const s = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return sum(transactions.filter((t) => t.ts >= s && t.ts < e));
}

export function noSpendDays(transactions, settings, now = Date.now()) {
  const r = getWeekRange(now, settings.weekStartDay);
  const today = startOfDay(now);
  let count = 0;
  for (let day = r.start; day <= today; day += DAY) {
    if (!transactions.some((t) => t.ts >= day && t.ts < day + DAY)) count++;
  }
  return count;
}

/** Average spend per weekday over the last `weeks` weeks. */
export function dowHeatmap(transactions, settings, now = Date.now(), weeks = 4) {
  const wsd = settings.weekStartDay;
  const totals = Array(7).fill(0);
  const counts = Array(7).fill(0);
  const cur = getWeekRange(now, wsd);
  for (let w = 0; w < weeks; w++) {
    const r = getWeekRange(cur.start - w * 7 * DAY, wsd);
    for (let off = 0; off < 7; off++) {
      const ds = r.start + off * DAY;
      if (ds > now) continue;
      totals[off] += sum(transactions.filter((t) => t.ts >= ds && t.ts < ds + DAY));
      counts[off] += 1;
    }
  }
  const avg = totals.map((v, i) => (counts[i] ? Math.round(v / counts[i]) : 0));
  const names = ["S", "M", "T", "W", "T", "F", "S"];
  const labels = Array.from({ length: 7 }, (_, off) => names[(wsd + off) % 7]);
  return { avg, labels, max: Math.max(1, ...avg) };
}

/** Top category this week vs its average over the previous `weeks` weeks. */
export function categoryTrend(transactions, categories, settings, now = Date.now(), weeks = 4) {
  const cur = getWeekRange(now, settings.weekStartDay);
  const wk = weekTransactions(transactions, cur);
  if (!wk.length) return null;
  const byCat = {};
  wk.forEach((t) => (byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount));
  const topId = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0];
  let s = 0, n = 0;
  for (let w = 1; w <= weeks; w++) {
    const r = getWeekRange(cur.start - w * 7 * DAY, settings.weekStartDay);
    const t = weekTransactions(transactions, r);
    if (!t.length) continue;
    s += t.filter((x) => x.categoryId === topId).reduce((a, x) => a + x.amount, 0);
    n++;
  }
  if (!n) return null;
  const avg = s / n;
  return {
    cat: categories.find((c) => c.id === topId),
    thisAmt: byCat[topId],
    avg: Math.round(avg),
    pct: avg > 0 ? Math.round(((byCat[topId] - avg) / avg) * 100) : null,
  };
}

/** Current trailing streak + longest streak of under-budget completed weeks. */
export function streaks(transactions, settings, overrides, now = Date.now()) {
  if (!transactions.length) return { current: 0, longest: 0 };
  const wsd = settings.weekStartDay;
  const earliest = Math.min(...transactions.map((t) => t.ts));
  const cur = getWeekRange(now, wsd);
  const flags = [];
  let r = getWeekRange(earliest, wsd);
  let guard = 0;
  while (r.start < cur.start && guard++ < 520) {
    const t = weekTransactions(transactions, r);
    const allw = getAllowanceForWeek(weekKey(r.start, wsd), settings, overrides);
    flags.push(t.length === 0 ? true : sum(t) <= allw);
    r = getWeekRange(r.start + 7 * DAY, wsd);
  }
  let longest = 0, run = 0;
  for (const u of flags) { run = u ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0;
  for (let i = flags.length - 1; i >= 0; i--) { if (flags[i]) current++; else break; }
  return { current, longest };
}

/** Total left over (allowance − spent) across completed weeks with activity. */
export function leftover(transactions, settings, overrides, now = Date.now()) {
  if (!transactions.length) return { total: 0, weeks: 0 };
  const wsd = settings.weekStartDay;
  const earliest = Math.min(...transactions.map((t) => t.ts));
  const cur = getWeekRange(now, wsd);
  let total = 0, weeks = 0, guard = 0;
  let r = getWeekRange(earliest, wsd);
  while (r.start < cur.start && guard++ < 520) {
    const t = weekTransactions(transactions, r);
    if (t.length) {
      const left = getAllowanceForWeek(weekKey(r.start, wsd), settings, overrides) - sum(t);
      if (left > 0) total += left;
      weeks++;
    }
    r = getWeekRange(r.start + 7 * DAY, wsd);
  }
  return { total, weeks };
}

/** Summary of the most recent completed week (for the recap / share card). */
export function lastWeekRecap(transactions, settings, overrides, categories, now = Date.now()) {
  const wsd = settings.weekStartDay;
  const cur = getWeekRange(now, wsd);
  const prev = getWeekRange(cur.start - 7 * DAY, wsd);
  const t = weekTransactions(transactions, prev);
  if (!t.length) return null;
  const spent = sum(t);
  const allowance = getAllowanceForWeek(weekKey(prev.start, wsd), settings, overrides);
  const byCat = {};
  t.forEach((x) => (byCat[x.categoryId] = (byCat[x.categoryId] || 0) + x.amount));
  const topId = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0];
  return {
    spent,
    allowance,
    over: spent - allowance,
    top: categories.find((c) => c.id === topId),
    topAmt: byCat[topId],
    start: prev.start,
    end: prev.end,
    count: t.length,
  };
}
