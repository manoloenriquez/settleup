import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClaimInvitation } from "@/components/groups/ClaimInvitation";

export const metadata = { title: "Personal invitation", robots: { index: false, follow: false } };

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<React.ReactElement> {
  const { token } = await searchParams;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    return (
      <p className="p-8">Invalid invitation. Ask the organizer for a new personal invitation.</p>
    );
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/claim?token=${token}`)}`);
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Join your group</h1>
      <ClaimInvitation token={token} />
    </main>
  );
}
