import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useJoinGroup } from "@/hooks/useCollaboration";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

export default function JoinGroupScreen() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const joinGroup = useJoinGroup();

  async function handleJoin() {
    const code = inviteCode.trim();
    if (!code) {
      Alert.alert("Error", "Please enter an invite code");
      return;
    }

    const result = await joinGroup.mutateAsync(code);
    if (result.error) {
      Alert.alert("Could not join", result.error);
      return;
    }
    if (!result.data) {
      Alert.alert("Could not join", "Group data was not returned.");
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const groupId = result.data.group.id;
    router.replace(`/(protected)/groups/${groupId}`);
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
            <Text style={styles.subtitle}>
              Enter the invite code shared by your group admin.
            </Text>
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
              Ask your group admin to share the invite code from the group settings page.
            </Text>
          </View>

          <AppButton
            title={joinGroup.isPending ? "Joining…" : "Join Group"}
            onPress={handleJoin}
            isLoading={joinGroup.isPending}
            disabled={!inviteCode.trim()}
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
