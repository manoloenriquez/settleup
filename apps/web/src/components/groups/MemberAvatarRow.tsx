"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ContentDialog } from "@/components/ui/ContentDialog";
import { AddMemberForm } from "./AddMemberForm";
import type { GroupMember } from "@template/supabase";

type Props = {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Horizontal row of member avatars with a trailing dashed "+ Add" circle,
 * per the mockup's group-details header.
 */
export function MemberAvatarRow({ groupId, members, currentUserId }: Props): React.ReactElement {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {members.map((member) => {
          const isYou = member.user_id === currentUserId;
          return (
            <div key={member.id} className="flex w-14 shrink-0 flex-col items-center gap-1.5">
              <span className={`rounded-full p-0.5 ring-2 ${isYou ? "ring-brand-500" : "ring-slate-200"}`}>
                <Avatar name={member.display_name} size="lg" />
              </span>
              <span className="max-w-full truncate text-xs font-medium text-slate-600">
                {isYou ? "You" : firstName(member.display_name)}
              </span>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex w-14 shrink-0 flex-col items-center gap-1.5"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-brand-400 hover:text-brand-600">
            <Plus size={20} />
          </span>
          <span className="text-xs font-medium text-slate-500">Add</span>
        </button>
      </div>

      <ContentDialog open={showAdd} onClose={() => setShowAdd(false)} title="Add members">
        <AddMemberForm groupId={groupId} />
      </ContentDialog>
    </>
  );
}
