import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentProfile } from "@/app/actions/payment-profiles";
import { PaymentProfileForm } from "@/components/groups/PaymentProfileForm";

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

  const profileResult = await getPaymentProfile(groupId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href={`/groups/${groupId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← {group.name}
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold text-slate-900">Payment Settings</h1>
      </div>

      {profileResult.error && (
        <p className="text-sm text-red-600">{profileResult.error}</p>
      )}

      <PaymentProfileForm groupId={groupId} initial={profileResult.data ?? null} />
    </div>
  );
}
