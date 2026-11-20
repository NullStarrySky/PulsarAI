export type BadgeColor =
  | "gray" | "red" | "orange" | "amber" | "yellow" | "lime" | "green"
  | "emerald" | "teal" | "cyan" | "blue" | "indigo" | "violet" | "purple"
  | "fuchsia" | "pink" | "rose";

export type BadgeSizeCanonical = "default" | "compact";
export type BadgeSize = BadgeSizeCanonical | "sm" | "md" | "lg";

export const badgeColors: Record<BadgeColor, string> = {
  gray: "#a3a3a3",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};
