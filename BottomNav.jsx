import { HomeIcon, PlusIcon, ClockIcon, GearIcon, HelpIcon } from "./icons.jsx";

// Add sits dead-center, flanked by two tabs on each side.
const TABS = [
  { key: "dashboard", label: "Dashboard", Icon: HomeIcon },
  { key: "history", label: "History", Icon: ClockIcon },
  { key: "add", label: "Add", Icon: PlusIcon, emphasized: true },
  { key: "settings", label: "Settings", Icon: GearIcon },
  { key: "help", label: "Help", Icon: HelpIcon },
];

/**
 * Floating glass tab bar. A pill that hovers above the content (which scrolls
 * underneath and shows through the blur), clear of the home indicator. The
 * active tab is marked by a capsule that slides between slots on a transform,
 * so moving between tabs reads as one object travelling, not two lighting up.
 */
export default function BottomNav({ view, onChange }) {
  const index = TABS.findIndex((t) => t.key === view);
  const onAdd = TABS[index]?.emphasized;

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4
                 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <div className="glass pointer-events-auto relative flex w-full max-w-[26rem] items-stretch rounded-full p-1.5">
        {/* Sliding active capsule: one slot wide, moved by transform only. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-1.5 rounded-full bg-gray-900/[0.06] transition-[transform,opacity] duration-[250ms] ease-out dark:bg-white/10"
          style={{
            width: "calc((100% - 0.75rem) / 5)",
            transform: `translateX(${Math.max(index, 0) * 100}%)`,
            opacity: index < 0 || onAdd ? 0 : 1,
          }}
        />
        {TABS.map(({ key, label, Icon, emphasized }) => {
          const active = view === key;
          if (emphasized) {
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-1 items-center justify-center"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-float
                    active:scale-95 ${active ? "bg-matcha-dark" : "bg-matcha"}`}
                >
                  <Icon size={26} />
                </span>
              </button>
            );
          }
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full active:scale-95
                ${active ? "text-matcha" : "text-gray-500 dark:text-gray-400"}`}
            >
              <Icon size={22} />
              <span className={`text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
