"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ROUTES, currencyName, type CurrencyCode } from "@template/shared";
import { createGroup } from "@/app/actions/groups";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { useOnline } from "@/hooks/useOnline";
import { useWebOutbox } from "@/components/OutboxProvider";
import type { ApiResponse } from "@template/shared";
import type { Group } from "@template/supabase";

const initialState: ApiResponse<Group> | null = null;

type Props = {
  /** Profile name or email local part; editable as "Your name in this group". */
  suggestedDisplayName: string;
};

export function CreateGroupForm({ suggestedDisplayName }: Props): React.ReactElement {
  const [state, formAction] = useActionState(createGroup, initialState);
  const [currency, setCurrency] = useState<CurrencyCode>("PHP");
  const [displayName, setDisplayName] = useState(suggestedDisplayName);
  const [isPending, startTransition] = useTransition();
  const online = useOnline();
  const { enqueue } = useWebOutbox();
  const router = useRouter();
  // The client id doubles as the group id server-side, so flaky-network
  // double submits of the same form can't create two groups.
  const clientIdRef = useRef<string>(crypto.randomUUID());

  async function handleSubmit(formData: FormData): Promise<void> {
    const name = String(formData.get("name") ?? "").trim();
    const myName = displayName.trim();
    if (!name) return;
    if (!myName) {
      toast.error("Enter the name the group will see for you.");
      return;
    }

    if (!online) {
      // Queue for replay; the group appears as a pending card in the list.
      // Never navigate into it — its page can't exist until it syncs.
      try {
        await enqueue({
          id: clientIdRef.current,
          kind: "group.create",
          entityId: clientIdRef.current,
          groupId: clientIdRef.current,
          payload: { name, currency_code: currency, display_name: myName },
          createdAt: new Date().toISOString(),
          summary: { title: name, amountCents: 0 },
        });
      } catch {
        toast.error(
          "Could not save on this device. Your changes are still here; please try again.",
        );
        return;
      }
      toast.info("Saved offline — the group will be created when you're back online");
      router.push(ROUTES.GROUPS);
      return;
    }

    formData.set("id", clientIdRef.current);
    formData.set("currency_code", currency);
    formData.set("display_name", myName);
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
      <Input
        name="display_name"
        label="Your name in this group"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        required
        maxLength={80}
        autoComplete="name"
      />
      <div className="flex flex-col gap-1">
        <CurrencySelect value={currency} onChange={setCurrency} label="Currency" id="group-currency" />
        <p className="text-xs text-slate-500">
          New expenses start in {currencyName(currency)}. You can still add expenses in other currencies;
          balances in each currency are kept separate.
        </p>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" isLoading={isPending}>
        Create Group
      </Button>
    </form>
  );
}
