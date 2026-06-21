// ---------------------------------------------------------------------------
// Pure formatting/fit logic for the progress-ring hero amount. No React/DOM, so
// it's unit-testable in isolation. RingAmount.jsx supplies the DOM `measure`.
// ---------------------------------------------------------------------------
import { formatMoney } from "./budget.js";

// Money with no centavos: "₱2,353" / "-₱2,353".
export function noDecimals(cents, symbol) {
  const sign = cents < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(cents) / 100);
  return `${sign}${symbol}${whole.toLocaleString("en-US")}`;
}

// Compact money for large magnitudes: "₱235k", "-₱1.2M".
export function compactMoney(cents, symbol) {
  const sign = cents < 0 ? "-" : "";
  const p = Math.abs(cents) / 100; // pesos
  // value with adaptive precision: integers from 100 up, else one decimal.
  const fmt = (v) => (v >= 100 ? Math.round(v) : +v.toFixed(1));
  // Promote to "M" when the rounded k-value would carry into the millions
  // (e.g. ₱999,999.50 -> "₱1M", not "₱1000k").
  if (p >= 1_000_000 || Math.round(p / 1000) >= 1000) {
    return `${sign}${symbol}${fmt(p / 1_000_000)}M`;
  }
  return `${sign}${symbol}${fmt(p / 1000)}k`;
}

/**
 * Pick the richest representation of `cents` that fits in `avail` px, plus the
 * font size to render it at. Pure given `measure(text) => widthAtMaxPx`.
 *
 * Ladder, richest → simplest:
 *   1. full with centavos  ("₱2,353.23")  — kept only if it fits at ≥ decimalFloor px
 *   2. no centavos         ("₱2,353")     — kept if it fits at ≥ min px
 *   3. compact k/M         ("₱235k")      — always fits; also forced for huge values
 * Text width scales ~linearly with font size, so size = max·avail/natural, clamped.
 */
export function chooseRingAmount(cents, symbol, avail, measure, opts = {}) {
  const { max = 60, min = 24, decimalFloor = 28, hugeThreshold = 10_000_000 } = opts;
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const fitSize = (text) => Math.floor((max * avail) / measure(text));

  // Large magnitudes go compact regardless of fit (₱235,346.13 → ₱235k).
  if (Math.abs(cents) >= hugeThreshold) {
    const text = compactMoney(cents, symbol);
    return { text, size: clamp(fitSize(text)) };
  }

  const dec = formatMoney(cents, symbol);
  const decFit = fitSize(dec);
  if (decFit >= decimalFloor) return { text: dec, size: clamp(decFit) };

  const nd = noDecimals(cents, symbol);
  const ndFit = fitSize(nd);
  if (ndFit >= min) return { text: nd, size: clamp(ndFit) };

  const text = compactMoney(cents, symbol);
  return { text, size: clamp(fitSize(text)) };
}
