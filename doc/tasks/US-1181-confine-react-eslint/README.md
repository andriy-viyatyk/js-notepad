# US-1181 — confine React to `editors/draw/**` and enforce it

**Epic:** [EPIC-074 — De-React Epic F: React confined](../../epics/EPIC-074.md) (task F-h, **the gate**)
**Status:** Blocked on F-f (US-1179) and F-e (US-1178)
**Created:** 2026-08-28

## Goal

Relocate the last React-adjacent code out of `uikit/`, then make the epic's closing property a build
failure: **`react` and `react-dom` are importable from exactly one directory,
`src/renderer/editors/draw/`.**

This is the task that turns "React is confined to Excalidraw" from a claim in a document into
something `npm run lint` checks.

## Prerequisites — do not start until both are true

1. **F-f (US-1179) has landed**, so no file imports React for types *and* `core/state/state.ts`'s
   dead `IState.use()` hook path is deleted. Otherwise the new rule reports ~67 type-only violations
   plus a genuine value-user violation in `core/`, and cannot be switched on.
2. `mountReactHandle` has exactly **one** consumer. As of 2026-08-28 that is already true —
   `DrawBodyView.ts:170` — because F-a removed `mountVanilla`, F-d removed `index.tsx`'s call, and
   F-g removed `LivePreview`'s. **Re-verify with a grep before moving it**; do not trust this line.

