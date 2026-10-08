import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { AppButton } from "@/components/ui/Button";
import { claimMember, joinGroupByInvite } from "@/services/collaboration";
import { clearAuthDestination, saveAuthDestination } from "@/lib/auth-links";
import { useQueryClient } from "@tanstack/react-query";
import { openGroupFromLink } from "@/lib/navigation";

type Props = { kind: "claim" | "join"; token: string };
export function AcceptInvitation({ kind, token }: Props): React.ReactElement {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const valid =
    kind === "claim" ? /^[a-f0-9]{64}$/.test(token) : /^[a-zA-Z0-9-]{4,128}$/.test(token);
  async function accept(): Promise<void> {
    if (!valid) return;
    setError("");
    setBusy(true);
    try {
      await saveAuthDestination(
        kind === "claim"
          ? `/claim?token=${encodeURIComponent(token)}`
          : `/join?code=${encodeURIComponent(token)}`,
      );
      if (!session) {
        router.push("/(auth)/login");
        return;
      }
      const result = kind === "claim" ? await claimMember(token) : await joinGroupByInvite(token);
      if (result.error || !result.data) {
        setError(result.error ?? "The invitation could not be accepted.");
        return;
      }
      await clearAuthDestination();
      await queryClient.invalidateQueries();
      openGroupFromLink(router, result.data.member.group_id);
    } catch {
      setError("Could not accept the invitation. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>
        {kind === "claim" ? "Accept your personal invitation" : "Join a group"}
      </Text>
      <Text>
        {kind === "claim"
          ? "Accept only if the organizer sent this invitation to you. It connects your account to your existing expense history."
          : "This adds you as a new group member. If the organizer already added your name, ask for a personal invitation to connect that record."}
      </Text>
      {!valid ? (
        <Text accessibilityRole="alert">
          This invitation is invalid. Ask the organizer for a new link.
        </Text>
      ) : (
        <AppButton
          title={session ? "Accept invitation" : "Sign in or create an account"}
          onPress={accept}
          isLoading={busy}
        />
      )}
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </ScrollView>
  );
}
