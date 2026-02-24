import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ groupId: string }>;
};

export default async function GroupSettingsPage({ params }: Props): Promise<React.ReactElement> {
  const { groupId } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .schema("settleup")
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .single();

  if (!group) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href={`/groups/${groupId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← {group.name}
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-700">Payment Details</h2>
        <p className="text-sm text-slate-500">
          Payment details are now shared across all your groups.
        </p>
        <Link
          href="/account/payment"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Manage payment details →
        </Link>
      </div>
    </div>
  );
}
