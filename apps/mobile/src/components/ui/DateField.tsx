import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { dateToISO, friendlyDate, isoToLocalDate } from "@/lib/dates";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Props = { label?: string; value: string; onChange: (iso: string) => void; maximumDate?: Date };

/** A date row that expands the native inline calendar in place. */
export function DateField({ label = "Date", value, onChange, maximumDate }: Props) {
  const [open, setOpen] = useState(false);
  const text = friendlyDate(value);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${text}`}
        accessibilityHint={open ? "Hides the calendar" : "Shows a calendar"}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.gray600} />
        <Text style={styles.value}>{text}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.gray400} />
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={isoToLocalDate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={maximumDate}
          accentColor={colors.primary}
          onChange={(_event, selected) => {
            if (Platform.OS !== "ios") setOpen(false);
            if (selected) onChange(dateToISO(selected));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  value: { flex: 1, fontSize: fontSize.md, color: colors.gray900 },
});
