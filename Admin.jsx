import { useEffect, useRef, useState } from "react";
import { formatMoney } from "./budget.js";
import { fitMoney } from "./ringFormat.js";
import { loadAdminStats } from "./store.js";

const card =
  "rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm";
const MARK = "#5B8C5A"; // matcha: every magnitude on this page is one series
const PEAK = "#D97706"; // the single highlighted mark in a chart
const SYM = "₱";

const METRICS = [
  { key: "transactions", label: "Entries", fmt: (v) => v.toLocaleString("en-US") },
  { key: "volume", label: "Pesos", fmt: (v) => fitMoney(v, SYM, 9) },
  { key: "users", label: "Users", fmt: (v) => v.toLocaleString("en-US") },
  { key: "signups", label: "Sign-ups", fmt: (v) => v.toLocaleString("en-US") },
];
const SIZE_LABELS = ["No entries", "1–9", "10–49", "50–199", "200+"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const n = (v) => Number(v || 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const dayLabel = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;

/**
 * Hidden admin screen (Help → tap the footer exactly five times within four
 * seconds). App-wide numbers only: the server function returns counts, totals
 * and distributions, never anyone's key, notes or individual entries. Whether
 * this account may see them is decided server-side; the gesture is just a door.
 */
export default function Admin({ hash, onBack }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | denied | error
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const d = await loadAdminStats(hash);
      setData(d);
      setState("ready");
    } catch (e) {
      // 401/403 = the function ran and said no (PostgREST reports a permission
      // error as 401 for the anon role); 404 = it hasn't been installed yet.
      const s = e.status;
      setState(s === 401 || s === 403 ? "denied" : s === 404 ? "missing" : "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  return (
    <div className="min-h-full space-y-3 bg-gray-50 px-4 pt-5 pb-4 dark:bg-gray-950">
      <header className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="-ml-1 mb-1 flex items-center gap-0.5 text-sm font-medium text-matcha active:opacity-70"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Help
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Admin</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {data
              ? `Everyone on budge· · updated ${new Date(n(data.generatedAt)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
              : "Everyone on budge·"}
          </p>
        </div>
        {state === "ready" && (
          <button
            onClick={load}
            disabled={busy}
            aria-label="Refresh"
            className="mt-7 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm ring-1 ring-gray-200 active:scale-95 disabled:opacity-60 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={busy ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        )}
      </header>

      {state === "loading" && <Skeleton />}
      {state === "denied" && (
        <Notice title="This account isn't an admin">
          Add your key to the <Code>admins</Code> table in Supabase — your key is under Settings →
          Your account key:
          <pre className="mt-2 overflow-x-auto rounded-xl bg-gray-100 p-3 font-mono text-[11px] leading-relaxed text-gray-700 dark:bg-white/5 dark:text-gray-300">
            insert into public.admins (user_hash){"\n"}values ('your-key');
          </pre>
        </Notice>
      )}
      {state === "missing" && (
        <Notice title="Stats aren't set up yet">
          Run <Code>supabase-admin.sql</Code> once in the Supabase SQL editor, then add your key to
          the <Code>admins</Code> table.
        </Notice>
      )}
      {state === "error" && (
        <Notice title="Couldn't reach the server" action={{ label: "Try again", onClick: load, busy }}>
          App-wide stats need a connection — your own data is unaffected.
        </Notice>
      )}
      {state === "ready" && data && <Stats d={data} />}
    </div>
  );
}

function Stats({ d }) {
  const t = d.totals || {};
  const today = d.today || {};
  const active = d.active || {};
  const accounts = n(t.accounts);
  const daily = d.daily || [];

  return (
    <>
      <Section title="Today" hint={d.timezone ? `Days end at midnight, ${d.timezone.split("/").pop().replace("_", " ")} time` : null}>
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Entries today" value={n(today.transactions).toLocaleString("en-US")} sub={`${n(today.users).toLocaleString("en-US")} logging`} />
          <Tile label="Logged today" value={fitMoney(n(today.volume), SYM, 10)} sub={today.transactions ? `avg ${fitMoney(Math.round(n(today.volume) / n(today.transactions)), SYM, 8)}` : "—"} />
          <Tile label="New accounts" value={n(today.signups).toLocaleString("en-US")} sub="created today" />
          <Tile label="Synced today" value={n(today.synced).toLocaleString("en-US")} sub={`of ${accounts.toLocaleString("en-US")} accounts`} />
        </div>
      </Section>

      <Section title="Accounts">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[clamp(2rem,10vw,2.5rem)] font-bold leading-none tracking-tight text-gray-900 dark:text-gray-50">
            {accounts.toLocaleString("en-US")}
          </p>
          <p className="text-right text-sm text-gray-500 dark:text-gray-400">
            {n(t.withEntries).toLocaleString("en-US")} have logged something
          </p>
        </div>
        <div className="mt-4 space-y-3">
          <Share label="Active today" value={n(active.d1)} of={accounts} />
          <Share label="Active this week" value={n(active.d7)} of={accounts} />
          <Share label="Active this month" value={n(active.d30)} of={accounts} />
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Active = logged at least one entry in the last 1, 7 or 30 days.
        </p>
      </Section>

      <Section title="Last 30 days">
        <Daily rows={daily} />
      </Section>

      <Section title="When people log" hint="Last 30 days">
        <Hours hours={d.hours || []} />
        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
          <Weekdays counts={d.weekdays || []} />
        </div>
      </Section>

      <Section title="Where the money goes" hint="Last 30 days, by category name">
        <Categories rows={d.categories || []} />
      </Section>

      <Section title="Account sizes" hint="Accounts by how many entries they've logged, all time">
        <Bars
          rows={(d.sizes || []).map((v, i) => ({ label: SIZE_LABELS[i], value: n(v) }))}
          fmt={(v) => v.toLocaleString("en-US")}
        />
      </Section>

      <Section title="All time">
        <div className="space-y-2.5">
          <Row label="Entries" value={n(t.transactions).toLocaleString("en-US")} />
          <Row label="Pesos logged" value={formatMoney(n(t.volume), SYM)} />
          <Row label="Entries per account" hint="with any entries" value={t.withEntries ? (n(t.transactions) / n(t.withEntries)).toFixed(1) : "—"} />
          <Row label="Average weekly budget" value={fitMoney(n(t.avgWeeklyBudget), SYM, 12)} />
          <Row label="Median weekly budget" value={fitMoney(Math.round(n(t.medianWeeklyBudget)), SYM, 12)} />
          <Row label="Database size" hint="account data" value={bytes(n(t.storageBytes))} />
        </div>
      </Section>
    </>
  );
}

// --- charts ----------------------------------------------------------------------

/**
 * Daily activity, one metric at a time. Four measures on four scales can't
 * share an axis, so they share a switcher instead. Tap or drag across the
 * chart to read any day; "Table" shows the same numbers as text.
 */
function Daily({ rows }) {
  const [metric, setMetric] = useState("transactions");
  const [table, setTable] = useState(false);
  const m = METRICS.find((x) => x.key === metric);
  const values = rows.map((r) => n(r[metric]));
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="mb-1 flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-white/5">
        {METRICS.map((x) => (
          <button
            key={x.key}
            onClick={() => setMetric(x.key)}
            aria-pressed={metric === x.key}
            className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${
              metric === x.key
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {table ? (
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">{m.label}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.day} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{dayLabel(r.day)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-900 dark:text-gray-50">{m.fmt(n(r[metric]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <LineChart rows={rows} values={values} fmt={m.fmt} label={m.label} />
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 font-mono text-xs text-gray-500 dark:text-gray-400">
          {metric === "users"
            ? `peak ${Math.max(0, ...values)} in a day`
            : `${m.fmt(total)} in 30 days`}
        </p>
        <button onClick={() => setTable((v) => !v)} className="shrink-0 text-xs font-semibold text-matcha">
          {table ? "Chart" : "Table"}
        </button>
      </div>
    </div>
  );
}

/**
 * A round upper bound for an axis that halves cleanly (the midline is labelled
 * too). A fine ladder, so a peak of 276 gets a 300 ceiling rather than 500 and
 * the line uses the height it's given.
 */
function niceMax(v) {
  if (v <= 0) return 2;
  const p = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10].find((f) => f * p >= v);
  return step * p;
}

/** Pointer → index across `count` evenly spaced slots, for a chart of width `vbw`. */
function useScrub(count) {
  const [idx, setIdx] = useState(null);
  const ref = useRef(null);
  function at(e) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !count) return;
    const x = Math.min(Math.max(e.clientX - r.left, 0), r.width - 1);
    setIdx(Math.floor((x / r.width) * count));
  }
  const handlers = {
    ref,
    onPointerDown: at,
    onPointerMove: (e) => (e.pointerType === "mouse" || e.buttons ? at(e) : null),
    onPointerLeave: (e) => e.pointerType === "mouse" && setIdx(null),
  };
  return [idx, handlers, setIdx];
}

/** Sits in a strip reserved above the plot, so it never covers the controls. */
function Tooltip({ leftPct, children }) {
  // Clamp so the bubble never hangs off either edge at 320px.
  const left = Math.min(Math.max(leftPct, 14), 86);
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-medium text-white shadow-md dark:bg-gray-50 dark:text-gray-900"
      style={{ left: `${left}%` }}
    >
      {children}
    </div>
  );
}

function LineChart({ rows, values, fmt, label }) {
  const VBW = 340;
  const VBH = 146;
  const PAD_T = 14; // room for the top gridline's label
  const PAD_B = 18;
  const plotH = VBH - PAD_T - PAD_B;
  const count = values.length;
  const top = niceMax(Math.max(...values, 0));
  const x = (i) => (count <= 1 ? VBW / 2 : (i / (count - 1)) * VBW);
  const y = (v) => PAD_T + plotH - (v / top) * plotH;
  const [idx, scrub] = useScrub(count);

  if (!count) return <Empty>No activity yet.</Empty>;
  const line = values.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L ${VBW} ${y(0)} L 0 ${y(0)} Z`;
  const cur = idx != null ? Math.min(idx, count - 1) : null;
  const mid = Math.floor((count - 1) / 2);

  return (
    <div className="relative touch-pan-y select-none pt-7" {...scrub}>
      {cur != null && (
        <Tooltip leftPct={(x(cur) / VBW) * 100}>
          {dayLabel(rows[cur].day)} · {fmt(values[cur])} {label.toLowerCase()}
        </Tooltip>
      )}
      <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" role="img" aria-label={`${label} per day for the last 30 days`}>
        {[top / 2, top].filter(Number.isInteger).map((g) => (
          <g key={g}>
            <line x1="0" x2={VBW} y1={y(g)} y2={y(g)} className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="1" />
            {/* Left edge: the right is where "today" is, which is the part people read. */}
            <text x="0" y={y(g) - 3} style={{ fontSize: 9 }} className="fill-gray-400 dark:fill-gray-500">
              {fmt(g)}
            </text>
          </g>
        ))}
        <line x1="0" x2={VBW} y1={y(0)} y2={y(0)} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="1" />
        <path d={area} fill={MARK} opacity="0.12" />
        <path d={line} fill="none" stroke={MARK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {cur != null && (
          <>
            <line x1={x(cur)} x2={x(cur)} y1={PAD_T} y2={y(0)} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx={x(cur)} cy={y(values[cur])} r="4" fill={MARK} className="stroke-white dark:stroke-gray-900" strokeWidth="2" />
          </>
        )}
        {[0, mid, count - 1].map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={VBH - 4}
            textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
            style={{ fontSize: 9, fontWeight: k === 2 ? 700 : 400 }}
            className={k === 2 ? "fill-gray-900 dark:fill-gray-50" : "fill-gray-500 dark:fill-gray-400"}
          >
            {k === 2 ? "Today" : dayLabel(rows[i].day)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Vertical bars with one highlighted peak and a tap-to-read tooltip. */
function Columns({ values, labels, ticks, tip, aria }) {
  const VBW = 340;
  const VBH = 110;
  const PAD_B = 16;
  const plotH = VBH - PAD_B - 4;
  const count = values.length;
  const max = Math.max(...values, 0);
  const peak = max > 0 ? values.indexOf(max) : -1;
  const slot = VBW / count;
  // 2px surface gap between neighbours, and capped so seven bars stay marks
  // rather than blocks.
  const bw = Math.min(Math.max(2, slot - 2), 22);
  const [idx, scrub] = useScrub(count);

  return (
    <div className="relative touch-pan-y select-none pt-7" {...scrub}>
      {idx != null && idx < count && <Tooltip leftPct={((idx + 0.5) / count) * 100}>{tip(idx, values[idx])}</Tooltip>}
      <svg viewBox={`0 0 ${VBW} ${VBH}`} width="100%" role="img" aria-label={aria}>
        {values.map((v, i) => {
          const h = max ? (v / max) * plotH : 0;
          const x0 = i * slot + (slot - bw) / 2;
          const y0 = VBH - PAD_B - h;
          const r = Math.min(3, bw / 2, h);
          // Rounded data-end only; the baseline end stays square.
          const d = h
            ? `M ${x0} ${VBH - PAD_B} V ${y0 + r} Q ${x0} ${y0} ${x0 + r} ${y0} H ${x0 + bw - r} Q ${x0 + bw} ${y0} ${x0 + bw} ${y0 + r} V ${VBH - PAD_B} Z`
            : "";
          return (
            <g key={i}>
              {d && <path d={d} fill={i === peak ? PEAK : MARK} opacity={idx != null && idx !== i ? 0.45 : 1} />}
            </g>
          );
        })}
        <line x1="0" x2={VBW} y1={VBH - PAD_B} y2={VBH - PAD_B} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="1" />
        {ticks.map((i) => (
          <text key={i} x={(i + 0.5) * slot} y={VBH - 3} textAnchor="middle" style={{ fontSize: 9, fontWeight: i === peak ? 700 : 400 }} className={i === peak ? "fill-gray-900 dark:fill-gray-50" : "fill-gray-500 dark:fill-gray-400"}>
            {labels[i]}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Hours({ hours }) {
  const values = Array.from({ length: 24 }, (_, i) => n(hours[i]));
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return <Empty>No entries in the last 30 days.</Empty>;
  const peak = values.indexOf(Math.max(...values));
  // Label the quarter-days plus the peak, never all 24.
  const ticks = [...new Set([0, 6, 12, 18, peak])];
  return (
    <div>
      <p className="-mb-5 text-xs font-medium text-gray-500 dark:text-gray-400">By hour</p>
      <Columns
        values={values}
        labels={values.map((_, h) => hourLabel(h))}
        ticks={ticks.filter((t) => t === peak || Math.abs(t - peak) > 1)}
        tip={(i, v) => `${hourLabel(i)}–${hourLabel((i + 1) % 24)} · ${v} ${v === 1 ? "entry" : "entries"}`}
        aria={`Entries by hour of day; busiest at ${hourLabel(peak)}`}
      />
      <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
        busiest {hourLabel(peak)}–{hourLabel((peak + 1) % 24)} · {pct(values[peak], total)}% of entries
      </p>
    </div>
  );
}

function Weekdays({ counts }) {
  // Monday first — the app's default week — so the weekend sits together.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const values = order.map((d) => n(counts[d]));
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const labels = order.map((d) => DOW[d]);
  const peak = values.indexOf(Math.max(...values));
  return (
    <div>
      <p className="-mb-5 text-xs font-medium text-gray-500 dark:text-gray-400">By day of week</p>
      <Columns
        values={values}
        labels={labels}
        ticks={values.map((_, i) => i)}
        tip={(i, v) => `${labels[i]} · ${v} ${v === 1 ? "entry" : "entries"}`}
        aria={`Entries by day of week; busiest on ${labels[peak]}`}
      />
      <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
        busiest {labels[peak]} · {pct(values[peak], total)}% of entries
      </p>
    </div>
  );
}

function Categories({ rows }) {
  const total = rows.reduce((a, r) => a + n(r.volume), 0);
  if (!total) return <Empty>No spending in the last 30 days.</Empty>;
  return (
    <Bars
      rows={rows.map((r) => ({
        label: r.name,
        value: n(r.volume),
        sub: `${pct(n(r.volume), total)}% · ${n(r.transactions).toLocaleString("en-US")} entries`,
      }))}
      fmt={(v) => fitMoney(v, SYM, 9)}
    />
  );
}

/**
 * Horizontal magnitude bars, stacked (label and value above a full-width bar)
 * so the bar keeps its length on a 320px phone instead of being squeezed
 * between two text columns. Values are printed, so nothing needs a hover.
 */
function Bars({ rows, fmt }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{r.label}</span>
              {r.sub && <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">{r.sub}</span>}
            </p>
            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-50">
              {fmt(r.value)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden bg-gray-100 dark:bg-white/5">
            <div
              className="h-full rounded-r transition-all duration-500 ease-out"
              style={{ width: `${max ? Math.max((r.value / max) * 100, r.value ? 2 : 0) : 0}%`, backgroundColor: MARK }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Part-of-whole as a single proportion bar, with the count and share in text. */
function Share({ label, value, of }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">
          {value.toLocaleString("en-US")} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">· {pct(value, of)}%</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct(value, of)}%`, backgroundColor: MARK }} />
      </div>
    </div>
  );
}

// --- pieces ----------------------------------------------------------------------

function Section({ title, hint, children }) {
  return (
    <section className={`${card} p-5`}>
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-50">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="min-w-0 rounded-2xl bg-gray-50 p-3.5 dark:bg-white/5">
      <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-[clamp(1.125rem,5.6vw,1.5rem)] font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-50">
        {value}
      </p>
      <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{sub}</p>
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 text-sm text-gray-600 dark:text-gray-300">
        {label}
        {hint && <span className="ml-1.5 text-xs text-gray-400">{hint}</span>}
      </span>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">{value}</span>
    </div>
  );
}

function Notice({ title, action, children }) {
  return (
    <div className={`${card} p-5`}>
      <p className="font-semibold text-gray-900 dark:text-gray-50">{title}</p>
      <div className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{children}</div>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.busy}
          className="mt-4 rounded-2xl bg-matcha px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {action.busy ? "Trying…" : action.label}
        </button>
      )}
    </div>
  );
}

const Code = ({ children }) => (
  <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] dark:bg-white/10">{children}</code>
);

const Empty = ({ children }) => (
  <div className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-white/5 dark:text-gray-400">
    {children}
  </div>
);

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading stats">
      {[128, 180, 220].map((h) => (
        <div key={h} className={`${card} animate-pulse`} style={{ height: h }} />
      ))}
    </div>
  );
}

function bytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}
