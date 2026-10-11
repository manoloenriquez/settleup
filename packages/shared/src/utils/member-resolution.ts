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

const normalizeName = (name: string): string => name.trim().normalize("NFKC").toLocaleLowerCase();

/**
 * Names typed as "Carla, Dina and Eli" (commas, "and", "&" or new lines) when
 * creating a group. Trims, drops blanks, repeats and anyone already in the
 * group (e.g. your own name), keeps the first spelling, and caps at what the
 * batch insert accepts (50 names, 80 characters each).
 */
export function parsePeopleNames(text: string, alreadyIn: ReadonlyArray<string> = []): string[] {
  const seen = new Set(alreadyIn.map(normalizeName));
  const names: string[] = [];
  for (const raw of text.split(/,|\n|;|&|\band\b/i)) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length === 50) break;
  }
  return names;
}
