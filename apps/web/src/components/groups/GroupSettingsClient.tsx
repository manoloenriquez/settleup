"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Copy, Crown, LogOut, Pencil, RefreshCw, Shield, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { addMember, deleteMember, renameMember } from "@/app/actions/members";
import { archiveGroup, deleteGroup, leaveGroup, renameGroup, transferOwnership } from "@/app/actions/groups";
import { createExpenseCategory, deleteExpenseCategory, updateExpenseCategory } from "@/app/actions/categories";
import { promoteMember, regenerateInviteCode, rotateShareToken } from "@/app/actions/collaboration";
import type { ExpenseCategory, GroupMember } from "@template/supabase";
import { DEFAULT_CATEGORY_COLOR } from "@template/shared";

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
  categories: ExpenseCategory[];
  isOwner: boolean;
  isAdmin: boolean;
  isAdminOrOwner: boolean;
  currentUserId: string;
}

export function GroupSettingsClient({
  group,
  members,
  categories,
  isOwner,
  isAdmin: _isAdmin,
  isAdminOrOwner,
  currentUserId,
}: Props): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [memberList, setMemberList] = useState<GroupMember[]>(members);
  const [categoryList, setCategoryList] = useState<ExpenseCategory[]>(categories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryColor, setEditingCategoryColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [inviteCode, setInviteCode] = useState(group.invite_code);
  const [newMemberName, setNewMemberName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMemberName, setEditingMemberName] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [groupName, setGroupName] = useState(group.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<GroupMember | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteLink = `${origin}/join?code=${inviteCode}`;

  function handleRenameGroup(e: React.FormEvent): void {
    e.preventDefault();
    const name = groupName.trim();
    if (!name || name === group.name) return;
    setRenameError(null);
    startTransition(async () => {
      const result = await renameGroup({ group_id: group.id, name });
      if (result.error) {
        setRenameError(result.error);
      } else {
        toast.success("Group renamed");
        router.refresh();
      }
    });
  }

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

  function handleTransferOwnership(member: GroupMember): void {
    setTransferTarget(member);
  }

  function confirmTransferOwnership(): void {
    if (!transferTarget) return;
    const member = transferTarget;
    setTransferTarget(null);
    startTransition(async () => {
      const result = await transferOwnership(group.id, member.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Ownership transferred to ${member.display_name}`);
        router.refresh();
      }
    });
  }

  function startEditMember(member: GroupMember): void {
    setEditingMemberId(member.id);
    setEditingMemberName(member.display_name);
  }

  function handleRenameMember(member: GroupMember): void {
    const name = editingMemberName.trim();
    if (!name || name === member.display_name) {
      setEditingMemberId(null);
      return;
    }
    startTransition(async () => {
      const result = await renameMember({ member_id: member.id, display_name: name });
      if (result.error) {
        toast.error(result.error);
      } else if (result.data) {
        setMemberList((prev) =>
          prev.map((m) => (m.id === member.id ? result.data! : m)),
        );
        setEditingMemberId(null);
        toast.success("Member renamed");
      }
    });
  }

  function handleLeaveGroup(): void {
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    startTransition(async () => {
      const result = await leaveGroup(group.id);
      if (result.error) {
        toast.error(result.error);
        setConfirmLeave(false);
      } else {
        toast.success("You have left the group");
        router.push("/groups");
        router.refresh();
      }
    });
  }

  function handlePromoteMember(member: GroupMember, role: "admin" | "member"): void {
    startTransition(async () => {
      const result = await promoteMember(member.id, role);
      if (result.error) {
        toast.error(result.error);
      } else if (result.data) {
        setMemberList((prev) =>
          prev.map((m) => (m.id === member.id ? result.data! : m)),
        );
        toast.success(role === "admin" ? `${member.display_name} is now an admin` : `${member.display_name} is now a regular member`);
      }
    });
  }

  function handleCreateCategory(e: React.FormEvent): void {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createExpenseCategory({
        group_id: group.id,
        name,
        color: newCategoryColor,
        icon: "circle-ellipsis",
      });
      if (result.error) {
        toast.error(result.error);
      } else if (result.data) {
        setCategoryList((prev) => [...prev, result.data!].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
        setNewCategoryName("");
        setNewCategoryColor(DEFAULT_CATEGORY_COLOR);
        toast.success("Category added");
        router.refresh();
      }
    });
  }

  function startEditCategory(category: ExpenseCategory): void {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setEditingCategoryColor(category.color);
  }

  function handleUpdateCategory(category: ExpenseCategory, sortOrder = category.sort_order): void {
    const name = editingCategoryId === category.id ? editingCategoryName.trim() : category.name;
    const color = editingCategoryId === category.id ? editingCategoryColor : category.color;
    if (!name) return;
    startTransition(async () => {
      const result = await updateExpenseCategory({
        category_id: category.id,
        name,
        icon: category.icon,
        color,
        sort_order: sortOrder,
      });
      if (result.error) {
        toast.error(result.error);
      } else if (result.data) {
        setCategoryList((prev) =>
          prev
            .map((item) => (item.id === category.id ? result.data! : item))
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
        );
        setEditingCategoryId(null);
        toast.success("Category updated");
        router.refresh();
      }
    });
  }

  function handleDeleteCategory(category: ExpenseCategory): void {
    startTransition(async () => {
      const result = await deleteExpenseCategory(category.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        setCategoryList((prev) => prev.filter((item) => item.id !== category.id));
        toast.success("Category deleted");
        router.refresh();
      }
    });
  }

  function handleArchiveGroup(): void {
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    startTransition(async () => {
      const result = await archiveGroup(group.id);
      if (result.error) {
        toast.error(result.error);
        setConfirmArchive(false);
      } else {
        toast.success("Group archived");
        router.push("/groups");
        router.refresh();
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
      {/* Group name (any linked member) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-700 mb-4">Group Name</h2>
          <form onSubmit={handleRenameGroup} className="flex gap-2">
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm
                         placeholder:text-slate-400 focus:outline-none focus:ring-2
                         focus:ring-brand-500 focus:border-transparent"
            />
            <Button
              type="submit"
              size="sm"
              leftIcon={Pencil}
              isLoading={isPending}
              disabled={!groupName.trim() || groupName.trim() === group.name}
            >
              Save
            </Button>
          </form>
          {renameError && <p className="text-xs text-red-600 mt-2">{renameError}</p>}
        </section>

      {/* Invite section (all members can see; regenerate restricted to owner/admin) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                {isAdminOrOwner && (
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
                )}
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

      {/* Member list */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700 mb-4">
          Members ({memberList.length})
        </h2>

        <ul className="divide-y divide-slate-100">
          {memberList.map((member) => {
            const isCurrentUser = member.user_id === currentUserId;
            const isOwnerMember = member.role === "owner";
            const isAdminMember = member.role === "admin";
            const canManageMember = isAdminOrOwner && !isOwnerMember && !isCurrentUser;
            const roleLabel = isOwnerMember
              ? "Owner"
              : isAdminMember
                ? "Admin"
                : member.user_id
                  ? "Member"
                  : "Unlinked";
            return (
              <li
                key={member.id}
                className="flex items-center justify-between py-3 gap-4 rounded-xl px-2 -mx-2 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 font-semibold text-sm flex items-center justify-center shrink-0">
                    {member.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingMemberId === member.id ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleRenameMember(member); }}
                        className="flex gap-1"
                      >
                        <input
                          autoFocus
                          type="text"
                          value={editingMemberName}
                          onChange={(e) => setEditingMemberName(e.target.value)}
                          className="flex-1 rounded-md border border-brand-300 px-2 py-1 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <Button type="submit" size="sm" isLoading={isPending}>Save</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingMemberId(null)}>✕</Button>
                      </form>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {member.display_name}
                          {isCurrentUser && (
                            <span className="ml-1.5 text-xs text-slate-400">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">{roleLabel}</p>
                      </>
                    )}
                  </div>
                </div>

                {(isAdminOrOwner || isCurrentUser) && editingMemberId !== member.id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={Pencil}
                      onClick={() => startEditMember(member)}
                      title="Rename member"
                    />
                    {isAdminOrOwner && (
                      <>
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
                        {/* Owner-only: promote/demote admin */}
                        {isOwner && !isOwnerMember && member.user_id && !isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={Shield}
                            onClick={() => handlePromoteMember(member, isAdminMember ? "member" : "admin")}
                            isLoading={isPending}
                            className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            title={isAdminMember ? "Remove admin" : "Make admin"}
                          >
                            {isAdminMember ? "Remove admin" : "Make admin"}
                          </Button>
                        )}
                        {/* Owner-only: transfer ownership */}
                        {isOwner && !isOwnerMember && member.user_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={Crown}
                            onClick={() => handleTransferOwnership(member)}
                            isLoading={isPending}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Transfer ownership"
                          >
                            Make owner
                          </Button>
                        )}
                        {canManageMember && (
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
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Add member form (owner/admin) */}
        {isAdminOrOwner && (
          <form onSubmit={handleAddMember} className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="New member name…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm
                         placeholder:text-slate-400 focus:outline-none focus:ring-2
                         focus:ring-brand-500 focus:border-transparent"
            />
            <Button type="submit" size="sm" leftIcon={UserPlus} isLoading={isPending}>
              Add
            </Button>
          </form>
        )}
        {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
      </section>

      {/* Categories */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700 mb-2">Expense Categories</h2>
        <p className="text-sm text-slate-500 mb-4">
          Members can use default and custom categories when adding expenses.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {categoryList.map((category) => {
            const isCustom = !category.is_default;
            return (
              <div key={category.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                {editingCategoryId === category.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-brand-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <input
                      type="color"
                      value={editingCategoryColor}
                      onChange={(e) => setEditingCategoryColor(e.target.value)}
                      className="h-8 w-10 shrink-0"
                      aria-label="Category color"
                    />
                    <Button type="button" size="sm" isLoading={isPending} onClick={() => handleUpdateCategory(category)}>
                      Save
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingCategoryId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{category.name}</p>
                      <p className="text-xs text-slate-400">{category.is_default ? "Default" : "Custom"}</p>
                    </div>
                    {isAdminOrOwner && isCustom && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleUpdateCategory(category, category.sort_order - 15)}>
                          ↑
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleUpdateCategory(category, category.sort_order + 15)}>
                          ↓
                        </Button>
                        <Button type="button" variant="ghost" size="sm" leftIcon={Pencil} onClick={() => startEditCategory(category)} title="Edit category" />
                        <Button type="button" variant="ghost" size="sm" leftIcon={Trash2} onClick={() => handleDeleteCategory(category)} title="Delete category" className="text-red-600 hover:bg-red-50 hover:text-red-700" />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {isAdminOrOwner && (
          <form onSubmit={handleCreateCategory} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
              New category
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Souvenirs"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Color
              <input
                type="color"
                value={newCategoryColor}
                onChange={(e) => setNewCategoryColor(e.target.value)}
                className="mt-1 block h-10 w-14"
                aria-label="New category color"
              />
            </label>
            <Button type="submit" size="sm" leftIcon={UserPlus} isLoading={isPending} disabled={!newCategoryName.trim()}>
              Add category
            </Button>
          </form>
        )}
      </section>

      {/* Payment details */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-700 mb-2">Payment Details</h2>
        <p className="text-sm text-slate-500 mb-3">
          Payment details are shared across all your groups.
        </p>
        <a
          href="/account/payment"
          className="text-sm font-medium text-brand-600 hover:text-brand-800"
        >
          Manage payment details →
        </a>
      </section>

      {/* Leave group (non-owners only) */}
      {!isOwner && (
        <section className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-orange-700 mb-2">Leave Group</h2>
          <p className="text-sm text-slate-500 mb-4">
            Your member record will remain so the group&apos;s expense history stays intact, but you will no longer have access.
          </p>
          <Button
            variant="secondary"
            leftIcon={LogOut}
            onClick={handleLeaveGroup}
            isLoading={isPending}
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            {confirmLeave ? "Click again to confirm" : "Leave Group"}
          </Button>
          {confirmLeave && (
            <button
              type="button"
              onClick={() => setConfirmLeave(false)}
              className="ml-3 text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          )}
        </section>
      )}

      {/* Danger zone (owner only) */}
      {isOwner && (
        <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-red-700 mb-4">Danger Zone</h2>

          <div className="mb-4">
            <p className="text-sm font-medium text-slate-700 mb-1">Archive Group</p>
            <p className="text-sm text-slate-500 mb-3">
              Hides the group from your list. You can restore it later from the groups page.
            </p>
            <Button
              variant="secondary"
              leftIcon={Archive}
              onClick={handleArchiveGroup}
              isLoading={isPending}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              {confirmArchive ? "Click again to confirm" : "Archive Group"}
            </Button>
            {confirmArchive && (
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="ml-3 text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="pt-4 border-t border-red-100">
            <p className="text-sm font-medium text-slate-700 mb-1">Delete Group</p>
            <p className="text-sm text-slate-500 mb-3">
              Permanently removes all expenses, payments, and members. This cannot be undone.
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
          </div>
        </section>
      )}

      <Dialog
        open={transferTarget !== null}
        onClose={() => setTransferTarget(null)}
        title="Transfer ownership"
        description={`Transfer ownership to ${transferTarget?.display_name ?? ""}? You will become a regular member and lose owner privileges.`}
        confirmLabel="Transfer ownership"
        confirmVariant="danger"
        onConfirm={confirmTransferOwnership}
        isLoading={isPending}
      />
    </div>
  );
}
