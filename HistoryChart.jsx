import { formatMoney } from "./budget.js";

/**
 * Polished SVG trend chart with a labelled Y-axis (peso scale) for readability.
 * Rounded-top bars (rx=4), red when over budget, an optional dashed reference
 * line (e.g. avg/day), muted axis labels, subtle hover. No charting library.
 * `data` = { buckets: [{label, spent, allowance?, over?}], refLine?, refLabel? }
 */
export default function HistoryChart({ data, symbol }) {
  const { buckets, refLine, refLabel } = data;

  const VBW = 340;
  const VBH = 184;
  const TOP = 10;
  const AXIS_W = 38; // left gutter for y-axis labels
  const AXIS_B = 24; // bottom gutter for x-axis labels
  const chartH = VBH - TOP - AXIS_B;
  const chartW = VBW - AXIS_W;

  const max = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.spent, b.allowance || 0)),
    refLine || 0
  );
  const n = buckets.length || 1;
  const slot = chartW / n;
  const bw = Math.min(slot * 0.6, 26);
  const step = n > 8 ? Math.ceil(n / 8) : 1;
  const refY = refLine != null ? TOP + chartH - (refLine / max) * chartH : null;

  // Compact peso label for the axis (e.g. ₱2k, ₱1.5k, ₱500).
  const yLabel = (cents) => {
    const p = cents / 100;
    if (p >= 1000) {
      const k = p / 1000;
      return `${symbol}${k % 1 === 0 ? k : k.toFixed(1)}k`;
    }
    return `${symbol}${Math.round(p)}`;
  };

  const gridFractions = [0, 0.5, 1];

  return (
    <svg
      viewBox={`0 0 ${VBW} ${VBH}`}
      width="100%"
      className="overflow-visible"
      role="img"
      aria-label="Spending over time"
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
              x={AXIS_W - 5}
              y={y + 3}
              textAnchor="end"
              className="fill-gray-400"
              style={{ fontSize: 8 }}
            >
              {yLabel(max * f)}
            </text>
          </g>
        );
      })}

      {/* Reference line (e.g. daily target) */}
      {refY != null && (
        <>
          <line
            x1={AXIS_W}
            x2={VBW}
            y1={refY}
            y2={refY}
            stroke="#5B8C5A"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          {refLabel && (
            <text x={VBW} y={refY - 4} textAnchor="end" className="fill-matcha" style={{ fontSize: 8 }}>
              {refLabel}
            </text>
          )}
        </>
      )}

      {/* Bars */}
      {buckets.map((b, i) => {
        const x = AXIS_W + i * slot + (slot - bw) / 2;
        const barH = Math.max((b.spent / max) * chartH, b.spent > 0 ? 3 : 0);
        const y = TOP + chartH - barH;
        const fill = b.over ? "#EF4444" : "#5B8C5A";
        return (
          <g key={i} className="transition-opacity duration-200 hover:opacity-70">
            <title>
              {b.label}: {formatMoney(b.spent, symbol)}
              {b.allowance != null ? ` of ${formatMoney(b.allowance, symbol)}` : ""}
            </title>
            <rect x={x} y={y} width={bw} height={barH} rx={4} fill={fill} />
            {i % step === 0 && (
              <text
                x={x + bw / 2}
                y={VBH - 8}
                textAnchor="middle"
                className="fill-gray-400"
                style={{ fontSize: 9 }}
              >
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
