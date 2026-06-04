import { useState } from "react";
import { parseAmount } from "./budget.js";
import CategoryEditor from "./CategoryEditor.jsx";
import Modal from "./Modal.jsx";

const WEEK_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
];

const SYNC_LABEL = {
  saving: { text: "Saving…", color: "text-gray-400" },
  saved: { text: "All changes synced", color: "text-matcha" },
  error: { text: "Offline — will retry", color: "text-red-500" },
  idle: { text: "", color: "text-gray-400" },
};

const card =
  "rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm";
const input =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-3 text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-matcha/40";

/** Settings: account, default weekly allowance, week start, currency, category CRUD, backups. */
export default function Settings({
  categories,
  settings,
  hash,
  sync,
  onUpdateSettings,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onUseAccount,
  onNewAccount,
  onExport,
  onImport,
}) {
  const symbol = settings.currencySymbol;
  const [editing, setEditing] = useState(null);
  const [accountModal, setAccountModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [hashInput, setHashInput] = useState("");

  function copyHash() {
    try {
      navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  const syncInfo = SYNC_LABEL[sync] || SYNC_LABEL.idle;

  return (
    <div className="min-h-full space-y-6 bg-gray-50 px-4 pt-5 pb-4 dark:bg-gray-950">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Settings</h1>

      <Section title="Account">
        <div className={`${card} p-4`}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Your account key</span>
            {syncInfo.text && (
              <span className={`font-mono text-xs font-medium ${syncInfo.color}`}>
                {syncInfo.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-100">
              {hash}
            </code>
            <button
              onClick={copyHash}
              className="rounded-lg bg-matcha px-4 py-2 text-xs font-semibold text-white active:scale-95"
            >
              {copied ? "Copied!" : "Copy Key"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Save this key. Anyone with it can access this account — use it to sign in on another
            device. There's no password recovery.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setHashInput("");
                setAccountModal("switch");
              }}
              className="rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-800 active:scale-[0.99] dark:bg-gray-800 dark:text-gray-100"
            >
              Use another key
            </button>
            <button
              onClick={() => setAccountModal("new")}
              className="rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-800 active:scale-[0.99] dark:bg-gray-800 dark:text-gray-100"
            >
              New account
            </button>
          </div>
        </div>
      </Section>

      <Section title="Budget">
        <Field label="Default weekly allowance">
          <div className="flex items-center rounded-xl border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-950">
            <span className="text-gray-400">{symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={(settings.weeklyAllowance / 100).toString()}
              onBlur={(e) => onUpdateSettings({ weeklyAllowance: parseAmount(e.target.value) })}
              className="w-full bg-transparent px-2 py-3 text-right font-mono font-semibold tabular-nums text-gray-900 focus:outline-none dark:text-gray-50"
            />
          </div>
          <p className="mt-1 px-1 text-xs text-gray-400">
            Used for any week without its own override. Adjust a single week from the Dashboard.
          </p>
        </Field>

        <Field label="Week starts on">
          <select
            value={settings.weekStartDay}
            onChange={(e) => onUpdateSettings({ weekStartDay: Number(e.target.value) })}
            className={input}
          >
            {WEEK_DAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Currency symbol">
          <input
            type="text"
            maxLength={3}
            defaultValue={settings.currencySymbol}
            onBlur={(e) => onUpdateSettings({ currencySymbol: e.target.value.trim() || "₱" })}
            className={input}
          />
        </Field>
      </Section>

      <Section title="Categories">
        <div className={`${card} divide-y divide-gray-100 overflow-hidden dark:divide-gray-800`}>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setEditing(c)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50 dark:active:bg-gray-800/50"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: c.color + "22" }}
              >
                {c.icon}
              </span>
              <span className="flex-1 font-medium text-gray-900 dark:text-gray-50">{c.name}</span>
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="text-sm font-medium text-matcha">Edit</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing({})}
          className="mt-3 w-full rounded-2xl border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 active:scale-[0.99] dark:border-gray-700 dark:text-gray-400"
        >
          + Add category
        </button>
      </Section>

      <Section title="Data">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onExport}
            className={`${card} py-3.5 text-sm font-semibold text-gray-900 active:scale-[0.99] dark:text-gray-50`}
          >
            Export Data
          </button>
          <button
            onClick={onImport}
            className={`${card} py-3.5 text-sm font-semibold text-gray-900 active:scale-[0.99] dark:text-gray-50`}
          >
            Import Data
          </button>
        </div>
        <p className="mt-2 px-1 text-xs text-gray-400">
          Backups download/read a JSON file.
        </p>
      </Section>

      {editing && (
        <CategoryEditor
          category={editing.id ? editing : null}
          canDelete={categories.length > 1}
          onSave={(payload) => {
            if (payload.id) onEditCategory(payload.id, payload);
            else onAddCategory(payload);
            setEditing(null);
          }}
          onDelete={(id) => {
            onDeleteCategory(id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {accountModal === "switch" && (
        <Modal title="Use another account" onClose={() => setAccountModal(null)}>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
            Paste an account key to load its data on this device.
          </p>
          <input
            autoFocus
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
            placeholder="account key"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 font-mono text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-matcha/40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-50"
          />
          <button
            disabled={!hashInput.trim()}
            onClick={() => {
              onUseAccount(hashInput);
              setAccountModal(null);
            }}
            className={`mt-4 w-full rounded-2xl py-3.5 text-base font-semibold transition ${
              hashInput.trim()
                ? "bg-matcha text-white active:scale-[0.99]"
                : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-800"
            }`}
          >
            Load account
          </button>
        </Modal>
      )}

      {accountModal === "new" && (
        <Modal title="Create a new account?" onClose={() => setAccountModal(null)}>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            This generates a fresh, empty account and switches to it. Your current account isn't
            deleted — copy its key first if you want to come back to it.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => {
                onNewAccount();
                setAccountModal(null);
              }}
              className="w-full rounded-2xl bg-matcha py-3.5 text-base font-semibold text-white active:scale-[0.99]"
            >
              Create new account
            </button>
            <button
              onClick={() => setAccountModal(null)}
              className="w-full rounded-2xl py-3 text-base font-medium text-gray-500 dark:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block px-1 text-sm text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}
