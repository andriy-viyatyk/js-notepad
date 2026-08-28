# EPIC-074 — De-React Epic F: React confined

**Status:** Complete
**Created:** 2026-08-28
**Completed:** 2026-08-28
**Depends on:** [EPIC-073](EPIC-073.md) (Epic E, complete)

The last epic of the De-React programme. It does **not** remove React — [EPIC-073](EPIC-073.md)
established that it cannot be removed — it *confines* React to the one directory a vendor requires
it in, and makes that confinement a build failure rather than a sentence in a document.

---

## F-1 — The closing property

**`react` and `react-dom` are importable from exactly one directory — `src/renderer/editors/draw/` —
and the build fails if that changes.**

That is the whole epic. It is one sentence, it is enforceable by a local ESLint rule, and unlike
every closing statement in Epics A–E it cannot rot, be undercounted, or be measured by an instrument
that answers a narrower question than the sentence asks. Two of Epic E's four closing statements
turned out to be wrong as written (see F-2); this one is checked by `npm run lint`.

Four supporting statements, each paired with a **presence** check so that "the import is gone" can
never stand in for "the feature still works" — the C9a discipline, and the direct lesson of
EPIC-073's two blank-but-passing surfaces:

| # | Statement | Presence check |
|---|---|---|
| 1 | A local ESLint rule forbids `react`/`react-dom` imports outside `editors/draw/**`; the baseline it drives to zero is **84 importers** | `npm run lint` is green, and the rule is proven to bite by a deliberate throwaway import in `uikit/` |
| 2 | `src/renderer/uikit/` contains no reference to React in any form — not a value, not a type, not a `.tsx` file | Every uikit story renders, and the four `applyRestProps` behaviours that motivated the compat layer (enumerated attributes, `aria-*` booleans, `draggable`, listener removal) still hold |
| 3 | Exactly **one** React root exists at runtime, mounted by the Excalidraw island | A draw page shows a non-blank canvas by **pixel histogram**, and `document.querySelectorAll("[data-react-root]").length === 1` with the app otherwise fully loaded |
| 4 | `@emotion/react`, `@emotion/styled` and `react-markdown` are uninstalled | A live **theme switch** repaints the app, and every `--p-*` custom property still resolves |

Statement 4 is the only one that removes packages, and it removes the only three that *can* be
removed. See F-3.

---

## F-2 — Corrections to EPIC-073's handoff

The handoff's numbers were re-measured and **all of them hold exactly**: 84 react importers, 14
using React as a value, 70 type-only, 3 live roots. The gen-4 classifier's five validation cases all
passed unchanged, which makes this the first epic in the programme to inherit a baseline that needed
no re-baselining. What did not survive is three of the handoff's *conclusions*.

### Correction 1 — nothing can be uninstalled by doing the type-surface work

The handoff called the ~70-file React type surface *"the actual blocker on uninstalling anything"*.
It is not a blocker on anything, because **nothing is unblockable**:

```
node_modules/@excalidraw/excalidraw/dist/types/excalidraw/index.d.ts  imports from "react"
```

Excalidraw declares `react`/`react-dom` as peer dependencies **and** its own type definitions import
React. So `react`, `react-dom`, `@types/react` and `@types/react-dom` stay installed permanently, no
matter how many of our own files stop importing them. The type surface work (F-f) is therefore worth
doing for a different reason than the handoff gave: **it is the precondition for the ESLint rule**,
which is the epic's only durable deliverable. If Epic F is judged by packages removed it will look
like a failure; it removes three packages and none of them are React.

This matters enough to record as a concern, because it is the second time in two epics that a
dependency's own contract defeated a plan built from counting our own files (**C18**, EPIC-073).

### Correction 2 — statement 2 of EPIC-073's close record was false as written

EPIC-073 closed on *"No file matches `return mountVanilla(`"*, reported as **21 → 0 faces, met**. Ten
files match it today, and none of them was created since:

```
editors/base/ContentHostFooter.ts    editors/shared/MonacoDiffEditorHost.ts
editors/base/EditorToolbar.ts        editors/shared/MonacoEditorHost.ts
editors/log-view/LogBody.ts          editors/text/ScriptPanel.ts
editors/shared/ColorizedCode.ts      uikit/Popover/Popover.ts
editors/shared/FindBar.ts            uikit/Tree/TreeItem.ts
```

The instrument (`e15-faces2.mjs`) opened with
`faces = all.filter((f) => f.endsWith(".tsx") && /return\s+mountVanilla\(/…)`. The extension filter
is the defect: **`mountVanilla` returns `React.createElement(VanillaHost, …)` and needs no JSX**, so
a face converted from `.tsx` to `.ts` keeps producing React while becoming invisible to both the
face count *and* the JSX-marker count. Ten faces walked out through that door.

The substantive claim survives — none of the ten has a live renderer (F-a proves it), so no React
face was *rendering* — but the sentence Epic E closed on was not the sentence its instrument
measured. That is the same failure as statement 4's undercount, and it generalises:

> **A file-extension filter is not a language filter.** Measure the construct, not the container.
> `React.createElement` in a `.ts` file is React; a JSX-looking string in a doc comment is not.

Recorded as concern **C20**. It has a second instance in this very scoping: of the four stray `.tsx`
files, `grid-context-menu.tsx`'s single JSX marker is `<DataGrid … />` **inside a doc comment**, while
`GlobalStyles.tsx`'s five are real. A marker count cannot tell those apart.

### Correction 3 — the seven "hook-exporting modules" are alive; only their hooks are dead

The handoff said to *"re-measure these for deadness rather than converting them"*. Correct
instruction, and the answer is a split: **every one of the hook entry points is dead, and every one
of the modules is alive.** `favicon-cache.ts` exports six functions of which one is the hook;
`pinned-items.ts` exports nine of which one is the hook. So F-b deletes nine functions, not seven
files — roughly 120 lines out of 698.

