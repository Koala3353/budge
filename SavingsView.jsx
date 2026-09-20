import { useState } from "react";
import { formatMoney } from "./budget.js";
import { fitMoney } from "./ringFormat.js";
import { cumulativeNet, weekOutcomes } from "./insights.js";

const GOOD = "#5B8C5A";
const BAD = "#EF4444";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (ts) => {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

/**
 * Week-by-week budget minus spend, as a diverging chart: kept above the line,
 * overspent below it. Polarity is the whole point of this view, so the zero
 * baseline is drawn solid and sits wherever the data puts it — bars are never
 * rescaled to hide which side of it you're on.
 */
function DivergingWeeks({ rows, symbol }) {
  const n = rows.length;
  const [sel, setSel] = useState(null);
  const selIdx = sel != null && sel < n ? sel : n - 1;
  const picked = rows[selIdx];

  const VBW = 340;
  const VBH = 170;
  const AXIS_B = 20;
  const plotH = VBH - AXIS_B;
  const maxUp = Math.max(0, ...rows.map((r) => r.net));
  const maxDown = Math.max(0, ...rows.map((r) => -r.net));
  const span = Math.max(1, maxUp + maxDown);
  // Zero sits proportionally, so a run of only-good weeks doesn't fake a baseline
  // halfway up the chart.
  const zeroY = (maxUp / span) * plotH;
  const slot = VBW / n;
  const bw = Math.min(slot * 0.6, 26);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
          Week of {short(picked.start)}
          <span
            className="ml-2 font-mono tabular-nums"
            style={{ color: picked.net >= 0 ? GOOD : BAD }}
          >
            {picked.net >= 0 ? "+" : "−"}
            {fitMoney(Math.abs(picked.net), symbol, 10)}
          </span>
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {fitMoney(picked.spent, symbol, 9)} of {fitMoney(picked.allowance, symbol, 9)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        width="100%"
        role="img"
        aria-label={`Kept or overspent each week. Week of ${short(picked.start)}: ${
          picked.net >= 0 ? "kept" : "over by"
        } ${formatMoney(Math.abs(picked.net), symbol)}`}
      >
        {rows.map((r, i) => {
          const slotX = i * slot;
          const x = slotX + (slot - bw) / 2;
          const h = Math.max((Math.abs(r.net) / span) * plotH, r.net === 0 ? 0 : 2);
          const up = r.net >= 0;
          const y = up ? zeroY - h : zeroY;
          const isSel = i === selIdx;
          return (
            <g key={r.start} onClick={() => setSel(i)} style={{ cursor: "pointer" }}>
              <rect x={slotX} y={0} width={slot} height={plotH} fill="transparent" />
              <title>
                {short(r.start)}: {up ? "kept" : "over by"} {formatMoney(Math.abs(r.net), symbol)}
              </title>
              <rect
                x={x}
                y={y}
                width={bw}
                height={h}
                // Rounded at the data end only; the baseline end stays square.
                rx={3}
                fill={up ? GOOD : BAD}
                opacity={isSel ? 1 : 0.5}
              />
              {/* square off the baseline end again */}
              <rect x={x} y={up ? zeroY - 3 : zeroY} width={bw} height={3} fill={up ? GOOD : BAD} opacity={isSel ? 1 : 0.5} />
              {isSel && (
                <text
                  x={x + bw / 2}
                  y={VBH - 6}
                  textAnchor="middle"
                  className="fill-gray-900 dark:fill-gray-50"
                  style={{ fontSize: 9, fontWeight: 700 }}
                >
                  {short(r.start)}
                </text>
              )}
            </g>
          );
        })}
        {/* zero baseline, drawn last so it sits on top of every bar */}
        <line x1="0" x2={VBW} y1={zeroY} y2={zeroY} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="1" />
      </svg>
      <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">Tap a week to read it</p>
    </div>
  );
}

/**
 * The "am I actually up?" view. The headline is all-time and deliberately nets
 * overspending off savings — counting only the good weeks is what made the old
 * "Saved so far" number flattering and wrong.
 */
export default function SavingsView({ ledger, symbol, rangeRows, rangeLabel, card }) {
  const { saved, overspent, net, weeks, best, worst, current } = ledger;
  const up = net >= 0;

  if (!weeks) {
    return (
      <section className={`${card} p-6 text-center`}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No completed weeks yet. Once your first week wraps up, what you kept — or went over —
          starts adding up here.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className={`${card} mb-4 p-6`}>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {up ? "Net kept" : "Net down"} · {weeks} completed week{weeks === 1 ? "" : "s"}
        </p>
        <p
          className="mt-1 truncate text-[clamp(1.75rem,9vw,2.25rem)] font-extrabold leading-tight tracking-tight tabular-nums"
          style={{ color: up ? GOOD : BAD }}
        >
          {up ? "" : "−"}
          {fitMoney(Math.abs(net), symbol, 11)}
        </p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {up
            ? "Budget minus spending, across every week you've logged. You're ahead."
            : "Budget minus spending, across every week you've logged. Your over-budget weeks outweigh what you put aside."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-2xl bg-matcha/10 px-4 py-3">
            <p className="text-xs font-medium text-matcha">Put aside</p>
            <p className="mt-0.5 truncate font-mono text-[clamp(0.95rem,4.6vw,1.125rem)] font-bold tabular-nums" style={{ color: GOOD }}>
              {fitMoney(saved, symbol, 9)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              on under-budget weeks
            </p>
          </div>
          <div className="min-w-0 rounded-2xl px-4 py-3" style={{ backgroundColor: BAD + "1a" }}>
            <p className="text-xs font-medium" style={{ color: BAD }}>Spent over</p>
            <p className="mt-0.5 truncate font-mono text-[clamp(0.95rem,4.6vw,1.125rem)] font-bold tabular-nums" style={{ color: BAD }}>
              {fitMoney(overspent, symbol, 9)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              on over-budget weeks
            </p>
          </div>
        </div>

        {current && current.count > 0 && (
          <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm dark:bg-white/5">
            <span className="text-gray-500 dark:text-gray-400">This week so far </span>
            <span
              className="font-mono font-semibold tabular-nums"
              style={{ color: current.net >= 0 ? GOOD : BAD }}
            >
              {current.net >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(current.net), symbol)}
            </span>
            <span className="text-gray-500 dark:text-gray-400"> — not counted until it ends</span>
          </div>
        )}
      </section>

      <section className={`${card} mb-4 p-5`}>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Week by week</h2>
        {/* Counts the weeks actually plotted, not the weeks the range spans — the
            current week is still running and has no final figure to draw. */}
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          {rangeRows.length > 0
            ? `Kept above the line, over below · ${rangeRows.length} completed week${
                rangeRows.length === 1 ? "" : "s"
              } in ${rangeLabel}`
            : `Nothing to plot — ${rangeLabel} holds no completed weeks yet. Pick a longer range.`}
        </p>
        {rangeRows.length > 0 && <DivergingWeeks rows={rangeRows} symbol={symbol} />}
      </section>

      {rangeRows.length > 1 && (
        <section className={`${card} mb-4 p-5`}>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Running total</h2>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Where the net has been heading, week by week · {rangeLabel}
          </p>
          <RunningTotal rows={rangeRows} symbol={symbol} />
        </section>
      )}

      {rangeRows.length > 0 && (
        <section className={`${card} mb-4 p-5`}>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">How your weeks went</h2>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            {rangeRows.length} completed week{rangeRows.length === 1 ? "" : "s"} · {rangeLabel}
          </p>
          <Outcomes rows={rangeRows} symbol={symbol} />
        </section>
      )}

      <section className={`${card} p-5`}>
        <h2 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-50">Your extremes</h2>
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Best week · {short(best.start)}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: best.net >= 0 ? GOOD : BAD }}>
              {best.net >= 0 ? "+" : "−"}{fitMoney(Math.abs(best.net), symbol, 10)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Worst week · {short(worst.start)}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: worst.net >= 0 ? GOOD : BAD }}>
              {worst.net >= 0 ? "+" : "−"}{fitMoney(Math.abs(worst.net), symbol, 10)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2.5 dark:border-gray-800">
            <span className="text-sm text-gray-600 dark:text-gray-300">Average week</span>
            <span
              className="font-mono text-sm font-semibold tabular-nums"
              style={{ color: net >= 0 ? GOOD : BAD }}
            >
              {net >= 0 ? "+" : "−"}{fitMoney(Math.abs(Math.round(net / weeks)), symbol, 10)}
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * The running total, which the per-week bars can't show: a run of small
 * overspends and one big saving look similar bar-by-bar but land in completely
 * different places. The zero line is drawn solid — crossing it is the event
 * this chart exists to make obvious.
 */
function RunningTotal({ rows, symbol }) {
  const { points, min, max, final, peak, fromPeak } = cumulativeNet(rows);
  const VBW = 340;
  const VBH = 132;
  const PAD_B = 18;
  const plotH = VBH - PAD_B;
  const span = Math.max(1, max - min);
  const y = (v) => plotH - ((v - min) / span) * plotH;
  const x = (i) => (points.length === 1 ? VBW / 2 : (i / (points.length - 1)) * VBW);
  const zeroY = y(0);
  const up = final >= 0;
  const line = points.map((p, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(p.cum).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${x(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        width="100%"
        role="img"
        aria-label={`Running total, ending at ${formatMoney(final, symbol)}`}
      >
        <path d={area} fill={up ? GOOD : BAD} opacity="0.12" />
        <line x1="0" x2={VBW} y1={zeroY} y2={zeroY} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="1" />
        <path d={line} fill="none" stroke={up ? GOOD : BAD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(final)} r="3.5" fill={up ? GOOD : BAD} />
        <text x="2" y={zeroY - 4} style={{ fontSize: 9 }} className="fill-gray-500 dark:fill-gray-400">
          break even
        </text>
        <text x={VBW} y={VBH - 5} textAnchor="end" style={{ fontSize: 9, fontWeight: 700 }} className="fill-gray-900 dark:fill-gray-50">
          {short(points[points.length - 1].start)}
        </text>
        <text x="0" y={VBH - 5} style={{ fontSize: 9 }} className="fill-gray-500 dark:fill-gray-400">
          {short(points[0].start)}
        </text>
      </svg>
      <p className="mt-2 font-mono text-xs text-gray-500 dark:text-gray-400">
        ends at{" "}
        <span style={{ color: up ? GOOD : BAD }}>
          {up ? "+" : "−"}{fitMoney(Math.abs(final), symbol, 10)}
        </span>
        {fromPeak < 0 && (
          <> · {fitMoney(Math.abs(fromPeak), symbol, 9)} below its peak of {fitMoney(peak, symbol, 9)}</>
        )}
      </p>
    </div>
  );
}

/** Under vs over at a glance, plus the longest run of each and a typical week. */
function Outcomes({ rows, symbol }) {
  const o = weekOutcomes(rows);
  const bar = (n) => (o.total ? (n / o.total) * 100 : 0);
  return (
    <div>
      <div className="flex h-7 overflow-hidden rounded-lg">
        {o.under > 0 && (
          <div className="flex items-center justify-center" style={{ width: `${bar(o.under)}%`, backgroundColor: GOOD }}>
            <span className="px-1 text-[11px] font-bold text-white">{o.under}</span>
          </div>
        )}
        {o.over > 0 && (
          <div className="flex items-center justify-center" style={{ width: `${bar(o.over)}%`, backgroundColor: BAD }}>
            <span className="px-1 text-[11px] font-bold text-white">{o.over}</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        <span className="font-semibold" style={{ color: GOOD }}>{o.pctUnder}%</span> of your weeks
        finished under budget — {o.under} under, {o.over} over.
      </p>
      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <Row label="Longest run under" value={`${o.bestRun} wk`} color={GOOD} />
        {o.worstRun > 0 && <Row label="Longest run over" value={`${o.worstRun} wk`} color={BAD} />}
        <Row
          label="Typical week"
          value={`${o.median >= 0 ? "+" : "−"}${fitMoney(Math.abs(o.median), symbol, 10)}`}
          color={o.median >= 0 ? GOOD : BAD}
          hint="median"
        />
      </div>
    </div>
  );
}

function Row({ label, value, color, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 text-sm text-gray-600 dark:text-gray-300">
        {label}
        {hint && <span className="ml-1.5 text-xs text-gray-400">{hint}</span>}
      </span>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
