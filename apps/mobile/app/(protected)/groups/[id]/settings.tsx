import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useArchiveGroup, useGroups, useRenameGroup, useTransferOwnership } from "@/hooks/useGroups";
import { useAddMember, useAddMembersBatch, useMembers, useDeleteMember, useRenameMember } from "@/hooks/useMembers";
import { useRegenerateInviteCode, useLeaveGroup } from "@/hooks/useCollaboration";
import { useAuth } from "@/context/AuthContext";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { Card, ListItem, Avatar, Skeleton } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "";

export default function GroupSettingsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [newMemberName, setNewMemberName] = useState("");
  const [groupNameInput, setGroupNameInput] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [renamingMemberId, setRenamingMemberId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");

  const membersQ = useMembers(groupId);
  const addMember = useAddMember(groupId);
  const addMembersBatch = useAddMembersBatch(groupId);
  const deleteMember = useDeleteMember(groupId);
  const renameMemberMutation = useRenameMember(groupId);
  const archiveGroupMutation = useArchiveGroup();
  const transferOwnershipMutation = useTransferOwnership();
  const renameGroupMutation = useRenameGroup();
  const regenerateCode = useRegenerateInviteCode();
  const leaveGroupMutation = useLeaveGroup();

  // Get current group to show invite code
  const groupsQ = useGroups();
  const group = (groupsQ.data ?? []).find((g) => g.id === groupId);

  const inviteLink = group && WEB_ORIGIN
    ? `${WEB_ORIGIN}/join?code=${group.invite_code}`
    : null;

  // Use local edit state if user has typed something; otherwise fall back to server value
  const groupNameValue = groupNameInput ?? group?.name ?? "";

  // Determine if current user is the group owner
  const currentMember = (membersQ.data ?? []).find((m) => m.user_id === user?.id);
  const isOwner = currentMember?.role === "owner";

  function confirmLeaveGroup() {
    Alert.alert(
      "Leave Group?",
      "Your expense history stays intact but you will no longer have access to this group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            const r = await leaveGroupMutation.mutateAsync(groupId);
            if (r.error) { Alert.alert("Error", r.error); return; }
            router.replace("/(protected)/(tabs)/groups");
          },
        },
      ],
    );
  }

  async function handleRenameGroup() {
    const name = groupNameValue.trim();
    if (!name || name === group?.name) return;
    const r = await renameGroupMutation.mutateAsync({ groupId, name });
    if (r.error) { Alert.alert("Error", r.error); return; }
    setGroupNameInput(null); // reset local state; query will refresh
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

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
    if (batchMode) {
      const names = newMemberName.split(",").map((n) => n.trim()).filter(Boolean);
      if (names.length === 0) return;
      const result = await addMembersBatch.mutateAsync(names);
      if (result.error) { Alert.alert("Error", result.error); return; }
      setNewMemberName("");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      const result = await addMember.mutateAsync(newMemberName.trim());
      if (result.error) { Alert.alert("Error", result.error); return; }
      setNewMemberName("");
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  function confirmTransferOwnership(memberId: string, memberName: string) {
    Alert.alert(
      "Transfer Ownership?",
      `Make ${memberName} the new group owner? You will become a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          style: "destructive",
          onPress: async () => {
            const r = await transferOwnershipMutation.mutateAsync({ groupId, memberId });
            if (r.error) { Alert.alert("Error", r.error); return; }
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }

  function startRenameMember(memberId: string, currentName: string) {
    setRenamingMemberId(memberId);
    setRenamingValue(currentName);
  }

  async function submitRenameMember(memberId: string, currentName: string) {
    const newName = renamingValue.trim();
    if (!newName || newName === currentName) {
      setRenamingMemberId(null);
      return;
    }
    const r = await renameMemberMutation.mutateAsync({ memberId, newName });
    if (r.error) {
      Alert.alert("Error", r.error);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setRenamingMemberId(null);
    }
  }

  function confirmDeleteMember(memberId: string, name: string) {
    Alert.alert(`Remove ${name}?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deleteMember.mutate(memberId) },
    ]);
  }

  function confirmArchiveGroup() {
    Alert.alert("Archive Group?", "The group will be hidden from your list. You can restore it later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: async () => {
          const r = await archiveGroupMutation.mutateAsync(groupId);
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

        {/* Group name */}
        <View style={styles.sectionLabelRow}>
          <Ionicons name="text-outline" size={12} color={colors.gray400} />
          <Text style={styles.sectionLabel}>GROUP NAME</Text>
        </View>
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <AppTextInput
              value={groupNameValue}
              onChangeText={setGroupNameInput}
              placeholder="Group name"
              returnKeyType="done"
              onSubmitEditing={handleRenameGroup}
            />
          </View>
          <AppButton
            title="Save"
            onPress={handleRenameGroup}
            isLoading={renameGroupMutation.isPending}
            disabled={!groupNameValue.trim() || groupNameValue.trim() === group?.name}
          />
        </View>

        {/* Invite code section */}
        <View style={[styles.sectionLabelRow, { marginTop: spacing.lg }]}>
          <Ionicons name="link-outline" size={12} color={colors.gray400} />
          <Text style={styles.sectionLabel}>INVITE MEMBERS</Text>
        </View>
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
        <View style={[styles.sectionLabelRow, { marginTop: spacing.lg }]}>
          <Ionicons name="people-outline" size={12} color={colors.gray400} />
          <Text style={styles.sectionLabel}>MEMBERS</Text>
        </View>
        {membersQ.isLoading ? (
          <Card padding={spacing.base}>
            <Skeleton height={36} />
            <Skeleton height={36} style={{ marginTop: spacing.sm }} />
          </Card>
        ) : (
          <Card padding={0}>
            {(membersQ.data ?? []).map((m, i) => (
              <View key={m.id}>
                {renamingMemberId === m.id ? (
                  <View style={styles.renameRow}>
                    <Avatar name={m.display_name} size={32} />
                    <AppTextInput
                      value={renamingValue}
                      onChangeText={setRenamingValue}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => submitRenameMember(m.id, m.display_name)}
                      containerStyle={{ flex: 1 }}
                    />
                    <AppButton
                      title="Save"
                      onPress={() => submitRenameMember(m.id, m.display_name)}
                      isLoading={renameMemberMutation.isPending}
                      style={styles.renameSaveBtn}
                    />
                    <Text
                      style={styles.renameCancelBtn}
                      onPress={() => setRenamingMemberId(null)}
                    >
                      Cancel
                    </Text>
                  </View>
                ) : (
                  <ListItem
                    left={<Avatar name={m.display_name} size={32} />}
                    title={m.display_name}
                    subtitle={m.role === "owner" ? "Owner" : m.user_id ? "Member" : "Unlinked"}
                    right={
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <Text
                          style={styles.renameBtn}
                          onPress={() => startRenameMember(m.id, m.display_name)}
                        >
                          Rename
                        </Text>
                        {isOwner && m.role !== "owner" && m.user_id && (
                          <Text
                            style={styles.transferBtn}
                            onPress={() => confirmTransferOwnership(m.id, m.display_name)}
                          >
                            Make owner
                          </Text>
                        )}
                        {m.role !== "owner" && (
                          <Text
                            style={styles.removeBtn}
                            onPress={() => confirmDeleteMember(m.id, m.display_name)}
                          >
                            Remove
                          </Text>
                        )}
                      </View>
                    }
                  />
                )}
                {i < (membersQ.data ?? []).length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </Card>
        )}

        {/* Add member */}
        <View style={[styles.sectionLabelRow, { marginTop: spacing.base }]}>
          <View style={styles.sectionLabelInner}>
            <Ionicons name="person-add-outline" size={12} color={colors.gray400} />
            <Text style={styles.sectionLabel}>ADD MEMBER</Text>
          </View>
          <TouchableOpacity onPress={() => { setBatchMode((v) => !v); setNewMemberName(""); }}>
            <Text style={styles.batchToggle}>{batchMode ? "Single" : "Multiple"}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <AppTextInput
              value={newMemberName}
              onChangeText={setNewMemberName}
              placeholder={batchMode ? "Alice, Bob, Carol…" : "Member name"}
              returnKeyType="done"
              onSubmitEditing={handleAddMember}
              multiline={batchMode}
            />
          </View>
          <AppButton
            title="Add"
            onPress={handleAddMember}
            isLoading={addMember.isPending || addMembersBatch.isPending}
            disabled={!newMemberName.trim()}
          />
        </View>
        {batchMode && (
          <Text style={styles.batchHint}>Separate names with commas</Text>
        )}

        {/* Leave group (non-owners only) */}
        {!isOwner && (
          <AppButton
            title="Leave Group"
            variant="secondary"
            onPress={confirmLeaveGroup}
            isLoading={leaveGroupMutation.isPending}
            style={{ marginTop: spacing["2xl"] }}
          />
        )}

        {/* Archive group (owner only) */}
        {isOwner && (
          <AppButton
            title="Archive Group"
            variant="danger"
            onPress={confirmArchiveGroup}
            isLoading={archiveGroupMutation.isPending}
            style={{ marginTop: spacing["2xl"] }}
          />
        )}
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
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm, justifyContent: "space-between" },
  sectionLabelInner: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  batchToggle: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold },
  batchHint: { fontSize: fontSize.xs, color: colors.gray400, marginTop: spacing.xs },
  removeBtn: { fontSize: fontSize.sm, color: colors.danger, fontWeight: fontWeight.medium },
  renameBtn: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
  transferBtn: { fontSize: fontSize.sm, color: colors.warning, fontWeight: fontWeight.medium },
  renameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  renameSaveBtn: { height: 36, paddingHorizontal: spacing.sm },
  renameCancelBtn: { fontSize: fontSize.sm, color: colors.gray500 },
});
