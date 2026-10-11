"use client";
import { useState, useTransition } from "react";
import { createClaimInvitation, revokeClaimInvitation } from "@/app/actions/collaboration";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function MemberInvitationControls({ memberId }: { memberId: string }): React.ReactElement {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-2 space-y-2 text-xs">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          isLoading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await createClaimInvitation(memberId);
              if (result.error) setMessage(result.error);
              else if (result.data) {
                router.refresh();
                setLink(`${window.location.origin}/claim?token=${result.data.token}`);
                setMessage(
                  "Send only to this person. Expires in 7 days; older invitations are invalidated.",
                );
              }
            })
          }
        >
          Create personal invitation
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await revokeClaimInvitation(memberId);
              setMessage(result.error ?? "Personal invitation revoked.");
              if (!result.error) {
                setLink("");
                router.refresh();
              }
            })
          }
        >
          Revoke invitation
        </Button>
      </div>
      {link && (
        <input
          aria-label="Personal invitation link"
          className="w-full rounded border p-2"
          value={link}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
