import { useState } from "react";
import Modal from "./Modal.jsx";

const COLOR_PRESETS = [
  "#F97316", "#3B82F6", "#8B5E34", "#8B5CF6", "#EC4899",
  "#5B8C5A", "#EF4444", "#F59E0B", "#14B8A6", "#6B7280",
];

/**
 * Add/edit a category. `category` null => add mode.
 * onSave({ id?, name, icon, color }); onDelete(id) only shown in edit mode.
 */
export default function CategoryEditor({ category, canDelete, onSave, onDelete, onClose }) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name || "");
  const [icon, setIcon] = useState(category?.icon || "💸");
  const [color, setColor] = useState(category?.color || COLOR_PRESETS[0]);

  const valid = name.trim().length > 0 && icon.trim().length > 0;

  return (
    <Modal title={isEdit ? "Edit category" : "Add category"} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
            style={{ backgroundColor: color + "22" }}
          >
            {icon || "❔"}
          </span>
          <div className="flex-1">
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-300">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-matcha/40"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600 dark:text-gray-300">
            Emoji
          </label>
          <input
            value={icon}
            onChange={(e) => setIcon([...e.target.value].slice(-2).join(""))}
            placeholder="🍜"
            className="w-24 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-center text-2xl focus:outline-none focus:ring-2 focus:ring-matcha/40"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-gray-600 dark:text-gray-300">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                className={`h-9 w-9 rounded-full transition ${
                  color === c ? "ring-2 ring-offset-2 ring-gray-500 dark:ring-offset-neutral-800" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <button
            disabled={!valid}
            onClick={() => onSave({ id: category?.id, name: name.trim(), icon: icon.trim(), color })}
            className={`w-full rounded-2xl py-3.5 text-base font-semibold transition ${
              valid
                ? "bg-matcha text-white active:scale-[0.99]"
                : "bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isEdit ? "Save changes" : "Add category"}
          </button>
          {isEdit && (
            <button
              disabled={!canDelete}
              onClick={() => onDelete(category.id)}
              className={`w-full rounded-2xl py-3.5 text-base font-semibold transition ${
                canDelete
                  ? "bg-red-500/10 text-red-500 active:scale-[0.99]"
                  : "bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed"
              }`}
            >
              {canDelete ? "Delete category" : "Can't delete the last category"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
