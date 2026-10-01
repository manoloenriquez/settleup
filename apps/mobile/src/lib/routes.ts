/** Canonical in-app destinations, so screens never hard-code tab paths. */
export const ROUTES = {
  home: "/(protected)/(tabs)/home",
  spending: "/(protected)/(tabs)/spending",
  shared: "/(protected)/(tabs)/shared",
  account: "/(protected)/(tabs)/account",
  onboarding: "/onboarding",
  login: "/(auth)/login",
  register: "/(auth)/register",
  newExpense: "/(protected)/expense/new",
  newGroup: "/(protected)/groups/new",
  joinGroup: "/(protected)/join-group",
  activity: "/(protected)/activity",
  addFriend: "/(protected)/friends/add",
} as const;

/**
 * Route segments under (protected) that work without an account. Everything
 * else there (groups, activity, payment details, profile) needs an identity.
 */
export function isGuestAllowed(segments: readonly string[]): boolean {
  if (segments[0] !== "(protected)") return false;
  const section = segments[1];
  if (section === "expense") return true;
  if (section !== "(tabs)") return false;
  const tab = segments[2];
  // Account sub-pages (payment details, edit profile) need an account.
  return tab !== "account" || segments.length <= 3 || segments[3] === "index";
}
