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

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          <Text style={styles.brand}>{APP_NAME}</Text>
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
    // Shadow
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
});
