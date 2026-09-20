import { useState } from "react";
import { formatMoney } from "./budget.js";
import { fitMoney } from "./ringFormat.js";

/**
 * Stacked composition over the selected range. The flat breakdown answers "what
 * is the split"; this answers "how has the split been moving" — whether one
 * category is quietly taking a bigger share, or a spike was a one-off.
 *
 * Each segment carries its category's own colour, in a fixed order, so a colour
 * never means two different things between buckets. Tap a bucket to read it.
 */
export default function CategoryMix({ data, symbol }) {
  const { buckets, slices, max } = data;
  const n = buckets.length || 1;
  const sig = `${n}|${buckets[0]?.label}|${buckets[n - 1]?.label}`;
  const [sel, setSel] = useState({ sig, idx: n - 1 });
  const idx = sel.sig === sig ? Math.min(sel.idx, n - 1) : n - 1;
  const picked = buckets[idx];

  if (!slices.length) {
    return (
      <div className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-white/5 dark:text-gray-400">
        Nothing logged in this range yet.
      </div>
    );
  }

  const VBW = 340;
  const VBH = 150;
  const AXIS_B = 20;
  const plotH = VBH - AXIS_B;
  const slot = VBW / n;
  const bw = Math.min(slot * 0.66, 34);
  const GAP = 2; // surface gap between stacked segments

  const pickedRows = slices
    .map((sl) => ({ ...sl, amount: picked?.parts[sl.id] || 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <div>
      {/* Readout — the value you'd otherwise only get from a hover */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
          {picked?.label}
          <span className="ml-2 font-mono tabular-nums text-gray-600 dark:text-gray-300">
            {formatMoney(picked?.total ?? 0, symbol)}
          </span>
        </span>
        <span className="min-w-0 truncate text-xs font-medium text-gray-500 dark:text-gray-400">
          {pickedRows.length
            ? `${pickedRows[0].icon} ${pickedRows[0].name} ${Math.round(
                (pickedRows[0].amount / picked.total) * 100
              )}%`
            : "nothing logged"}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        width="100%"
        role="img"
        aria-label={`Category mix over time. ${picked?.label}: ${formatMoney(picked?.total ?? 0, symbol)}`}
      >
        {buckets.map((b, i) => {
          const slotX = i * slot;
          const x = slotX + (slot - bw) / 2;
          const isSel = i === idx;
          let y = plotH; // stack upward from the baseline
          const segs = [];
          for (const sl of slices) {
            const amt = b.parts[sl.id] || 0;
            if (amt <= 0) continue;
            const h = (amt / max) * plotH;
            y -= h;
            segs.push({ id: sl.id, color: sl.color, y, h });
          }
          return (
            <g key={b.start} onClick={() => setSel({ sig, idx: i })} style={{ cursor: "pointer" }}>
              <rect x={slotX} y={0} width={slot} height={plotH} fill="transparent" />
              <title>
                {b.label}: {formatMoney(b.total, symbol)}
              </title>
              {segs.map((sg, k) => {
                // Trim each segment so the surface shows through between them,
                // and round only the top of the topmost segment (the data end).
                const h = Math.max(sg.h - (k < segs.length - 1 ? GAP : 0), 1);
                const top = k === segs.length - 1;
                return (
                  <rect
                    key={sg.id}
                    x={x}
                    y={sg.y + (k < segs.length - 1 ? GAP : 0)}
                    width={bw}
                    height={h}
                    rx={top ? 3 : 0}
                    fill={sg.color}
                    opacity={isSel ? 1 : 0.45}
                  />
                );
              })}
              {isSel && (
                <rect x={x} y={plotH + 2} width={bw} height={2.5} rx={1.25} className="fill-gray-400 dark:fill-gray-500" />
              )}
              <text
                x={x + bw / 2}
                y={VBH - 5}
                textAnchor="middle"
                className={isSel ? "fill-gray-900 dark:fill-gray-50" : "fill-gray-500 dark:fill-gray-400"}
                style={{ fontSize: 9, fontWeight: isSel ? 700 : 500 }}
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend — identity is never carried by colour alone */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {slices.map((sl) => (
          <span key={sl.id} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: sl.color }} />
            {sl.name}
          </span>
        ))}
      </div>

      {/* The selected bucket, itemised */}
      {pickedRows.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
          {pickedRows.map((r) => (
            <div key={r.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-gray-600 dark:text-gray-300">
                {r.icon} {r.name}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-gray-900 dark:text-gray-50">
                {fitMoney(r.amount, symbol, 10)}
                <span className="ml-1.5 font-sans text-gray-500 dark:text-gray-400">
                  {Math.round((r.amount / picked.total) * 100)}%
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
