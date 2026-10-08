import { DynamicColorIOS, Platform, type ColorValue } from "react-native";

/** A color that follows the system appearance (iOS); light elsewhere. */
function adaptive(light: string, dark: string): ColorValue {
  return Platform.OS === "ios" ? DynamicColorIOS({ light, dark }) : light;
}

/**
 * Fixed brand colors for props typed as plain strings (navigation header and
 * tab tints). The brand green reads well on both light and dark bars.
 */
export const brand = {
  primary: "#059669",
  white: "#ffffff",
} as const;

/**
 * Semantic colors. Each adapts to light and dark appearance, so styles keep
 * using them unchanged. Never build colors from these with string operations
 * (they are opaque on iOS): add a token below instead.
 */
export const colors = {
  // Brand
  primary: adaptive("#059669", "#10b981"),
  primaryLight: adaptive("#d1fae5", "#06352a"),
  primaryDark: adaptive("#047857", "#6ee7b7"),

  // Semantic
  success: adaptive("#10b981", "#34d399"),
  successLight: adaptive("#d1fae5", "#06352a"),
  successDark: adaptive("#065f46", "#6ee7b7"),
  warning: adaptive("#f59e0b", "#fbbf24"),
  warningLight: adaptive("#fef3c7", "#3a2604"),
  warningDark: adaptive("#92400e", "#fcd34d"),
  danger: adaptive("#e11d48", "#fb7185"),
  dangerLight: adaptive("#ffe4e6", "#3f0a16"),

  // Translucent tints (replace hex-alpha string building)
  successTint: adaptive("#d1fae5b0", "#10b98129"),
  successTintSoft: adaptive("#d1fae560", "#10b9811f"),
  successBorder: adaptive("#10b98130", "#34d3994d"),
  dangerTint: adaptive("#ffe4e6b0", "#f43f5e29"),
  dangerBorder: adaptive("#e11d4830", "#fb71854d"),
  warningTintSoft: adaptive("#fef3c760", "#f59e0b24"),
  primaryTint: adaptive("#d1fae580", "#10b9811f"),
  primaryBorderSoft: adaptive("#05966930", "#10b9814d"),
  primaryBorder: adaptive("#05966950", "#10b98173"),
  neutralTint: adaptive("#f8fafc80", "#ffffff0a"),
  overlay: "rgba(0,0,0,0.4)",

  // Accent (quick actions, decorative)
  violet: adaptive("#8b5cf6", "#a78bfa"),
  violetLight: adaptive("#ede9fe", "#241640"),

  // Fixed (text on colored fills, shadows)
  black: "#000000",
  white: "#ffffff",

  // Neutral
  gray50: adaptive("#f8fafc", "#121214"),
  gray100: adaptive("#f1f5f9", "#1f1f23"),
  gray200: adaptive("#e5e7eb", "#2c2c31"),
  gray300: adaptive("#d1d5db", "#3d3d44"),
  gray400: adaptive("#9ca3af", "#6e6e78"),
  gray500: adaptive("#6b7280", "#9a9aa3"),
  gray600: adaptive("#4b5563", "#b8b8c0"),
  gray700: adaptive("#374151", "#d4d4da"),
  gray800: adaptive("#1f2937", "#e8e8ec"),
  gray900: adaptive("#111827", "#f5f5f7"),

  // Background
  background: adaptive("#f8fafc", "#000000"),
  surface: adaptive("#ffffff", "#1c1c1e"),
  border: adaptive("#e5e7eb", "#38383a"),
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
  md: 12,
  lg: 16,
  xl: 20,
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
  "#059669", // emerald (brand)
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
