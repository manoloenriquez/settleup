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
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { AppTextInput } from "@/components/ui/TextInput";
import { AppButton } from "@/components/ui/Button";
import { APP_NAME } from "@template/shared";
import { signInWithGoogle } from "@/lib/google-auth";
import { colors, borderRadius, fontSize, fontWeight, spacing } from "@/theme";

function ConfirmEmailState() {
  return (
    <View style={styles.confirmCard}>
      <View style={styles.iconWrap}>
        <Ionicons name="mail-outline" size={28} color={colors.primary} />
      </View>
      <Text style={styles.confirmTitle}>Check your email</Text>
      <Text style={styles.confirmSubtitle}>
        We sent you a confirmation link. Tap it to activate your account, then come back to sign in.
      </Text>
      <Link href="/(auth)/login" asChild>
        <Pressable style={styles.backToLogin}>
          <Text style={styles.backToLoginText}>Back to sign in</Text>
        </Pressable>
      </Link>
    </View>
  );
}

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // True when signup succeeded but email confirmation is required
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

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

  if (awaitingConfirmation) {
    return (
      <View style={styles.flex}>
        <ConfirmEmailState />
      </View>
    );
  }

  async function handleSignUp() {
    // Client-side validation before hitting the network
    if (!email.trim() || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setLoading(true);

    const result = await signUp(email.trim(), password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // If email confirmation is disabled (local dev), onAuthStateChange fires with
    // SIGNED_IN → RouteGuard navigates to home (we never reach setAwaitingConfirmation).
    //
    // If email confirmation is required (production), show the pending state.
    setAwaitingConfirmation(true);
    setLoading(false);
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
          <Text style={styles.brand}>{APP_NAME}</Text>
          <Text style={styles.title}>Create your account</Text>
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
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="8+ characters"
            returnKeyType="next"
            containerStyle={styles.fieldGap}
          />

          <AppTextInput
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="••••••••"
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
            containerStyle={styles.fieldGap}
          />

          <AppButton
            title="Create account"
            onPress={handleSignUp}
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
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={styles.link}>Sign in</Text>
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
  // Confirm email state
  confirmCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing["2xl"],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  confirmTitle: {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    color: colors.gray900,
    textAlign: "center",
  },
  confirmSubtitle: {
    fontSize: fontSize.base,
    color: colors.gray500,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  backToLogin: {
    marginTop: spacing["2xl"],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.md,
  },
  backToLoginText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.gray700,
  },
});
