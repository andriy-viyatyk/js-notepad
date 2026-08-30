# US-1224 — Dependency and documentation cleanup

## Goal

Remove the unused direct `clsx` dependency, document why `react` and `react-dom` remain in the
runtime dependency list, and correct the false shim claim attached to
`getDefaultEditorModelState`. Record that the ESLint scoping half of the epic item is already
complete; do not alter it.

## Background

### `clsx`

`package.json:59` declares `"clsx": "^2.1.1"`, but a whole authored-repository search found no
code use. The search covered `src/`, `scripts/`, `assets/`, `boards-assets/`, `qa/`, `docs/`, and
configuration files, not only the renderer. The remaining literal hits are dependency metadata or
historical prose:

- `package-lock.json:20` is the root project's direct dependency entry.
- `package-lock.json:5331-5338` is the corresponding top-level `node_modules/clsx` record.
- `package-lock.json:1325` and `:1642-1650` are Excalidraw's nested `clsx@1.1.1` dependency and
  package record; they are transitive and must remain if Excalidraw still requires them.
- `.claude/settings.local.json:76` records a past PowerShell probe containing
  `require('clsx')`; it is permission-history text, not executable project code or a dependency
  use.
- `doc/de-react-refactoring.md:253`, `doc/epics/EPIC-025.md:190`, and the active/EPIC-078
  tracking prose describe the cleanup; they are not executable uses.

Therefore “zero across the whole repo” is true for authored code uses, not for the expected
package-lock metadata and historical documentation. Removing the direct declaration should remove
the root `clsx@2.1.1` lock record after lockfile regeneration while preserving Excalidraw's nested
transitive copy.

### React runtime role

`package.json:77-78` declares `react` and `react-dom`. They are retained for one product boundary:
the Excalidraw vendor island. The direct component import is
`src/renderer/editors/draw/ExcalidrawIsland.tsx:1-19`, with React hooks from `react` at `:10` and
Excalidraw's React peer dependency at `:2-3`. The adjacent
`src/renderer/editors/draw/react-island.ts:1-2` imports `react-dom/client` to mount that same
component and has only a type-only `React` import at `:1`. There are no React runtime imports in
the native renderer outside `editors/draw/`.

The wording should therefore describe the single Excalidraw-only island boundary, while remaining
precise that `react-dom/client` is used by its mount adapter. Since `package.json` cannot contain
comments, add the pointer in `doc/architecture/overview.md` immediately after its existing
Renderer Architecture paragraph at `:96-101`, which already states that React is confined to
`editors/draw/` and names `ExcalidrawIsland.tsx` and `react-island.ts`.

### False shim comment

`src/renderer/editors/base/index.ts:14-16` currently says:

```ts
/** Default `IEditorState` factory consumed by preserved standalone shim files
 *  for their state defaults. */
export function getDefaultEditorModelState(): IEditorState {
```

The verified source call graph has exactly one caller:
`src/renderer/editors/browser/BrowserEditorModel.ts:3` imports the helper and `:252-256` spreads
its result into `getDefaultBrowserPageState()`. That file is ordinary browser editor state
construction. `src/renderer/editors/browser/BrowserEditor.ts:39-46` defines `BrowserEditor extends
EditorModel` with `editorId = "browser-view"`; `BrowserEditorModel.ts:314` exports that class as
`BrowserEditorModel`. No preserved standalone shim files exist. The helper itself returns the
generic base `IEditorState` fields at `index.ts:16-27`.

Recommend correcting the comment rather than inlining the helper. The helper makes the base-state
spread explicit and keeps browser-specific state construction separate from generic defaults; the
fact that the current call count is one does not make its current documentation false or make an
inline rewrite safer.

### ESLint item already complete

Do not change `eslint.config.mjs`. The shared TypeScript block at `:558-573` restricts `react` and
`react-dom` imports, with the EPIC-074 message that React is confined to `editors/draw/**`. The
draw override at `:577-588` applies to
`src/renderer/editors/draw/**/*.ts` and `*.tsx`, restating only the `av-grid` restriction so the
React island is exempt from the React import restriction. This matches EPIC-078 §D-2 correction 7:
the ESLint half is already done; only dependency-role documentation remains.

## Implementation Plan

1. Remove only the direct `clsx` entry from `package.json:59`. Regenerate the lockfile using the
   repository's package-manager workflow so the root dependency map no longer contains `clsx` and
   the top-level `node_modules/clsx@2.1.1` record is removed if no other package needs it. Do not
   remove `@excalidraw/excalidraw`'s nested `clsx@1.1.1` entry at `package-lock.json:1325,1642-1650`.

   Before → after:

   ```text
   // package.json dependencies
   "cheerio": "^1.2.0",
   "clsx": "^2.1.1",
   "csv-parse": "^7.0.1",

   "cheerio": "^1.2.0",
   "csv-parse": "^7.0.1",
   ```

