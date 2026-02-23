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

function ConfirmEmailState() {
  return (
    <View style={styles.confirmCard}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>✉️</Text>
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
  // True when signup succeeded but email confirmation is required
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

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
  flex: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  brand: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 6,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: "#dc2626",
  },
  fieldGap: {
    marginTop: 16,
  },
  submitBtn: {
    marginTop: 24,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: "#6b7280",
  },
  link: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6366f1",
  },
  // Confirm email state
  confirmCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ede9fe",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  icon: {
    fontSize: 28,
  },
  confirmTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  confirmSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },
  backToLogin: {
    marginTop: 28,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
  },
  backToLoginText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
});
