// ---------------------------------------------------------------------------
// Defaults + mock data. budget.js is NOT touched. Money is integer centavos.
// The demo data is used app-wide when App's DEMO_MODE flag is on, so every
// screen (Dashboard, Quick-Add, History) shows the same realistic dataset.
// ---------------------------------------------------------------------------
import { getWeekRange } from "./budget.js";

export const DEFAULT_CATEGORIES = [
  { id: "food", name: "Food", icon: "🍜", color: "#F97316" }, // orange
  { id: "transport", name: "Transport", icon: "🚌", color: "#3B82F6" }, // blue
  { id: "coffee", name: "Coffee", icon: "☕", color: "#8B5E34" }, // brown
  { id: "school", name: "School", icon: "📚", color: "#8B5CF6" }, // purple
  { id: "fun", name: "Bouldering", icon: "🧗", color: "#EC4899" }, // pink
  { id: "other", name: "Other", icon: "💸", color: "#6B7280" }, // gray
];

export const DEFAULT_SETTINGS = {
  weeklyAllowance: 200000, // ₱2,000.00
  currencySymbol: "₱",
  weekStartDay: 1, // Monday
};

export const DEFAULT_WEEK_OVERRIDES = {};

const DAY = 86400000;

/**
 * Mock transactions. Current week = the exact spec sample (Today / Yesterday /
 * Monday) summing to ~₱1,820 (~90% of ₱2,000) so the over/near-limit states
 * show. Plus ~15 prior weeks so the trend chart and streak badge have history;
 * the most recent 3 prior weeks are under budget (3-week streak).
 */
export function buildDemoTransactions(categories, settings) {
  const now = Date.now();
  const wsd = settings.weekStartDay;
  const allowance = settings.weeklyAllowance || 200000;
  const ids = categories.map((c) => c.id);
  const idOf = (want) => (ids.includes(want) ? want : ids[0]);
  const cur = getWeekRange(now, wsd);
  const weekStart = cur.start;

  const tx = [];
  let n = 0;
  const push = (amount, cat, note, ts) =>
    tx.push({ id: "demo_" + n++, amount, categoryId: idOf(cat), note, ts });

  // Current week — the specified sample.
  push(60000, "fun", "Bouldering Day Pass", now - 2 * 3600000); // Today
  push(5000, "transport", "Tricycle", now - 5 * 3600000); // Today
  push(14000, "coffee", "Iced Americano", now - DAY - 3 * 3600000); // Yesterday
  push(18000, "food", "JSEC Lunch", now - DAY - 6 * 3600000); // Yesterday
  push(85000, "school", "Management Engineering Textbooks", weekStart + 10 * 3600000); // Monday

  // Prior weeks for charts + streak (fractions of allowance).
  const fractions = [
    0.85, 0.78, 0.92, 1.1, 0.7, 0.95, 1.05, 0.6, 0.88, 0.75, 1.12, 0.82, 0.9, 0.65, 0.97,
  ];
  fractions.forEach((f, idx) => {
    const i = idx + 1;
    const r = getWeekRange(now - i * 7 * DAY, wsd);
    const total = Math.round(allowance * f);
    [0.4, 0.35, 0.25].forEach((s, k) => {
      push(Math.round(total * s), ids[(i + k) % ids.length], "", r.start + (k * 2 + 1) * DAY + 9 * 3600000);
    });
  });

  return tx;
}
