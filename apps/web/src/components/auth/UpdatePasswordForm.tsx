"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updatePassword } from "@/app/actions/recovery";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function UpdatePasswordForm(): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updatePassword(Object.fromEntries(form));
          if (result.error) setError(result.error);
          else {
            router.replace("/login?passwordUpdated=1");
            router.refresh();
          }
        });
      }}
    >
      <Input
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <Input
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" isLoading={pending}>
        Update password
      </Button>
      <Link href="/forgot-password" className="block text-sm text-brand-700">
        Request another reset link
      </Link>
    </form>
  );
}
