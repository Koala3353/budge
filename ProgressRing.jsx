import { useEffect, useState } from "react";

// Close and over are money signals and never change with the theme; on track
// is the app's resting state, so it wears the theme's accent.
function ringColor(pct, isOver) {
  if (isOver) return "#EF4444"; // danger
  if (pct >= 0.8) return "#F59E0B"; // amber
  return "rgb(var(--accent))"; // on track: theme accent
}

/**
 * Hero progress ring. Animates the stroke from empty to its target on mount
 * and on state change (transition-all duration-700 ease-out). Round linecap.
 */
export default function ProgressRing({
  pct,
  isOver = false,
  size = 240,
  stroke = 22,
  children,
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = isOver ? 1 : Math.min(Math.max(pct, 0), 1);
  const color = ringColor(pct, isOver);

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setProgress(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const offset = circumference * (1 - progress);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-gray-200/80 dark:stroke-gray-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
          style={{ stroke: color, filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.10))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        {children}
      </div>
    </div>
  );
}
