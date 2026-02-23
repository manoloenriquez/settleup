import { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { createMobileClient } from "@template/supabase";
import { parsePHPAmount, equalSplit } from "@template/shared";
import type { GroupMember } from "@template/supabase";

export default function AddExpenseScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const supabase = createMobileClient();

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [itemName, setItemName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .schema("settleup")
      .from("group_members")
      .select("*")
      .eq("group_id", id)
      .order("created_at");
    if (error) Alert.alert("Error", error.message);
    else {
      const list = data ?? [];
      setMembers(list);
      setSelectedIds(list.map((m) => m.id));
    }
    setLoadingMembers(false);
  }, [id]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  function toggleMember(memberId: string) {
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((x) => x !== memberId) : [...prev, memberId],
    );
  }

  async function handleSave() {
    const amountCents = parsePHPAmount(amountStr);
    if (!itemName.trim()) {
      Alert.alert("Validation", "Enter an item name.");
      return;
    }
    if (!amountCents || amountCents <= 0) {
      Alert.alert("Validation", "Enter a valid amount.");
      return;
    }
    if (selectedIds.length === 0) {
      Alert.alert("Validation", "Select at least one participant.");
      return;
    }
    if (!session) return;

    setSaving(true);

    const { data: expense, error: expenseError } = await supabase
      .schema("settleup")
      .from("expenses")
      .insert({ group_id: id!, item_name: itemName.trim(), amount_cents: amountCents })
      .select()
      .single();

    if (expenseError || !expense) {
      Alert.alert("Error", expenseError?.message ?? "Failed to add expense.");
      setSaving(false);
      return;
    }

    const sortedIds = [...selectedIds].sort();
    const shares = equalSplit(amountCents, sortedIds.length);
    const participantRows = sortedIds.map((member_id, i) => ({
      expense_id: expense.id,
      member_id,
      share_cents: shares[i]!,
    }));

    const { error: participantError } = await supabase
      .schema("settleup")
      .from("expense_participants")
      .insert(participantRows);

    if (participantError) {
      Alert.alert("Error", participantError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: "Add Expense" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>Item name</Text>
          <TextInput
            style={styles.input}
            value={itemName}
            onChangeText={setItemName}
            placeholder="e.g. Wahunori"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Amount (₱)</Text>
          <TextInput
            style={styles.input}
            value={amountStr}
            onChangeText={setAmountStr}
            placeholder="e.g. 8703.39"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Split between</Text>
          {loadingMembers ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.chips}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => toggleMember(m.id)}
                  style={[styles.chip, selectedIds.includes(m.id) && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedIds.includes(m.id) && styles.chipTextSelected,
                    ]}
                  >
                    {m.display_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.primary, saving && styles.disabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.primaryText}>{saving ? "Saving…" : "Add Expense"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  chipSelected: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 13, fontWeight: "500", color: "#374151" },
  chipTextSelected: { color: "#fff" },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primary: { backgroundColor: "#6366f1" },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  disabled: { opacity: 0.6 },
});
