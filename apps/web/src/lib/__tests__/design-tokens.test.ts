import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN_TOKENS } from "@template/shared";

describe("cross-platform design tokens", () => {
  it("keeps canonical semantic colors mirrored in web CSS", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8").toLowerCase();
    const mirrored = [
      DESIGN_TOKENS.color.brand,
      DESIGN_TOKENS.color.canvas,
      DESIGN_TOKENS.color.surface,
      DESIGN_TOKENS.color.border,
      DESIGN_TOKENS.color.text,
      DESIGN_TOKENS.color.textMuted,
      DESIGN_TOKENS.color.positive,
      DESIGN_TOKENS.color.outgoing,
      DESIGN_TOKENS.color.danger,
      DESIGN_TOKENS.color.ai,
    ];
    for (const color of mirrored) expect(css).toContain(color.toLowerCase());
  });
});
