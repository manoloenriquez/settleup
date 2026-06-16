import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useArchiveGroup, useGroups, useRenameGroup, useTransferOwnership } from "@/hooks/useGroups";
import { useAddMember, useAddMembersBatch, useMembers, useDeleteMember, useRenameMember } from "@/hooks/useMembers";
import { useRegenerateInviteCode, useLeaveGroup, usePromoteMember } from "@/hooks/useCollaboration";
import { useRecurringExpenses, useSetRecurringActive, useDeleteRecurringExpense } from "@/hooks/useRecurring";
import { useSetGroupBudget } from "@/hooks/useGroups";
import { shareGroupLedger } from "@/services/export";
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from "@/hooks/useCategories";
import { useAuth } from "@/context/AuthContext";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { Card, ListItem, Avatar, Skeleton, useToast } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";
import { DEFAULT_CATEGORY_COLOR, formatCents, parsePHPAmount } from "@template/shared";

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? "";

export default function GroupSettingsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [newMemberName, setNewMemberName] = useState("");
  const [groupNameInput, setGroupNameInput] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [renamingMemberId, setRenamingMemberId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renamingCategoryName, setRenamingCategoryName] = useState("");

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
  const promoteMemberMutation = usePromoteMember(groupId);
  const categoriesQ = useCategories(groupId);
  const createCategory = useCreateCategory(groupId);
  const updateCategory = useUpdateCategory(groupId);
  const deleteCategory = useDeleteCategory(groupId);
  const recurringQ = useRecurringExpenses(groupId);
  const setRecurringActive = useSetRecurringActive(groupId);
  const deleteRecurring = useDeleteRecurringExpense(groupId);
  const setBudget = useSetGroupBudget();
  const [budgetInput, setBudgetInput] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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
  const isAdmin = currentMember?.role === "admin";
  const isAdminOrOwner = isOwner || isAdmin;

  function handleSaveBudget() {
    const raw = budgetInput ?? "";
    const cents = parsePHPAmount(raw);
    if (!cents || cents <= 0) {
      toast.error("Enter a valid budget amount");
      return;
    }
    setBudget.mutate({ groupId, budgetCents: cents }, {
      onSuccess: (res) => {
        if (res.error) { toast.error(res.error); return; }
        setBudgetInput(null);
        toast.success("Budget saved");
      },
    });
  }

  function handleRemoveBudget() {
    setBudget.mutate({ groupId, budgetCents: null }, {
      onSuccess: (res) => {
        if (res.error) { toast.error(res.error); return; }
        setBudgetInput(null);
        toast.success("Budget removed");
      },
    });
  }

  async function handleExportLedger() {
    setExporting(true);
    const res = await shareGroupLedger(groupId, group?.name ?? "group");
    setExporting(false);
    if (res.error) toast.error(res.error);
  }

  function handleToggleRecurring(id: string, active: boolean) {
    setRecurringActive.mutate({ id, active: !active }, {
      onSuccess: (res) => {
        if (res.error) { toast.error(res.error); return; }
        toast.success(active ? "Recurring expense paused" : "Recurring expense resumed");
      },
    });
  }

  function confirmDeleteRecurring(id: string, name: string) {
    Alert.alert(`Delete "${name}"?`, "Future expenses will no longer be added automatically.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteRecurring.mutate(id, {
          onSuccess: (res) => {
            if (res.error) { toast.error(res.error); return; }
            toast.success("Recurring expense removed");
          },
        }),
      },
    ]);
  }

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
            if (r.error) { toast.error(r.error); return; }
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
    if (r.error) { toast.error(r.error); return; }
    setGroupNameInput(null); // reset local state; query will refresh
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleCopyInviteCode() {
    if (!group?.invite_code) return;
    await Clipboard.setStringAsync(group.invite_code);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toast.success("Invite code copied to clipboard");
  }

  async function handleCopyInviteLink() {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toast.success("Invite link copied to clipboard");
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
            if (r.error) { toast.error(r.error); return; }
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
      if (result.error) { toast.error(result.error); return; }
      setNewMemberName("");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      const result = await addMember.mutateAsync(newMemberName.trim());
      if (result.error) { toast.error(result.error); return; }
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
            if (r.error) { toast.error(r.error); return; }
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
      toast.error(r.error);
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

  function handlePromoteMember(memberId: string, memberName: string, newRole: "admin" | "member") {
    const label = newRole === "admin" ? "Make admin" : "Remove admin";
    Alert.alert(
      `${label}?`,
      newRole === "admin"
        ? `${memberName} will be able to manage members and invite codes.`
        : `${memberName} will become a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: label,
          onPress: async () => {
            const r = await promoteMemberMutation.mutateAsync({ memberId, role: newRole });
            if (r.error) { toast.error(r.error); return; }
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const result = await createCategory.mutateAsync({ name, color: newCategoryColor });
    if (result.error) { toast.error(result.error); return; }
    setNewCategoryName("");
    setNewCategoryColor(DEFAULT_CATEGORY_COLOR);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function startRenameCategory(categoryId: string, currentName: string) {
    setRenamingCategoryId(categoryId);
    setRenamingCategoryName(currentName);
  }

  function nextCategoryColor(current: string): string {
    const palette = [DEFAULT_CATEGORY_COLOR, "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
    const index = palette.indexOf(current);
    return palette[(index + 1) % palette.length] ?? palette[0]!;
  }

  async function handleUpdateCategory(category: {
    id: string;
    name: string;
    icon: string;
    color: string;
    sort_order: number;
  }, sortOrder = category.sort_order, color = category.color) {
    const name = renamingCategoryId === category.id ? renamingCategoryName.trim() : category.name;
    if (!name) {
      setRenamingCategoryId(null);
      return;
    }
    const result = await updateCategory.mutateAsync({
      categoryId: category.id,
      name,
      icon: category.icon,
      color,
      sortOrder,
    });
    if (result.error) { toast.error(result.error); return; }
    setRenamingCategoryId(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function confirmDeleteCategory(categoryId: string, name: string) {
    Alert.alert(`Delete ${name}?`, "Existing expenses will move to Other.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteCategory.mutate(categoryId) },
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
          if (r.error) { toast.error(r.error); return; }
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
              {isAdminOrOwner && (
                <AppButton
                  title="Regenerate Code"
                  variant="secondary"
                  onPress={handleRegenerateCode}
                  isLoading={regenerateCode.isPending}
                  style={{ marginTop: spacing.sm }}
                />
              )}
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
                    title={`${m.display_name}${m.user_id === user?.id ? " (you)" : ""}`}
                    subtitle={m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : m.user_id ? "Member" : "Unlinked"}
                    right={
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        {(isAdminOrOwner || m.user_id === user?.id) && (
                          <Text
                            style={styles.renameBtn}
                            onPress={() => startRenameMember(m.id, m.display_name)}
                          >
                            Rename
                          </Text>
                        )}
                        {/* Owner-only: promote/demote admin */}
                        {isOwner && m.role !== "owner" && m.user_id && m.user_id !== user?.id && (
                          <Text
                            style={styles.adminBtn}
                            onPress={() => handlePromoteMember(m.id, m.display_name, m.role === "admin" ? "member" : "admin")}
                          >
                            {m.role === "admin" ? "Remove admin" : "Make admin"}
                          </Text>
                        )}
                        {isOwner && m.role !== "owner" && m.user_id && (
                          <Text
                            style={styles.transferBtn}
                            onPress={() => confirmTransferOwnership(m.id, m.display_name)}
                          >
                            Make owner
                          </Text>
                        )}
                        {isAdminOrOwner && m.role !== "owner" && m.user_id !== user?.id && (
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

        {/* Categories */}
        <View style={[styles.sectionLabelRow, { marginTop: spacing.lg }]}>
          <Ionicons name="pricetags-outline" size={12} color={colors.gray400} />
          <Text style={styles.sectionLabel}>CATEGORIES</Text>
        </View>
        <Card padding={0}>
          {(categoriesQ.data ?? []).map((category, i) => (
            <View key={category.id}>
              {renamingCategoryId === category.id ? (
                <View style={styles.renameRow}>
                  <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                  <AppTextInput
                    value={renamingCategoryName}
                    onChangeText={setRenamingCategoryName}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => handleUpdateCategory(category)}
                    containerStyle={{ flex: 1 }}
                  />
                  <AppButton title="Save" onPress={() => handleUpdateCategory(category)} isLoading={updateCategory.isPending} style={styles.renameSaveBtn} />
                  <Text style={styles.renameCancelBtn} onPress={() => setRenamingCategoryId(null)}>Cancel</Text>
                </View>
              ) : (
                <ListItem
                  left={<View style={[styles.categoryDot, { backgroundColor: category.color }]} />}
                  title={category.name}
                  subtitle={category.is_default ? "Default" : "Custom"}
                  right={
                    !category.is_default && isAdminOrOwner ? (
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <Text style={styles.renameBtn} onPress={() => handleUpdateCategory(category, category.sort_order - 15)}>Up</Text>
                        <Text style={styles.renameBtn} onPress={() => handleUpdateCategory(category, category.sort_order + 15)}>Down</Text>
                        <Text style={styles.renameBtn} onPress={() => handleUpdateCategory(category, category.sort_order, nextCategoryColor(category.color))}>Color</Text>
                        <Text style={styles.renameBtn} onPress={() => startRenameCategory(category.id, category.name)}>Rename</Text>
                        <Text style={styles.removeBtn} onPress={() => confirmDeleteCategory(category.id, category.name)}>Delete</Text>
                      </View>
                    ) : null
                  }
                />
              )}
              {i < (categoriesQ.data ?? []).length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>
        {isAdminOrOwner && (
          <View style={[styles.addRow, { marginTop: spacing.sm }]}>
            <View style={{ flex: 1 }}>
              <AppTextInput
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="New category"
                returnKeyType="done"
                onSubmitEditing={handleCreateCategory}
              />
            </View>
            <TouchableOpacity
              style={[styles.colorSwatch, { backgroundColor: newCategoryColor }]}
              onPress={() => setNewCategoryColor(nextCategoryColor(newCategoryColor))}
            />
            <AppButton title="Add" onPress={handleCreateCategory} isLoading={createCategory.isPending} disabled={!newCategoryName.trim()} />
          </View>
        )}

        {/* Budget */}
        {isAdminOrOwner && (
          <>
            <View style={[styles.sectionLabelRow, { marginTop: spacing.lg }]}>
              <Ionicons name="wallet-outline" size={12} color={colors.gray400} />
              <Text style={styles.sectionLabel}>BUDGET</Text>
            </View>
            <View style={styles.addRow}>
              <View style={{ flex: 1 }}>
                <AppTextInput
                  value={budgetInput ?? (group?.budget_cents ? String(group.budget_cents / 100) : "")}
                  onChangeText={setBudgetInput}
                  placeholder="e.g. 30000"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveBudget}
                />
              </View>
              <AppButton title="Save" onPress={handleSaveBudget} isLoading={setBudget.isPending} />
              {group?.budget_cents != null && (
                <AppButton title="Remove" variant="secondary" onPress={handleRemoveBudget} disabled={setBudget.isPending} />
              )}
            </View>
            <Text style={styles.batchHint}>Optional spending cap shown on the group page.</Text>
          </>
        )}

        {/* Recurring expenses */}
        <View style={[styles.sectionLabelRow, { marginTop: spacing.lg }]}>
          <Ionicons name="repeat-outline" size={12} color={colors.gray400} />
          <Text style={styles.sectionLabel}>RECURRING EXPENSES</Text>
        </View>
        {(recurringQ.data ?? []).length === 0 ? (
          <Text style={styles.batchHint}>
            None yet — create one from Add Expense, Detailed mode, "Repeats".
          </Text>
        ) : (
          <Card padding={0}>
            {(recurringQ.data ?? []).map((item, i) => (
              <View key={item.id}>
                <ListItem
                  title={`${item.item_name} · ${formatCents(item.amount_cents)}`}
                  subtitle={`${item.cadence === "weekly" ? "Weekly" : "Monthly"}${item.payers && item.payers.length > 1 ? ` · ${item.payers.length} payers` : ""} · next ${item.next_run_at}${item.active ? "" : " · paused"}`}
                  right={
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <Text style={styles.renameBtn} onPress={() => handleToggleRecurring(item.id, item.active)}>
                        {item.active ? "Pause" : "Resume"}
                      </Text>
                      <Text style={styles.removeBtn} onPress={() => confirmDeleteRecurring(item.id, item.item_name)}>
                        Delete
                      </Text>
                    </View>
                  }
                />
                {i < (recurringQ.data ?? []).length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </Card>
        )}

        {/* Export */}
        <View style={[styles.sectionLabelRow, { marginTop: spacing.lg }]}>
          <Ionicons name="download-outline" size={12} color={colors.gray400} />
          <Text style={styles.sectionLabel}>EXPORT</Text>
        </View>
        <AppButton
          title="Share Ledger (CSV)"
          variant="secondary"
          onPress={() => void handleExportLedger()}
          isLoading={exporting}
        />
        <Text style={styles.batchHint}>Full expense and payment history as a spreadsheet.</Text>

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
  adminBtn: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
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
  categoryDot: { width: 14, height: 14, borderRadius: 7 },
  colorSwatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.surface },
});
