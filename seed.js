// ---------------------------------------------------------------------------
// Defaults for a fresh account. budget.js is NOT touched. Money is integer
// centavos. New accounts start empty (no mock data).
// ---------------------------------------------------------------------------

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
  spendDaysPerWeek: 5, // typical school spending days; drives the daily-limit pacing
};

export const DEFAULT_WEEK_OVERRIDES = {};
