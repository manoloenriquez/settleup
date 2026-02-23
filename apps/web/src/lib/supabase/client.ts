"use client";

import { createBrowserClient } from "@template/supabase";

// Singleton browser client — safe to call multiple times
export const supabase = createBrowserClient();
