import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The group someone last added a shared expense to, per account, so the add
 * menu can offer "Split with {group}" first. A missing or stale id (group
 * left or archived) is simply not offered.
 */
const key = (userId: string): string => `talli:last-group:v1:${userId}`;

export async function rememberLastGroup(userId: string, groupId: string): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(key(userId), groupId).catch(() => undefined);
}

export async function readLastGroup(userId: string): Promise<string | null> {
  if (!userId) return null;
  return AsyncStorage.getItem(key(userId)).catch(() => null);
}
