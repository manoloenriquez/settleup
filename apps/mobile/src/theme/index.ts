import { DESIGN_TOKENS } from "@template/shared";

const design = DESIGN_TOKENS;

export const colors = {
  // Brand
  primary: design.color.brand,
  primaryLight: design.color.brandSoft,
  primaryDark: design.color.brandStrong,

  // Semantic
  success: design.color.positive,
  successLight: design.color.positiveSoft,
  successDark: "#0D5D50",
  warning: design.color.outgoing,
  warningLight: design.color.outgoingSoft,
  warningDark: "#79440A",
  danger: design.color.danger,
  dangerLight: design.color.dangerSoft,

  // Accent (quick actions, decorative)
  violet: design.color.ai,
  violetLight: design.color.aiSoft,

  // Neutral
  black: "#000000",
  white: "#ffffff",
  gray50: "#f8fafc",
  gray100: "#f1f5f9",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: design.color.textMuted,
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: design.color.text,

  // Background
  background: design.color.canvas,
  surface: design.color.surface,
  surfaceMuted: design.color.surfaceMuted,
  border: design.color.border,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const borderRadius = {
  sm: 8,
  md: design.radius.control,
  lg: 16,
  xl: design.radius.card,
  full: 9999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

// Member avatar colors (hash-based, matching web)
export const AVATAR_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f97316", // orange
  "#14b8a6", // teal
] as const;

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}
