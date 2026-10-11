"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimMember } from "@/app/actions/collaboration";
import { Button } from "@/components/ui/Button";

export function ClaimInvitation({ token }: { token: string }): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <p>
        Accept the personal invitation sent by your organizer to link your account to your existing
        expenses. Only accept an invitation intended for you.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button
        isLoading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await claimMember(token);
            if (result.error) setError(result.error);
            else if (result.data) {
              router.replace(`/groups/${result.data.member.group_id}`);
              router.refresh();
            }
          })
        }
      >
        Accept personal invitation
      </Button>
    </div>
  );
}
