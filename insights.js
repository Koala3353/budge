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

/**
 * Average spend per weekday over the weeks you've actually been using the app
 * (up to the last `weeks` weeks). A weekday slot only counts toward its average
 * if that day falls on/after your first-ever transaction and on/before today —
 * so calendar weeks before you started logging don't dilute the average with
 * fake ₱0 days. A real no-spend day inside your active range still counts as 0.
 */
export function dowHeatmap(transactions, settings, now = Date.now(), weeks = 4) {
  const wsd = settings.weekStartDay;
  const totals = Array(7).fill(0);
  const counts = Array(7).fill(0);
  const cur = getWeekRange(now, wsd);
  const earliest = transactions.length ? Math.min(...transactions.map((t) => t.ts)) : now;
  const firstDay = startOfDay(earliest);
  const weeksWithData = new Set();
  for (let w = 0; w < weeks; w++) {
    const r = getWeekRange(cur.start - w * 7 * DAY, wsd);
    if (r.end <= firstDay) continue; // whole week predates any data
    for (let off = 0; off < 7; off++) {
      const ds = r.start + off * DAY;
      if (ds > now) continue; // hasn't happened yet
      if (ds + DAY <= firstDay) continue; // before your first log
      totals[off] += sum(transactions.filter((t) => t.ts >= ds && t.ts < ds + DAY));
      counts[off] += 1;
      weeksWithData.add(r.start);
    }
  }
  const avg = totals.map((v, i) => (counts[i] ? Math.round(v / counts[i]) : 0));
  const names = ["S", "M", "T", "W", "T", "F", "S"];
  const labels = Array.from({ length: 7 }, (_, off) => names[(wsd + off) % 7]);
  return { avg, labels, max: Math.max(1, ...avg), weeks: weeksWithData.size };
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

// --- Dashboard views: range bounds, time of day, per-category series ---------

/**
 * Start/end (end exclusive) covered by a dashboard range mode. Deliberately
 * matches the buckets computeHistory() builds, so the Categories tab and the
 * trend chart are always describing the same span of time.
 */
export function rangeBounds(mode, settings, now = Date.now()) {
  const wsd = settings.weekStartDay;
  const cur = getWeekRange(now, wsd);
  if (mode === "week") return { start: cur.start, end: cur.end, label: "this week" };
  if (mode === "month" || mode === "3m") {
    const back = mode === "month" ? 4 : 12;
    const first = getWeekRange(cur.start - back * 7 * DAY, wsd);
    return { start: first.start, end: cur.end, label: `last ${back + 1} weeks` };
  }
  const d = new Date(now);
  return {
    start: new Date(d.getFullYear(), d.getMonth() - 11, 1).getTime(),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
    label: "last 12 months",
  };
}

/** Total budget across a range — the sum of the budgets of the weeks inside it. */
export function budgetForRange(settings, overrides, start, end) {
  const wsd = settings.weekStartDay;
  let total = 0;
  let r = getWeekRange(start, wsd);
  let guard = 0;
  while (r.start < end && guard++ < 120) {
    total += getAllowanceForWeek(weekKey(r.start, wsd), settings, overrides);
    r = getWeekRange(r.start + 7 * DAY, wsd);
  }
  return total;
}

// Blocks chosen around a student's day, not clock quarters. Evening absorbs the
// small hours (a 1am purchase belongs to the night before, not to "morning").
const TIME_BLOCKS = [
  { key: "morning", label: "Morning", hint: "5–11am", from: 5, to: 11, icon: "🌅" },
  { key: "midday", label: "Midday", hint: "11am–2pm", from: 11, to: 14, icon: "🍜" },
  { key: "afternoon", label: "Afternoon", hint: "2–6pm", from: 14, to: 18, icon: "🌤" },
  { key: "evening", label: "Evening", hint: "6pm–5am", from: 18, to: 29, icon: "🌙" },
];

/** Spend split across four time-of-day blocks within [start, end). */
export function timeOfDay(transactions, start, end) {
  const rows = TIME_BLOCKS.map((b) => ({ ...b, amount: 0, count: 0 }));
  for (const t of transactions) {
    if (t.ts < start || t.ts >= end) continue;
    const h = new Date(t.ts).getHours();
    const hh = h < 5 ? h + 24 : h; // small hours roll into the previous evening
    const row = rows.find((b) => hh >= b.from && hh < b.to) || rows[3];
    row.amount += t.amount;
    row.count += 1;
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    rows,
    total,
    max: Math.max(1, ...rows.map((r) => r.amount)),
    top: total > 0 ? rows.reduce((m, r) => (r.amount > m.amount ? r : m)) : null,
  };
}

/**
 * Weekly totals per category for the last `weeks` weeks (oldest first), used to
 * draw a sparkline beside each category row. Returns { [categoryId]: number[] }.
 */
export function categorySeries(transactions, categoryIds, settings, now = Date.now(), weeks = 8) {
  const wsd = settings.weekStartDay;
  const cur = getWeekRange(now, wsd);
  const out = {};
  for (const id of categoryIds) out[id] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const r = getWeekRange(cur.start - i * 7 * DAY, wsd);
    const tx = weekTransactions(transactions, r);
    for (const id of categoryIds) {
      out[id].push(tx.reduce((s, t) => (t.categoryId === id ? s + t.amount : s), 0));
    }
  }
  return out;
}

/**
 * Per-category stats over a range: total, share, transaction count, average
 * per purchase, and the change vs the first half of the same range. Sorted by
 * amount, so the caller can render it straight down the page.
 */
export function categoryStats(transactions, categories, start, end) {
  const mid = start + (end - start) / 2;
  const acc = new Map();
  let total = 0;
  for (const t of transactions) {
    if (t.ts < start || t.ts >= end) continue;
    const a = acc.get(t.categoryId) || { amount: 0, count: 0, first: 0, second: 0, max: 0 };
    a.amount += t.amount;
    a.count += 1;
    a.max = Math.max(a.max, t.amount);
    if (t.ts < mid) a.first += t.amount;
    else a.second += t.amount;
    acc.set(t.categoryId, a);
    total += t.amount;
  }
  const rows = [];
  for (const [categoryId, a] of acc) {
    const cat = categories.find((c) => c.id === categoryId) || {
      name: "Uncategorized", color: "#6B7280", icon: "❔",
    };
    rows.push({
      categoryId,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      amount: a.amount,
      count: a.count,
      avg: Math.round(a.amount / a.count),
      biggest: a.max,
      pct: total > 0 ? a.amount / total : 0,
      // null when there's no earlier half to compare against
      change: a.first > 0 ? Math.round(((a.second - a.first) / a.first) * 100) : null,
    });
  }
  rows.sort((a, b) => b.amount - a.amount);
  return { rows, total, count: rows.reduce((s, r) => s + r.count, 0) };
}
