import { useState } from "react";
import { formatMoney } from "./budget.js";

const MATCHA = "#5B8C5A";
const OVER = "#EF4444";

/**
 * SVG trend chart built for touch. Because phones have no hover, every bar's
 * value is readable two ways without a mouse:
 *   1. A readout line above the chart always shows the selected bucket in full
 *      (tap any bar to select; the most recent bar is selected by default).
 *   2. Compact value labels sit above the bars — on every bar when there's
 *      room (≤ 8), otherwise just above the selected bar.
 * A dashed "budget" line contextualises the red over-budget bars.
 * `data` = { buckets: [{label, spent, allowance?, over?}], refLine?, refLabel? }
 */
export default function HistoryChart({ data, symbol }) {
  const { buckets, refLine, refLabel } = data;
  const n = buckets.length || 1;

  // Selection keyed by the dataset's shape, so switching range (Week → Month …)
  // re-selects the most recent bar instead of pointing at a stale index.
  const sig = `${n}|${buckets[0]?.label}|${buckets[n - 1]?.label}`;
  const [sel, setSel] = useState({ sig, idx: n - 1 });
  const selIdx = sel.sig === sig ? Math.min(sel.idx, n - 1) : n - 1;
  const selected = buckets[selIdx];

  const VBW = 340;
  const VBH = 188;
  const TOP = 20; // room for the value label above the tallest bar
  const AXIS_W = 36; // left gutter for y-axis labels
  const AXIS_B = 24; // bottom gutter for x-axis labels
  const chartH = VBH - TOP - AXIS_B;
  const chartW = VBW - AXIS_W;

  // Most-recent weekly budget (if the buckets carry one) → a single reference
  // line so the red bars read as "over this".
  const budget = [...buckets].reverse().find((b) => b.allowance != null)?.allowance ?? null;

  const max = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.spent, b.allowance || 0)),
    refLine || 0,
    budget || 0
  );
  const slot = chartW / n;
  const bw = Math.min(slot * 0.62, 30);
  const showEveryValue = n <= 8; // sparse enough to label every bar
  const labelStep = n > 9 ? Math.ceil(n / 9) : 1; // thin x-axis ticks if crowded
  const refY = refLine != null ? TOP + chartH - (refLine / max) * chartH : null;
  const budgetY = budget != null ? TOP + chartH - (budget / max) * chartH : null;

  // Compact peso label (e.g. ₱2k, ₱1.5k, ₱500) for axis + on-bar values.
  const compact = (cents) => {
    const p = cents / 100;
    if (p >= 1000) {
      const k = p / 1000;
      return `${symbol}${k % 1 === 0 ? k : k.toFixed(1)}k`;
    }
    return `${symbol}${Math.round(p)}`;
  };

  const gridFractions = [0, 0.5, 1];

  // Readout for the selected bucket.
  const selOver = selected?.allowance != null ? selected.spent - selected.allowance : null;

  return (
    <div>
      {/* Always-visible readout — the value you'd otherwise only get on hover */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
          {selected?.label}
          <span className="ml-2 font-mono tabular-nums" style={{ color: selected?.over ? OVER : MATCHA }}>
            {formatMoney(selected?.spent ?? 0, symbol)}
          </span>
        </span>
        {selected?.allowance != null ? (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            of {formatMoney(selected.allowance, symbol)} ·{" "}
            <span style={{ color: selOver > 0 ? OVER : MATCHA }}>
              {selOver > 0 ? `${formatMoney(selOver, symbol)} over` : `${formatMoney(-selOver, symbol)} left`}
            </span>
          </span>
        ) : (
          <span className="text-xs font-medium text-gray-400">tap a bar</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        width="100%"
        className="overflow-visible"
        role="img"
        aria-label={`Spending over time. ${selected?.label}: ${formatMoney(selected?.spent ?? 0, symbol)}`}
      >
        {/* Y-axis gridlines + scale labels */}
        {gridFractions.map((f, i) => {
          const y = TOP + chartH - f * chartH;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={AXIS_W}
                x2={VBW}
                y1={y}
                y2={y}
                className="stroke-gray-200 dark:stroke-gray-800"
                strokeWidth="1"
              />
              <text
                x={AXIS_W - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-gray-500 dark:fill-gray-400"
                style={{ fontSize: 9 }}
              >
                {compact(max * f)}
              </text>
            </g>
          );
        })}

        {/* Budget reference line (weekly views) */}
        {budgetY != null && (
          <>
            <line
              x1={AXIS_W}
              x2={VBW}
              y1={budgetY}
              y2={budgetY}
              stroke={OVER}
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.7"
            />
            <text x={VBW} y={budgetY - 4} textAnchor="end" style={{ fontSize: 9, fill: OVER }}>
              budget {compact(budget)}
            </text>
          </>
        )}

        {/* Reference line (e.g. daily target on the Week view) */}
        {refY != null && (
          <>
            <line
              x1={AXIS_W}
              x2={VBW}
              y1={refY}
              y2={refY}
              stroke={MATCHA}
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            {refLabel && (
              <text x={VBW} y={refY - 4} textAnchor="end" className="fill-matcha" style={{ fontSize: 9 }}>
                {refLabel}
              </text>
            )}
          </>
        )}

        {/* Bars */}
        {buckets.map((b, i) => {
          const slotX = AXIS_W + i * slot;
          const x = slotX + (slot - bw) / 2;
          const barH = Math.max((b.spent / max) * chartH, b.spent > 0 ? 3 : 0);
          const y = TOP + chartH - barH;
          const isSel = i === selIdx;
          const fill = b.over ? OVER : MATCHA;
          const showValue = b.spent > 0 && (showEveryValue || isSel);
          return (
            <g key={i} onClick={() => setSel({ sig, idx: i })} style={{ cursor: "pointer" }}>
              {/* full-height transparent hit area for easy tapping */}
              <rect x={slotX} y={TOP} width={slot} height={chartH} fill="transparent" />
              <title>
                {b.label}: {formatMoney(b.spent, symbol)}
                {b.allowance != null ? ` of ${formatMoney(b.allowance, symbol)}` : ""}
              </title>
              <rect
                x={x}
                y={y}
                width={bw}
                height={barH}
                rx={4}
                fill={fill}
                opacity={isSel ? 1 : 0.55}
              />
              {/* selection underline tick */}
              {isSel && (
                <rect x={x} y={TOP + chartH + 2} width={bw} height={2.5} rx={1.25} fill={fill} />
              )}
              {showValue && (
                <text
                  x={x + bw / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className={isSel ? "" : "fill-gray-400"}
                  style={{
                    fontSize: isSel ? 10 : 8.5,
                    fontWeight: isSel ? 700 : 400,
                    fill: isSel ? fill : undefined,
                  }}
                >
                  {compact(b.spent)}
                </text>
              )}
              {(i % labelStep === 0 || isSel) && (
                <text
                  x={x + bw / 2}
                  y={VBH - 7}
                  textAnchor="middle"
                  className={isSel ? "fill-gray-900 dark:fill-gray-50" : "fill-gray-500 dark:fill-gray-400"}
                  style={{ fontSize: 9.5, fontWeight: isSel ? 700 : 500 }}
                >
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
