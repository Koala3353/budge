// ---------------------------------------------------------------------------
// Shareable weekly recap: the message text and the image card.
//
// Copy rules: plain and factual, the way you'd actually text a friend. No app
// branding or "sent with…" footer, no taglines, no decorative emoji.
// ---------------------------------------------------------------------------
import { formatMoney } from "./budget.js";

export const DEFAULT_SHARE_OPTS = {
  detail: "standard", // "simple" | "standard" | "detailed"
  showBudget: true,
  showCategories: false,
  showPurchases: false,
  showStreak: false,
  showDates: false,
};

// A detail level is just a preset over the toggles below.
export const DETAIL_PRESETS = {
  simple: { showBudget: false, showCategories: false, showPurchases: false, showStreak: false, showDates: false },
  standard: { showBudget: true, showCategories: false, showPurchases: false, showStreak: false, showDates: false },
  detailed: { showBudget: true, showCategories: true, showPurchases: true, showStreak: true, showDates: true },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = (ts) => {
  const x = new Date(ts);
  return `${MONTHS[x.getMonth()]} ${x.getDate()}`;
};

/** "Mar 3 to Mar 9" for the recap's week (end is exclusive). */
export function dateRangeLabel(recap) {
  return `${d(recap.start)} to ${d(recap.end - 86400000)}`;
}

/**
 * The message someone actually sends. Kept short and human: a headline, the
 * over/under line, then optional detail sections. Returns a plain string.
 */
export function buildShareText(data, opts, symbol) {
  const { recap, categories = [], purchases = [], streak = 0 } = data;
  const over = recap.over > 0;
  const lines = [];

  lines.push(opts.showDates ? `Last week (${dateRangeLabel(recap)})` : "Last week");

  lines.push(
    opts.showBudget
      ? `Spent ${formatMoney(recap.spent, symbol)} of ${formatMoney(recap.allowance, symbol)}.`
      : `Spent ${formatMoney(recap.spent, symbol)}.`
  );

  if (opts.showBudget) {
    lines.push(
      over
        ? `${formatMoney(recap.over, symbol)} over budget.`
        : `${formatMoney(-recap.over, symbol)} left over.`
    );
  }

  if (opts.showStreak && streak >= 1) {
    lines.push(`${streak} week${streak === 1 ? "" : "s"} under budget in a row.`);
  }

  if (opts.showCategories && categories.length) {
    lines.push("");
    lines.push("Where it went:");
    for (const c of categories.slice(0, 5)) {
      lines.push(`${c.icon} ${c.name} ${formatMoney(c.amount, symbol)}`);
    }
  }

  if (opts.showPurchases && purchases.length) {
    lines.push("");
    lines.push("Biggest buys:");
    for (const p of purchases.slice(0, 5)) {
      lines.push(`${p.label} ${formatMoney(p.amount, symbol)}`);
    }
  }

  return lines.join("\n");
}

// --- image card ------------------------------------------------------------

const BG = "#0A0F0C";
const INK = "#F4F7F2";
const MUTED = "#8FA194";
const MATCHA = "#7BA87A";
const DANGER = "#EF4444";
const W = 1080;
const PAD = 88;

/**
 * Draw (or measure) the card. Two-pass: called once with `measure` to work out
 * the height, then again to actually paint. Returns the content height.
 */
function paint(ctx, data, opts, symbol, measure, offset = 0) {
  const { recap, categories = [], purchases = [], streak = 0 } = data;
  const over = recap.over > 0;
  let y = PAD + 42 + offset;

  const text = (s, { font, fill, dy = 0, x = PAD }) => {
    y += dy;
    if (!measure) {
      ctx.font = font;
      ctx.fillStyle = fill;
      ctx.fillText(s, x, y);
    }
  };

  ctx.textBaseline = "alphabetic";

  // Header
  text(opts.showDates ? `Last week · ${dateRangeLabel(recap)}` : "Last week", {
    font: "600 34px Inter, Arial, sans-serif",
    fill: MATCHA,
  });

  // Headline amount
  text(formatMoney(recap.spent, symbol), {
    font: "700 156px Inter, Arial, sans-serif",
    fill: INK,
    dy: 190,
  });

  if (opts.showBudget) {
    text(`of ${formatMoney(recap.allowance, symbol)} budget`, {
      font: "400 46px Inter, Arial, sans-serif",
      fill: MUTED,
      dy: 74,
    });
    text(
      over
        ? `${formatMoney(recap.over, symbol)} over`
        : `${formatMoney(-recap.over, symbol)} left over`,
      { font: "700 68px Inter, Arial, sans-serif", fill: over ? DANGER : MATCHA, dy: 106 }
    );
  }

  if (opts.showStreak && streak >= 1) {
    text(`${streak} week${streak === 1 ? "" : "s"} under budget in a row`, {
      font: "500 40px Inter, Arial, sans-serif",
      fill: MUTED,
      dy: 84,
    });
  }

  const section = (title, rows) => {
    if (!rows.length) return;
    y += 96;
    if (!measure) {
      ctx.fillStyle = "#243029";
      ctx.fillRect(PAD, y - 34, W - PAD * 2, 3);
    }
    text(title, { font: "600 36px Inter, Arial, sans-serif", fill: MUTED, dy: 30 });
    for (const r of rows.slice(0, 5)) {
      y += 66;
      if (!measure) {
        ctx.font = "500 44px Inter, Arial, sans-serif";
        ctx.fillStyle = INK;
        ctx.fillText(r.left, PAD, y);
        ctx.fillStyle = MUTED;
        ctx.textAlign = "right";
        ctx.fillText(r.right, W - PAD, y);
        ctx.textAlign = "left";
      }
    }
  };

  if (opts.showCategories) {
    section(
      "Where it went",
      categories.map((c) => ({ left: `${c.icon}  ${c.name}`, right: formatMoney(c.amount, symbol) }))
    );
  }
  if (opts.showPurchases) {
    section(
      "Biggest buys",
      purchases.map((p) => ({ left: p.label, right: formatMoney(p.amount, symbol) }))
    );
  }

  return y + PAD;
}

/**
 * Render the recap card into `canvas`. Square (1080) when the content is short,
 * growing taller only when extra sections are switched on.
 */
export function drawShareCard(canvas, data, opts, symbol) {
  const probe = document.createElement("canvas").getContext("2d");
  const needed = paint(probe, data, opts, symbol, true);
  // Fit the card to its content rather than forcing a square: a short recap in a
  // 1080 square is mostly empty space. Floor keeps it from looking cramped.
  const height = Math.max(620, Math.ceil(needed / 2) * 2);
  const offset = Math.max(0, Math.round((height - needed) / 2));

  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, height);
  paint(ctx, data, opts, symbol, false, offset);
  return canvas;
}
