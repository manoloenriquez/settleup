"use client";

import { Plus } from "lucide-react";

type Props = {
  onClick: () => void;
};

/**
 * Floating add-expense button on the group page (mobile only — the bottom
 * nav is hidden on desktop where the header CTA is visible). Opens the
 * pre-mounted Add Expense dialog directly — no navigation.
 */
export function GroupFab({ onClick }: Props): React.ReactElement {
  return (
    <button
      type="button"
      aria-label="Add expense"
      onClick={onClick}
      className="md:hidden fixed bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/40 transition-transform hover:bg-brand-700 active:scale-95"
    >
      <Plus size={26} />
    </button>
  );
}
