# Agent Documentation Audit Report

**Date:** 2026-03-02
**Scope:** `CLAUDE.md` accuracy review + gap analysis for `CODEX.md` / `OPENCODE.md`

---

## Current CLAUDE.md — What's Accurate

The following sections are correct and require no factual changes:

| Section | Status |
|---------|--------|
| Architecture tree | Accurate — matches actual repo structure |
| Invariants (import boundaries, service_role ban, RLS) | Accurate |
| TypeScript conventions (strict, noUncheckedIndexedAccess, no any) | Accurate |
| React Web conventions (Server Components, Server Actions, ApiResponse) | Accurate |
| React Mobile conventions (Expo Router, onAuthStateChange, secure-store) | Accurate |
| Server Actions template | Accurate |
| `ApiResponse<T>` type | Accurate |
| Supabase Rules (all 8 rules) | Accurate |
| File Placement table | Accurate (missing AI lib row) |
| How to Add a New Feature checklist | Accurate |
| Definition of Done checklist | Accurate (could use 2 additions) |

---

## What's Missing

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| **Tech Stack with versions** | Agents guess versions, may use wrong APIs | Add version table |
| **AI Layer docs** | `apps/web/src/lib/ai/` undocumented; agents may misuse `generateJSON` or skip Zod validation | Add dedicated section |
| **Common Commands** | Agents don't know how to build/test/lint | Add command table |
| **Security Rules** | Service_role rule exists but buried in invariants; no AI security, upload, or share endpoint rules | Add dedicated section |
| **Testing info** | No mention of Vitest, test locations, or how to run tests | Add Testing section |
| **Environment Variables** | No reference to which env vars exist or which are public vs secret | Add env var table |
| **Quality/workflow rules** | No guidance on read-before-write, smallest-change, verify-after-edit | Add "How to Work" section |
| **Output format** | No standard for how agents should present results | Add Output Format section |
| **CODEX.md** | Does not exist — Codex agents get no project context | Create file |
| **OPENCODE.md** | Does not exist — OpenCode agents get no project context | Create file |

---

## What's Outdated

Nothing in the current `CLAUDE.md` is factually wrong. Minor gaps:

- File Placement table doesn't include the AI lib row (`apps/web/src/lib/ai/`)
- Definition of Done doesn't mention running tests or build verification

---

## Recommendation

1. **Update `CLAUDE.md`** — add missing sections (Tech Stack, AI Layer, Common Commands, Security, Testing, Env Vars, How to Work, Output Format); extend DoD
2. **Create `CODEX.md`** — condensed version of CLAUDE.md tailored for Codex's diff-oriented workflow
3. **Create `OPENCODE.md`** — condensed version tailored for OpenCode's tool-based workflow