2. Add an explicit dependency-role note to `doc/architecture/overview.md` after `:101`. The note
   must point readers to the `react`/`react-dom` entries in `package.json`, state that they are
   retained solely for the Excalidraw vendor island, and distinguish the component import from the
   adjacent mount adapter without implying a second application React surface.

   Before → after:

   ```md
   React is confined to the Excalidraw vendor island in `editors/draw/`; its root adapter lives beside
   that editor in `editors/draw/react-island.ts`. Global styles are installed by the native
   `theme/global-styles.ts` module, so startup creates no React root.

   React is confined to the Excalidraw vendor island in `editors/draw/`; its root adapter lives beside
   that editor in `editors/draw/react-island.ts`. The `react` and `react-dom` runtime entries in
   `package.json` are retained solely for this island: `ExcalidrawIsland.tsx` uses React and the
   adjacent adapter uses `react-dom/client` to mount it. Global styles are installed by the native
   `theme/global-styles.ts` module, so startup creates no React root.
   ```

3. Replace the false comment at `src/renderer/editors/base/index.ts:14-15` with a truthful
   description of a base `IEditorState` factory used by editor-specific default-state factories.
   Keep the function and its return values unchanged.

   Before → after:

   ```ts
   /** Default `IEditorState` factory consumed by preserved standalone shim files
    *  for their state defaults. */

   /** Create the base `IEditorState` fields that editor-specific default-state factories extend. */
   ```

4. Record verification of `eslint.config.mjs:558-588` without editing it. Also verify the exact
   caller count for `getDefaultEditorModelState` remains one and that it is the ordinary browser
   editor model path at `BrowserEditorModel.ts:252-256`, not a shim.

5. Run repository-wide searches after the edits. Confirm no executable authored file imports or
   calls `clsx`; distinguish expected Excalidraw transitive lock metadata and historical prose from
   direct dependency usage. Confirm `react`/`react-dom` remain declared and the architecture note
   names their Excalidraw-only role. Do not add tests or a test harness; this project has no unit
   tests and this cleanup is verified by source/lock/config inspection.

## Concerns

- Removing the direct dependency does not mean every `clsx` string disappears from the lockfile:
  Excalidraw declares `clsx@1.1.1` transitively at `package-lock.json:1325`, and its nested package
  record is expected to survive. The acceptance check must distinguish direct root metadata from
  transitive vendor metadata.
- `.claude/settings.local.json:76` is another intentional non-use: it is a recorded permission
  entry for a historical `node -e "require('clsx')..."` probe. It must be classified, not mistaken
  for a resurrected import or runtime call.
- Do not remove `react`, `react-dom`, `@types/react`, `@types/react-dom`, or
  `eslint-plugin-react-hooks`. The first two are runtime requirements for the sanctioned
  Excalidraw island; the type packages support its TypeScript file; and the ESLint plugin/config
  already enforce the boundary.
- The helper could be inlined because it currently has one caller, but that would mix generic base
  defaults into the browser state factory and provide no correctness benefit. Correcting the
  comment is the lower-risk recommendation and accurately describes the helper's abstraction.
- `doc/de-react-refactoring.md`, EPIC documents, and completed task records contain historical
  counts and decisions. They should not be rewritten as part of this cleanup merely to make a
  literal search return zero; the current architecture note is the documentation that needs the
  role statement.

## Acceptance Criteria

- `package.json` no longer declares direct `clsx`; the regenerated lockfile no longer carries the
  root project's direct `clsx` dependency or unnecessary top-level `clsx@2.1.1` record, while the
  Excalidraw nested transitive record remains as required.
- A whole-authored-repository search across `src/`, `scripts/`, `assets/`, `boards-assets/`, `qa/`,
  `docs/`, and configuration files finds zero executable `clsx` use. Remaining lock metadata and
  historical documentation are identified rather than misclassified as uses.
- `doc/architecture/overview.md` points to `package.json` and states that the runtime React
  dependencies serve only the Excalidraw island (`ExcalidrawIsland.tsx` plus its mount adapter).
- `src/renderer/editors/base/index.ts:14-15` no longer claims preserved standalone shim callers;
  `getDefaultEditorModelState` remains a helper used by the ordinary browser editor default-state
  factory at `BrowserEditorModel.ts:252-256`.
- `eslint.config.mjs:558-588` is unchanged and its existing React import restriction plus draw
  override are recorded as already complete.
- No source file other than the documented comment in `src/renderer/editors/base/index.ts`, no
  test or test harness, and no dashboard entry outside the requested documentation is added or
  changed by the implementation.

## Files Changed Summary

| File | Expected change |
|---|---|
| `package.json` | Remove the unused direct `clsx` declaration |
| `package-lock.json` | Regenerate direct dependency metadata; preserve Excalidraw's transitive `clsx` |
| `doc/architecture/overview.md` | Document the Excalidraw-only role of `react`/`react-dom` and point to `package.json` |
| `src/renderer/editors/base/index.ts` | Correct the false standalone-shim comment |

Files that need **NO changes**: `src/renderer/editors/browser/BrowserEditorModel.ts`,
`src/renderer/editors/browser/BrowserEditor.ts`, `src/renderer/editors/draw/ExcalidrawIsland.tsx`,
`src/renderer/editors/draw/react-island.ts`, `eslint.config.mjs`, `@types/react`/
`@types/react-dom`, `eslint-plugin-react-hooks`, all files under `scripts/`, `assets/`,
`boards-assets/`, `qa/`, and `docs/`, `.claude/settings.local.json`, and the historical epic/task
records.
