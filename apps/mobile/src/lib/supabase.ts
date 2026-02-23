import { Platform } from "react-native";
import { createMobileClient } from "@template/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * SecureStore adapter — satisfies Supabase's LargeSecureStore interface.
 * Only available on iOS/Android. Falls back to AsyncStorage on web.
 */
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// SecureStore is not available in Expo web builds.
const storage = Platform.OS === "web" ? AsyncStorage : SecureStoreAdapter;

/**
 * Singleton Supabase client for the mobile app.
 * Import this directly — do not call createMobileClient() again elsewhere.
 */
export const supabase = createMobileClient({ storage });