Current state after F-a/F-d/F-g, measured with a quote-agnostic classifier: **70 react importers, of
which 3 use React as a value** — `editors/draw/ExcalidrawIsland.tsx` (permanent),
`uikit/shared/mount.tsx` (this task's target), and **`core/state/state.ts`**, which calls
`useSyncExternalStore`/`useEffect`/`useRef` behind its dead `IState.use()` hook path. Plus **one file
referencing the global `React` namespace with no import at all** — `core/traits/dnd.ts:48`.

> **An earlier draft of this document said only `mount.tsx` had React runtime left. That was wrong**,
> because the measuring instrument's import regex hardcoded double quotes and `state.ts` uses single
> ones (EPIC-074, instrument defect 6). F-f now owns deleting that hook path; **if it has not, this
> task's rule cannot pass** — do not attempt to work around it with a disable comment.

## Background — what actually blocks deleting `mount.tsx`

`uikit/shared/mount.tsx` now contains only two things:

- `mountReactHandle` + `MountedReactRoot` — the React root adapter, one consumer.
- **`VanillaViewCtor<P>`** at `:5`: `export type VanillaViewCtor<P> = new (props: P) => VanillaView<P>;`

That type is **pure structural typing with no React in it**, and it is the type the entire vanilla
architecture is built on. It has **13 consumers across eight subsystems**:

| File | Line(s) |
|---|---|
| `editors/base/editorRegistry.ts` | 4, 32, 36 |
| `ui/dialogs/dialog-view-registry.ts` | 2, 30 |
| `ui/secondary-views/secondary-view-registry.ts` | 3, 34 |
| `ui/secondary-views/LazySecondaryViewView.ts` | 5, 15, 77 |
| `components/page-manager/AppPageManagerView.ts` | 1, 18 |
| `components/page-manager/PageManagerView.ts` | 1, 11 |
| `components/page-manager/PageSlot.ts` | 1, 33 |
| `editors/browser/BrowserView.ts` | 13, 383, 408 |
| `editors/types.ts` | 3, 10 |
| `editors/storybook/storyTypes.ts` | 2, 44 |

It is stranded in the React module by accident of history: `mount.tsx` was where both adapters lived,
and the type was declared beside them. `mount.tsx` already imports `VanillaView` from
`./vanilla-view`, and `LivePreview.ts:5` imports `VanillaView` from `"../../uikit/shared/vanilla-view"`
directly — so that module is the obvious, already-established home.

## Implementation plan

### Step 1 — move `VanillaViewCtor` to `uikit/shared/vanilla-view.ts`

Declare it there, next to the `VanillaView` class it references, and delete it from `mount.tsx`.
Repoint all 13 consumers above from `"…/uikit/shared/mount"` to `"…/uikit/shared/vanilla-view"`.
Several of those imports are `import type` and some are combined (`import { type VanillaViewCtor }`)
— preserve each site's existing form rather than normalising it.

`vanilla-view.ts` must not gain a React import. If a circular-import problem appears (the class file
importing something that imports the type), stop and report rather than working around it — the type
is a one-line structural alias and should need nothing.

### Step 2 — move the React root adapter into `editors/draw/`

Move `mountReactHandle` and the `MountedReactRoot` interface to a new
`src/renderer/editors/draw/react-island.tsx`, and update `DrawBodyView.ts:18` to import from
`"./react-island"`.

Keep the `host.dataset.reactRoot` marker and its comment verbatim. That marker is how every
De-React measurement counts React roots (EPIC-063 E5-3 added it because an island was otherwise
invisible), and EPIC-074's closing statement 3 asserts a count of exactly 1 using it. Losing it
would silently break the epic's own verification.

Then **delete `src/renderer/uikit/shared/mount.tsx`**. At that point `uikit/` contains no React in
any form and no `.tsx` file, which is closing statement 2 — true *by construction* rather than by
audit.

### Step 3 — the rule

`eslint.config.mjs` already has the right mechanism at `:558-568`, scoped to `src/**/*.ts(x)`:

```js
"no-restricted-imports": ["error", {
    paths: [{
        name: "av-grid",
        message: "EPIC-057 C4-1: import from uikit/DataGrid, not from av-grid directly.",
    }],
    patterns: ["av-grid/*"],
}],
```

Extend `paths` with `react` and `react-dom`, following the existing convention of citing the epic in
the message — something like *"EPIC-074 F-h: React is confined to `editors/draw/**`, where
`@excalidraw/excalidraw` requires it as a peer dependency. Nothing else may import React."*
`react-dom/client` needs covering too, so add `"react-dom/*"` to `patterns`.

Then add a **following** config block that exempts the island:

```js
{
    files: ["src/renderer/editors/draw/**/*.ts", "src/renderer/editors/draw/**/*.tsx"],
    rules: { /* … */ },
}
```

> **Flat-config overrides replace a rule's options; they do not merge them.** So the draw block must
> **re-state the `av-grid` restriction**, or `editors/draw/` silently loses that protection — and
> `DrawBodyView.ts` is a grid-adjacent editor, so this is not hypothetical. The alternative is to
> keep two separate rule entries; either is fine, but the av-grid restriction must still apply
> inside `editors/draw/`. State in a comment which choice was made and why.

A custom rule in the inline `vanillaViewPlugin` (`eslint.config.mjs:11`) is **not** needed here.
Prefer the built-in — less code, standard semantics, and no new rule to maintain.

### Step 4 — prove the rule bites

**A rule that matches nothing passes silently, which is exactly how a zero-baseline guard gives false
comfort.** So:

1. Add a throwaway `import { useState } from "react";` to any file under `src/renderer/uikit/`.
2. Run `npm run lint` and confirm it **fails**, citing that line and your message.
3. Remove the throwaway line and confirm lint passes again.
4. Repeat once inside `src/renderer/editors/draw/` and confirm lint **passes** there — proving the
   exemption works and not just that the rule is off.

Report all four results explicitly. Step 4's second half matters as much as the first: a rule that
fires everywhere including draw would break the build in the one place React is legitimate.

## Files that need NO changes

- `src/renderer/editors/draw/ExcalidrawIsland.tsx` — the vendor island. Its React imports are the
  point; they must remain and must be exempted, not removed.
- `src/renderer/uikit/shared/vanilla-view.ts` — gains one type declaration; the class is untouched.
- `package.json` — `react`, `react-dom`, `@types/react`, `@types/react-dom` all **stay installed**
  permanently (Excalidraw peer dependencies, and its own `.d.ts` imports React).

## Concerns

1. **Ordering.** This task is last for a reason. Run it before F-f and the rule reports ~67 type-only
   violations; there is no partial-enable that is worth the confusion.
2. **`storyTypes.ts` is one of the 13 consumers.** F-g rewrote that file; confirm its
   `VanillaViewCtor` import still exists and is the only React-shaped thing left in it.
3. **Do not add an ESLint disable comment anywhere to make the rule pass.** If a file outside
   `editors/draw/` still needs React after F-f and F-e, that is a finding about the epic's premise,
   not a formatting problem — stop and report it.
4. **The `data-react-root` marker is load-bearing for verification, not for behaviour.** It is easy
   to drop while moving code because nothing fails without it. Grep for it after the move.

## Acceptance criteria

1. `src/renderer/uikit/shared/mount.tsx` no longer exists.
2. `find src/renderer/uikit -name '*.tsx'` returns **nothing**, and
   `grep -rn "react" src/renderer/uikit/ --include=*.ts` returns nothing (case-insensitive, comments
   included — a stale mention is a C21 problem).
3. `find src -name '*.tsx'` returns exactly **one** file: `editors/draw/ExcalidrawIsland.tsx`, plus
   the new `editors/draw/react-island.tsx` if you gave it a `.tsx` extension (it needs none — it
   contains no JSX, so prefer `.ts`).
4. The react-usage classifier reports **1 importer, 1 value user, 0 type-only**, and **0 files
   referencing the global `React` namespace without an import** — that second query is separate and
   an import-based census cannot answer it.
5. `npm run lint` passes; the four probes in step 4 behave as described.
6. `npm run typecheck` and `npm run build-prod` pass.
7. **Presence check:** open a `.excalidraw` file and confirm the canvas renders **non-blank by pixel
   histogram** (not by element size — EPIC-073 shipped a zero-height Excalidraw island that passed
   every geometry check), and that `document.querySelectorAll("[data-react-root]").length === 1`
   with a draw page open and **0** without one.

## Files changed

| File | Change |
|---|---|
| `uikit/shared/vanilla-view.ts` | gains `VanillaViewCtor` |
| `uikit/shared/mount.tsx` | **deleted** |
| `editors/draw/react-island.ts` | **new** — `mountReactHandle`, `MountedReactRoot`, the `data-react-root` marker |
| `editors/draw/DrawBodyView.ts` | import repointed |
| 13 files across 8 subsystems | `VanillaViewCtor` import repointed |
| `eslint.config.mjs` | `react`/`react-dom` restricted; `editors/draw/**` exempted |
