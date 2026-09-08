import {
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useState } from "react";
import { colors, borderRadius, fontSize, fontWeight } from "@/theme";

export type AppTextInputProps = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
};

export function AppTextInput({
  label,
  error,
  containerStyle,
  style,
  secureTextEntry,
  ...props
}: AppTextInputProps): React.ReactElement {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        accessibilityLabel={label}
        secureTextEntry={secureTextEntry && !visible}
        placeholderTextColor={colors.gray400}
        autoCorrect={false}
        spellCheck={false}
        {...props}
      />
      {secureTextEntry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          onPress={() => setVisible(!visible)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: colors.primary }}>
            {visible ? "Hide password" : "Show password"}
          </Text>
        </Pressable>
      ) : null}
      {error && (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      )}
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
