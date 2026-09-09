/** A name is a suggestion only. Match a unique exact name; ambiguity requires user input. */
export function resolveExactMember(
  name: string | null,
  members: ReadonlyArray<{ id: string; display_name: string }>,
): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = members.filter(
    (member) => member.display_name.trim().normalize("NFKC").toLocaleLowerCase() === normalized,
  );
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}
