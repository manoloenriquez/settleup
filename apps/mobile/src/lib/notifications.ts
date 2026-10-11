/**
 * Push notification payload handling. Kept free of React Native imports so
 * the routing rules can be unit-tested.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Destination for a tapped notification. The database sends `data.route`
 * so it can retarget without a client release; only routes this build knows
 * are honoured, and anything else falls back to the group screen.
 */
export function notificationGroupRoute(data: Record<string, unknown>): string | null {
  const groupId = data["group_id"];
  if (typeof groupId !== "string" || !UUID_PATTERN.test(groupId)) return null;
  const route = data["route"];
  if (typeof route === "string" && route === `/groups/${groupId}`) return route;
  return `/groups/${groupId}`;
}
