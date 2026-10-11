import type { AssistantFocus, AssistantSnapshot } from "./types";

// ---------------------------------------------------------------------------
// The only app data the language model sees: names of groups and people and
// what the conversation is about. No ids, no amounts, no balances — the model
// has nothing to copy money from, and every number must come from the user.
// Capped so instructions + context + 4 turns + schema fit the 4,096-token
// on-device context with room to answer.
// ---------------------------------------------------------------------------

const MAX_GROUPS = 12;
const MAX_MEMBERS = 10;

export function buildModelContext(snapshot: AssistantSnapshot, focus: AssistantFocus): string {
  const lines: string[] = [];
  if (snapshot.isGuest) {
    lines.push("The user has no account: only their own expenses, no groups.");
  } else {
    const groups = snapshot.groups.filter((g) => !g.archived && !g.isDirect).slice(0, MAX_GROUPS);
    const friends = snapshot.groups.filter((g) => !g.archived && g.isDirect && g.friendName).map((g) => g.friendName!);
    if (groups.length) {
      lines.push(
        "Their groups: " +
          groups
            .map((g) => {
              const others = g.members.filter((m) => !m.isMe).map((m) => m.name);
              const shown = others.slice(0, MAX_MEMBERS).join(", ") + (others.length > MAX_MEMBERS ? ", …" : "");
              return `${g.name} (${shown || "just them"})`;
            })
            .join("; ") +
          ".",
      );
    } else {
      lines.push("They have no groups yet.");
    }
    if (friends.length) lines.push(`Friends: ${friends.slice(0, 20).join(", ")}.`);
  }
  const focused = snapshot.groups.find((g) => g.id === focus.groupId);
  if (focused) lines.push(`The conversation is about the group "${focused.isDirect && focused.friendName ? `with ${focused.friendName}` : focused.name}".`);
  const expense = focused?.expenses?.find((e) => e.id === focus.expenseIds[0]);
  if (expense) lines.push(`"That" expense is "${expense.description}" on ${expense.date}.`);
  return lines.join("\n");
}
