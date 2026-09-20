import { formatMoney } from "./budget.js";
import { fitMoney } from "./ringFormat.js";

const UP = "#D97706"; // spending more
const DOWN = "#5B8C5A"; // spending less

/**
 * This period against the one immediately before it, same length, per category.
 *
 * Deliberately different from the arrow on the breakdown rows: that compares a
 * range's own two halves, which answers "is this drifting within the period".
 * This answers "is this month worse than last month" — and includes categories
 * that appeared or vanished, which are usually the interesting ones.
 *
 * Bars diverge from a centre line so direction is readable before the number is.
 */
export default function CategoryCompare({ data, symbol, rangeLabel }) {
  const { rows, delta, hasBaseline, max, totalPrev, totalNow } = data;

  if (!hasBaseline) {
    return (
      <div className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-white/5 dark:text-gray-400">
        No earlier period to compare against yet — this is your first stretch of data.
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-white/5 dark:text-gray-400">
        Nothing logged in either period.
      </div>
    );
  }

  const up = delta > 0;

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
        Overall you spent{" "}
        <span className="font-mono font-semibold" style={{ color: up ? UP : DOWN }}>
          {formatMoney(Math.abs(delta), symbol)} {up ? "more" : "less"}
        </span>{" "}
        than the previous {rangeLabel.replace(/^last /, "")} —{" "}
        {formatMoney(totalNow, symbol)} vs {formatMoney(totalPrev, symbol)}.
      </p>

      <div className="space-y-2.5">
        {rows.map((r) => {
          const w = (Math.abs(r.delta) / max) * 50; // % of full width, each side
          const more = r.delta > 0;
          return (
            <div key={r.categoryId}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {r.icon} {r.name}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums" style={{ color: more ? UP : DOWN }}>
                  {more ? "+" : "−"}
                  {fitMoney(Math.abs(r.delta), symbol, 9)}
                  {r.pct != null ? (
                    <span className="ml-1.5 font-sans">{more ? "↑" : "↓"}{Math.abs(r.pct)}%</span>
                  ) : (
                    <span className="ml-1.5 font-sans text-gray-500 dark:text-gray-400">
                      {r.before === 0 ? "new" : "gone"}
                    </span>
                  )}
                </span>
              </div>
              {/* Centre line at 50%: left = spent less, right = spent more */}
              <div className="relative h-2.5 overflow-hidden rounded-sm bg-gray-100 dark:bg-white/5">
                <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-300 dark:bg-gray-600" />
                <span
                  className="absolute top-0 h-full rounded-sm transition-all duration-500"
                  style={{
                    backgroundColor: more ? UP : DOWN,
                    width: `${Math.max(w, 1.5)}%`,
                    left: more ? "50%" : `${50 - Math.max(w, 1.5)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-gray-100 pt-2.5 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        Left of the line is spending less. Sorted by how much the amount moved.
      </p>
    </div>
  );
}
