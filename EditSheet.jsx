import { formatMoney, formatTime } from "./budget.js";

const DANGER = "#EF4444";

/** Bottom-sheet modal for a tapped transaction: Edit or Delete. Slides up with
 *  a drag handle and a glass backdrop. */
export default function EditSheet({ tx, category, symbol, onClose, onEdit, onDelete }) {
  if (!tx) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-gray-950/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md animate-[slideUp_200ms_ease-out] rounded-t-3xl border border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />

        <div className="mb-5 flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
            style={{ backgroundColor: (category?.color || "#888") + "22" }}
          >
            {category?.icon || "❔"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900 dark:text-gray-50">
              {category?.name || "Uncategorized"}
            </div>
            <div className="truncate text-sm text-gray-500 dark:text-gray-400">
              {tx.note || "No note"} · {formatTime(tx.ts)}
            </div>
          </div>
          <div className="font-mono text-lg font-bold tabular-nums text-gray-900 dark:text-gray-50">
            {formatMoney(tx.amount, symbol)}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onEdit(tx)}
            className="w-full rounded-2xl bg-matcha py-3.5 text-base font-semibold text-white transition active:scale-[0.99]"
          >
            Edit Transaction
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
