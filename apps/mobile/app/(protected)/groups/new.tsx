import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCreateGroup } from "@/hooks/useGroups";
import { AppButton } from "@/components/ui/Button";
import { AppTextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

export default function NewGroupScreen() {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const createGroup = useCreateGroup();

  async function handleCreate() {
    if (!name.trim()) return;

    const result = await createGroup.mutateAsync(name.trim());
    if (result.error) {
      toast.error(result.error);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!result.data) {
      toast.error("Group data was not returned.");
      return;
    }

    router.replace(`/(protected)/groups/${result.data.id}`);
  }

  return (
    <>
      <Stack.Screen options={{ title: "New Group", headerShown: true }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Create a Group</Text>
          <Text style={styles.sub}>
            Give your group a name — like "Barkada Trip" or "House Expenses".
          </Text>

          <View style={styles.form}>
            <AppTextInput
              label="Group Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Barkada Trip 2025"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />

            <AppButton
              title={createGroup.isPending ? "Creating…" : "Create Group"}
              onPress={handleCreate}
              isLoading={createGroup.isPending}
              disabled={!name.trim() || createGroup.isPending}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingTop: spacing.xl },
  heading: { fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: colors.gray900 },
  sub: { fontSize: fontSize.base, color: colors.gray500, marginTop: spacing.xs, marginBottom: spacing.xl, lineHeight: 22 },
  form: { gap: spacing.md },
});
