import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatAmount, type AnswerCard, type AssistantRoute, type ClarifyChoice } from "@template/shared";
import type { UiMessage } from "@/hooks/useAssistant";
import { borderRadius, colors, fontSize, fontWeight, spacing } from "@/theme";

type Props = {
  message: UiMessage;
  onChoose: (choice: ClarifyChoice) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onOpen: (route: AssistantRoute) => void;
  disabled: boolean;
};

export function AssistantMessage({ message, onChoose, onConfirm, onCancel, onUndo, onOpen, disabled }: Props) {
  if (message.role === "user") {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText} selectable>
            {message.text}
          </Text>
          {message.note ? <Text style={styles.userNote}>{message.note}</Text> : null}
        </View>
      </View>
    );
  }
  const plan = message.plan;
  return (
    <View style={styles.assistantRow}>
      {message.result && !plan ? <ResultLine result={message.result} /> : <Text style={styles.assistantText} selectable>{message.text}</Text>}
      {message.restored && message.note ? <Text style={styles.note}>{message.note}</Text> : null}
      {plan?.kind === "answer" && plan.card ? <AnswerCardView card={plan.card} /> : null}
      {plan?.kind === "clarify" && plan.choices.length > 0 ? (
        <View style={styles.choices}>
          {plan.choices.map((choice) => (
            <Pressable
              key={choice.label}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => onChoose(choice)}
              style={({ pressed }) => [styles.choice, pressed && styles.pressed, disabled && styles.dim]}
            >
              <Text style={styles.choiceText}>{choice.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {(plan?.kind === "navigate" || (plan?.kind === "refuse" && plan.route)) && (
        <Pressable
          accessibilityRole="link"
          onPress={() => onOpen((plan as { route: AssistantRoute }).route)}
          style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>{plan.kind === "navigate" ? "Open" : "Go there"}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>
      )}
      {plan?.kind === "propose" ? (
        <ProposalCard message={message} onConfirm={onConfirm} onCancel={onCancel} onUndo={onUndo} onOpen={onOpen} />
      ) : null}
    </View>
  );
}

function ResultLine({ result }: { result: NonNullable<UiMessage["result"]> }) {
  const icon = result.status === "saved" ? "checkmark-circle" : result.status === "queued" ? "cloud-offline" : "alert-circle";
  const color = result.status === "saved" ? colors.success : result.status === "queued" ? colors.warning : colors.danger;
  return (
    <View style={styles.resultRow} accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.resultText}>{result.message}</Text>
    </View>
  );
}

function ProposalCard({
  message,
  onConfirm,
  onCancel,
  onUndo,
  onOpen,
}: Pick<Props, "message" | "onConfirm" | "onCancel" | "onUndo" | "onOpen">) {
  if (message.plan?.kind !== "propose") return null;
  const { proposal } = message.plan;
  const state = message.proposalState ?? "open";
  const destructive = proposal.action.type === "delete_group_expense" || proposal.action.type === "remove_member";
  return (
    <View style={[styles.card, proposal.risk === "consequential" && styles.cardConsequential]} accessibilityLabel={`${proposal.title}. ${proposal.lines.map((l) => `${l.label}: ${l.before ? `from ${l.before} to ` : ""}${l.value}`).join(". ")}`}>
      <View style={styles.cardHeader}>
        <Ionicons name={destructive ? "trash-outline" : "create-outline"} size={16} color={destructive ? colors.danger : colors.primary} />
        <Text style={styles.cardTitle}>{proposal.title}</Text>
        <Text style={styles.cardBadge}>{badge(state, message.result?.status)}</Text>
      </View>
      {proposal.lines.map((line) => (
        <View key={line.label} style={styles.line}>
          <Text style={styles.lineLabel}>{line.label}</Text>
          <View style={styles.lineValues}>
            {line.before ? <Text style={styles.lineBefore}>{line.before}</Text> : null}
            <Text style={[styles.lineValue, line.label === "Note" && styles.lineNote]}>{line.value}</Text>
          </View>
        </View>
      ))}
      {state === "open" ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Saves this change"
            onPress={onConfirm}
            style={({ pressed }) => [styles.primaryButton, destructive && styles.destructiveButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{destructive ? (proposal.action.type === "remove_member" ? "Remove" : "Delete") : "Confirm"}</Text>
          </Pressable>
        </View>
      ) : null}
      {state === "running" ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}
      {state === "cancelled" ? <Text style={styles.stateText}>Cancelled — nothing was saved.</Text> : null}
      {state === "replaced" ? <Text style={styles.stateText}>Replaced by a newer request — nothing was saved.</Text> : null}
      {state === "done" && message.result ? (
        <View style={styles.resultBlock}>
          <ResultLine result={message.result} />
          <View style={styles.resultActions}>
            {message.result.undo && !message.undone ? (
              <Pressable accessibilityRole="button" onPress={onUndo} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
                <Text style={styles.smallButtonText}>Undo</Text>
              </Pressable>
            ) : null}
            {message.result.groupId && message.result.status !== "failed" ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => onOpen({ screen: "group", groupId: message.result!.groupId! })}
                style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
              >
                <Text style={styles.smallButtonText}>View group</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function badge(state: string, status: string | undefined): string {
  if (state === "done") return status === "saved" ? "Saved" : status === "queued" ? "Waiting to sync" : "Not saved";
  if (state === "running") return "Saving…";
  if (state === "cancelled" || state === "replaced") return "Not saved";
  return "Not saved yet";
}

function AnswerCardView({ card }: { card: AnswerCard }) {
  if (card.rows.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{card.title}</Text>
      {card.rows.map((row, index) => (
        <View key={`${row.label}-${index}`} style={styles.answerRow}>
          <View style={styles.answerLabel}>
            <Text style={styles.answerMain} numberOfLines={2}>
              {row.label}
            </Text>
            {"sub" in row && row.sub ? <Text style={styles.answerSub}>{row.sub}</Text> : null}
          </View>
          <Text style={styles.answerAmount}>{formatAmount(row.amountMinor, row.currency)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: "flex-end", marginVertical: spacing.xs },
  userBubble: {
    maxWidth: "85%",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  userText: { color: colors.white, fontSize: fontSize.md },
  userNote: { color: colors.white, opacity: 0.85, fontSize: fontSize.xs, marginTop: 2 },
  assistantRow: { alignItems: "flex-start", marginVertical: spacing.xs, gap: spacing.sm, maxWidth: "100%" },
  assistantText: { color: colors.gray900, fontSize: fontSize.md, lineHeight: 22 },
  note: { color: colors.gray500, fontSize: fontSize.sm },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryTint,
  },
  choiceText: { color: colors.primaryDark, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  linkButton: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 2 },
  linkText: { color: colors.primary, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardConsequential: { borderColor: colors.warning },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  cardBadge: { fontSize: fontSize.xs, color: colors.gray500 },
  line: { flexDirection: "row", gap: spacing.sm },
  lineLabel: { width: 92, fontSize: fontSize.sm, color: colors.gray500 },
  lineValues: { flex: 1 },
  lineBefore: { fontSize: fontSize.sm, color: colors.gray500, textDecorationLine: "line-through" },
  lineValue: { fontSize: fontSize.sm, color: colors.gray900 },
  lineNote: { color: colors.warningDark },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  destructiveButton: { backgroundColor: colors.danger },
  primaryText: { color: colors.white, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.gray700, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  spinner: { marginVertical: spacing.sm },
  stateText: { fontSize: fontSize.sm, color: colors.gray500 },
  resultBlock: { gap: spacing.sm },
  resultRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  resultText: { flex: 1, fontSize: fontSize.sm, color: colors.gray800 },
  resultActions: { flexDirection: "row", gap: spacing.sm },
  smallButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButtonText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },
  answerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 36 },
  answerLabel: { flex: 1 },
  answerMain: { fontSize: fontSize.sm, color: colors.gray900 },
  answerSub: { fontSize: fontSize.xs, color: colors.gray500 },
  answerAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray900, fontVariant: ["tabular-nums"] },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.5 },
});
