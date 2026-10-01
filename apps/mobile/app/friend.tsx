import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppButton, AppTextInput } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { clearAuthDestination, saveAuthDestination } from "@/lib/auth-links";
import { acceptFriendInvite, previewFriendInvite, type FriendInvitePreview } from "@/services/friends";
import { ROUTES } from "@/lib/routes";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

/** Opened from a friend's invite link: preview, then accept (sign-in first if needed). */
export default function FriendInviteScreen() {
  const { token: raw } = useLocalSearchParams<{ token?: string }>();
  const token = typeof raw === "string" && /^[0-9a-f]{64}$/.test(raw) ? raw : "";
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const [preview, setPreview] = useState<FriendInvitePreview | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggested = profile?.full_name?.trim() || "";

  useEffect(() => {
    if (!token) {
      setPreview({ status: "invalid" });
      return;
    }
    void previewFriendInvite(token).then((res) => setPreview(res.data ?? { status: "invalid" }));
  }, [token]);

  async function accept() {
    if (!session) {
      await saveAuthDestination(`/friend?token=${token}`);
      router.push(ROUTES.login);
      return;
    }
    const displayName = (name ?? suggested).trim();
    if (!displayName) {
      setError("Enter the name your friend will see.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await acceptFriendInvite(token, displayName);
    setBusy(false);
    if (res.error !== null) {
      setError(res.error);
      return;
    }
    await clearAuthDestination();
    void qc.invalidateQueries({ queryKey: ["friends"] });
    void qc.invalidateQueries({ queryKey: ["groups"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    router.replace({ pathname: "/(protected)/groups/[id]", params: { id: res.data.directGroupId } });
  }

  if (!preview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const inviter = preview.inviter_name ?? "Someone";
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {preview.status === "open" ? (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {inviter} wants to share expenses with you
          </Text>
          <Text style={styles.body}>
            You’ll get a simple tab between the two of you: add what either of you paid, see who owes
            whom, and settle up. Only the two of you can see it.
          </Text>
          {session && (
            <AppTextInput
              label="Your name for this friend"
              value={name ?? suggested}
              onChangeText={setName}
              placeholder="How they know you"
              autoCapitalize="words"
            />
          )}
          <AppButton
            title={session ? `Add ${inviter} as a Friend` : "Sign In or Create an Account"}
            onPress={() => void accept()}
            isLoading={busy}
          />
          {!session && (
            <Text style={styles.note}>You need a free account so you both see the same tab.</Text>
          )}
        </>
      ) : (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {preview.status === "used" ? "This invite was already used" : "This invite isn’t valid anymore"}
          </Text>
          <Text style={styles.body}>
            Invite links work once and expire after 14 days. Ask {preview.inviter_name ?? "your friend"} for
            a new link.
          </Text>
        </>
      )}
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <AppButton title="Not Now" variant="ghost" onPress={() => router.replace(ROUTES.home)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 96, gap: spacing.base, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: colors.gray900 },
  body: { fontSize: fontSize.md, lineHeight: 22, color: colors.gray600 },
  note: { fontSize: fontSize.sm, color: colors.gray500, textAlign: "center" },
  error: { fontSize: fontSize.sm, color: colors.danger },
});
