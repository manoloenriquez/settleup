"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Copy } from "lucide-react";

type Props = {
  text: string;
  label?: string;
  className?: string;
  onCopied?: () => void;
};

export function CopyButton({
  text,
  label = "Copy",
  className,
  onCopied,
}: Props): React.ReactElement {
  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
      onCopied?.();
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={Copy}
      onClick={handleCopy}
      className={className}
    >
      {label}
    </Button>
  );
}
