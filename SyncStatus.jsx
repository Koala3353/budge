import { useEffect, useRef, useState } from "react";

/**
 * Compact sync indicator for the main screens. Stays silent when everything is
 * synced (no clutter); shows "Saving…" while a push is in flight, a brief
 * "Saved" confirmation, and a persistent "Offline" when a push failed — in
 * which case the change is still safe locally and will sync on reconnect.
 *
 * `sync` comes from App: "idle" | "saving" | "saved" | "error".
 */
export default function SyncStatus({ sync }) {
  const prev = useRef(sync);
  const [savedVisible, setSavedVisible] = useState(false);

  useEffect(() => {
    let t;
    if (sync === "saved" && prev.current !== "saved") {
      setSavedVisible(true);
      t = setTimeout(() => setSavedVisible(false), 2000); // confirm, then fade out
    }
    prev.current = sync;
    return () => t && clearTimeout(t);
  }, [sync]);

  let dot, label, cls, pulse;
  if (sync === "saving") {
    dot = "#9CA3AF"; label = "Saving…"; cls = "text-gray-400"; pulse = true;
  } else if (sync === "error") {
    dot = "#F59E0B"; label = "Offline"; cls = "text-amber-500 dark:text-amber-400";
  } else if (sync === "saved" && savedVisible) {
    dot = "#5B8C5A"; label = "Saved"; cls = "text-matcha";
  } else {
    return null; // idle / long-since-synced → show nothing
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${cls}`}
      role="status"
      aria-live="polite"
      title={sync === "error" ? "Offline — your changes are saved and will sync when you reconnect" : label}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ backgroundColor: dot }}
      />
      {label}
    </span>
  );
}
