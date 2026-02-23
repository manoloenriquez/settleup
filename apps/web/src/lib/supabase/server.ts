import { createServerClient } from "@template/supabase";
import { cookies } from "next/headers";

// Call inside Server Components, Route Handlers, and Server Actions
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // setAll called from a Server Component — ignore (read-only context)
      }
    },
  });
}
