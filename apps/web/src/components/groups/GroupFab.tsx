"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type Props = {
  groupId: string;
};

/**
 * Floating add-expense button on the group page (mobile only — the bottom
 * nav is hidden on desktop where the header CTA is visible). Deep-links into
 * the Add Expense dialog via the `?add=expense` param handled by GroupHeader.
 */
export function GroupFab({ groupId }: Props): React.ReactElement {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Add expense"
      onClick={() => router.push(`/groups/${groupId}?add=expense`)}
      className="md:hidden fixed bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/40 transition-transform hover:bg-brand-700 active:scale-95"
    >
      <Plus size={26} />
    </button>
  );
}
