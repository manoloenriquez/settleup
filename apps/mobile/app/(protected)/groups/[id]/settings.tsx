import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useDeleteGroup } from "@/hooks/useGroups";
import { useAddMember, useMembers, useDeleteMember } from "@/hooks/useMembers";
import { useRegenerateInviteCode } from "@/hooks/useCollaboration";
import { useGroups } from "@/hooks/useGroups";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { Card, ListItem, Avatar, Skeleton } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
// Derive web app origin from Supabase project URL or fall back to env
const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "";

export default function GroupSettingsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [newMemberName, setNewMemberName] = useState("");

  const membersQ = useMembers(groupId);
  const addMember = useAddMember(groupId);
  const deleteMember = useDeleteMember(groupId);
  const deleteGroup = useDeleteGroup();
  const regenerateCode = useRegenerateInviteCode();

  // Get current group to show invite code
  const groupsQ = useGroups();
  const group = (groupsQ.data ?? []).find((g) => g.id === groupId);

  const inviteLink = group && WEB_ORIGIN
    ? `${WEB_ORIGIN}/join?code=${group.invite_code}`
    : null;

  async function handleCopyInviteCode() {
    if (!group?.invite_code) return;
    await Clipboard.setStringAsync(group.invite_code);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied", "Invite code copied to clipboard");
  }

  async function handleCopyInviteLink() {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied", "Invite link copied to clipboard");
  }

  async function handleRegenerateCode() {
    Alert.alert(
      "Regenerate Invite Code?",
      "The old invite code will stop working. Current members are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          onPress: async () => {
            const r = await regenerateCode.mutateAsync(groupId);
            if (r.error) { Alert.alert("Error", r.error); return; }
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }

  async function handleAddMember() {
    if (!newMemberName.trim()) return;
    const result = await addMember.mutateAsync(newMemberName.trim());
    if (result.error) { Alert.alert("Error", result.error); return; }
    setNewMemberName("");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function confirmDeleteMember(memberId: string, name: string) {
    Alert.alert(`Remove ${name}?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deleteMember.mutate(memberId) },
    ]);
  }

  function confirmDeleteGroup() {
    Alert.alert("Delete Group?", "This will archive the group and cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const r = await deleteGroup.mutateAsync(groupId);
          if (r.error) { Alert.alert("Error", r.error); return; }
          router.replace("/(protected)/(tabs)/groups");
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Group Settings", headerShown: true }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* Invite code section */}
        <Text style={styles.sectionLabel}>INVITE MEMBERS</Text>
        <Card padding={spacing.base}>
          {!group ? (
            <Skeleton height={48} />
          ) : (
            <View style={styles.inviteSection}>
              <View style={styles.inviteCodeRow}>
                <View style={styles.inviteCodeBox}>
                  <Text style={styles.inviteCodeText}>{group.invite_code}</Text>
                </View>
                <AppButton
                  title="Copy Code"
                  variant="secondary"
                  onPress={handleCopyInviteCode}
                  style={styles.inviteBtn}
                />
              </View>
              {inviteLink ? (
                <AppButton
                  title="Copy Invite Link"
                  variant="secondary"
                  onPress={handleCopyInviteLink}
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
              <AppButton
                title="Regenerate Code"
                variant="secondary"
                onPress={handleRegenerateCode}
                isLoading={regenerateCode.isPending}
                style={{ marginTop: spacing.sm }}
              />
              <Text style={styles.inviteHint}>
                Share this code or link so others can join the group.
              </Text>
            </View>
          )}
        </Card>

        {/* Member list */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>MEMBERS</Text>
        {membersQ.isLoading ? (
          <Card padding={spacing.base}>
            <Skeleton height={36} />
            <Skeleton height={36} style={{ marginTop: spacing.sm }} />
          </Card>
        ) : (
          <Card padding={0}>
            {(membersQ.data ?? []).map((m, i) => (
              <View key={m.id}>
                <ListItem
                  left={<Avatar name={m.display_name} size={32} />}
                  title={m.display_name}
                  subtitle={m.role === "owner" ? "Owner" : m.user_id ? "Member" : "Unlinked"}
                  right={
                    m.role !== "owner" ? (
                      <Text
                        style={styles.removeBtn}
                        onPress={() => confirmDeleteMember(m.id, m.display_name)}
                      >
                        Remove
                      </Text>
                    ) : null
                  }
                />
                {i < (membersQ.data ?? []).length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </Card>
        )}

        {/* Add member */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.base }]}>ADD MEMBER</Text>
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <AppTextInput
              value={newMemberName}
              onChangeText={setNewMemberName}
              placeholder="Member name"
              returnKeyType="done"
              onSubmitEditing={handleAddMember}
            />
          </View>
          <AppButton title="Add" onPress={handleAddMember} isLoading={addMember.isPending} disabled={!newMemberName.trim()} />
        </View>

        {/* Delete group */}
        <AppButton
          title="Delete Group"
          variant="danger"
          onPress={confirmDeleteGroup}
          style={{ marginTop: spacing["2xl"] }}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"] },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.gray400,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  inviteSection: { gap: spacing.xs },
  inviteCodeRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  inviteCodeBox: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  inviteCodeText: {
    fontFamily: "monospace",
    fontSize: fontSize.sm,
    color: colors.gray800 ?? colors.gray900,
    letterSpacing: 0.5,
  },
  inviteBtn: { flexShrink: 0 },
  inviteHint: { fontSize: fontSize.xs, color: colors.gray400, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.base },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  removeBtn: { fontSize: fontSize.sm, color: colors.danger, fontWeight: fontWeight.medium },
});
