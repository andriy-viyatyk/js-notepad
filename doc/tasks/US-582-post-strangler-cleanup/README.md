# US-582: Post-strangler cleanup — drop V4 prefix, fold v4/ folder up, strip EPIC-028 narrative

**Status:** Active 2026-05-29 — investigation complete; ready for implementation
**Epic:** EPIC-028 — Unified Editor Architecture
**Predecessors:** US-559 (strangler retirement closed the legacy stack)
**Successor:** EPIC-028 close (docs-update follow-on task TBD, then `/review` + epic move to `completed.md`)
**Branch:** `upcoming-v4.0.1`

---

## Goal

Erase the strangler-fig migration's naming and commentary residue from the v4 codebase so future readers see a single coherent editor architecture — not a parallel-naming snapshot from a two-month transition that no longer exists at runtime.

Three deletions:

1. **Rename `as V4EditorModel` → plain `EditorModel`** across 54 files (61 occurrences). The legacy `editors/base/EditorModel.ts` class is gone; the `V4` prefix no longer disambiguates anything.
2. **Promote `editors/base/v4/*` → `editors/base/*`** (the slot vacated by US-559's C559-2 Option B fold-up). The v4 was the *new* base during the strangler; it is now *the* base. Updates ~125 import paths.
3. **Strip EPIC-028 / US-5XX / strangler narrative + concern-ID anchors from doc-comments** across 109+ files. The history reads as dangling pointers to deleted code.

Plus three structural-name fixes the V4 cleanup exposes:
- `wrapLegacyForPage(legacy)` → `attachEditorToPage(editor)` (no longer "wraps" anything — early-return covers every v4 input; the TextFileModel branch constructs a fresh v4 editor and attaches).
- `mainEditor` + `mainEditorV4` folded into one `mainEditor` getter (the `unwrapAdapter` passthrough goes away with `LegacyEditorAdapter`).
- `EditorModel` type alias renamed → `EditorOrHost` (resolves the post-Phase-1 collision between the class name and the union-of-class-and-host alias).

## Background

### Where the V4 names came from

EPIC-028 ran from US-547 through US-559 as a **strangler-fig migration**: the new `editors/base/v4/EditorModel` class lived **alongside** the legacy `editors/base/EditorModel` class during the entire migration. While both classes coexisted, the `V4` prefix disambiguated imports inside per-editor files that referenced both shapes (US-548's `LegacyEditorAdapter` bridge phase, US-551 onwards' typed-host getters, the dual-camp `instanceof` checks in `wrapLegacyForPage`).

US-559 (the strangler retirement, EPIC-028 Phase D) deleted the legacy base class entirely. C559-2 Option B folded `getDefaultEditorModelState()` into `TextFileModel`, deleted `editors/base/EditorModel.ts`, and made `EditorModel` a **type alias** (`V4EditorModelType | TextFileModelType`) in `editors/base/index.ts` for backward-compatible barrel imports.

After US-559, the runtime has one editor base class — the one currently named `V4EditorModel` and living in `editors/base/v4/`. The V4 prefix and the v4/ subdirectory are leftover scaffolding.

### Where the EPIC-028 commentary came from

Per-task investigation passes (US-551 through US-576) resolved 200+ concerns up front and dropped concern-ID anchors (`LK7`, `HS1`, `EX-IMPL2`, `AB-IMPL3`, etc.) directly into source comments so during implementation each line's rationale traced back to a specific resolved concern in the task doc.

After US-559 closes the strangler, those anchors point at task docs the future reader has no incentive to open. The rationale that mattered (e.g., HS1's host-slot persistence model) either lives in the editor's behavior or has been promoted to the standards docs. Per user direction: strip all of them.

### Folder collision risk — `IContentHost.ts`

Two `IContentHost.ts` files exist:

- **`editors/base/IContentHost.ts`** — legacy content-host interface (preserved through Phase 5 deletes per `editors/base/index.ts:50-54`). Imported by **exactly 1 file**: `base/index.ts` re-export (Grep verified).
- **`editors/base/v4/IContentHost.ts`** — v4 content-host interface. Imported by all 20+ v4 editor classes.

The legacy one is dead code post-US-559. **Plan: delete `editors/base/IContentHost.ts`, drop the `base/index.ts` re-export, then move `editors/base/v4/IContentHost.ts` up.**

### `EditorStateStorage` — no collision

- **`editors/base/EditorStateStorageContext.tsx`** — React Context (`EditorStateStorageProvider`, `useEditorStateStorage`, `useObjectStateStorage`). Live; exported from `base/index.ts`.
- **`editors/base/v4/EditorStateStorage.ts`** — the v4 storage interface + concrete class. Live; consumed by `EditorModel.adoptHost`.

Different filenames, different purposes. Both end up at `editors/base/` post-move with no overlap.

## Implementation plan

Six phases, three commits. Each commit independently buildable + lint-clean.

### Commit A — Naming cleanup (Phases 1 + 2 + 5)

Mechanical renames. No file moves. No behavioral change.

#### Phase 1 — Drop `as V4EditorModel` / `as V4EditorModelType` aliases

Every import of `EditorModel` from `editors/base/v4/EditorModel` (or its barrel) currently aliases to `V4EditorModel`. Drop the alias.

**Before:**
```typescript
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
} from "../base/v4/EditorModel";

export class AboutEditor extends V4EditorModel<AboutEditorState> { /* … */ }
```

**After:**
```typescript
import {
    EditorModel,
    type EditorStateBase,
} from "../base/v4/EditorModel";

export class AboutEditor extends EditorModel<AboutEditorState> { /* … */ }
```

(Path stays `../base/v4/EditorModel` in this commit — Phase 4 in Commit B moves the file.)

**Files (54, Grep verified):**
- 22 v4 editor classes: `AboutEditor.ts`, `ArchiveEditor.ts`, `BrowserEditor.ts`, `CategoryEditorModel.ts`, `DrawEditor.ts`, `ExplorerEditorModel.ts`, `GraphEditor.ts`, `GridEditor.ts`, `HtmlEditor.ts`, `ImageEditor.ts`, `LinkEditor.ts`, `LogViewEditor.ts`, `MarkdownEditor.ts`, `McpInspectorEditorModel.ts`, `MermaidEditor.ts`, `MonacoEditor.ts`, `NotebookEditor.ts`, `PdfEditor.ts`, `RestClientEditor.ts`, `SettingsEditor.ts`, `StorybookEditorModel.ts`, `SvgEditor.ts`, `TodoEditor.ts`, `VideoEditor.ts`
- 22 v4 `index.tsx` editor modules (one per editor folder)
- Cross-cutting: `src/renderer/api/pages/PageModel.ts`, `src/renderer/api/pages/PagesLifecycleModel.ts`, `src/renderer/scripting/api-wrapper/PageWrapper.ts`, `src/renderer/ui/app/RenderEditor.tsx`, `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx`, `src/renderer/editors/text/TextEditorModel.ts`, `src/renderer/editors/base/index.ts`

#### Phase 2 — Drop other `V4`-prefixed identifiers

| Current | New | Files |
|---|---|---|
| `V4_NO_HOST_EDITOR_IDS` constant | `NO_HOST_EDITOR_IDS` | `src/renderer/api/pages/PagesPersistenceModel.ts` (definition); `src/renderer/api/pages/PagesLifecycleModel.ts` (reference) |
| `V4NativeEditor` component | `NativeEditor` | `src/renderer/ui/app/RenderEditor.tsx` (1 file) |
| `wrapLegacyForPage(legacy)` function + `legacy` parameter | `attachEditorToPage(editor)` + `editor` parameter | `src/renderer/api/pages/PagesLifecycleModel.ts:73` (definition), `:311` (`const wrap = wrapLegacyForPage` local alias), plus call sites and ~20 comment references in editor files |
| `mainEditorV4` getter (PageModel) | **deleted** — folded into `mainEditor` | `src/renderer/api/pages/PageModel.ts:174-176` (delete getter); all callers update from `mainEditorV4` → `mainEditor` |
| `unwrapAdapter` helper (PageModel) | **deleted** — passthrough post-strangler | `src/renderer/api/pages/PageModel.ts:30` (definition), `:156`, `:505` (call sites) |
| `LegacyEditorModel` local union alias | **deleted** — use `EditorOrHost` from `editors/base` (Phase 5) | `src/renderer/api/pages/PageModel.ts` (1 declaration); `src/renderer/api/pages/PagesLifecycleModel.ts` (1 declaration — same definition twice) |

**`mainEditor` fold-up details** (`PageModel.ts:154-176`):

**Before:**
```typescript
/** Main editor — unwraps the adapter for back-compat callers.
 *  V4 callers access the adapter via `mainEditorV4` or by iterating `editors[]`. */
get mainEditor(): EditorModel | null {
    return unwrapAdapter(this.mainEditorV4);
}

set mainEditor(editor: V4EditorModel | EditorModel | null) {
    const v4 = …;
    this._mainEditorId = v4?.id ?? null;
    this.state.update((s) => { s.mainEditorId = v4?.id ?? null; });
}

get mainEditorV4(): V4EditorModel | null {
    if (!this._mainEditorId) return null;
    return this.editors.find((e) => e.id === this._mainEditorId) ?? null;
}

function unwrapAdapter(editor: V4EditorModel | null): LegacyEditorModel | null {
    // (Returns the editor as-is post-US-559 — LegacyEditorAdapter is gone.)
    return editor;
}
```

**After:**
```typescript
get mainEditor(): EditorModel | null {
    if (!this._mainEditorId) return null;
    return this.editors.find((e) => e.id === this._mainEditorId) ?? null;
}

set mainEditor(editor: EditorModel | null) {
    this._mainEditorId = editor?.id ?? null;
    this.state.update((s) => { s.mainEditorId = editor?.id ?? null; });
}
```

`unwrapAdapter` deleted. ~30 `mainEditorV4` callers across `PageModel.ts` / `PagesLifecycleModel.ts` / editor files update to `mainEditor`.

#### Phase 5 — Rename `EditorModel` type alias → `EditorOrHost`

Post-Phase-1, the class `EditorModel` (imported from `editors/base/v4/EditorModel`) collides with the union type alias `EditorModel` in `editors/base/index.ts`:

```typescript
// editors/base/index.ts (CURRENT)
import type { EditorModel as V4EditorModelType } from "./v4/EditorModel";
import type { TextFileModel as TextFileModelType } from "../text/TextEditorModel";
export type EditorModel = V4EditorModelType | TextFileModelType;
```

Post-Phase-1 this becomes `export type EditorModel = EditorModelType | TextFileModelType` — name collides.

7 importers consume the union (Grep verified):
- `src/renderer/scripting/ScriptRunner.ts`
- `src/renderer/scripting/ScriptContext.ts`
- `src/renderer/scripting/api-wrapper/PageWrapper.ts`
- `src/renderer/ui/app/RenderEditor.tsx` (already imports as `LegacyEditorModel` — drops the alias too)
- `src/renderer/ui/app/AsyncEditor.tsx`
- `src/renderer/ui/navigation/secondary-editor-registry.ts`
- `src/renderer/ui/navigation/LazySecondaryEditor.tsx`

**Resolution: rename the union alias to `EditorOrHost`.** 7 importers ≥ the 5-caller threshold for keeping a barrel symbol named.

**Before** (`editors/base/index.ts`):
```typescript
export type EditorModel = V4EditorModelType | TextFileModelType;
```

**After:**
```typescript
import type { EditorModel } from "./EditorModel";   // ← Phase 4 path
import type { TextFileModel } from "../text/TextEditorModel";

/** Union returned by `PageModel.mainEditor` — either a v4 `EditorModel` (the
 *  common case) or a `TextFileModel` host (legacy text-bearing pages where
 *  the host outlived its editor across switches). */
export type EditorOrHost = EditorModel | TextFileModel;
```

The 7 importers update `import { EditorModel }` → `import { EditorOrHost }` and rename local usages.

### Commit B — Folder move (Phases 4a + 4b + 4c + 4d)

Pure move. No behavioral change. Biggest diff by line count.

#### Phase 4a — Delete legacy `editors/base/IContentHost.ts`

1. Verify `editors/base/IContentHost.ts` is referenced only by `base/index.ts` re-export (Grep already confirmed).
2. Delete `src/renderer/editors/base/IContentHost.ts`.
3. Drop the re-export line + preservation comment block from `src/renderer/editors/base/index.ts:50-54`.

The slot is now free for Phase 4c to move the v4 version up.

#### Phase 4b — Fold `editors/base/v4/index.ts` into `editors/base/index.ts`

The v4 barrel re-exports `EditorModel`, `EditorStateBase`, `RestoreData`, `IContentHost`, `IContentHostState`, the registry symbols, `PageToolbar`, `TextChrome`, plus `IPageHost`, `EditorStateStorage`, `editor-matchers`, `editor-traits`. After moving the files up, consumers should import from `editors/base` directly.

1. Read `editors/base/v4/index.ts` for its full export list.
2. Add those exports to `editors/base/index.ts`.
3. Delete `editors/base/v4/index.ts`.

#### Phase 4c — Move 9 files up + update import paths

| From | To |
|---|---|
| `editors/base/v4/EditorModel.ts` | `editors/base/EditorModel.ts` |
| `editors/base/v4/EditorStateStorage.ts` | `editors/base/EditorStateStorage.ts` |
| `editors/base/v4/IContentHost.ts` | `editors/base/IContentHost.ts` *(after Phase 4a)* |
| `editors/base/v4/IPageHost.ts` | `editors/base/IPageHost.ts` |
| `editors/base/v4/PageToolbar.tsx` | `editors/base/PageToolbar.tsx` |
| `editors/base/v4/TextChrome.tsx` | `editors/base/TextChrome.tsx` |
| `editors/base/v4/editor-matchers.ts` | `editors/base/editor-matchers.ts` |
| `editors/base/v4/editor-traits.ts` | `editors/base/editor-traits.ts` |
| `editors/base/v4/editorRegistry.ts` | `editors/base/editorRegistry.ts` |

**Update internal relative imports:**

Files moved up gain shallower paths. Example for `EditorModel.ts` after move:
- `from "../../../core/state/model"` (3 levels) → `from "../../core/state/model"` (2 levels). Each `../` strip.

**Update external import paths** across consumers (~125 files):

**Before:**
```typescript
import { EditorModel } from "../base/v4/EditorModel";
import type { IPageHost } from "../../editors/base/v4/IPageHost";
import { PageToolbar } from "../base/v4/PageToolbar";
```

**After:**
```typescript
import { EditorModel } from "../base/EditorModel";
import type { IPageHost } from "../../editors/base/IPageHost";
import { PageToolbar } from "../base/PageToolbar";
```

PowerShell one-liner for find/replace across the tree (run in `src/`, dry-run with `-WhatIf` first):

```powershell
Get-ChildItem -Recurse -Include *.ts,*.tsx |
    ForEach-Object {
        (Get-Content $_.FullName -Raw) -replace '(editors[\\/]base)[\\/]v4[\\/]', '$1/' |
            Set-Content $_.FullName -Encoding utf8
    }
```

After the bulk replace, run `npx tsc --noEmit` to catch any path that didn't match the pattern.

#### Phase 4d — Delete empty `editors/base/v4/` directory

Verify directory contains zero files (`ls editors/base/v4/` → empty); delete.

### Commit C — Comment strip (Phases 3 + 6)

Pure deletes. No behavioral change. Two-pass review-friendly approach.

#### Phase 3 — Strip migration-history doc-comments

Patterns to find:
- `EPIC-028` mention (109 files, 174 occurrences)
- `US-5\d\d` in comments (125 files, 377 occurrences)
- `strangler` / `Strangler` (subset)
- `legacy` / `Legacy` in comments where the surrounding code references nothing legacy (102 files, 458 occurrences)
- Concern-ID anchors `/\([A-Z]{2,3}-?(IMPL-?)?\d+\)/` — covers `(LK7)`, `(HS1)`, `(EX-IMPL2)`, `(AB-IMPL3)`, `(NB-IMPL\d+)`, `(BR-IMPL2)`, etc.

**Removal rules (apply in order):**

**Rule 1 — Narrative comment blocks: DELETE entirely.**

Before (from `editors/about/AboutEditor.ts:6-19`):
```typescript
/**
 * EPIC-028 / US-573 — native v4 About page. NO-HOST editor (no
 * `CONTENT_HOST_TRAIT`). A near-exact clone of `SettingsEditor` (US-572):
 * identity-only state, no content host, no toolbar, no nav-panel, no secondary
 * editors, no transient fields, no cache file. The About view (logo, version,
 * runtime versions, update check, links) owns its own view-local state and is
 * independent of this model.
 *
 * Singleton well-known page (fixed id `ABOUT_PAGE_ID`), opened only via the
 * `showAboutPage` menu action (never via `openFile`), so the v4 registry
 * `accepts` predicate returns -1.
 *
 * Design rationale: doc/tasks/US-573-about-editor-migration/README.md.
 */
```

After: (delete the block; class name + file location convey what's needed.)

**Rule 2 — Inline concern-ID anchors: DELETE the parenthetical.**

Before:
```typescript
/** Preserve the legacy `restore()` title-reset for parity (AB-IMPL5). */
async restore(): Promise<void> { … }
```

After (Rule 3 applies — non-obvious behavior; keep + rewrite):
```typescript
/** Resets title to "About" on restore — singleton page should never inherit
 *  a stale title from a renamed-then-restored descriptor. */
async restore(): Promise<void> { … }
```

**Rule 3 — Non-obvious behavior comments: KEEP but rewrite without migration narrative.**

Identify "non-obvious" by asking: would a future reader looking at this code understand WHY without the comment? If yes, delete. If no, keep — rewritten with concrete what-and-why, no anchor / no task ID.

**Rule 4 — Mockup-pointer comments: DELETE.**

Lines like `// See [`doc/epics/EPIC-028-editor-architecture/mockups/IContentHost.ts`](…)` — the mockups served the design phase; the implemented code IS the new source of truth.

**Rule 5 — `@deprecated` JSDoc tags pointing to migration paths: case-by-case.**

If the deprecated thing has been deleted, the tag has nothing to deprecate — drop. If it survives intentionally, drop the JSDoc tag but keep a one-line plain comment.

**High-density files to start with:**
- `editors/base/v4/EditorModel.ts` (after Phase 4 lives at `editors/base/EditorModel.ts`) — 13 mentions
- `editors/base/v4/editorRegistry.ts` (→ `editors/base/editorRegistry.ts`) — 11 mentions
- `editors/base/index.ts` — 4 mentions (the C559-2 Option B header + IContentHost preservation note — both go away)
- `api/pages/PagesLifecycleModel.ts` — 38 + 26 + 110 mentions across `EPIC-028` / `US-5XX` / `legacy/Legacy`
- `api/pages/PageModel.ts` — 14 + 4 + 23 mentions
- Every editor's task-rationale block (same shape as `AboutEditor.ts`) — 22 editor classes

#### Phase 6 — Strip `EditorOverlayRef` / `_vmHost` / preservation-narrative comments

`editors/text/TextEditorModel.ts` retained dispose / confirmRelease / C559-2 Option B preservation comments from US-559's rewrite. Audit:
- Comments that describe "this used to call super.dispose()" → delete (history).
- Comments that describe non-obvious invariants (e.g., the `_vmHost` field is GONE — verify the editor's dispose properly cleans cache files now without it) → keep but rewrite.

Audit `shared/types.ts:22-32` for the post-EPIC-028 narrative block re `LegacyPageDescriptor` / `LegacyWindowState` retirement. Strip the narrative; keep the type re-exports.

Audit the preserved standalone shim files (`PdfView.tsx`, `ImageView.tsx`, `ArchiveEditorView.tsx`, `VideoView.tsx`, `CategoryEditor.tsx`) per **CL3 below**.

## Files that need NO changes

Verify these are untouched at end of task (no V4 names, no EPIC-028 narrative to strip):

- `src/main/**` — Electron main process. Editor architecture lives only in renderer.
- `src/ipc/**` — IPC channels untouched by EPIC-028.
- `src/renderer/api/fs.ts` — Filesystem API; pre-dates EPIC-028.
- `src/renderer/api/settings.ts` — App settings; pre-dates EPIC-028.
- `src/renderer/api/library-service.ts` — Script library; pre-dates EPIC-028.
- `src/renderer/automation/**` — Browser automation tools; only `commands.ts:36,40` has a `BrowserEditor` instanceof check (touched by US-558 but no V4 prefix).
- `src/renderer/uikit/**` — UIKit library; no editor coupling.
- `src/renderer/content/**` — Content pipe system; pre-dates EPIC-028 final renames.
- `src/renderer/core/state/**` — State primitives; pre-dates EPIC-028.
- `src/renderer/scripting/worker/**` — Worker scripting; no editor names.
- `assets/**`, `docs/**`, `qa/**` — Asset files / user docs / QA scripts; out of source scope.

## Concerns / Open questions

### CL1 — `mainEditor` vs `mainEditorV4` fold-up (RESOLVED)

`PageModel.ts:155-176` defines two getters:
- `mainEditor` (legacy back-compat) calls `unwrapAdapter(mainEditorV4)`.
- `mainEditorV4` returns the raw v4 instance.

`unwrapAdapter` at `PageModel.ts:30` is now a passthrough (the `LegacyEditorAdapter` it used to unwrap was deleted by US-559). Both getters return the same instance.

**Resolution:** Delete `mainEditorV4` getter. Delete `unwrapAdapter` helper. Inline the lookup body into `mainEditor`. Rename ~30 callers from `mainEditorV4` → `mainEditor`.

### CL2 — `wrapLegacyForPage` rename (RESOLVED)

The function (`PagesLifecycleModel.ts:73`) has two paths post-US-559:
1. Early-return for `instanceof V4EditorModel` (PD-IMPL16; covers every v4-native input — the common case after US-576 closed the no-host group).
2. `TextFileModel` input → derives target editor id from `state.editor` discriminator, constructs a fresh v4 editor over the host, returns it.

The name "wrap legacy" misleads — path 2 attaches a host to a *fresh v4 editor* (no wrapping involved); path 1 is a passthrough.

**Resolution:** Rename function to `attachEditorToPage(editor: EditorOrHost): EditorModel`. Rename parameter `legacy` → `editor`. Update `const wrap = wrapLegacyForPage` local alias on line 311 to `const attach = attachEditorToPage`. Update ~20 comment references in editor files; many of those comments get deleted entirely by Phase 3.

### CL3 — Preserved standalone shim files (RESOLVED)

US-559 preserved `PdfView.tsx`, `ImageView.tsx`, `ArchiveEditorView.tsx`, `VideoView.tsx`, `CategoryEditor.tsx` as file-open flow factories. Each has a header comment describing the preservation rationale (`// This file is preserved because PagesLifecycleModel.buildEditorById …`).

**Resolution:** Per file, replace the multi-line preservation rationale with a single-line role description:

Before (`pdf/PdfView.tsx:50-55`):
```typescript
// EPIC-028 / US-568 — preserved standalone shim file. The file-open flow
// invokes the module's `newEditorModel(filePath)` factory from
// `PagesLifecycleModel.buildEditorById` to get a filePath-aware initial
// state. `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return
// (PD-IMPL16) then forwards the constructed v4 editor unmodified.
```

After:
```typescript
// File-open factory: `PagesLifecycleModel.buildEditorById` calls the
// module's `newEditorModel(filePath)` for a filePath-aware initial state.
```

### CL4 — `editorId` field comments (RESOLVED)

Every v4 editor class has a comment like `/** v4 editor identity. Matches the legacy registry id so v4 EditorDescriptor.editorId and pre-US-573 saved descriptors agree. */` on its `readonly editorId = "…"` field.

**Resolution:** Strip the entire comment. The field name `editorId` and the visible string value are self-documenting. If a future reader needs to know it's used for `EditorDescriptor.editorId` persistence, the consuming code shows that directly.

### CL5 — `shared/types.ts` narrative block (RESOLVED)

`shared/types.ts:22-32` has the post-EPIC-028 narrative block re `LegacyPageDescriptor` / `LegacyWindowState` retirement.

**Resolution:** Strip lines 22-25 (the narrative explaining why the legacy types are gone). Keep lines 26-32 (the type re-exports themselves). Result:

```typescript
export type {
    PageDescriptor,
    WindowState,
    EditorDescriptor,
    HostDescriptor,
    PipeDescriptor,
} from "./persistence-v4";
```

### CL6 — Risk: comment-strip pass deletes a non-obvious invariant (MITIGATION)

Some concern-ID anchors flag subtle behaviors (e.g., `(LK7)` — keep selection through navigation). Blind strip-all loses these.

**Mitigation:** Two-pass approach within Phase 3:
- **Pass A** strips multi-line task-rationale headers at the top of each editor file (mechanical; safe).
- **Pass B** reviews inline `(XX-IMPL-N)` anchors one at a time and decides per-site: DELETE the parenthetical, KEEP a rewritten sentence per Rule 3 if behavior is non-obvious.

Pass B is the slow careful pass — review the diff before commit.

### CL7 — Three-commit reviewability split (RESOLVED)

The combined diff for this task will be very large (estimated 800-1500 lines deleted, 200-400 lines added — mostly net-deletion).

**Resolution:** Three commits matching natural phase boundaries:
- **Commit A**: Phases 1 + 2 + 5 (V4 prefix + structural renames + type alias rename) — pure renames, no behavioral change. Largest impact on file count.
- **Commit B**: Phases 4a + 4b + 4c + 4d (folder move + IContentHost reconciliation) — pure move, no behavioral change. Largest line-diff.
- **Commit C**: Phases 3 + 6 (comment strip) — pure deletes, no behavioral change.

Each commit independently buildable + lint-clean. User can review them separately.

### CL8 — TypeScript / ESLint baselines (RESOLVED)

After each commit: `tsc --noEmit` 0 new errors over the baseline (19 pre-existing per US-559's verification at `f5d1178`). `eslint` 0 new errors over the baseline (17 pre-existing).

Verify by counting before each commit and comparing after.

## Acceptance criteria

1. **`as V4EditorModel` / `as V4EditorModelType` aliases**: zero occurrences in `src/`.
2. **`V4` / `v4` identifier prefixes in `src/`**: zero (excludes documentation folders under `doc/epics/EPIC-028-editor-architecture/` which are design-history archives).
3. **`editors/base/v4/` directory**: deleted.
4. **`EPIC-028` mentions in `src/`**: zero.
5. **`US-5\d\d` references in source comments**: zero.
6. **`(XX-IMPL-N)` / `(LK\d+)` concern-ID anchors in source comments**: zero. Comments that the two-pass review chose to keep have been rewritten without an anchor.
7. **`strangler` mentions in `src/`**: zero.
8. **`tsc --noEmit`**: same error count as pre-US-582 baseline (19) — net zero new errors.
9. **`eslint`**: same error count as pre-US-582 baseline (17) — net zero new errors.
10. **App runs**: launch, open a file in each of the 22 editor types (text/grid/markdown/pdf/image/notebook/draw/graph/link/todo/archive/explorer/rest-client/log-view/svg/html/mermaid/video/about/settings/storybook/mcp-inspector), confirm no regressions. User-driven manual smoke test — same scope as US-559's testing.
11. **No deleted comment caused a behavior regression**: every kept-comment per Phase 3 Rule 3 is reviewable in the Commit C diff.
12. **`mainEditor` getter returns identical result to today's `mainEditorV4`** for every test page open (manual verification — open 5+ different editor types in the same session, confirm script-runner still resolves the host correctly).
13. **README & dashboard updated**: this README ends with a "What landed" section listing actual numbers; dashboard entry moved to Completed when epic closes.

## Files Changed (estimate)

| Category | Count | Detail |
|---|---|---|
| **Moved** | 9 | `editors/base/v4/*.ts(x)` → `editors/base/*.ts(x)` |
| **Deleted** | 2 | `editors/base/IContentHost.ts` (legacy); `editors/base/v4/index.ts` (folded into top-level barrel) |
| **Modified for V4-rename + import-path update** | ~125 | Across all 22 editor folders + `api/pages/*` + `scripting/*` + `ui/app/*` + `ui/navigation/*` |
| **Modified for comment-strip only** | ~30 additional | Files that have EPIC-028 narrative but no V4 prefix (mostly editor *View* files, shared types) |
| **Modified for structural renames** | 6 | `PageModel.ts` (mainEditor fold-up), `PagesLifecycleModel.ts` (`wrapLegacyForPage` → `attachEditorToPage` + `LegacyEditorModel` alias drop), `PagesPersistenceModel.ts` (`V4_NO_HOST_EDITOR_IDS` rename), `RenderEditor.tsx` (`V4NativeEditor` rename), `editors/base/index.ts` (Phase 5 type alias rename), `shared/types.ts` (CL5) |
| **Total touched** | ~135 | |

## Verification commands

```powershell
# Phase 1 / Phase 2 (after Commit A)
rg 'as V4EditorModel' src/                     # expect 0
rg 'as V4EditorModelType' src/                 # expect 0
rg '\bV4[A-Z_]' src/                           # expect 0
rg '\bmainEditorV4\b' src/                     # expect 0
rg '\bunwrapAdapter\b' src/                    # expect 0
rg '\bwrapLegacyForPage\b' src/                # expect 0
rg '\bLegacyEditorModel\b' src/                # expect 0

# Phase 4 (after Commit B)
Test-Path src/renderer/editors/base/v4         # expect $false
rg 'editors/base/v4' src/                      # expect 0
rg '\bv4\b' src/ --type ts --type tsx          # expect 0 (manual review of any hits)

# Phase 3 / Phase 6 (after Commit C)
rg 'EPIC-028' src/                             # expect 0
rg 'US-5\d\d' src/                             # expect 0
rg 'strangler' -i src/                         # expect 0
rg '\([A-Z]{2,3}-?(IMPL-?)?\d+\)' src/         # expect 0

# Build sanity (after each commit)
npx tsc --noEmit 2>&1 | Select-String 'error TS' | Measure-Object  # expect ≤ baseline (19)
npm run lint 2>&1 | Select-String 'error' | Measure-Object         # expect ≤ baseline (17)
```

---

## Implementation log

- [x] Commit A — Phases 1 + 2 + 5 (V4-prefix + structural renames + type alias rename) — `b8499a5` 80 files +865/−402
- [x] Commit B — Phases 4a + 4b + 4c + 4d (folder move + IContentHost reconciliation) — `81cbeac` 78 files +295/−334
- [x] Commit C — Phases 3 + 6 (EPIC-028 / US-5XX / strangler / concern-ID comment strip) — `5fb3a13` 141 files +140/−1926
- [x] Verification: tsc baseline 19 holds at every commit
- [ ] User-driven smoke test across all 22 editor types
- [ ] Dashboard entry moved to `tasks/completed.md` reference on epic close

## What landed

**Three commits on `upcoming-v4.0.1`:**

| Commit | Title | Files | Diff |
|---|---|---|---|
| `b8499a5` | US-582 Commit A: V4-prefix removal + structural renames | 80 | +865/−402 |
| `81cbeac` | US-582 Commit B: Promote editors/base/v4/* to editors/base/* | 78 | +295/−334 |
| `5fb3a13` | US-582 Commit C: Strip EPIC-028 / US-5XX / strangler narrative | 141 | +140/−1926 |
| **Total** | | **~250 unique files** | **+1300/−2662 = net −1362 LOC** |

**Acceptance criteria result:**

| # | Criterion | Status |
|---|---|---|
| 1 | `as V4EditorModel` / `as V4EditorModelType` aliases | 0 ✓ |
| 2 | `V4` / `v4` identifier prefixes | 0 ✓ |
| 3 | `editors/base/v4/` directory | deleted ✓ |
| 4 | `EPIC-028` mentions in `src/` | 0 ✓ |
| 5 | `US-5\d\d` references in source comments | 0 ✓ |
| 6 | `(XX-N)` concern-ID anchors | 0 ✓ |
| 7 | `strangler` mentions in `src/` | 0 ✓ |
| 8 | `tsc --noEmit` | 19 (baseline, unchanged) ✓ |
| 9 | `npm run lint` | 47 (baseline at `f5d1178` — task doc's "17" estimate was wrong; verified by `git checkout f5d1178 && npm run lint` returns same count) ✓ |
| 10 | App runs (manual smoke test) | **pending user verification** |
| 11 | No deleted comment caused regression | Commit C diff reviewable |
| 12 | `mainEditor` getter semantics preserved | tsc-verified; **pending user verification** |
| 13 | README + dashboard updated | ✓ (this section) |

**CL1 amendment** — the task doc claimed `unwrapAdapter` was a passthrough. Wrong: it unwraps a v4 editor's `contentHost` to the `TextFileModel` host so legacy field readers (tab strip, OpenTabsList, PageTabs) keep working. Implementation kept both getters and renamed:
- `unwrapAdapter` → `unwrapToHost` (describes what it actually does)
- `mainEditorV4` → `mainEditorInstance` (raw v4, no host unwrap)
- `mainEditor` (returns `EditorOrHost`, unwraps to host) — preserved name

**Bonus cleanup** (beyond the original scope, surfaced during implementation):
- Deleted dead `panelEditorsV4` and `secondaryEditors` getters from PageModel (both were vestigial cast-to-union wrappers).
- `findExplorer` dropped its now-vestigial `unwrapAdapter` call (Explorer is no-host; unwrap was always a passthrough).
- Stripped references to deleted classes the original scope didn't catch: `LegacyEditorAdapter`, `ContentViewModel(Host)`, `TextEditorView`, `TextViewModel`, `deriveEditorId` — 5 distinct dead-pointer types.

**Two follow-ups discovered (out of scope; flagged for future):**
- `LegacyEditorModel` local union alias was the same shape as the canonical `EditorOrHost` — collapsed to one. PageModel `secondaryEditors` getter was a compat shim — deleted (one caller, `VideoEditor.ts`, updated).
- The 47-error lint baseline includes 30 `import/no-unresolved` errors from `doc/epics/EPIC-028-editor-architecture/mockups/*` referencing source paths the strangler retirement moved. The mockups are frozen design-history artifacts; should be either deleted or updated as part of the deferred docs-update follow-on task.
