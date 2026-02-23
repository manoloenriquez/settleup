"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetRole } from "@/app/actions/profile";
import type { Profile, UserRole } from "@template/supabase";

function RoleButton({
  userId,
  role,
  currentUserId,
}: {
  userId: string;
  role: UserRole;
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isSelf = userId === currentUserId;

  function changeRole(newRole: UserRole) {
    setError(null);
    startTransition(async () => {
      const result = await adminSetRole(userId, newRole);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-3">
      {role === "admin" ? (
        <>
          <span className="text-sm font-medium text-purple-700">Admin</span>
          {!isSelf && (
            <button
              disabled={pending}
              onClick={() => changeRole("user")}
              className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "…" : "Demote"}
            </button>
          )}
        </>
      ) : (
        <button
          disabled={pending}
          onClick={() => changeRole("admin")}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {pending ? "Promoting…" : "Promote to admin"}
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function UsersTable({
  users,
  currentUserId,
}: {
  users: Profile[];
  currentUserId: string;
}) {
  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
        <p className="text-sm text-slate-500">No users yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-100">
        <thead>
          <tr className="bg-slate-50">
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Joined
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Role
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 text-sm text-slate-900">
                <span>{user.email}</span>
                {user.id === currentUserId && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                    you
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-slate-500">
                {user.full_name ?? <span className="italic text-slate-300">—</span>}
              </td>
              <td className="px-6 py-4 text-sm text-slate-500">
                {new Date(user.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td className="px-6 py-4">
                <RoleButton
                  userId={user.id}
                  role={user.role}
                  currentUserId={currentUserId}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
