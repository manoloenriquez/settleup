"use client";

import { createTracker, type Tracker } from "@template/shared";

/**
 * Browser-side product event tracker. Inserts through the signed-in user's
 * Supabase session under RLS; the database allowlists names and properties.
 * Fire-and-forget: never throws, never blocks, drops on failure or when
 * signed out. The client is resolved lazily so importing this module never
 * requires Supabase configuration (component tests render without it).
 */
export const track: Tracker = createTracker(
  {
    async record({ name, properties, platform }) {
      const { supabase } = await import("@/lib/supabase/client");
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
  "web",
);
