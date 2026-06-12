import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

const STORAGE_KEY = "settleup.push_token";

/**
 * Whether this device/build can register for push at all.
 * Requires a physical device and an EAS project id in app config.
 */
export function getPushProjectId(): string | null {
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? null;
  return projectId;
}

export async function getRegisteredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function registerForPush(userId: string): Promise<ApiResponse<string>> {
  if (!Device.isDevice) {
    return { data: null, error: "Push notifications need a physical device." };
  }
  const projectId = getPushProjectId();
  if (!projectId) {
    return {
      data: null,
      error: __DEV__
        ? "No EAS project id configured. Run `eas init` and rebuild to enable push."
        : "Push notifications aren't available in this build.",
    };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    return { data: null, error: "Notification permission was not granted." };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase
      .schema("settleup")
      .from("push_tokens")
      .upsert(
        { user_id: userId, token, platform: Platform.OS === "ios" ? "ios" : "android" },
        { onConflict: "user_id,token" },
      );
    if (error) return { data: null, error: error.message };

    await AsyncStorage.setItem(STORAGE_KEY, token);
    return { data: token, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Failed to register for push." };
  }
}

export async function unregisterFromPush(userId: string): Promise<ApiResponse<null>> {
  const token = await AsyncStorage.getItem(STORAGE_KEY);
  if (token) {
    const { error } = await supabase
      .schema("settleup")
      .from("push_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("token", token);
    if (error) return { data: null, error: error.message };
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
  return { data: null, error: null };
}
