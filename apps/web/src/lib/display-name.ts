import { getProfile } from "@/lib/supabase/guards";

/** The name a new group shows for its creator: profile name, else the email's local part. */
export async function suggestedDisplayName(): Promise<string> {
  const profile = await getProfile();
  const fullName = profile?.full_name?.trim();
  if (fullName) return fullName.slice(0, 80);
  return (profile?.email?.split("@")[0] ?? "").trim().slice(0, 80);
}
