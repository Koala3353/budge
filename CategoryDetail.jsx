import { formatMoney } from "./budget.js";

/** Tiny weekly-trend sparkline — shape only, the numbers live in the row. */
function Spark({ series, color }) {
  const n = series.length;
  if (n < 2) return null;
  const max = Math.max(1, ...series);
  const W = 44;
  const H = 20;
  const pts = series
    .map((v, i) => `${(i / (n - 1)) * W},${H - (v / max) * (H - 2) - 1}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 overflow-visible" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
      <circle cx={W} cy={H - (series[n - 1] / max) * (H - 2) - 1} r="2.2" fill={color} />
    </svg>
  );
}

/**
 * The Categories tab's main view: every category over the selected range, with
 * its share, how many purchases made it up, the average and largest purchase,
 * an 8-week shape, and the direction of travel within the range.
 */
export default function CategoryDetail({ stats, series, symbol, showSpark }) {
  const { rows, total, count } = stats;

  if (!rows.length) {
    return (
      <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Nothing logged in this range yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {rows.map((r) => (
        <div key={r.categoryId}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
              style={{ backgroundColor: r.color + "22" }}
            >
              {r.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{r.name}</span>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                  {formatMoney(r.amount, symbol)}
                  <span className="ml-1.5 font-sans text-xs font-medium text-gray-500 dark:text-gray-400">
                    {Math.round(r.pct * 100)}%
                  </span>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.max(r.pct * 100, 5)}%`, backgroundColor: r.color }}
                />
              </div>
            </div>
          </div>

          {/* Each piece gets its own box: only the free text may truncate, so the
              change chip and the sparkline are never the thing that gets cut. */}
          <div className="mt-2 flex items-center gap-2 pl-14">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
              {r.count}× · avg {formatMoney(r.avg, symbol)}
            </p>
            {r.change != null && (
              <span
                className="shrink-0 text-xs font-semibold tabular-nums"
                style={{ color: r.change > 0 ? "#D97706" : "#5B8C5A" }}
                title={`${r.change >= 0 ? "Up" : "Down"} ${Math.abs(r.change)}% vs the first half of this range`}
              >
                {r.change >= 0 ? "↑" : "↓"}
                {Math.abs(r.change)}%
              </span>
            )}
            {showSpark && series?.[r.categoryId] && (
              <Spark series={series[r.categoryId]} color={r.color} />
            )}
          </div>
        </div>
      ))}

      <p className="border-t border-gray-100 pt-3 font-mono text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {formatMoney(total, symbol)} across {count} purchase{count === 1 ? "" : "s"} ·{" "}
        {rows.length} categor{rows.length === 1 ? "y" : "ies"}
        {showSpark && <span className="ml-1">· line = last 8 weeks</span>}
      </p>
    </div>
  );
}