The last two entry points are not exports at all and would have been missed by an export scan:
`ComponentQueue`'s hook-shaped **methods** `use()` and `useRequest()`, which carry four
`react-hooks/rules-of-hooks` suppressions between them and have **zero call sites**.

One near-miss worth recording: `useComponentModel` appeared to have a consumer. Its single hit is a
**comment** in `GitTreeModel.ts:8` reading *"NOT created via `useComponentModel`"*. A grep for a
symbol finds the prose that mentions it, and this epic's whole deliverable is a grep-shaped claim.

---

## F-3 — The measured baseline

Taken 2026-08-28 on `upcoming-v4.0.23`, instrument validation green.

| Measure | Value |
|---|---|
| `react`/`react-dom` importers | **84** |
| — using React as a **value** (real runtime) | **14** |
| — **type-only** | **70** |
| Live React roots at runtime | **3** |
| Non-story `.tsx` files | **10** (of which 3 contain no JSX, 1 only in a comment) |
| Story `.tsx` files | **2** (`Panel.story.tsx`, `Text.story.tsx`) |
| Surviving `mountVanilla` faces | **10** (all in `.ts`, all dead — see F-2) |
| Dead hook entry points | **9** (7 exports + 2 `ComponentQueue` methods) |
| `mountReactHandle` call sites | **3** (draw, storybook, `index.tsx`) |
| Removable packages | **3** (`@emotion/react`, `@emotion/styled`, `react-markdown`) |
| Non-removable React packages | **4** (`react`, `react-dom`, `@types/react`, `@types/react-dom`) |

**The type surface is two contracts, not seventy decisions.** Of ~132 `React.<Type>` dereferences,
**85 are two types**:

```
50  React.Ref                 -> bindRef()        in uikit/shared/react-compat.ts
35  React.HTMLAttributes      -> applyRestProps() in uikit/shared/react-compat.ts
10  React.CSSProperties        9  React.ReactElement       8  React.ReactNode
 5  React.DragEvent            3  React.SyntheticEvent     2  React.ComponentType
 2  React.InputHTMLAttributes  2  React.ButtonHTMLAttributes
 1 each: UIEvent, RefObject, LabelHTMLAttributes, Dispatch, Fragment (a value, in a story)
```

Both live in `uikit/shared/react-compat.ts`, and **39 views call `applyRestProps`**. That is the
epic's real shape: one 168-line module defines the React-shaped contract that 70 files restate, so
the 70-file conversion is two decisions applied mechanically rather than seventy judgements.

**The three roots, by lifetime.** Only one of them is live in an ordinary session:

1. **`GlobalStyles`** (`index.tsx:15`) — Emotion `<Global>`, mounted at startup, **always live**.
2. **Storybook's `component:` arm** (`LivePreview.ts:161-183`) — `Panel.tsx`, `Text.tsx`,
   `EditorErrorBoundary.tsx`; live only while a React story is selected.
3. **The Excalidraw island** (`DrawBodyView.ts:170`) — live only on a draw page. **Permanent.**

---

## F-4 — The cut

Eight tasks. F-h is the gate and must run last; the rest are independent except where noted.

### The dead-code half — no behaviour to preserve, and it is most of the file count

**F-a · Delete the ten `mountVanilla` faces and the vanilla-to-React adapter.**
All ten are reachable only through barrel re-exports and are rendered by nothing. Verified per face:
`LogBody`, `ColorizedCode`, `FindBar`, `MonacoDiffEditorHost`, `MonacoEditorHost` have **zero**
references of any kind; `ContentHostFooter`'s single hit is a CSS import that shares the name;
`EditorToolbar`, `ScriptPanel`, `Popover` and `TreeItem` are re-exported by five barrels
(`editors/base/index.ts:28-29`, `editors/text/index.ts:2-3`, `uikit/index.ts:49,81`,
`uikit/Popover/index.ts:1`, `uikit/Tree/index.ts:8-9`) and rendered nowhere. None is referenced from
`boards-assets/`, `assets/`, `qa/` or `docs/`. Keep the sibling `*View.ts` classes and the model
exports that share those modules — only the face functions go, plus `mountVanilla` and `mountReact`
from `uikit/shared/mount.tsx`.

**F-b · Delete the nine dead hook entry points.** `useBoardUpdates`, `useFavicons`, `useModel`,
`useComponentModel`, `useBoardIcon`, `useBoardStandalone`, `usePinnedRefs`, and `ComponentQueue`'s
`use()`/`useRequest()`. The modules stay; `model.ts` keeps `effect`/`memo` (18 live call sites).
Delete the four `react-hooks/rules-of-hooks` suppressions with them — the suppression comments are
the tell that these were always fighting the linter.

**F-c · Four extension renames.** `renderer.tsx`, `content/tree-context-menus.tsx` and
`ui/dialogs/poppers/grid-context-menu.tsx` contain **no JSX** (the third's only marker is inside a
doc comment) and import no React; `index.tsx` joins them once F-d lands. Apply EPIC-072's gotcha:
after a `.tsx` → `.ts` rename, **touch the importers** or Vite serves a stale specifier resolution
that a renderer reload alone will not clear.

### The behaviour half — two tasks that can visibly break the app

**F-d · Convert `GlobalStyles` to native CSS injection; uninstall Emotion and `react-markdown`.**
160 lines of Emotion `<Global>` become a module that owns one `<style>` element and rewrites it on
`themeState` change — `themeState` is a `TOneState` (`theme/theme-state.ts:12`) whose own doc comment
says it exists "so non-React consumers can subscribe to the same synchronous notification path as
React views". This kills the always-live React root, lets `index.tsx` become `index.ts`, and drops
`@emotion/react` + `@emotion/styled`. `react-markdown` rides along: **zero importers in `src/`**,
already dead, converted away in the editor migration and left installed by design until this epic.
**Highest-risk task in the epic** — it owns every `--p-*` custom property and theme switching, and a
mistake is app-wide rather than local.

**F-e · Delete the React event proxy.** `react-compat.ts`'s `toPublicEvent` builds a Proxy
synthesizing a React `SyntheticEvent` for every rest-prop listener across 39 views. Measured
consumption of the members that justify it:

