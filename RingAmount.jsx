import { useLayoutEffect, useRef } from "react";
import { formatMoney } from "./budget.js";
import { chooseRingAmount } from "./ringFormat.js";

/**
 * Hero amount for the progress ring. Renders `cents` so it always stays on one
 * line *inside* the ring: scales the font down as needed, drops centavos when
 * it'd otherwise get too small, and falls back to compact k/M for big numbers.
 *
 * Available width is the parent's CONTENT box. `clientWidth` includes padding,
 * so we subtract it explicitly — the earlier bug measured the full ring width
 * (padding included) and let the text run under the stroke.
 */
export default function RingAmount({ cents, symbol, max = 60, min = 24, className, style }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    // Width of a candidate string at the max font size.
    const measure = (s) => {
      el.textContent = s;
      el.style.fontSize = `${max}px`;
      return el.scrollWidth || 1;
    };

    const fit = () => {
      const cs = getComputedStyle(parent);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const avail = parent.clientWidth - pad - 6; // true inner width, minus a hair
      if (avail <= 0) return;
      const { text, size } = chooseRingAmount(cents, symbol, avail, measure, { max, min });
      el.textContent = text;
      el.style.fontSize = `${size}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [cents, symbol, max, min]);

  // Initial (pre-layout) text; the layout effect refits before paint. The
  // aria-label keeps the exact amount for screen readers even when the visible
  // text is compacted (e.g. shows "₱235k").
  return (
    <span
      ref={ref}
      className={className}
      aria-label={formatMoney(cents, symbol)}
      style={{ display: "inline-block", whiteSpace: "nowrap", lineHeight: 1.05, ...style }}
    >
      {formatMoney(cents, symbol)}
    </span>
  );
}
