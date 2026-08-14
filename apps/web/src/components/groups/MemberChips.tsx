"use client";

import type { GroupMember } from "@template/supabase";

type Props = {
  members: GroupMember[];
  selectedIds: string[];
  onToggle: (memberId: string) => void;
  size?: "sm" | "md";
};

export function MemberChips({ members, selectedIds, onToggle, size = "md" }: Props): React.ReactElement {
  const sizeClasses = size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <div className={`flex flex-wrap ${size === "sm" ? "gap-1.5" : "gap-2"}`}>
      {members.map((member) => (
        <button
          key={member.id}
          type="button"
          onClick={() => onToggle(member.id)}
          className={`rounded-full font-medium border transition-colors ${sizeClasses} ${
            selectedIds.includes(member.id)
              ? "bg-brand-600 text-white border-brand-600"
              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
          }`}
        >
          {member.display_name}
        </button>
      ))}
    </div>
  );
}
