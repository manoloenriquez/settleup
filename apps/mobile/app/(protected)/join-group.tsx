import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useJoinGroup } from "@/hooks/useCollaboration";
import { decideJoin } from "@/lib/join-with-code";
import { openGroupFromLink } from "@/lib/navigation";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function JoinGroupScreen() {
  const toast = useToast();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const joinGroup = useJoinGroup();
  const [checking, setChecking] = useState(false);

  async function handleJoin() {
    const code = inviteCode.trim();
    if (!code) {
      toast.error("Please enter an invite code");
      return;
    }

    if (checking) return;
    setChecking(true);
    const decision = await decideJoin(code).finally(() => setChecking(false));
    if (decision.kind === "error") {
      toast.error(decision.message);
      return;
    }
    if (decision.kind === "cancel") return;
    if (decision.kind === "open") {
      toast.info(`You’re already in ${decision.groupName}`);
      openGroupFromLink(router, decision.groupId);
      return;
    }

    const result = await joinGroup.mutateAsync(code);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (!result.data) {
      toast.error("Group data was not returned.");
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success("Joined group");
    openGroupFromLink(router, result.data.group.id);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Join Group", headerShown: true }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Join a Group</Text>
            <Text style={styles.subtitle}>Enter the invite code shared by your group admin.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Invite Code</Text>
            <AppTextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="e.g. 3a9f2b4c1d8e"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleJoin}
            />
            <Text style={styles.hint}>
              Already listed in the group by name? Ask the organizer for your personal invite
              instead, so your expenses come with you.
            </Text>
          </View>

          <AppButton
            title={joinGroup.isPending ? "Joining…" : "Join Group"}
            onPress={handleJoin}
            isLoading={joinGroup.isPending || checking}
            disabled={!inviteCode.trim() || checking}
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"] },

  header: { marginBottom: spacing.lg },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray400, marginTop: spacing.xs },

  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray700 },
  hint: { fontSize: fontSize.xs, color: colors.gray400 },

  button: { marginTop: spacing.sm },
});
