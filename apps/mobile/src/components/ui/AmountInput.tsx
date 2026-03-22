import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, fontSize, borderRadius, spacing, fontWeight } from "@/theme";

type AmountInputProps = Omit<TextInputProps, "keyboardType" | "value" | "onChangeText"> & {
  value: string;
  onChangeText: (v: string) => void;
  label?: string;
  error?: string;
};

export function AmountInput({ value, onChangeText, label, error, ...props }: AmountInputProps) {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputRow, error ? styles.inputError : null]}>
        <Text style={styles.prefix}>₱</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.gray300}
          {...props}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 52,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  prefix: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.gray900, marginRight: spacing.xs },
  input: { flex: 1, fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.gray900, padding: 0 },
  errorText: { fontSize: fontSize.sm, color: colors.danger },
});