```
isPersistent  0    isDefaultPrevented  0    isPropagationStopped  0    persist  0
nativeEvent   2  ->  core/events/context-menu.ts:62   already handles both shapes:
                       const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
                     editors/link-editor/index.ts:260  event.nativeEvent  <- the only real fix
```

Fix one call site and the Proxy, the `React.SyntheticEvent` type, and ~50 lines go, with handlers
receiving the native `Event`. A genuine simplification rather than a rename — and therefore a real
behaviour change on every rest-prop listener in the app, which is why it is scoped as its own task
and not folded into F-f. **It runs after F-f** — see decision 3.

### The bulk half

**F-f · Collapse the type surface — the two contracts.** Define native equivalents next to the code
that consumes them (`react-compat.ts` should lose its name too — it will no longer be a compat
layer): an element-ref type replacing `React.Ref` (50 uses), an HTML-props type replacing
`React.HTMLAttributes` and its `Input`/`Button`/`Label` variants (40 uses), plus `CSSProperties`,
`DragEvent`, `UIEvent`, `ComponentType`, and `ReactNode`'s last home in
`fill-slot.ts:4`/`slots.ts:9`. **The props type must keep its camelCase `on*` handler keys** — the
39 `applyRestProps` callers rely on them for typo checking, so a `Record<string, unknown>` would
type-check while silently accepting `onClik`. 70 files, mechanical once the two types exist.

**F-g · Remove storybook's React arm.** `LivePreview.ts`'s React path, `Panel.tsx`, `Text.tsx`,
`Panel.story.tsx`, `Text.story.tsx`, `EditorErrorBoundary.tsx`, and `Story.component` /
`hasStoryComponent()` from `storyTypes.ts` — which collapses the story union to one shape. **This is
dead weight, not a capability** (decision 1): the arm is a closed loop of five files with no
application consumer, the components' real implementations are the native `panel-style.ts` /
`text-style.ts` used by ~150 and ~120 files, and `Panel.tsx:11-14` already documents itself as a
legacy shim that should *not* be given a vanilla replacement. Keep `EditorErrorBoundary.css` —
`NativeEditorErrorView.ts` imports it.

**F-h · The gate: move `mountReactHandle` into `editors/draw/` and turn the rule on.** After F-a,
F-d and F-g, `mountReactHandle` has exactly **one** consumer — `DrawBodyView.ts:170`. Move it there
and `uikit/` becomes React-free *by construction* rather than by audit.

> **`mount.tsx` cannot simply be deleted, and an earlier draft of this task said it could.**
> `VanillaViewCtor` — the `new (props: P) => VanillaView<P>` type that the entire vanilla
> architecture is built on — is declared at `mount.tsx:5` and has **13 consumers** in eight
> subsystems: `editorRegistry.ts:32,36`, `dialog-view-registry.ts:30`,
> `secondary-view-registry.ts:34`, `LazySecondaryViewView.ts`, all three `page-manager` files,
> `BrowserView.ts`, `editors/types.ts`, and `storyTypes.ts:44` (the surviving `view:` arm). It is
> pure structural typing with no React in it, and it is stranded in the React module by accident of
> history. **Relocate it to `uikit/shared/vanilla-view.ts`** — beside the `VanillaView` class it
> references, which `mount.tsx` already imports from there — and repoint the 13 importers. Only then
> does `mount.tsx` become empty enough to delete. This is the one non-mechanical edit in F-h and it
> touches more files than the rule does. Then add the local ESLint rule (the repo has carried a local `vanilla-view` plugin
since EPIC-071 — `eslint.config.mjs:434-440` is the registration precedent) forbidding
`react`/`react-dom` imports outside `editors/draw/**`. **Prove the rule bites** with a throwaway
import before declaring it done; a rule that matches nothing passes silently, which is how a
zero-baseline guard gives false comfort.

---

## F-5 — Decisions

**Decision 1 — storybook's React arm is removed (F-g), and it removes no capability.**
*(Corrected 2026-08-28, in answer to "why do we need React in storybook?" — the honest answer is
that we do not, and an earlier draft of this section overstated the cost by calling the arm a
capability.)*

**Storybook does not need React. The arm exists because two uikit components were never converted,
and it is a closed loop with nothing outside it:** `Panel.story.tsx` exists to demo `Panel.tsx`;
`Panel.tsx` survives because a story renders it; `LivePreview`'s `component:` path exists because
those two stories use it; `EditorErrorBoundary.tsx` exists because `LivePreview` wraps React stories
in it; and `mountReactHandle` keeps a React root inside `uikit/` because `LivePreview` calls it. Five
files sustaining each other and **zero application consumers** — `Panel` and `Text` are reachable
only through the `uikit/index.ts` barrel (`:12-13`, `:34-35`) and their own stories.

**The real implementations were never React.** `Panel/panel-style.ts` (349 lines, native,
`createPanelElement`) has **~150 consumers** and `Text/text-style.ts` has **~120**. `Panel.tsx` (152
lines) and `Text.tsx` (65) are wrappers that destructure props and hand them to those same native
resolvers. The native path *is* the API. And `Panel.tsx:11-14` already says so:

> *"Legacy, app-facing React layout shim. New vanilla views should use their own semantic container
> and stylesheet rather than introducing a vanilla Panel abstraction."*

So the codebase had already ruled that there is nothing to convert here — the standing guidance is
explicitly **not** to build a vanilla `Panel`, but to use a semantic container per view. F-g
therefore deletes the faces and creates **no** replacement work, which also means no uikit component
count goes down: `Panel` and `Text` were never live components.

**The one argument for keeping it is authoring stories in JSX, and the evidence refutes it:** 43
stories are `.story.ts` with a `view:` arm and **2** are `.story.tsx` — the arm's own two components.
No React story has been authored since. Meanwhile `mountReactHandle` retains the nest-React-in-vanilla
capability regardless, and after F-h the draw editor exercises it on every draw page — a better
standing test than a story nobody opens.

