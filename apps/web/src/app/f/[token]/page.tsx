import type { Metadata } from "next";
import { z } from "zod";
import { createAnonClient } from "@template/supabase";
import { createClient } from "@/lib/supabase/server";
import { AcceptFriendForm } from "@/components/friends/AcceptFriendForm";

export const metadata: Metadata = {
  title: "A friend invited you to Talli",
  robots: { index: false, follow: false, nocache: true },
};

const previewSchema = z.object({
  status: z.enum(["open", "used", "expired", "invalid"]),
  inviter_name: z.string().optional(),
});

type Props = { params: Promise<{ token: string }> };

/** Landing page for a friend invite link: who invited you, then accept in the app or here. */
export default async function FriendInvitePage({ params }: Props): Promise<React.ReactElement> {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  let preview: z.infer<typeof previewSchema> = { status: "invalid" };
  if (valid) {
    const { data } = await createAnonClient()
      .schema("settleup")
      .rpc("get_friend_invite_preview", { p_token: token });
    const parsed = previewSchema.safeParse(data);
    if (parsed.success) preview = parsed.data;
  }
  const inviter = preview.inviter_name ?? "Your friend";

  if (preview.status !== "open") {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <h1 className="text-2xl font-semibold">
          {preview.status === "used" ? "This invite was already used" : "This invite isn’t valid anymore"}
        </h1>
        <p className="text-gray-600">
          Invite links work once and expire after 14 days. Ask {inviter} for a new link.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-md space-y-5 p-6">
      <h1 className="text-2xl font-semibold">{inviter} wants to share expenses with you</h1>
      <p className="text-gray-600">
        You’ll get a simple tab between the two of you on Talli: add what either of you paid, see who
        owes whom, and settle up. Only the two of you can see it.
      </p>
      <a
        className="block rounded-md bg-emerald-600 px-4 py-3 text-center font-semibold text-white"
        href={`talli://friend?token=${token}`}
      >
        Open in the Talli app
      </a>
      {user ? (
        <AcceptFriendForm token={token} inviterName={inviter} suggestedName={profile?.full_name ?? ""} />
      ) : (
        <a
          className="block rounded-md border px-4 py-3 text-center font-semibold"
          href={`/login?redirectTo=${encodeURIComponent(`/f/${token}`)}`}
        >
          Sign in on the web instead
        </a>
      )}
    </main>
  );
}
