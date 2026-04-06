import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/supabase/guards";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { GroupSettingsClient } from "@/components/groups/GroupSettingsClient";

type Props = {
  params: Promise<{ groupId: string }>;
};

export default async function GroupSettingsPage({ params }: Props): Promise<React.ReactElement> {
  const { groupId } = await params;
  const user = await requireAuth();

  const supabase = await createSettleUpDb();
  const db = supabase.schema("settleup");

  const [{ data: group }, { data: members }] = await Promise.all([
    db
      .from("groups")
      .select("id, name, owner_user_id, invite_code, share_token")
      .eq("id", groupId)
      .single(),
    db
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true }),
  ]);

  if (!group) notFound();

  const isOwner = group.owner_user_id === user.id;
  const currentMember = (members ?? []).find((m) => m.user_id === user.id);
  const isAdmin = currentMember?.role === "admin";
  const isAdminOrOwner = isOwner || isAdmin;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← {group.name}
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      </div>

      <GroupSettingsClient
        group={group}
        members={members ?? []}
        isOwner={isOwner}
        isAdmin={isAdmin}
        isAdminOrOwner={isAdminOrOwner}
        currentUserId={user.id}
      />
    </div>
  );
}
