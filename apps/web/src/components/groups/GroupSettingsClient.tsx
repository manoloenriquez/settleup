"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addMember, deleteMember } from "@/app/actions/members";
import { deleteGroup } from "@/app/actions/groups";
import { regenerateInviteCode, rotateShareToken } from "@/app/actions/collaboration";
import type { GroupMember } from "@template/supabase";

type GroupRow = {
  id: string;
  name: string;
  owner_user_id: string | null;
  invite_code: string;
  share_token: string;
};

interface Props {
  group: GroupRow;
  members: GroupMember[];
  isOwner: boolean;
  currentUserId: string;
}

export function GroupSettingsClient({
  group,
  members,
  isOwner,
  currentUserId,
}: Props): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [memberList, setMemberList] = useState<GroupMember[]>(members);
  const [inviteCode, setInviteCode] = useState(group.invite_code);
  const [newMemberName, setNewMemberName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteLink = `${origin}/join?code=${inviteCode}`;

  function copyToClipboard(text: string, label: string): void {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }

  function handleAddMember(e: React.FormEvent): void {
    e.preventDefault();
    const name = newMemberName.trim();
    if (!name) return;
    setAddError(null);

    startTransition(async () => {
      const result = await addMember({ group_id: group.id, display_name: name });
      if (result.error) {
        setAddError(result.error);
      } else if (result.data) {
        setMemberList((prev) => [...prev, result.data!]);
        setNewMemberName("");
        toast.success(`${name} added`);
      }
    });
  }

  function handleDeleteMember(member: GroupMember): void {
    if (member.user_id === currentUserId) {
      toast.error("You cannot remove yourself from the group.");
      return;
    }
    startTransition(async () => {
      const result = await deleteMember(member.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        setMemberList((prev) => prev.filter((m) => m.id !== member.id));
        toast.success(`${member.display_name} removed`);
      }
    });
  }

  function handleRotateToken(member: GroupMember): void {
    startTransition(async () => {
      const result = await rotateShareToken(member.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Share link rotated");
        router.refresh();
      }
    });
  }

  function handleRegenerateInvite(): void {
    startTransition(async () => {
      const result = await regenerateInviteCode(group.id);
      if (result.error) {
        toast.error(result.error);
      } else if (result.data) {
        setInviteCode(result.data.invite_code);
        toast.success("Invite code regenerated");
      }
    });
  }

  function handleDeleteGroup(): void {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const result = await deleteGroup(group.id);
      if (result.error) {
        toast.error(result.error);
        setConfirmDelete(false);
      } else {
        toast.success("Group deleted");
        router.push("/groups");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Invite section (owner only) */}
      {isOwner && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-700 mb-4">Invite Members</h2>

          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Invite Code</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800">
                  {inviteCode}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={Copy}
                  onClick={() => copyToClipboard(inviteCode, "Invite code")}
                >
                  Copy code
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={RefreshCw}
                  isLoading={isPending}
                  onClick={handleRegenerateInvite}
                  title="Regenerate invite code (invalidates the old one)"
                >
                  Rotate
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Invite Link</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600 truncate"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={Copy}
                  onClick={() => copyToClipboard(inviteLink, "Invite link")}
                >
                  Copy link
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Member list */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700 mb-4">
          Members ({memberList.length})
        </h2>

        <ul className="divide-y divide-slate-100">
          {memberList.map((member) => {
            const isCurrentUser = member.user_id === currentUserId;
            const isOwnerMember = member.role === "owner";
            return (
              <li
                key={member.id}
                className="flex items-center justify-between py-3 gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-semibold text-sm flex items-center justify-center shrink-0">
                    {member.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {member.display_name}
                      {isCurrentUser && (
                        <span className="ml-1.5 text-xs text-slate-400">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {isOwnerMember ? "Owner" : member.user_id ? "Member" : "Unlinked"}
                    </p>
                  </div>
                </div>

                {isOwner && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={RefreshCw}
                      onClick={() => handleRotateToken(member)}
                      isLoading={isPending}
                      title="Rotate share link"
                    >
                      Rotate link
                    </Button>
                    {!isOwnerMember && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={Trash2}
                        onClick={() => handleDeleteMember(member)}
                        isLoading={isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Remove member"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Add member form (owner only) */}
        {isOwner && (
          <form onSubmit={handleAddMember} className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="New member name…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm
                         placeholder:text-slate-400 focus:outline-none focus:ring-2
                         focus:ring-indigo-500 focus:border-transparent"
            />
            <Button type="submit" size="sm" leftIcon={UserPlus} isLoading={isPending}>
              Add
            </Button>
          </form>
        )}
        {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
      </section>

      {/* Payment details */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700 mb-2">Payment Details</h2>
        <p className="text-sm text-slate-500 mb-3">
          Payment details are shared across all your groups.
        </p>
        <a
          href="/account/payment"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Manage payment details →
        </a>
      </section>

      {/* Danger zone (owner only) */}
      {isOwner && (
        <section className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-red-700 mb-2">Danger Zone</h2>
          <p className="text-sm text-slate-500 mb-4">
            Deleting this group will permanently remove all expenses, payments, and members.
            This cannot be undone.
          </p>
          <Button
            variant="danger"
            leftIcon={Trash2}
            onClick={handleDeleteGroup}
            isLoading={isPending}
          >
            {confirmDelete ? "Click again to confirm deletion" : "Delete Group"}
          </Button>
          {confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="ml-3 text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          )}
        </section>
      )}
    </div>
  );
}
