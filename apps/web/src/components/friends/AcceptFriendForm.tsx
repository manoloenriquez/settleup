"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptFriendInvite } from "@/app/actions/friends";
import { Button } from "@/components/ui/Button";

export function AcceptFriendForm({
  token,
  inviterName,
  suggestedName,
}: {
  token: string;
  inviterName: string;
  suggestedName: string;
}): React.ReactElement {
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Your name for {inviterName}</span>
        <input
          className="w-full rounded-md border px-3 py-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoComplete="name"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button
        isLoading={pending}
        disabled={!name.trim()}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptFriendInvite(token, name);
            if (result.error !== null) setError(result.error);
            else {
              router.replace(`/groups/${result.data.groupId}`);
              router.refresh();
            }
          })
        }
      >
        Add {inviterName} as a friend
      </Button>
    </div>
  );
}
