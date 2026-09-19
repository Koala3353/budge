// ---------------------------------------------------------------------------
// Pure helpers: money math, parsing, week boundaries, weekly budgets, and
// historical aggregation. Money is stored as INTEGER centavos.
// ---------------------------------------------------------------------------

export const MAX_CENTAVOS = 999999999; // ₱9,999,999.99 cap
const DAY = 86400000;

export function formatMoney(centavos, symbol = "₱") {
  const negative = centavos < 0;
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = whole.toLocaleString("en-US");
  const body = cents === 0 ? grouped : `${grouped}.${String(cents).padStart(2, "0")}`;
  return `${negative ? "-" : ""}${symbol}${body}`;
}

export function parseAmount(str) {
  if (str == null) return 0;
  const s = String(str).trim();
  if (s === "" || s === ".") return 0;
  if (!/^\d*\.?\d*$/.test(s)) return 0;
  const [intPart = "0", decPartRaw = ""] = s.split(".");
  const decPart = decPartRaw.slice(0, 2).padEnd(2, "0");
  const cents = parseInt(intPart || "0", 10) * 100 + parseInt(decPart || "0", 10);
  if (!Number.isFinite(cents) || cents < 0) return 0;
  return Math.min(cents, MAX_CENTAVOS);
}

// --- Week boundaries (local time, DST-safe via Date.setDate) ---------------

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** {start,end} epoch ms for the week containing `ts`. end is exclusive. */
export function getWeekRange(ts, weekStartDay = 1) {
  const d = startOfDay(ts);
  const delta = (d.getDay() - weekStartDay + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - delta);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() };
}

/** Stable key (YYYY-MM-DD of the week's start) used to store per-week budgets. */
export function weekKey(ts, weekStartDay = 1) {
  const { start } = getWeekRange(ts, weekStartDay);
  const d = new Date(start);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Allowance for a given week: the per-week override if set, else the default. */
export function getAllowanceForWeek(key, settings, weekOverrides) {
  if (weekOverrides && weekOverrides[key] != null) return weekOverrides[key];
  return settings.weeklyAllowance;
}

export function weekTransactions(transactions, range) {
  return transactions.filter((t) => t.ts >= range.start && t.ts < range.end);
}

// --- Totals & breakdown ----------------------------------------------------

export function computeTotals(transactions, allowance) {
  const spent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const remaining = allowance - spent;
  const pct = allowance > 0 ? spent / allowance : 0;
  return { spent, allowance, remaining, pct, isOver: spent > allowance };
}

export function computeCategoryBreakdown(transactions, categories) {
  const byId = new Map();
  for (const t of transactions) {
    byId.set(t.categoryId, (byId.get(t.categoryId) || 0) + t.amount);
  }
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  const rows = [];
  for (const [categoryId, amount] of byId.entries()) {
    const cat =
      categories.find((c) => c.id === categoryId) || {
        id: categoryId,
        name: "Uncategorized",
        color: "#888888",
        icon: "❔",
      };
    rows.push({
      categoryId,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      amount,
      pct: total > 0 ? amount / total : 0,
    });
  }
  rows.sort((a, b) => b.amount - a.amount);
  return { rows, total, top: rows[0] || null };
}

/** Ring color based on how much of the allowance is spent. */
export function ringColor(pct, isOver) {
  if (isOver) return "#E5484D"; // over -> red
  if (pct >= 0.8) return "#F5A623"; // nearing -> amber
  return "#5B8C5A"; // safe -> matcha
}

// --- Historical aggregation for the dashboard charts -----------------------
// mode: "week" (7 daily bars) | "month" (~5 weekly bars) |
//       "3m" (~13 weekly bars) | "year" (12 monthly bars)
export function computeHistory(transactions, mode, settings, weekOverrides, now = Date.now()) {
  const wsd = settings.weekStartDay;
  const buckets = [];

  const sumBetween = (start, end) =>
    transactions.reduce((s, t) => (t.ts >= start && t.ts < end ? s + t.amount : s), 0);

  if (mode === "week") {
    const { start } = getWeekRange(now, wsd);
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < 7; i++) {
      const ds = new Date(start);
      ds.setDate(new Date(start).getDate() + i);
      const dStart = ds.getTime();
      const dEnd = dStart + DAY;
      buckets.push({ label: names[ds.getDay()], spent: sumBetween(dStart, dEnd), over: false });
    }
    const wk = getAllowanceForWeek(weekKey(now, wsd), settings, weekOverrides);
    return { buckets, refLine: Math.round(wk / 7), refLabel: "avg/day" };
  }

  if (mode === "month" || mode === "3m") {
    const weeks = mode === "month" ? 5 : 13;
    const cur = getWeekRange(now, wsd);
    for (let i = weeks - 1; i >= 0; i--) {
      const ws = new Date(cur.start);
      ws.setDate(new Date(cur.start).getDate() - i * 7);
      const range = getWeekRange(ws.getTime(), wsd);
      const spent = sumBetween(range.start, range.end);
      const allowance = getAllowanceForWeek(weekKey(ws.getTime(), wsd), settings, weekOverrides);
      const d = new Date(range.start);
      buckets.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        spent,
        allowance,
        over: spent > allowance,
      });
    }
    return { buckets, refLine: null };
  }

  // year: last 12 calendar months. A month's budget is the sum of the budgets of
  // the weeks that START in it, so per-week overrides carry through here too.
  const monthAllowance = (mStart, mEnd) => {
    let total = 0;
    let r = getWeekRange(mStart, wsd);
    if (r.start < mStart) r = getWeekRange(r.start + 7 * DAY, wsd);
    let guard = 0;
    while (r.start < mEnd && guard++ < 10) {
      total += getAllowanceForWeek(weekKey(r.start, wsd), settings, weekOverrides);
      r = getWeekRange(r.start + 7 * DAY, wsd);
    }
    return total;
  };

  const base = new Date(now);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const mStart = m.getTime();
    const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime();
    const spent = sumBetween(mStart, mEnd);
    const allowance = monthAllowance(mStart, mEnd);
    buckets.push({
      label: m.toLocaleDateString("en-US", { month: "short" }),
      spent,
      allowance,
      over: spent > allowance,
    });
  }
  return { buckets, refLine: null };
}

// --- Time formatting -------------------------------------------------------

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const so = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((so(now) - so(d)) / DAY);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
