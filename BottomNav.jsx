import { HomeIcon, PlusIcon, ClockIcon, GearIcon } from "./icons.jsx";

const TABS = [
  { key: "dashboard", label: "Dashboard", Icon: HomeIcon },
  { key: "add", label: "Add", Icon: PlusIcon, emphasized: true },
  { key: "history", label: "History", Icon: ClockIcon },
  { key: "settings", label: "Settings", Icon: GearIcon },
];

/** Fixed bottom tab bar. The Add tab is visually emphasized (centered FAB-style). */
export default function BottomNav({ view, onChange }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 dark:border-gray-800
                 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md
                 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ key, label, Icon, emphasized }) => {
          const active = view === key;
          if (emphasized) {
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                aria-label={label}
                className="flex flex-col items-center justify-center px-3 -mt-5"
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg
                    ${active ? "bg-matcha-dark" : "bg-matcha"} active:scale-95 transition`}
                >
                  <Icon size={28} />
                </span>
              </button>
            );
          }
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              aria-label={label}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2
                ${active ? "text-matcha" : "text-gray-400 dark:text-gray-500"}`}
            >
              <Icon size={24} />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
