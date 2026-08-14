import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import {
  DEFAULT_SHARE_OPTS,
  DETAIL_PRESETS,
  buildShareText,
  drawShareCard,
} from "./shareCard.js";

const OPTS_KEY = "budge.share.opts";

const DETAILS = [
  { key: "simple", label: "Simple" },
  { key: "standard", label: "Standard" },
  { key: "detailed", label: "Detailed" },
];

const TOGGLES = [
  { key: "showBudget", label: "Budget and over/under", hint: "How much of your budget you used" },
  { key: "showCategories", label: "Category breakdown", hint: "Top categories and their totals" },
  { key: "showPurchases", label: "Individual purchases", hint: "Your five biggest buys, with notes" },
  { key: "showStreak", label: "Under-budget streak", hint: "Weeks in a row you stayed under" },
  { key: "showDates", label: "Week dates", hint: "The date range the recap covers" },
];

function Switch({ on, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-matcha" : "bg-gray-200 dark:bg-gray-700"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/**
 * Options step shown before the OS share sheet: pick how much detail the
 * message includes, see a live preview of the card and the exact text, then
 * share. Choices are remembered for next time.
 */
export default function ShareSheet({ data, symbol, onClose }) {
  const [opts, setOpts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPTS_KEY) || "null");
      return saved ? { ...DEFAULT_SHARE_OPTS, ...saved } : DEFAULT_SHARE_OPTS;
    } catch {
      return DEFAULT_SHARE_OPTS;
    }
  });
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch { /* ignore */ }
  }, [opts]);

  const text = useMemo(() => buildShareText(data, opts, symbol), [data, opts, symbol]);

  // Redraw the card whenever the options change.
  useEffect(() => {
    const canvas = canvasRef.current || document.createElement("canvas");
    canvasRef.current = canvas;
    drawShareCard(canvas, data, opts, symbol);
    setPreview(canvas.toDataURL("image/png"));
  }, [data, opts, symbol]);

  const setDetail = (key) => setOpts((o) => ({ ...o, detail: key, ...DETAIL_PRESETS[key] }));
  const toggle = (key) => (val) => setOpts((o) => ({ ...o, [key]: val }));

  async function toBlob() {
    return new Promise((res) => canvasRef.current.toBlob(res, "image/png"));
  }

  async function share() {
    setBusy(true);
    try {
      const blob = await toBlob();
      const file = new File([blob], "last-week.png", { type: "image/png" });
      // Prefer sharing the image with the text; fall back to text, then to a
      // plain download if the browser has no share support at all.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else if (navigator.share) {
        await navigator.share({ text });
      } else {
        saveImage();
      }
      onClose();
    } catch {
      /* user dismissed the share sheet, or it failed — stay open */
    } finally {
      setBusy(false);
    }
  }

  function saveImage() {
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = "last-week.png";
    a.click();
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Modal title="Share last week" onClose={onClose}>
      {/* Live preview */}
      {preview && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <img src={preview} alt="Preview of the recap card" className="block w-full" />
        </div>
      )}

      {/* Detail level */}
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Detail
      </p>
      <div className="mb-5 flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-white/5">
        {DETAILS.map((dd) => (
          <button
            key={dd.key}
            onClick={() => setDetail(dd.key)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              opts.detail === dd.key
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {dd.label}
          </button>
        ))}
      </div>

      {/* Include toggles */}
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Include
      </p>
      <div className="mb-5 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{t.label}</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t.hint}</p>
            </div>
            <Switch on={!!opts[t.key]} onChange={toggle(t.key)} label={t.label} />
          </div>
        ))}
      </div>

      {/* Exact message that gets sent */}
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Message
      </p>
      <pre className="mb-5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-gray-100 px-4 py-3 font-sans text-sm leading-relaxed text-gray-700 dark:bg-white/5 dark:text-gray-200">
        {text}
      </pre>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={share}
          disabled={busy}
          className="w-full rounded-2xl bg-matcha py-3.5 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? "Opening…" : "Share"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={saveImage}
            className="rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-800 active:scale-[0.99] dark:border-gray-700 dark:text-gray-100"
          >
            Save image
          </button>
          <button
            onClick={copyText}
            className="rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-800 active:scale-[0.99] dark:border-gray-700 dark:text-gray-100"
          >
            {copied ? "Copied" : "Copy text"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
