import { Platform } from "react-native";
import { createTracker, type Tracker } from "@template/shared";
import { supabase } from "@/lib/supabase";

/**
 * Product event tracker for the native app. Inserts under the signed-in
 * session's RLS; the database allowlists names and properties. Never throws,
 * never blocks; events emitted while offline or signed out are dropped.
 */
export const track: Tracker = createTracker(
  {
    async record({ name, properties, platform }) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) return;
      await supabase
        .schema("settleup")
        .from("product_events")
        .insert({ event_name: name, user_id: userId, platform, properties });
    },
  },
  Platform.OS === "ios" ? "ios" : "android",
);
