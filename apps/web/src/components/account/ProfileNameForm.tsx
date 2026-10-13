"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateMyProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/Button";

type Props = { initialName: string | null };

/** The name on your account (the iPhone app's Edit Profile). */
export function ProfileNameForm({ initialName }: Props): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName ?? "");
  const [saved, setSaved] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateMyProfile({ full_name: trimmed });
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setSaved(trimmed);
      toast.success("Profile updated");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 px-4 py-3.5">
      <label htmlFor="profile-name" className="text-sm font-medium text-slate-900">
        Display name
      </label>
      <div className="flex gap-2">
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoComplete="name"
          placeholder="Your name"
          aria-invalid={error !== null}
          aria-describedby={error ? "profile-name-error" : undefined}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <Button type="submit" size="sm" isLoading={isPending} disabled={!trimmed || trimmed === saved}>
          Save
        </Button>
      </div>
      {error && (
        <p id="profile-name-error" role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
