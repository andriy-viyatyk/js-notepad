---
name: review
description: Review recent code changes against architecture and coding standards
model: sonnet
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob, Bash
---

# Architecture Review

You are reviewing recent code changes against the project's architecture and coding standards.

## What to check

Read the following documentation as your source of truth:

### Architecture docs (`doc/architecture/`)
- `overview.md` — Application layers, process boundaries, key patterns
- `folder-structure.md` — Where files belong (renderer/api, renderer/ui, renderer/editors, etc.)
- `state-management.md` — State primitives, Object Model APIs, reactive patterns
- `scripting.md` — Script execution, wrappers, facades, auto-release lifecycle
- `editors.md` — Editor registry, content-view pattern, ContentViewModel
- `pages-architecture.md` — Page model, tab lifecycle, grouped pages
- `browser-editor.md` — Browser-specific architecture

### Standards docs (`doc/standards/`)
- `coding-style.md` — TypeScript, naming, imports, styling (Emotion), color tokens
- `editor-guide.md` — How to add/modify editors
- `component-guide.md` — UI component patterns
- `model-view-pattern.md` — Model-View separation, TComponentModel

### Key rules to validate
1. **Folder placement** — New files are in the correct layer (`api/`, `ui/`, `editors/`, `scripting/`, `components/`, `core/`)
2. **Dynamic imports** — Editor code uses `import()` not static imports
3. **No hardcoded colors** — All colors come from `color.ts` theme tokens
4. **Direct imports** — No barrel imports (avoid circular dependencies)
5. **Object Model usage** — Code uses `app.settings`, `app.fs`, `app.pages`, etc. instead of accessing stores directly
6. **ContentViewModel pattern** — New editor views use `useContentViewModel` hook
7. **Styled components** — Single root styled component with nested class-based styles (not multiple styled components)
8. **Script API** — Any new scripting API has `.d.ts` types in `api/types/`
9. **No direct `require("path")`** — Use `file-path` utility (`/src/renderer/core/utils/file-path.ts`) for all path operations. Only `file-path.ts` itself may import `path` directly.
10. **No direct `require("fs")`** — Use `app.fs` (`/src/renderer/api/fs.ts`) for file operations. Only `fs.ts` itself and a few documented exceptions may import `fs` directly (see `coding-style.md` for the exception list).
11. **No defensive `!` non-null assertions** — Persephone's `tsconfig.json` has `noImplicitAny: true` but does NOT enable `strict: true` or `strictNullChecks: true`. Without strict null checks, TypeScript treats `T | undefined` as assignable to `T` everywhere — the `!` operator is decorative (it silences the lint rule that scans for the `!` token but is invisible to TS). Flag any newly-added `!` in the diff as a concern. If null-safety is genuinely needed, use a runtime guard (`if (!x) return`) or refactor the type so the invariant is visible. US-588 Phase 3 (May 2026) removed 154 such `!` across 51 files with zero TS regressions — every one was a defensive addition with no semantic value.

## How to review

1. Use `git diff` or `git status` to identify changed/new files
2. For each changed file, check against the rules above
3. Look for patterns that don't match the architecture

## Output format

Present findings as a structured list:

### Concerns (must fix)
Issues that violate architecture or standards. Each item should include:
- File path and line (if applicable)
- What the concern is
- What the correct approach should be

### Suggestions (optional improvements)
Non-blocking improvements that could make the code better but are not violations.

### OK
If no concerns are found, say "No architecture concerns found." with a brief summary of what was reviewed.

**Important:** Only report real concerns backed by the documentation. Do not invent issues or be overly pedantic. Focus on structural/architectural problems, not cosmetic style preferences.