Two consequences to carry into the task: `Story.component`, `previewChildren`'s `ReactNode` arm and
`hasStoryComponent()` collapse, so `storyTypes.ts`'s union becomes a single shape rather than a
two-arm discriminated union — a simplification of the contract EPIC-069 built. And
`EditorErrorBoundary.css` **stays**: `NativeEditorErrorView.ts:3` already imports it, so the styling
serves a native consumer while only the boundary itself is `LivePreview`-only. Rename the CSS with
the boundary gone.

**Decision 2 — the four React packages stay installed, permanently, and that is the epic's stated
outcome rather than a shortfall.** Forced by Excalidraw's peer dependencies and its own `.d.ts`
(F-2, correction 1). Worth writing into the roadmap explicitly so no later reader treats a
`package.json` containing `react` as unfinished business.

**Decision 3 — F-f before F-e. (Reversed 2026-08-28; the original order was unsafe.)**

The first draft said F-e first, reasoning that deleting the proxy removes `React.SyntheticEvent`
before F-f restates the contract 70 times. That is true and it is the wrong trade, because **the
runtime half and the type half of this contract live in different tasks**:

- `applyRestProps` (F-e) decides what object a rest-prop handler *receives* at runtime.
- `React.HTMLAttributes` (F-f) decides what the call site *believes* it receives — `onClick` is
  typed `React.MouseEventHandler`, so the handler parameter is a React synthetic event.

Run F-e first and every `on*` handler starts receiving a native `Event` while its declared type
still promises a synthetic one. Nothing fails to compile. The concrete casualty is
`editors/link-editor/index.ts:260`:

```ts
onClick: (event) => this.openViewModeMenu(event.nativeEvent),
```

`event.nativeEvent` keeps type-checking against the stale React type and becomes `undefined` at
runtime — a silent break of the link-editor view-mode menu, in a file no one would think to open.
That is concern **C22** exactly.

Run **F-f first** and the same line becomes a **compile error** the moment the props type stops
being React's, so `tsc` enumerates every affected call site instead of leaving them to be found by
hand. The transient inconsistency in this direction is harmless: while the proxy still exists it is
a `Proxy` *over* the native event that forwards unknown properties to it, so a site corrected to
pass `event` directly keeps working until F-e removes the wrapper.

**Rule behind it, worth keeping:** when a contract's runtime and its types are changed by separate
tasks, change the **types first** — a type change fails loudly and lists the work, a runtime change
fails silently and hides it.

---

## F-6 — Concerns

**C19 · The epic's value is not legible in `package.json`.** It removes three packages, none of them
React, and its real deliverable is a lint rule plus ~20 deleted files. Anyone measuring it the way
Epics A–E were measured — markers, `.tsx` counts, packages dropped — will read it as thin.
Mitigation: F-1 states the closing property as an *enforcement* property from the start.

**C20 · A file-extension filter is not a language filter** (new; see F-2, correction 2). Ten faces
survived Epic E by moving from `.tsx` to `.ts`. Every instrument in this epic must match constructs —
`React.createElement`, `import … from "react"`, `mountVanilla(` — with no extension predicate, and
must strip comments before counting markers.

**C21 · A grep for a symbol also finds prose about the symbol.** `useComponentModel` looked live
because a comment says it is *not* used. This epic's closing property is itself a grep-shaped claim,
so its final measurement must strip comments — the same stripper the JSX counter already uses.

**C22 · F-d and F-e are the only two tasks that can break the app, and neither is caught by a build.**
A converted `GlobalStyles` that never subscribes to `themeState` compiles, renders, and simply stops
following theme changes; a deleted event proxy compiles and silently hands `undefined` to
`event.nativeEvent`. Both need runtime presence checks, and per EPIC-073's headline finding those
checks must observe the *effect*: switch the theme and re-read a `--p-*` value, and open
`link-editor`'s view-mode menu (which is also US-1153's already-unverified surface — worth pairing).

**C23 · Deleting a barrel export is an API change with no compiler signal inside the repo.** Ten
faces leave through five barrels. Nothing in `src/`, `boards-assets/`, `assets/`, `qa/` or `docs/`
references them, but user-authored scripts reach uikit names through the scripting API's type
surface. Check `assets/editor-types/` before removing a name from `uikit/index.ts`.

**C24 · `applyRestProps`' four behavioural special cases are undocumented outside their own file.**
`draggable`/`spellcheck`/`contenteditable` are enumerated rather than boolean attributes, `aria-*`
booleans must render as `"true"`/`"false"`, and stale attributes and listeners must be removed on
update. F-f rewrites the *types* around this code and F-e rewrites its *events*; both must leave
those four behaviours intact. `react-compat.ts:63-88` carries the reasoning — keep those comments
with the code when it is renamed.

---

## F-7 — What "the De-React programme is finished" will and will not mean

**Will:** no React in `uikit/`, no React in any editor but `draw`, one React root, one directory that
may import React, a lint rule that fails the build otherwise, and three fewer packages.

**Will not:** React uninstalled. `package.json` will still list `react`, `react-dom`,
`@types/react` and `@types/react-dom` after the last task, permanently, because Excalidraw requires
them. The programme's original opening line — *"Delete `react-dom`, then `react`"* — was invalidated
during EPIC-073 and replaced by the user's decision of 2026-08-27. Relocating Excalidraw into
persephone-boards remains explicitly **out of scope**; if that ever happens, the four packages become
removable and the ESLint rule's allowlist becomes empty, which is the cheapest possible follow-on.

---

## F-8 — Tasks

