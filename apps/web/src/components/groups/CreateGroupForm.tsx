"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/app/actions/groups";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { ApiResponse } from "@template/shared";
import type { Group } from "@template/supabase";

const initialState: ApiResponse<Group> = { data: null, error: null } as unknown as ApiResponse<Group>;

export function CreateGroupForm(): React.ReactElement {
  const [state, formAction] = useActionState(createGroup, initialState);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // createGroup redirects on success, so we only handle error state
  return (
    <form
      action={(formData) => startTransition(() => { formAction(formData); })}
      className="flex flex-col gap-4 max-w-md"
    >
      <Input
        name="name"
        label="Group name"
        placeholder="e.g. Barkada Trip 2025"
        required
        autoFocus
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
