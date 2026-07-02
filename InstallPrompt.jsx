import { useEffect, useRef, useState } from "react";

const DISMISS_KEY = "budge.installPrompt.dismissedAt";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // don't nag for 2 weeks after dismiss

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

function detectPlatform() {
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as "Macintosh" — disambiguate via touch points.
  const iOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

// iOS "Share" glyph (box with an up arrow) so the instruction is unmistakable.
function ShareGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-3px", display: "inline" }}>
      <path d="M12 3v13M8 7l4-4 4 4" />
      <path d="M6 12H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

/**
 * Closeable "add to home screen" banner, shown only when the app is running in
 * a browser tab (not already installed). Android/desktop Chrome get a one-tap
 * Install button (via the captured beforeinstallprompt event); iOS gets manual
 * Share → Add to Home Screen steps, since Safari has no install API.
 */
export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState("other");
  const [canPrompt, setCanPrompt] = useState(false);
  const revealed = useRef(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed — nothing to do
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissedAt < SNOOZE_MS) return;

    const p = detectPlatform();
    setPlatform(p);
    const hasEvent = !!window.__budgeInstallEvent;
    setCanPrompt(hasEvent);

    // Reveal a moment after load so it doesn't fight the first paint.
    const reveal = () => {
      if (revealed.current) return;
      revealed.current = true;
      setTimeout(() => setShow(true), 1500);
    };
    // iOS/Android always get the banner; "other" (desktop) only if installable.
    if (p === "ios" || p === "android" || hasEvent) reveal();

    const onInstallable = () => { setCanPrompt(true); reveal(); };
    const onInstalled = () => setShow(false);
    window.addEventListener("budge:installable", onInstallable);
    window.addEventListener("budge:installed", onInstalled);
    return () => {
      window.removeEventListener("budge:installable", onInstallable);
      window.removeEventListener("budge:installed", onInstalled);
    };
  }, []);

  if (!show) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  }

  async function install() {
    const e = window.__budgeInstallEvent;
    if (!e) return;
    e.prompt();
    try {
      const { outcome } = await e.userChoice;
      window.__budgeInstallEvent = null;
      if (outcome === "accepted") dismiss();
      else setCanPrompt(false);
    } catch { /* ignore */ }
  }

  return (
    <div
      className="fixed inset-x-0 z-30 px-4"
      style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      role="dialog"
      aria-label="Install budge"
    >
      <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-matcha text-xl font-bold text-white">
            ₱
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-50">Add budge· to your home screen</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Opens like a real app — full screen, works offline, and can send you reminders.
            </p>

            {platform === "ios" ? (
              <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                In Safari, tap the Share icon <ShareGlyph /> in the toolbar, then choose{" "}
                <span className="font-semibold text-gray-900 dark:text-gray-50">Add to Home Screen</span>.
              </p>
            ) : canPrompt ? (
              <button
                onClick={install}
                className="mt-3 w-full rounded-2xl bg-matcha py-2.5 text-sm font-semibold text-white active:scale-[0.99]"
              >
                Install app
              </button>
            ) : platform === "android" ? (
              <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                Tap the <span className="font-semibold text-gray-900 dark:text-gray-50">⋮</span> menu, then{" "}
                <span className="font-semibold text-gray-900 dark:text-gray-50">Add to Home screen</span> (or “Install app”).
              </p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                Use the install icon in your browser’s address bar to add budge·.
              </p>
            )}
          </div>

          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-gray-400 active:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
