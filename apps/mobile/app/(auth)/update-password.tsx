import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { Link, useRouter } from "expo-router";
import { updatePasswordSchema } from "@template/shared";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { AppTextInput } from "@/components/ui/TextInput";
import { AppButton } from "@/components/ui/Button";

export default function UpdatePasswordScreen(): React.ReactElement {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(): Promise<void> {
    const parsed = updatePasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: failure } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (failure) {
        setError(failure.message);
        return;
      }
      await signOut();
      router.replace("/(auth)/login");
    } catch {
      setError("Could not update your password. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Choose a new password</Text>
      {session ? (
        <>
          <AppTextInput
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          <AppTextInput
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          {error ? <Text accessibilityRole="alert">{error}</Text> : null}
          <AppButton title="Update password" isLoading={busy} onPress={save} />
        </>
      ) : (
        <>
          <Text>This link has expired or was already used.</Text>
          <Link href="/(auth)/forgot-password">Request a new recovery email</Link>
        </>
      )}
    </ScrollView>
  );
}
