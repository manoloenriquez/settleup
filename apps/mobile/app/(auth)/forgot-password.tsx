import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Forgot Password", headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {sent ? (
            <View style={styles.successCard}>
              <Text style={styles.successEmoji}>{"\uD83D\uDCE7"}</Text>
              <Text style={styles.successTitle}>Check your email</Text>
              <Text style={styles.successSub}>We sent a password reset link to {email}</Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.backLink}>{"\u2190"} Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.heading}>Reset Password</Text>
              <Text style={styles.sub}>Enter your email and we'll send you a reset link.</Text>
              {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
              <AppTextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <AppButton title={loading ? "Sending\u2026" : "Send Reset Link"} onPress={handleSubmit} isLoading={loading} disabled={!email.trim() || loading} />
              <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
                <Text style={styles.backLink}>{"\u2190"} Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingTop: spacing.xl },
  form: { gap: spacing.md },
  heading: { fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: colors.gray900 },
  sub: { fontSize: fontSize.base, color: colors.gray500, lineHeight: 22 },
  errorBox: { backgroundColor: colors.dangerLight, borderRadius: 8, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.sm },
  backRow: { alignItems: "center", marginTop: spacing.sm },
  backLink: { color: colors.primary, fontWeight: fontWeight.medium, fontSize: fontSize.base },
  successCard: { alignItems: "center", paddingTop: spacing["2xl"], gap: spacing.md },
  successEmoji: { fontSize: 56 },
  successTitle: { fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: colors.gray900 },
  successSub: { fontSize: fontSize.base, color: colors.gray500, textAlign: "center", lineHeight: 22 },
});
