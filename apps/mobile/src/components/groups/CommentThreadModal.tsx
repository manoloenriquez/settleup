import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, AppButton, useToast } from "@/components/ui";
import { AppTextInput } from "@/components/ui/TextInput";
import { useAddExpenseComment, useDeleteExpenseComment, useExpenseComments } from "@/hooks/useComments";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type MemberInfo = {
  display_name: string;
  user_id: string | null;
};

type Props = {
  expenseId: string | null;
  /** Enables offline comment queueing (outbox entries are grouped by group). */
  groupId?: string;
  expenseName: string;
  members: MemberInfo[];
  currentUserId: string | undefined;
  onClose: () => void;
};

function relativeTime(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export function CommentThreadModal({ expenseId, groupId, expenseName, members, currentUserId, onClose }: Props): React.ReactElement {
  const toast = useToast();
  const [body, setBody] = useState("");
  const commentsQ = useExpenseComments(expenseId);
  const addComment = useAddExpenseComment(expenseId, groupId);
  const deleteComment = useDeleteExpenseComment(expenseId);

  const nameByUserId = new Map(
    members.filter((m) => m.user_id !== null).map((m) => [m.user_id as string, m.display_name]),
  );

  function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || !currentUserId) return;
    addComment.mutate(
      { authorUserId: currentUserId, body: trimmed },
      {
        onSuccess: (res) => {
          if (res.error) {
            toast.error(res.error);
            return;
          }
          setBody("");
        },
      },
    );
  }

  return (
    <Modal visible={expenseId !== null} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              Comments · {expenseName}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close comments">
              <Ionicons name="close" size={22} color={colors.gray600} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {commentsQ.isLoading && <Text style={styles.empty}>Loading…</Text>}
            {!commentsQ.isLoading && (commentsQ.data ?? []).length === 0 && (
              <Text style={styles.empty}>No comments yet. Start the conversation.</Text>
            )}
            {(commentsQ.data ?? []).map((comment) => {
              const authorName = nameByUserId.get(comment.author_user_id) ?? "Member";
              return (
                <View key={comment.id} style={styles.commentRow}>
                  <Avatar name={authorName} size={28} />
                  <View style={styles.commentBody}>
                    <Text style={styles.commentMeta}>
                      <Text style={styles.commentAuthor}>{authorName}</Text>
                      {"  "}
                      {relativeTime(comment.created_at)}
                    </Text>
                    <Text style={styles.commentText}>{comment.body}</Text>
                  </View>
                  {comment.author_user_id === currentUserId && (
                    <TouchableOpacity
                      onPress={() =>
                        deleteComment.mutate(comment.id, {
                          onSuccess: (res) => {
                            if (res.error) toast.error(res.error);
                          },
                        })
                      }
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Delete comment"
                    >
                      <Ionicons name="trash-outline" size={15} color={colors.gray400} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <AppTextInput
                value={body}
                onChangeText={setBody}
                placeholder="Add a comment…"
                returnKeyType="send"
                onSubmitEditing={handleSend}
                maxLength={500}
              />
            </View>
            <AppButton title="Send" onPress={handleSend} isLoading={addComment.isPending} disabled={!body.trim()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: "75%",
    paddingBottom: spacing["2xl"],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900, marginRight: spacing.sm },
  list: { maxHeight: 320 },
  listContent: { padding: spacing.base, gap: spacing.md },
  empty: { fontSize: fontSize.sm, color: colors.gray400, textAlign: "center", paddingVertical: spacing.lg },
  commentRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  commentBody: { flex: 1, gap: 2 },
  commentMeta: { fontSize: fontSize.xs, color: colors.gray400 },
  commentAuthor: { fontWeight: fontWeight.semibold, color: colors.gray700 },
  commentText: { fontSize: fontSize.base, color: colors.gray800 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.sm },
});
