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
 * Average spend per weekday across a range.
 *
 * Only days you ACTUALLY SPENT ON count toward a weekday's average. A ₱0
 * Wednesday almost always means no classes that day, not a cheap Wednesday —
 * averaging those in would drag every weekday toward zero and say more about
 * your timetable than your spending. A weekday you have never spent on is left
 * out of the result entirely rather than drawn as an empty bar.
 *
 * Returns rows in week order (starting from the user's week-start day).
 */
export function dowHeatmap(transactions, settings, start, end) {
  const wsd = settings.weekStartDay;
  const totals = Array(7).fill(0);
  const days = Array(7).fill(0);

  // Collapse to one entry per calendar day first; a day only exists here if
  // something was spent on it, so zero-spend days can never enter the average.
  const byDay = new Map();
  for (const t of transactions) {
    if (t.ts < start || t.ts >= end) continue;
    const d = startOfDay(t.ts);
    byDay.set(d, (byDay.get(d) || 0) + t.amount);
  }
  for (const [dayStart, amount] of byDay) {
    if (amount <= 0) continue;
    const off = (new Date(dayStart).getDay() - wsd + 7) % 7;
    totals[off] += amount;
    days[off] += 1;
  }

  // Full short names, not initials: with the unspent weekdays removed, a bare
  // "T" next to another "T" is genuinely ambiguous.
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows = [];
  for (let off = 0; off < 7; off++) {
    if (!days[off]) continue; // never spent on this weekday in this range
    rows.push({
      off,
      label: names[(wsd + off) % 7],
      avg: Math.round(totals[off] / days[off]),
      days: days[off],
      total: totals[off],
    });
  }
  return {
    rows,
    max: Math.max(1, ...rows.map((r) => r.avg)),
    spendingDays: byDay.size,
  };
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
 * The bucket boundaries a range mode is made of, oldest first. Mirrors the
 * buckets computeHistory() charts, so a sparkline drawn from these lines up
 * with the bars above it instead of quietly covering a different span.
 */
export function bucketRanges(mode, settings, now = Date.now()) {
  const wsd = settings.weekStartDay;
  const out = [];
  if (mode === "week") {
    const { start } = getWeekRange(now, wsd);
    for (let i = 0; i < 7; i++) {
      const ds = new Date(start);
      ds.setDate(new Date(start).getDate() + i);
      out.push({ start: ds.getTime(), end: ds.getTime() + DAY });
    }
    return { ranges: out, unit: "day", label: "this week, by day" };
  }
  if (mode === "month" || mode === "3m") {
    const weeks = mode === "month" ? 5 : 13;
    const cur = getWeekRange(now, wsd);
    for (let i = weeks - 1; i >= 0; i--) {
      const ws = new Date(cur.start);
      ws.setDate(new Date(cur.start).getDate() - i * 7);
      out.push(getWeekRange(ws.getTime(), wsd));
    }
    return { ranges: out, unit: "week", label: `last ${weeks} weeks` };
  }
  const base = new Date(now);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({
      start: m.getTime(),
      end: new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime(),
    });
  }
  return { ranges: out, unit: "month", label: "last 12 months" };
}

/**
 * Per-category totals for each bucket of the selected range (oldest first),
 * used to draw the sparkline beside each category row. Returns
 * { series: { [categoryId]: number[] }, label } where `label` says what one
 * point represents, so the chart never has to be explained twice.
 */
export function categorySeries(transactions, categoryIds, mode, settings, now = Date.now()) {
  const { ranges, unit, label } = bucketRanges(mode, settings, now);
  const series = {};
  for (const id of categoryIds) series[id] = ranges.map(() => 0);
  for (const t of transactions) {
    const i = ranges.findIndex((r) => t.ts >= r.start && t.ts < r.end);
    if (i === -1) continue;
    if (series[t.categoryId]) series[t.categoryId][i] += t.amount;
  }
  return { series, unit, label };
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

/**
 * The honest savings ledger: for every completed week you actually logged in,
 * budget minus spend. A week you went over is a NEGATIVE row and is subtracted,
 * so `net` answers "am I up or actually down?" rather than only counting the
 * good weeks. Weeks with no activity are skipped — a week before you started
 * logging is not a ₱2,000 saving.
 *
 * The current week is reported separately as `current` and left out of the
 * totals, because it isn't finished and counting it would swing the number
 * every time you log a lunch.
 */
export function savingsLedger(transactions, settings, overrides, now = Date.now()) {
  const wsd = settings.weekStartDay;
  const empty = { rows: [], saved: 0, overspent: 0, net: 0, weeks: 0, best: null, worst: null, current: null };
  if (!transactions.length) return empty;

  const cur = getWeekRange(now, wsd);
  const earliest = Math.min(...transactions.map((t) => t.ts));
  const rows = [];
  let r = getWeekRange(earliest, wsd);
  let guard = 0;
  while (r.start < cur.start && guard++ < 520) {
    const tx = weekTransactions(transactions, r);
    if (tx.length) {
      const allowance = getAllowanceForWeek(weekKey(r.start, wsd), settings, overrides);
      const spent = sum(tx);
      rows.push({ start: r.start, end: r.end, allowance, spent, net: allowance - spent, count: tx.length });
    }
    r = getWeekRange(r.start + 7 * DAY, wsd);
  }

  const saved = rows.reduce((s, x) => (x.net > 0 ? s + x.net : s), 0);
  const overspent = rows.reduce((s, x) => (x.net < 0 ? s - x.net : s), 0);
  const curTx = weekTransactions(transactions, cur);
  const curAllowance = getAllowanceForWeek(weekKey(cur.start, wsd), settings, overrides);

  return {
    rows,
    saved,
    overspent,
    net: saved - overspent,
    weeks: rows.length,
    best: rows.length ? rows.reduce((m, x) => (x.net > m.net ? x : m)) : null,
    worst: rows.length ? rows.reduce((m, x) => (x.net < m.net ? x : m)) : null,
    current: { allowance: curAllowance, spent: sum(curTx), net: curAllowance - sum(curTx), count: curTx.length },
  };
}
