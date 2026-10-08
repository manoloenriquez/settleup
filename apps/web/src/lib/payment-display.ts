/**
 * Public pages show account numbers masked ("****1234") unless the owner chose
 * to share them in full. A masked number can't be copied or typed into a
 * banking app, so it is shown as "ending in 1234" with no Copy button.
 */
export function isMaskedNumber(value: string): boolean {
  return value.includes("*");
}

export function maskedNumberLabel(value: string): string {
  return `account ending in ${value.replace(/\*/g, "")}`;
}

/** Details an organizer typed in for someone without an account are labelled as unconfirmed. */
export function organizerNote(
  source: "self" | "organizer" | undefined,
  name: string,
): string | null {
  return source === "organizer"
    ? `Added by the group organizer — not confirmed by ${name}. Check with them before paying.`
    : null;
}