| # | Task | Scope | Status |
|---|---|---|---|
| F-a | US-1174: delete the ten dead `mountVanilla` faces, `mountVanilla`, `mountReact` | 10 faces + 5 barrels + `mount.tsx` | [x] |
| F-b | US-1175: delete the nine dead hook entry points | 7 modules | [x] |
| F-c | US-1176: four `.tsx` → `.ts` renames | 4 files + importer touch | [x] |
| F-d | US-1177: native `GlobalStyles`; uninstall Emotion + `react-markdown` | 2 files, 3 packages | [x] |
| F-e | US-1178: delete the React event proxy | `react-compat.ts` + 2 call sites | [x] |
| F-f | [US-1179: collapse the type surface to two native contracts](../tasks/US-1179-native-props-types/README.md) | ~70 files | [x] |
| F-g | US-1180: remove storybook's React arm | 6 files + `storyTypes.ts` | [x] |
| F-h | US-1181: move `mountReactHandle` into `editors/draw/`, add and prove the ESLint rule | `mount.tsx` → draw, `eslint.config.mjs` | [x] |

Ordering: F-a, F-b, F-c, F-d, F-g are independent. **F-f before F-e** (decision 3 — reversed;
changing the types first turns a silent runtime break into a compile error). **F-h last** — it
depends on F-a, F-d and F-g having removed `mountReactHandle`'s other two call sites, and on F-f
having cleared the type surface the rule would otherwise flag 70 times.

## F-9 — Progress

### Landed

**F-a / F-b / F-c — the dead-React sweep (US-1174/1175/1176), complete and verified.**
30 files changed, **+66 / -673**. Eight face modules deleted, `mountVanilla` / `mountReact` /
`VanillaHost` removed from `mount.tsx`, the face function stripped from `ScriptPanel.ts` and
`TreeItem.ts`, five barrels edited, `ui/dialogs/poppers/types.ts` repointed to `PopoverModel`, nine
dead hook entry points and four `react-hooks` suppressions deleted, three files renamed `.tsx` → `.ts`
(`index.html:39` needed updating with them — it loads `/src/renderer.ts` as the entry). Gates green.

Three **stale doc comments** referencing the deleted `mountVanilla` were also rewritten
(`DataGridView.ts:13`, `ListItemView.ts:23`, `TreeItemView.ts:29`). They were dangling references to
removed code, and concern **C21** is exactly that a grep for a symbol finds the prose about it — the
epic's own closing measurement is grep-shaped, so leaving them would poison it.

*Presence verified live after a cold restart* (not just a green build): 26 icon buttons at 24x24,
8 page tabs at 50x32, 17 panels at 369x981, tree rows with boxed descendants at 18x20, a virtual grid
with 456 boxed descendants at 369x885, monaco at 1551x919, and a pushed markdown `h3` rendering at
264x16 — which is `LogBodyView`, the one deleted face with no other reachable surface. React roots: 1
(`GlobalStyles`, expected at that point).

**F-d — native global styles (US-1177), complete; one runtime check deferred.**
`theme/global-styles.ts` replaces `GlobalStyles.tsx`; `index.tsx` → `index.ts`; `@emotion/react`,
`@emotion/styled` and `react-markdown` uninstalled while all four React packages are retained.
Gates green, cold start clean.

Verified live: `style[data-name="global-styles"]` present with **4,967 characters** of CSS,
`style[data-emotion]` count **0**, themed `body` background, the scrollbar-arrow data URI carrying a
**literal** `%23969696` with `var(` absent from it — and **`[data-react-root]` count 0**, which is the
headline: *the always-live React root is gone.*

**Deferred: the theme-switch rebuild.** Argued sound by inspection — `installGlobalStyles`
subscribes with the selector form (`themeState.subscribe(cb, (s) => s.id)`), the callback re-runs the
same `buildGlobalStyles()` used at install, and `applyTheme` sets `themeState` *after* writing the
CSS variables (`themes/index.ts:75`), so `resolveColor` sees the new theme when subscribers fire. Not
confirmed at runtime, for two reasons worth recording:

1. **`app.settings.set("theme", …)` does not apply a theme in-session.** It persists and emits
   `_onChanged`; `applyTheme` is called only from `loadSettings` (the file-watcher path) and
   `ThemeSection.ts:138`. Measured: after `set("theme","monokai")` the setting read back as `monokai`
   while `--color-bg-default` stayed `#1f1f1f`. **That is a property of the settings path, not
   evidence about the subscription** — recording it explicitly because it is exactly the shape of
   EPIC-073's two false alarms.
2. The verification channel died mid-task (below).

### Instruments: two new failures, both in the channel rather than the code

- **`execute_script` cannot use dynamic `import()`.** The runner evaluates through `new Function`,
  and V8 rejects `import(` in that position with `SyntaxError: missing ) after argument list` — a
  *parse* error, so nothing in the script runs and the message names no import. This cost several
  cycles of misdiagnosis (object literals were suspected first). **To reach a module singleton from a
  script, use the `app` global; there is no import escape hatch.**
- **Raw HTTP to the app's MCP endpoint is not a reliable fallback.** When Claude Code's `persephone`
  MCP client disconnected, `http://127.0.0.1:7865/mcp` accepted `initialize` and returned a session
  id, answered a few `tools/call`s, then went silent for every subsequent call *including
  main-process-only tools like `tools/list`* — while the app itself stayed healthy (window titled
  Persephone, port listening, no renderer errors in the dev log). The failure mimics a dead renderer
  and is not one. **Do not diagnose a renderer from this transport.**

**F-g — storybook's React arm removed (US-1180), complete.**
`Panel.tsx`, `Text.tsx`, both stories, both barrels and `EditorErrorBoundary.tsx` deleted;
`EditorErrorBoundary.css` renamed to `NativeEditorErrorView.css` with rules untouched; `Story` is a
single interface and `LivePreview.ts` has **zero** React references. Gates green.
**43 stories survive** — my task document guessed 41, which was simply wrong arithmetic; it had told
Codex to report the observed count rather than assert mine, and that is why the error surfaced
immediately instead of becoming a false acceptance criterion.

