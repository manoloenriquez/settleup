import { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  TextInput,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import type { Group } from "@template/supabase";
import { supabase } from "@/lib/supabase";

export default function GroupsScreen(): React.ReactElement {
  const { session } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fetchGroups = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .schema("settleup")
      .from("groups")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    if (error) Alert.alert("Error", error.message);
    else setGroups(data ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  async function handleCreate() {
    if (!newName.trim() || !session) return;
    setCreating(true);
    const { data, error } = await supabase
      .schema("settleup")
      .from("groups")
      .insert({ name: newName.trim(), owner_user_id: session.user.id })
      .select()
      .single();

    if (error) {
      Alert.alert("Error", error.message);
    } else if (data) {
      setNewName("");
      setShowForm(false);
      await fetchGroups();
      router.push(`/groups/${data.id}`);
    }
    setCreating(false);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Groups" }} />
      <View style={styles.container}>
        {showForm ? (
          <View style={styles.formCard}>
            <Text style={styles.label}>Group name</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Barkada Trip 2025"
              autoFocus
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.primary]}
                onPress={handleCreate}
                disabled={creating}
              >
                <Text style={styles.primaryText}>{creating ? "Creating…" : "Create"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.secondary]}
                onPress={() => setShowForm(false)}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.btn, styles.primary, styles.newBtn]}
            onPress={() => setShowForm(true)}
          >
            <Text style={styles.primaryText}>+ New Group</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No groups yet.</Text>
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/groups/${item.id}`)}
              >
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16 },
  list: { gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  cardSub: { fontSize: 12, color: "#9ca3af", marginTop: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#9ca3af", fontSize: 15 },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
    marginBottom: 16,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
  },
  row: { flexDirection: "row", gap: 10 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: "#6366f1", flex: 1 },
  secondary: { backgroundColor: "#f1f5f9", flex: 1 },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  secondaryText: { color: "#374151", fontWeight: "600", fontSize: 14 },
  newBtn: { marginBottom: 16 },
});
