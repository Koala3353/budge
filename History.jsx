import { useState } from "react";
import { formatMoney, formatTime, dayLabel } from "./budget.js";
import { fitMoney } from "./ringFormat.js";
import EditSheet from "./EditSheet.jsx";

/** Group transactions (newest first) into day buckets keyed by label. */
function groupByDay(transactions) {
  const sorted = [...transactions].sort((a, b) => b.ts - a.ts);
  const groups = [];
  let current = null;
  for (const t of sorted) {
    const label = dayLabel(t.ts);
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(t);
  }
  return groups;
}

export default function History({ categories, transactions, settings, onSave, onDelete }) {
  const symbol = settings.currencySymbol;
  const [selected, setSelected] = useState(null);
  const catById = (id) => categories.find((c) => c.id === id);
  const groups = groupByDay(transactions);

  return (
    <div className="min-h-full bg-gray-50 px-4 pt-5 pb-4 dark:bg-gray-950">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        History
      </h1>

      {transactions.length === 0 ? (
        <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          No transactions yet. Logged expenses will appear here.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label}>
              {/* Sticky date header */}
              <h2 className="sticky top-0 z-10 -mx-4 mb-2 bg-gray-50/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 backdrop-blur-md dark:bg-gray-950/80 dark:text-gray-400">
                {g.label}
              </h2>
              <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                {g.items.map((t, i) => {
                  const c = catById(t.categoryId);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition active:bg-gray-50 dark:active:bg-gray-800/50 ${
                        i > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""
                      }`}
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
                        style={{ backgroundColor: (c?.color || "#888") + "22" }}
                      >
                        {c?.icon || "💸"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-gray-900 dark:text-gray-50">
                          {c?.name || "Uncategorized"}
                        </div>
                        {t.note && (
                          <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                            {t.note}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                          -{fitMoney(t.amount, symbol, 10)}
                        </div>
                        <div className="text-xs text-gray-400">{formatTime(t.ts)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <EditSheet
          key={selected.id}
          tx={selected}
          categories={categories}
          symbol={symbol}
          weekStartDay={settings.weekStartDay}
          onClose={() => setSelected(null)}
          onSave={(tx) => {
            onSave?.(tx);
            setSelected(null);
          }}
          onDelete={(tx) => {
            onDelete?.(tx);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
