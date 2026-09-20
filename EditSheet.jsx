import { useState } from "react";
import { parseAmount, formatMoney, getWeekRange } from "./budget.js";

const DANGER = "#EF4444";
const pad = (n) => String(n).padStart(2, "0");
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Bottom-sheet editor for a tapped transaction: amount, category, note, and the
 * date and time it happened. Saves via onSave (keeping the original id) or
 * removes it via onDelete. Mounted only while a transaction is selected, with a
 * key on the id so the form state resets for each one.
 *
 * Moving a transaction across a week boundary moves the money with it, so the
 * sheet says so before you save rather than letting two weekly totals change
 * without explanation.
 */
export default function EditSheet({
  tx,
  categories = [],
  symbol,
  weekStartDay = 1,
  onClose,
  onSave,
  onDelete,
}) {
  const original = new Date(tx.ts);
  const [amountStr, setAmountStr] = useState((tx.amount / 100).toString());
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [note, setNote] = useState(tx.note || "");
  const [dateStr, setDateStr] = useState(toDateStr(original));
  const [timeStr, setTimeStr] = useState(toTimeStr(original));

  // Rebuild the timestamp from scratch rather than mutating the original, so an
  // edit like "Jan 31 -> Feb" can't roll over into March on the way through.
  const ts = (() => {
    const [y, m, d] = (dateStr || "").split("-").map(Number);
    const [hh, mi] = (timeStr || "").split(":").map(Number);
    if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mi)) return null;
    const next = new Date(y, m - 1, d, hh, mi, original.getSeconds(), original.getMilliseconds());
    // Reject a rolled-over date (e.g. Feb 31) instead of silently saving March 3.
    if (next.getMonth() !== m - 1 || next.getDate() !== d) return null;
    return next.getTime();
  })();

  const cents = parseAmount(amountStr);
  const canSave = cents > 0 && categoryId != null && ts != null;

  const movedWeek =
    ts != null && getWeekRange(ts, weekStartDay).start !== getWeekRange(tx.ts, weekStartDay).start;
  const inFuture = ts != null && ts > Date.now();

  function save() {
    if (!canSave) return;
    onSave({ ...tx, amount: cents, categoryId, note: note.trim(), ts });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-gray-950/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md animate-[slideUp_200ms_ease-out] rounded-t-3xl border border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />

        <h3 className="mb-1 text-base font-bold text-gray-900 dark:text-gray-50">Edit transaction</h3>

        {/* Amount */}
        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-gray-400">
          Amount
        </label>
        <div className="mt-1 flex items-center rounded-2xl bg-gray-100 px-4 dark:bg-gray-950">
          <span className="text-2xl font-bold text-gray-400">{symbol}</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full bg-transparent px-2 py-3 text-right text-3xl font-extrabold tabular-nums text-gray-900 focus:outline-none dark:text-gray-50"
          />
        </div>

        {/* When it happened */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor="tx-date" className="block text-xs font-medium uppercase tracking-wide text-gray-400">
              Date
            </label>
            <input
              id="tx-date"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="mt-1 w-full min-w-0 rounded-2xl bg-gray-100 px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-matcha/40 dark:bg-gray-950 dark:text-gray-50 dark:[color-scheme:dark]"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="tx-time" className="block text-xs font-medium uppercase tracking-wide text-gray-400">
              Time
            </label>
            <input
              id="tx-time"
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="mt-1 w-full min-w-0 rounded-2xl bg-gray-100 px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-matcha/40 dark:bg-gray-950 dark:text-gray-50 dark:[color-scheme:dark]"
            />
          </div>
        </div>
        {ts == null ? (
          <p className="mt-2 text-xs font-medium" style={{ color: DANGER }}>
            That date and time don't make sense — check them before saving.
          </p>
        ) : (
          (movedWeek || inFuture) && (
            <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              {movedWeek && "Moves this to a different week, so both weekly totals change."}
              {movedWeek && inFuture && " "}
              {inFuture && "This is in the future."}
            </p>
          )
        )}

        {/* Category chips */}
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-gray-400">
          Category
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c) => {
            const active = categoryId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`min-h-[40px] rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-95 ${
                  active
                    ? "border border-transparent text-white"
                    : "border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200"
                }`}
                style={active ? { backgroundColor: c.color } : undefined}
              >
                {c.icon} {c.name}
              </button>
            );
          })}
        </div>

        {/* Note */}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note"
          className="mt-4 w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-matcha/40 dark:bg-gray-950 dark:text-gray-50"
        />

        <div className="mt-5 space-y-3">
          <button
            onClick={save}
            disabled={!canSave}
            className={`w-full rounded-2xl py-3.5 text-base font-semibold transition ${
              canSave
                ? "bg-matcha text-white active:scale-[0.99]"
                : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-800"
            }`}
          >
            {canSave ? `Save ${formatMoney(cents, symbol)}` : "Enter amount & category"}
          </button>
          <button
            onClick={() => onDelete(tx)}
            className="w-full rounded-2xl py-3.5 text-base font-semibold transition active:scale-[0.99]"
            style={{ backgroundColor: DANGER + "1a", color: DANGER }}
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-2xl py-3 text-base font-medium text-gray-500 dark:text-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}