**`find src -name '*.tsx'` now returns exactly two files:** `editors/draw/ExcalidrawIsland.tsx`
(permanent) and `uikit/shared/mount.tsx` (F-h's target). Zero story `.tsx`.

### Instrument defect 6 — and it means the programme's React census was wrong for two epics

**The classifier's import regex hardcoded double quotes.** `core/state/state.ts:1` is
`import React, { SetStateAction, useEffect, useRef, useState, useSyncExternalStore } from 'react';`
— single-quoted, and therefore **invisible to every measurement this programme has published**,
including EPIC-073's handoff and this epic's own F-3 baseline. It is not a marginal file: it calls
`useSyncExternalStore`, `useEffect` and `useRef`, so it is a live React **runtime** user.

I reported "84 → 69 importers, 14 → 2 value users" mid-epic. **Both figures were wrong.** Corrected,
quote-agnostic, measured after F-a/F-d/F-g:

| Measure | Value |
|---|---|
| `react`/`react-dom` importers | **70** |
| — React as a **value** (runtime) | **3** — `ExcalidrawIsland.tsx`, `core/state/state.ts`, `uikit/shared/mount.tsx` |
| — type-only | **67** |
| Global `React.*` with **no import at all** | **1** — `core/traits/dnd.ts:48` (`React.DragEvent`) |
| Total React-touching files | **71** |

Two lessons, and they are the same lesson C20 already states in a different costume:

> **A census keyed to one spelling of a construct is not a census of the construct.** Gen 3 of this
> instrument was broken by a heredoc eating `\b`; gen 4 by assuming double quotes. Both produced
> plausible numbers. Match `from ['"]react` — and separately, match the **global** `React.`
> namespace, because `@types/react` declares it, so a file can reference React types while importing
> nothing and no import-based query will ever see it.

The repaired instrument also revealed that its own regex still contained **two literal backspace
characters** where `\b` belonged — gen 3's damage, surviving inside gen 4 and masked by a lazy
quantifier that happened to stop in the right place. Repaired; numbers unchanged, which is the only
reason the earlier gen-4 counts were internally consistent at all.

### A blocking discovery: the dead `IState.use()` hook path

`core/state/state.ts` being a React value user **would have made F-h's ESLint rule impossible** — the
rule allows React only under `editors/draw/**`, and this file is in `core/`. So it must lose React,
not keep it.

It can. `IState.use` (`state.ts:15,77-121`) is reached only through **13 wrapper methods**, and every
one has **zero non-comment callers**: `board-install-registry.ts:131`, `board-trust.ts:66,78`,
`published-boards.ts:84,116`, `recent.ts:24`, `settings.ts:220`, `registered-tools.ts:99,109`,
`tool-stats.ts:55`, `tools-trust.ts:58,68`, `window.ts:84`, `busy-boards.ts:39`,
`custom-editor-registry.ts:157`. The only textual hit on any wrapper name outside its declaration is
a comment at `published-boards.ts:107` — **C21 for the third time this epic**.

This is the same shape as F-b and it is the last of it: the React *consumers* were deleted by Epics
D and E, leaving the hook providers stranded and invisible. Folded into **F-f** rather than made a
ninth task, because `state.ts` is already in F-f's file list and F-f is the task that must make it
React-free. Recorded in F-f's document as a stated precondition for F-h.

### Instrument defect 7, and a user-facing breaking change nobody had noticed

Reviewing F-f's plan produced two pushbacks from Codex, **both correct, and both against my own
numbers.**

**A fourth React value user, invisible to a deref-based scan.** `scripting/ScriptContext.ts:9`
imports React and `:64` does `readonly React = React;`. The classifier called it type-only because
React appears only as a **bare identifier** — never `React.something` — and the value test looks for a
namespace dereference at a lowercase or known-value member. So:

> **A namespace used as a value is not always dereferenced.** Test for the bare identifier —
> assigned, passed, or re-exported — not only for `Namespace.member`.

That is now three distinct blind spots in one census (quote style, missing import, bare identifier),
each of which produced a confident and wrong total. The corrected count of React **value** users is
**4**: `ExcalidrawIsland.tsx`, `core/state/state.ts`, `uikit/shared/mount.tsx`, `ScriptContext.ts`.

**And that one is a documented public API.** `React` is injected as a global into *every user script*
— `ScriptRunnerBase.ts:12` and `library-require.ts:17` both prepend `React=this.React` beside `app`,
`page`, `io`, `ai` — and `docs/scripting.md:490` lists it among the script globals, with
`whats-new.md:1145` announcing library modules gaining it.

It is removed anyway, because it is **provably inert**: no script-facing API can consume a React
value (zero `ReactNode`/`ReactElement`/`JSX` across all 40 `assets/editor-types/*.d.ts`),
`styledText` returns a native builder, no sample or board script uses `React.`, and the global never
had a `.d.ts` declaration so it never appeared in IntelliSense. A script can build a React element
today and nothing in the app can render it — useful when editors were React, inert since Epic E.

**This is nevertheless the epic's one breaking change, and it is recorded as such rather than
absorbed silently.** Any existing user script referencing `React` will now throw `ReferenceError`.
`docs/scripting.md` loses it from the globals list; `whats-new.md:1145` is left alone as a changelog
record of what shipped then, and `/userdoc` owns writing the removal note.

**Codex's second pushback:** 15 `state.use()` wrapper call sites, not the 13 I counted (17 matches
minus 2 comments). Corrected.

Both corrections came from the delegated side reviewing *my* review. Worth recording because the
workflow's stated value is the opposite direction.

### Remaining

F-f (plan corrected; implementation next), then F-e, then F-h. Ordering per decision 3 and F-8.
F-f now additionally owns making `core/state/state.ts` and `ScriptContext.ts` React-free, both of
which are **preconditions for F-h's rule** rather than optional cleanup.


---

## F-10 — Close record

### The closing property, assessed

