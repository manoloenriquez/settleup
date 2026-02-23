"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { seedDemoData } from "@/app/actions/seed";
import { Button } from "@/components/ui/Button";

export function SeedButton(): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSeed() {
    startTransition(async () => {
      const result = await seedDemoData();
      if (result.data) {
        router.push(`/groups/${result.data.groupId}`);
        router.refresh();
      }
    });
  }

  return (
    <Button variant="secondary" size="sm" isLoading={isPending} onClick={handleSeed}>
      Load Demo Data
    </Button>
  );
}
