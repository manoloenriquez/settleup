import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useDeleteGroup } from "@/hooks/useGroups";
import { useAddMember, useMembers, useDeleteMember } from "@/hooks/useMembers";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { Card, ListItem, Avatar } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

export default function GroupSettingsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [newMemberName, setNewMemberName] = useState("");

  const membersQ = useMembers(groupId);
  const addMember = useAddMember(groupId);
  const deleteMember = useDeleteMember(groupId);
  const deleteGroup = useDeleteGroup();

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
        <Text style={styles.sectionLabel}>MEMBERS</Text>
        <Card padding={0}>
          {(membersQ.data ?? []).map((m, i) => (
            <View key={m.id}>
              <ListItem
                left={<Avatar name={m.display_name} size={32} />}
                title={m.display_name}
                right={
                  <Text
                    style={styles.removeBtn}
                    onPress={() => confirmDeleteMember(m.id, m.display_name)}
                  >
                    Remove
                  </Text>
                }
              />
              {i < (membersQ.data ?? []).length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>

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
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8, marginBottom: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.base },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  removeBtn: { fontSize: fontSize.sm, color: colors.danger, fontWeight: fontWeight.medium },
});