| # | Statement | Verdict |
|---|---|---|
| 1 | An ESLint rule forbids `react`/`react-dom` outside `editors/draw/**`; baseline 84 importers driven to zero | **Met, and proven to bite.** `eslint.config.mjs:565-572` adds both to `no-restricted-imports` with an EPIC-074 message. Four probes: a throwaway `react` import under `uikit/` **failed** lint at `vanilla-view.ts:1:1`; removing it passed; the same import inside `editors/draw/` **passed**; removing it left lint passing. Both halves matter — a rule that fires everywhere would break the one legitimate place |
| 2 | `uikit/` contains no reference to React in any form — value, type, or `.tsx` | **Met.** `uikit/shared/mount.tsx` is deleted, `VanillaViewCtor` moved to `vanilla-view.ts`, and no `.ts`/`.tsx` file under `uikit/` imports React. `find src/renderer/uikit -name '*.tsx'` returns nothing. Presence: every uikit story renders; the four `applyRestProps` behaviours survive |
| 3 | Exactly **one** React root at runtime, mounted by the Excalidraw island | **Met.** Verified by pixel histogram: a draw page renders non-blank with **1** `[data-react-root]`; closing it leaves **0**. The always-live `GlobalStyles` root is gone |
| 4 | `@emotion/react`, `@emotion/styled`, `react-markdown` uninstalled | **Met.** All three removed; `react`, `react-dom`, `@types/react`, `@types/react-dom` deliberately retained. Presence: native `<style data-name="global-styles">` carries 4,967 characters of CSS, `style[data-emotion]` count is 0, `body` is themed. **One deferred check** — see below |

**Measured, epic open → close.** `react` importers **85 → 2**; React **value** users **16 → 2**;
type-only **69 → 0**; files touching the global `React` namespace with no import **1 → 0**; non-story
`.tsx` **10 → 1**; story `.tsx` **2 → 0**. 169 files changed, **+468 / −2,877**. The two survivors are
`editors/draw/ExcalidrawIsland.tsx` and `editors/draw/react-island.ts`, both inside the one permitted
directory.

> **Those opening figures are not the ones this epic published at F-3.** F-3 said 84 / 14 / 70. The
> true baseline was 85 / 16 / 69, and the difference is three separate defects in the measuring
> instrument, all found *during* the epic. See below — it is the epic's main finding.

### The finding that outlasts the epic: a census keyed to one spelling is not a census

This programme has measured React usage in every epic since A. In this one the instrument was wrong
**three times**, each in a different way, and each time it produced a plausible, confident, wrong
total:

1. **Quote style.** The import regex hardcoded double quotes. `core/state/state.ts:1` is
   `… from 'react';` — single-quoted — so a file calling `useSyncExternalStore`, `useEffect` and
   `useRef` was invisible to *every measurement this programme has published*, including EPIC-073's
   handoff.
2. **No import at all.** `@types/react` declares a global `React` namespace, so `core/traits/dnd.ts:48`
   could write `React.DragEvent` with no import. No import-based query can ever see that.
3. **Bare identifier.** The value test looked for `React.member`. `scripting/ScriptContext.ts:64` does
   `readonly React = React;` — a namespace used as a value without ever being dereferenced — and was
   filed as type-only.

> **Measure the construct three ways: how it is spelled, whether it is imported at all, and whether
> it is used without being dereferenced.** Each of the three misses above was individually invisible
> and collectively changed the epic's scope: defects 1 and 3 were *blocking*, because both files were
> React **value** users outside `editors/draw/`, so F-h's rule could not have passed while either
> stood. An epic whose deliverable is a lint rule cannot be scoped by a query weaker than the rule.

A fourth, smaller instance: the repaired regex still contained **two literal backspace characters**
where `\b` belonged — gen 3's heredoc damage, surviving inside gen 4, masked by a lazy quantifier
that happened to stop in the right place. It never changed a number, which is why it survived two
epics.

### The two blocking discoveries, and why they were the same shape as F-a

Both were dead React *providers* left stranded when Epics D and E deleted their consumers — exactly
F-a's and F-b's shape, one layer deeper:

- **`IState.use()`**, the React-hook path on the state primitive, reached only through **15** wrapper
  methods across 11 api/editor files. Every one had zero non-comment callers. Deleting them let
  `core/state/state.ts` drop React entirely.
- **`ScriptContext.React`**, injected as a global into every user script by
  `ScriptRunnerBase.ts:12` and `library-require.ts:17`.

Both were folded into F-f rather than becoming new tasks, because F-f owned the files.

### The epic's one breaking change, recorded rather than absorbed

**`React` was a documented script global and has been removed.** `docs/scripting.md:490` listed it
beside `app`, `page` and `ui`; `whats-new.md:1145` announced library modules gaining it. Any user
script referencing `React` now throws `ReferenceError`.

It went because it was **provably inert**, not merely unused: no script-facing API can consume a React
value (zero `ReactNode`/`ReactElement`/`JSX` across all 40 `assets/editor-types/*.d.ts`), `styledText`
returns a native builder, no sample or board script used it, and it never had a `.d.ts` declaration so
it never appeared in IntelliSense. A script could build a React element that nothing in the app could
render — useful when editors were React, inert since Epic E.

`docs/scripting.md` loses it from the globals list. `whats-new.md:1145` is left intact as a changelog
record of what shipped then.

### Two plan corrections made mid-epic, both from reading the code

1. **F-e and F-f were ordered wrongly.** The original plan ran the runtime change (deleting the event
   proxy) before the type change. But the runtime half and the type half of that contract live in
   different tasks, so that order leaves every `on*` handler receiving a native `Event` while its
   declared type promises a synthetic one — nothing fails to compile, and
   `editors/link-editor/index.ts:260`'s `event.nativeEvent` silently becomes `undefined`. Reversed.
   **Rule: when a contract's runtime and its types are changed by separate tasks, change the types
   first — a type change fails loudly and lists the work, a runtime change fails silently and hides
   it.**
2. **F-h could not "just delete `mount.tsx`".** `VanillaViewCtor` — the type the whole vanilla
   architecture rests on, with 13 references across eight subsystems — was declared in that React
   module by accident of history. It is pure structural typing; relocating it to
   `uikit/shared/vanilla-view.ts` was the actual precondition, and it touched more files than the rule
   did.

### Delegation: the review loop ran in both directions

