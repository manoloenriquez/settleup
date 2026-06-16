import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GroupWithStats } from "@template/shared";
import { useCreateGroup } from "@/hooks/useGroups";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { AppButton, useToast } from "@/components/ui";

type GroupPickerProps = {
  groups: GroupWithStats[];
  isLoading: boolean;
  onSelect: (groupId: string) => void;
  onBack: () => void;
};

export function GroupPicker({ groups, isLoading, onSelect, onBack }: GroupPickerProps): React.ReactElement {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const createGroup = useCreateGroup();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  async function handleCreate(): Promise<void> {
    const name = newName.trim();
    if (!name) return;

    const result = await createGroup.mutateAsync(name);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.data) {
      setNewName("");
      setCreating(false);
      onSelect(result.data.id);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Choose Group</Text>
      </View>

      {/* Search */}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search groups..."
        placeholderTextColor={colors.gray400}
        style={styles.searchInput}
        clearButtonMode="while-editing"
      />

      {/* Create new group */}
      {creating ? (
        <View style={styles.createForm}>
          <TextInput
            style={styles.createInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Group name"
            placeholderTextColor={colors.gray400}
            autoFocus
            onSubmitEditing={() => void handleCreate()}
            returnKeyType="done"
          />
          <View style={styles.createActions}>
            <TouchableOpacity
              onPress={() => { setCreating(false); setNewName(""); }}
              style={styles.cancelBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <AppButton
                title="Create & Select"
                onPress={() => void handleCreate()}
                isLoading={createGroup.isPending}
                disabled={!newName.trim()}
              />
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreating(true)} activeOpacity={0.7}>
          <View style={styles.createIconWrap}>
            <Ionicons name="add" size={20} color={colors.primary} />
          </View>
          <Text style={styles.createBtnText}>Create New Group</Text>
        </TouchableOpacity>
      )}

      {/* Group list */}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={32} color={colors.gray300} />
          <Text style={styles.emptyText}>
            {search.trim() ? `No groups match "${search}"` : "No groups yet"}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filtered.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={styles.card}
              onPress={() => onSelect(group.id)}
              activeOpacity={0.7}
            >
              <View style={styles.cardIconWrap}>
                <Ionicons name="people" size={20} color={colors.primary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName} numberOfLines={1}>{group.name}</Text>
                <Text style={styles.cardMeta}>{group.member_count ?? 0} members</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.gray300} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  backBtn: { padding: spacing.xs },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },

  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.gray900,
  },

  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
  },
  createIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },

  createForm: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.base,
    gap: spacing.sm,
  },
  createInput: {
    backgroundColor: colors.gray50,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.gray900,
  },
  createActions: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  cancelBtn: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  cancelText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray500 },

  loading: { paddingVertical: spacing.xl, alignItems: "center" },
  empty: { paddingVertical: spacing["2xl"], alignItems: "center", gap: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: colors.gray400, textAlign: "center" },

  list: { gap: spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  cardMeta: { fontSize: fontSize.sm, color: colors.gray400, marginTop: 2 },
});
