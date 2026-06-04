import { formatMoney } from "./budget.js";

/**
 * Polished SVG trend chart. Rounded-top bars (rx=4), red when over budget,
 * a dashed reference line (e.g. avg/day in week view), muted x-axis labels,
 * and a subtle hover fade. Built with raw SVG — no charting library.
 * `data` = { buckets: [{label, spent, allowance?, over?}], refLine?, refLabel? }
 */
export default function HistoryChart({ data, symbol }) {
  const { buckets, refLine, refLabel } = data;

  const VBW = 340;
  const VBH = 170;
  const LEFT = 28;
  const RIGHT = 6;
  const TOP = 10;
  const AXIS = 24;
  const chartW = VBW - LEFT - RIGHT;
  const chartH = VBH - TOP - AXIS;

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
  const rawTicks = [
    { value: max, y: TOP },
    { value: Math.round(max / 2), y: TOP + chartH / 2 },
    { value: 0, y: TOP + chartH },
  ];
  const ticks = rawTicks.filter(
    (tick, index, arr) => arr.findIndex((t) => t.value === tick.value) === index
  );
  const labelX = 10;
  const labelY = TOP + chartH / 2;

  return (
    <svg
      viewBox={`0 0 ${VBW} ${VBH}`}
      width="100%"
      className="overflow-visible"
      role="img"
      aria-label="Spending over time"
    >
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        className="fill-gray-400"
        style={{ fontSize: 9 }}
        transform={`rotate(-90 ${labelX} ${labelY})`}
      >
        Spend ({symbol})
      </text>
      {ticks.map((tick) => (
        <text
          key={tick.value}
          x={LEFT - 6}
          y={tick.y}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-gray-400"
          style={{ fontSize: 8 }}
        >
          {formatMoney(tick.value, symbol)}
        </text>
      ))}

      {/* Reference line (e.g. daily target) */}
      {refY != null && (
        <>
          <line
            x1={LEFT}
            x2={LEFT + chartW}
            y1={refY}
            y2={refY}
            className="stroke-gray-300 dark:stroke-gray-700"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          {refLabel && (
            <text
              x={LEFT + chartW}
              y={refY - 4}
              textAnchor="end"
              className="fill-gray-400"
              style={{ fontSize: 8 }}
            >
              {refLabel}
            </text>
          )}
        </>
      )}

      {buckets.map((b, i) => {
        const x = LEFT + i * slot + (slot - bw) / 2;
        const barH = Math.max((b.spent / max) * chartH, b.spent > 0 ? 3 : 0);
        const y = TOP + chartH - barH;
        const fill = b.over ? "#EF4444" : "#5B8C5A";
        return (
          <g key={i} className="transition-opacity duration-200 hover:opacity-70">
            <title>
              {b.label}: {formatMoney(b.spent, symbol)}
              {b.allowance != null ? ` of ${formatMoney(b.allowance, symbol)}` : ""}
            </title>
            {/* baseline ghost so very small bars still read as a pill */}
            <rect
              x={x}
              y={TOP + chartH - 3}
              width={bw}
              height={3}
              rx={1.5}
              className="fill-gray-100 dark:fill-gray-800"
            />
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
