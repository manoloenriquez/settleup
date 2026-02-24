import Link from "next/link";
import { getPaymentProfile } from "@/app/actions/payment-profiles";
import { PaymentProfileForm } from "@/components/groups/PaymentProfileForm";

export default async function AccountPaymentPage(): Promise<React.ReactElement> {
  const profileResult = await getPaymentProfile();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/groups" className="text-sm text-slate-500 hover:text-slate-700">
          ← Groups
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold text-slate-900">Payment Settings</h1>
      </div>

      <p className="text-sm text-slate-500 max-w-lg">
        These details are shared across all your groups and shown to friends when they view their balance.
      </p>

      {profileResult.error && (
        <p className="text-sm text-red-600">{profileResult.error}</p>
      )}

      <PaymentProfileForm initial={profileResult.data ?? null} />
    </div>
  );
}
