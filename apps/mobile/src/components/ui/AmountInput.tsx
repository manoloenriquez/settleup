import { StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";
import { currencyPrecision, currencySymbol, type CurrencyCode } from "@template/shared";
import { colors, fontSize, borderRadius, spacing, fontWeight } from "@/theme";

type AmountInputProps = Omit<TextInputProps, "keyboardType" | "value" | "onChangeText"> & {
  value: string;
  onChangeText: (v: string) => void;
  label?: string;
  error?: string;
  /** Currency of the amount; defaults to PHP for the existing group screens. */
  currency?: CurrencyCode;
  /** When set, the currency prefix becomes a button that changes the currency. */
  onCurrencyPress?: () => void;
};

export function AmountInput({
  value,
  onChangeText,
  label,
  error,
  currency = "PHP",
  onCurrencyPress,
  ...props
}: AmountInputProps) {
  const precision = currencyPrecision(currency);
  const placeholder = precision === 0 ? "0" : `0.${"0".repeat(precision)}`;
  const symbol = currencySymbol(currency);
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputRow, error ? styles.inputError : null]}>
        {onCurrencyPress ? (
          <TouchableOpacity
            onPress={onCurrencyPress}
            style={styles.currencyBtn}
            accessibilityRole="button"
            accessibilityLabel={`Currency ${currency}. Change currency`}
            hitSlop={8}
          >
            <Text style={styles.currencyCode}>{currency}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.prefix} accessibilityLabel={currency}>
            {symbol}
          </Text>
        )}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          keyboardType={precision === 0 ? "number-pad" : "decimal-pad"}
          placeholder={placeholder}
          placeholderTextColor={colors.gray300}
          accessibilityLabel={label ?? `Amount in ${currency}`}
          {...props}
        />
      </View>
      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
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
    minHeight: 52,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  prefix: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.gray900, marginRight: spacing.xs },
  currencyBtn: {
    marginRight: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryLight,
  },
  currencyCode: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.primaryDark },
  input: { flex: 1, fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.gray900, padding: 0 },
  errorText: { fontSize: fontSize.sm, color: colors.danger },
});
