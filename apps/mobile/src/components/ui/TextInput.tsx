import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

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
        placeholderTextColor="#9ca3af"
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
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
  },
  inputError: {
    borderColor: "#f87171",
  },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
  },
});
