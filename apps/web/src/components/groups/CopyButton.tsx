"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  text: string;
  label?: string;
  className?: string;
};

export function CopyButton({ text, label = "Copy", className }: Props): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silently fail
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleCopy} className={className}>
      {copied ? "Copied!" : label}
    </Button>
  );
}