Two of my review findings were pushed back on by the delegated side and **both pushbacks were
correct**: 15 `state.use()` wrapper call sites rather than the 13 I counted, and `ScriptContext.ts` as
a fourth React value user I had missed. The workflow's stated value is my reviewing its plans; on this
epic it also caught two of my errors. Worth recording, because the asymmetry is usually assumed.

A third case is my own arithmetic: F-g's task document asserted "41 stories remain". It is 43. The
document had told the implementer to **report the observed count rather than assert mine**, which is
the only reason it surfaced as a note instead of a false acceptance criterion.

### Review

`/review` found **two must-fix items and one optional**, all verified against source and all fixed:

1. **`dom-props.ts` matched enumerated attributes case-sensitively** while the new props type spells
   them camelCase. `ENUMERATED_ATTRIBUTES` holds `spellcheck`/`contenteditable`; the type declares
   `spellCheck`/`contentEditable`. So `spellCheck={true}` would have taken the boolean-attribute path
   and written `""` — which for an *enumerated* attribute means `auto`, i.e. silently the opposite of
   what was asked. The mismatch existed in shape before F-f (React's own props type is camelCase too)
   but F-f made the contract explicit and therefore visibly inconsistent. Now compared lowercased,
   with the reasoning kept at the call site.
2. **The props type omitted `draggable`** while the helper still special-cases it — the runtime
   supported a key the type forbade. Added, typed as the enumerated `boolean | "true" | "false" |
   "auto"`.
3. *(optional, fixed)* `PageSlot.ts` imported `vanilla-view` twice after F-h's repointing, which is
   where the build's two `import/no-duplicates` warnings came from. Merged; **lint is now clean at
   zero warnings**, where it had carried two throughout the epic.

The first is the one worth remembering: a rename that makes an implicit contract explicit will surface
disagreements that were always there. Neither half was new; only their being written down was.

`/document` updated eight developer-doc areas. `/userdoc` removed `React` from the script-globals list
and added the breaking-change note plus a what's-new entry — the only user-visible change this epic
made.

### Verification: what was and was not exercised

Verified live after a cold restart, via pixel histogram, backing-store reads and element geometry —
never by a green build alone: the dead-code sweep's five surviving implementations (toolbar, footer,
log body, tree rows, virtual grid, monaco, and a pushed markdown `h3`), the native global stylesheet,
the zero-root and one-root states, and a non-blank Excalidraw canvas.

**Deferred, and honestly so — the theme-switch rebuild.** Argued sound by inspection:
`installGlobalStyles` subscribes with the selector form, the callback re-runs the same
`buildGlobalStyles()` used at install, and `applyTheme` sets `themeState` *after* writing the CSS
variables (`themes/index.ts:75`), so `resolveColor` sees the new theme when subscribers fire. Not
confirmed at runtime. Two things blocked it, both worth recording:

1. **`app.settings.set("theme", …)` does not apply a theme in-session.** It persists and emits
   `_onChanged`; `applyTheme` runs only from the file-watcher path and `ThemeSection.ts:138`.
   Measured: after `set("theme","monokai")` the setting read back as `monokai` while
   `--color-bg-default` stayed `#1f1f1f`. **That is a property of the settings path, not evidence
   about the subscription** — and mistaking it for one would have been this epic's false alarm.
2. The verification channel failed (below).

### Instruments: the verification channel, and a scripting limitation

- **`execute_script` cannot use dynamic `import()`.** The runner evaluates through `new Function`, and
  V8 rejects `import(` there with `SyntaxError: missing ) after argument list` — a *parse* error, so
  nothing runs and the message names no import. **To reach a module singleton from a script, use the
  `app` global; there is no import escape hatch.**
- **Raw HTTP to the app's own MCP endpoint is not a usable fallback.** When the editor's MCP client
  disconnected mid-epic, `http://127.0.0.1:7865/mcp` accepted `initialize`, answered a few
  `tools/call`s, then went silent for everything — *including main-process-only tools* — while the app
  stayed healthy (window present, port listening, no renderer errors). The failure mimics a dead
  renderer and is not one. **Do not diagnose a renderer from that transport.**

### Still unverified, cheapest and highest-value first

1. **A theme switch** through the UI (Settings → Theme, which calls `applyTheme` directly), confirming
   the scrollbar-arrow data URIs recolour. The one deferred acceptance criterion.
2. **A rest-prop listener firing** after the event proxy's removal — the `Dot` story forwards
   `onClick` through `applyRestProps`; and `aria-expanded` still serialising as `"false"` on a closed
   `Select`.
3. **`event.key` in a keyboard handler** — the WebIDL brand-check case the proxy was originally
   written to work around.
4. **The link-editor view-mode menu**, the call site the F-f/F-e ordering exists to protect, and also
   an open item from US-1153.
5. Everything still listed in **US-1173** from EPIC-073 — dialog commit/focus, popover resize, graph
   interaction, rest-client Monaco hosts, av-grid editing, the repointed stories.

### What "the De-React programme is finished" means

**Does mean:** no React in `uikit/`, none in any editor but `draw`, one React root, one directory that
may import React, and a build failure if that changes. Three packages gone. The only `.tsx` file in
the repository is `editors/draw/ExcalidrawIsland.tsx`.

**Does not mean React is uninstalled.** `react`, `react-dom`, `@types/react` and `@types/react-dom`
remain in `package.json` permanently, because `@excalidraw/excalidraw` declares the first two as peer
dependencies and its own `dist/types/excalidraw/index.d.ts` imports React — so the type packages are
required to typecheck the island regardless of how few of our files reference them. The programme's
original opening line, *"Delete `react-dom`, then `react`"*, was invalidated in EPIC-073 and replaced
by the user's decision of 2026-08-27: **React only where a vendor requires it.**

Relocating Excalidraw into persephone-boards stays out of scope. If it ever happens, those four
packages become removable and the ESLint rule's allowlist becomes empty — the cheapest possible
follow-on, and the rule is what will prove it.
