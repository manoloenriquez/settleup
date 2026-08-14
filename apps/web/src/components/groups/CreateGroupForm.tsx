"use client";

import { useActionState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ROUTES } from "@template/shared";
import { createGroup } from "@/app/actions/groups";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useOnline } from "@/hooks/useOnline";
import { useWebOutbox } from "@/components/OutboxProvider";
import type { ApiResponse } from "@template/shared";
import type { Group } from "@template/supabase";

const initialState: ApiResponse<Group> | null = null;

export function CreateGroupForm(): React.ReactElement {
  const [state, formAction] = useActionState(createGroup, initialState);
  const [isPending, startTransition] = useTransition();
  const online = useOnline();
  const { enqueue } = useWebOutbox();
  const router = useRouter();
  // The client id doubles as the group id server-side, so flaky-network
  // double submits of the same form can't create two groups.
  const clientIdRef = useRef<string>(crypto.randomUUID());

  function handleSubmit(formData: FormData): void {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    if (!online) {
      // Queue for replay; the group appears as a pending card in the list.
      // Never navigate into it — its page can't exist until it syncs.
      void enqueue({
        id: clientIdRef.current,
        kind: "group.create",
        entityId: clientIdRef.current,
        groupId: clientIdRef.current,
        payload: { name },
        createdAt: new Date().toISOString(),
        summary: { title: name, amountCents: 0 },
      });
      toast.info("Saved offline — the group will be created when you're back online");
      router.push(ROUTES.GROUPS);
      return;
    }

    formData.set("id", clientIdRef.current);
    startTransition(() => {
      formAction(formData);
    });
  }

  // createGroup redirects on success, so we only handle error state
  return (
    <form action={handleSubmit} className="flex flex-col gap-4 max-w-md">
      <Input
        name="name"
        label="Group name"
        placeholder="e.g. Barkada Trip 2025"
        required
        autoFocus
        maxLength={100}
      />
      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <Button type="submit" isLoading={isPending}>
        Create Group
      </Button>
    </form>
  );
}
