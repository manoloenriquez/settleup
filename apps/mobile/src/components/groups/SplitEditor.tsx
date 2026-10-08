import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatAmount, resolveSplit } from "@template/shared";
import type { CurrencyCode, SplitMode } from "@template/shared";
import { AppTextInput, ChipGroup, SegmentedControl } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

type Member = { id: string; display_name: string };

type Props = {
  members: Member[];
  selected: Set<string>;
  onToggle: (memberId: string) => void;
  mode: SplitMode;
  onModeChange: (mode: SplitMode) => void;
  values: Record<string, string>;
  onValueChange: (memberId: string, value: string) => void;
  currency: CurrencyCode;
  /** Parsed amount in minor units, or 0 while the amount field is invalid. */
  totalMinor: number;
};

const MODES: { value: SplitMode; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "percent", label: "%" },
  { value: "shares", label: "Shares" },
  { value: "exact", label: "Exact" },
];

/**
 * Who shares an expense and how. Every mode resolves through the shared
 * `resolveSplit`, so the preview is exactly what will be saved.
 */
export function SplitEditor({
  members,
  selected,
  onToggle,
  mode,
  onModeChange,
  values,
  onValueChange,
  currency,
  totalMinor,
}: Props) {
  const ids = members.filter((m) => selected.has(m.id)).map((m) => m.id);
  const labels = Object.fromEntries(members.map((m) => [m.id, m.display_name]));
  const resolution =
    totalMinor > 0 && ids.length > 0
      ? resolveSplit({ mode, totalMinor, currency, memberIds: ids, values, labels })
      : null;
  const resolved = resolution?.ok ? new Map(resolution.shares.map((s) => [s.memberId, s.shareCents])) : null;

  return (
    <View style={styles.wrapper}>
      <ChipGroup
        label="Split between"
        chips={members.map((m) => ({ id: m.id, label: m.display_name }))}
        selected={selected}
        onToggle={onToggle}
      />
      <Text style={styles.label}>How to split</Text>
      <SegmentedControl segments={MODES} value={mode} onChange={onModeChange} />
      {mode !== "equal" &&
        ids.map((id) => (
          <View key={id} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {labels[id]}
            </Text>
            <View style={styles.input}>
              <AppTextInput
                value={values[id] ?? ""}
                onChangeText={(v) => onValueChange(id, v)}
                placeholder={mode === "shares" ? "1" : mode === "percent" ? "0" : "0.00"}
                keyboardType="decimal-pad"
                accessibilityLabel={
                  mode === "percent"
                    ? `Percentage for ${labels[id]}`
                    : mode === "shares"
                      ? `Shares for ${labels[id]}`
                      : `Amount for ${labels[id]}`
                }
              />
            </View>
            <Text style={styles.part}>
              {mode !== "exact" && resolved?.has(id) ? formatAmount(resolved.get(id)!, currency) : ""}
            </Text>
          </View>
        ))}
      {mode === "shares" && (
        <Text style={styles.hint}>Blank counts as 1 share. Use 2 for someone covering two people.</Text>
      )}
      {resolution && !resolution.ok && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {resolution.error}
        </Text>
      )}
      {resolution?.ok && mode !== "equal" && (
        <View style={styles.balanced}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={styles.hint}>Adds up to {formatAmount(totalMinor, currency)}</Text>
        </View>
      )}
      {resolution?.ok && mode === "equal" && ids.length > 1 && (
        <Text style={styles.hint}>
          {formatAmount(Math.floor(totalMinor / ids.length), currency)} each
          {totalMinor % ids.length !== 0 ? " (the leftover is spread one unit at a time)" : ""}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, fontSize: fontSize.md, color: colors.gray900 },
  input: { width: 110 },
  part: { width: 90, textAlign: "right", fontSize: fontSize.sm, color: colors.gray600 },
  hint: { fontSize: fontSize.sm, color: colors.gray600 },
  error: { fontSize: fontSize.sm, color: colors.danger },
  balanced: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
