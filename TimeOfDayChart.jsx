import { formatMoney } from "./budget.js";

/**
 * When in the day money leaves. Horizontal bars because the block names are
 * long — reading them sideways under a vertical bar is worse than reading them
 * in a row. The value sits at the end of its own bar, so there's no legend and
 * no hover to discover: everything is on the page at rest.
 */
export default function TimeOfDayChart({ data, symbol }) {
  const { rows, total, max, top } = data;

  if (total === 0) {
    return (
      <div className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-white/5 dark:text-gray-400">
        No spending in this range yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const isTop = top && r.key === top.key && r.amount > 0;
        return (
          <div key={r.key} className="flex items-center gap-3">
            <div className="w-[88px] shrink-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {r.icon} {r.label}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{r.hint}</p>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* Track stays square: only the FILL gets a rounded data-end, so the bar
                  reads as a value and not as a pill that happens to be part-full. */}
              <div className="h-6 flex-1 overflow-hidden bg-gray-100 dark:bg-white/5">
                <div
                  className="h-full rounded-r-md transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.max((r.amount / max) * 100, r.amount > 0 ? 3 : 0)}%`,
                    backgroundColor: isTop ? "#D97706" : "#5B8C5A",
                  }}
                />
              </div>
              <span className="w-[74px] shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                {formatMoney(r.amount, symbol)}
              </span>
            </div>
          </div>
        );
      })}
      <p className="pt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
        {top && top.amount > 0
          ? `Heaviest block: ${top.label.toLowerCase()} · ${Math.round((top.amount / total) * 100)}% of spend`
          : "—"}
      </p>
    </div>
  );
}
