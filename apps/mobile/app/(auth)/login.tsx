import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { AppTextInput } from "@/components/ui/TextInput";
import { AppButton } from "@/components/ui/Button";
import { APP_NAME } from "@template/shared";
import { signInWithGoogle } from "@/lib/google-auth";
import { colors, borderRadius, fontSize, fontWeight, spacing } from "@/theme";
import { BrandMark } from "@/components/brand/BrandMark";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignIn(): Promise<void> {
    setError(null);
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setGoogleLoading(false);
    }
    // On success: onAuthStateChange fires → RouteGuard navigates to home.
  }

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError(null);
    setLoading(true);

    const result = await signIn(email.trim(), password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success: onAuthStateChange fires → RouteGuard navigates to home.
    // We intentionally leave loading=true to avoid a flash back to this screen.
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}><BrandMark size={42} /><Text style={styles.brand}>{APP_NAME}</Text></View>
          <Text style={styles.title}>Sign in to your account</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {error && (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <AppTextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="you@example.com"
            returnKeyType="next"
          />

          <AppTextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            containerStyle={styles.fieldGap}
          />

          <AppButton
            title="Sign in"
            onPress={handleSignIn}
            isLoading={loading}
            style={styles.submitBtn}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <AppButton
            title="Continue with Google"
            onPress={handleGoogleSignIn}
            isLoading={googleLoading}
            variant="secondary"
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don&apos;t have an account? </Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={styles.link}>Create one</Text>
            </Pressable>
          </Link>
        </View>
        <View style={styles.footer}>
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing["2xl"],
  },
  brand: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.gray900,
    letterSpacing: -0.5,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: {
    fontSize: fontSize.base,
    color: colors.gray500,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: borderRadius.sm + 2,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  fieldGap: {
    marginTop: spacing.base,
  },
  submitBtn: {
    marginTop: spacing.xl,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.base,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: fontSize.sm,
    color: colors.gray400,
    marginHorizontal: spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.gray500,
  },
  link: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
});
