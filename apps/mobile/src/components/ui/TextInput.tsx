import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, borderRadius, fontSize, fontWeight } from "@/theme";

export interface AppTextInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function AppTextInput({
  label,
  error,
  containerStyle,
  style,
  ...props
}: AppTextInputProps) {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.gray400}
        autoCorrect={false}
        spellCheck={false}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.gray700,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: borderRadius.sm + 2,
    paddingHorizontal: 14,
    fontSize: fontSize.md,
    color: colors.gray900,
    backgroundColor: colors.white,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.danger,
  },
});
