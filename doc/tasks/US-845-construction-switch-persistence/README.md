# US-845: Construction + switch + persistence integration

**Epic:** [EPIC-043 — Content-Host Boards](../../epics/EPIC-043.md) (task 3 of 5)
**Status:** Not started
**Depends on:** US-843 (`editorKind` on `CustomEditorMatch`), US-844 (`BoardContentEditorModel`)
**Blocks:** US-846 (content bridge + view wiring), US-847 (DrawIO proving ground)

## Goal

Wire the (currently unreferenced) `BoardContentEditorModel` into the three lifecycle paths that
bring it to life, so a content-host board is **built** from a file's pipe, **switches** with the
built-in editors by transferring the shared host (both directions), and **survives** an app
restart / cross-window move / duplicate with its content intact. Also lift the two `isPlainLocalPath`
gates that would otherwise hide a content-host board over `https://`/archive/encrypted files
(CH4). After this task, opening a file whose trusted board declares `editorKind: "content-host"`
lands in the board, Monaco↔board switching transfers the host with no reload, and Ctrl+S / dirty
tracking work through the host (the content **bridge** that lets the board *read* the content is
US-846 — until then the board renders host-less, but the model, switch, save, and persistence are
all live).

## Background

US-844 delivered `BoardContentEditorModel extends BoardEditorModel` (a mechanical merge of
`MonacoEditor`'s host-composition surface onto the board machinery). It compiles but **nothing
constructs it**. This task is the construction/switch/persistence wiring — no new model behavior,
only call-site integration. All four touched files already carry the imports and patterns this
task extends (EPIC-042 built the same seams for the *simple* board).

### The four seams (all verified 2026-07-15)

1. **`PagesLifecycleModel.buildEditorById`** (`PagesLifecycleModel.ts:283`) — the `board-editor:<root>`
   branch (`:291`) builds a **plain** `BoardEditorModel` + `initFromBoardRoot`. It must branch on
   the board's `editorKind` (from `customEditorRegistry`) and, for `"content-host"`, build a
   `BoardContentEditorModel` **with an adopted host**.
   - Sibling `createEditorFromFile` (`:351`) then assigns the resolver's pipe via
     `if (pipe) editor.pipe = pipe` (`:360`). For a content-host board that pipe must reach the
     **host**, not the board's own (unused) `pipe` field.

2. **`PageModel.switchMainEditor`** (`PageModel.ts:451`) — the `boardInvolved` branch (`:464`) does
   dispose-and-rebuild + `confirmRelease` for **every** board switch (EPIC-042 CE4). A content-host
   board must instead **transfer the shared host** via `switchFrom` (no reload, no `confirmRelease`),
   both directions. A `board-editor:<root>` id is **not** in `editorRegistry`, so the generic
   host-transfer tail (`:492`–`:500`, `editorRegistry.getById`/`createEditor`) can never build it —
   all board involvement stays inside the `boardInvolved` branch (HIGH-2).

3. **`PagesPersistenceModel.restorePage`** (`PagesPersistenceModel.ts:63`) — a content-host board
   persists `editorId: "board-view"` (pinned by `BoardEditorModel.getRestoreData`) **plus**
   `d.host` (added by `BoardContentEditorModel.getRestoreData`). Without a new branch, the generic
   `if (d.host)` path (`:78`) grabs it → `editorRegistry.createEditor("board-view")` builds a
   **plain** `BoardEditorModel`, base no-op `applyRestoreData` (so `d.state.boardRoot`/`filePath`
   are dropped), then `restore()` throws `"legacy project-mode board editor"`
   (`BoardEditorModel.ts:219`) → **the tab vanishes** (HIGH-1). A board branch must run **before**
   `if (d.host)`.

4. **The `isPlainLocalPath` gates (CH4 / MEDIUM-3).** Two gates hide file-associated boards over
   non-local paths; both must let a **content-host** board through (simple boards stay gated):
   - `resolveEditorIdForFile` (`custom-editor-registry.ts:168`) — early-returns the built-in id on a
     non-local path, **before** the board scan.
   - `PageToolbar.tsx:80` — the switch-widget's `useBoardsForFile(isPlainLocalPath(fp) ? fp : "")`
     passes `""` for a non-local file, so **no** board appears as a switch option.
   - The third "gate" (`BoardContentEditorModel.findCompatibleEditors`) was **already** dropped in
     US-844's subclass override — **no change here**.

### Key facts (verified)

- `customEditorRegistry.entries` (`custom-editor-registry.ts:119`) is a sync list of
  `CustomEditorMatch` (each carries `editorKind`, US-843). It is warmed at bootstrap
  (`register-editors.ts:453`); a resolved `board-editor:<root>` id implies the registry is populated,
  so `entries.find(e => e.editorId === editorId)?.editorKind` is safe to read synchronously.
- `newTextFileModel(filePath)` (`TextEditorModel.ts:440`) builds a host that lazily self-creates its
  pipe on `restore()` for a **local** path (`ensurePipe`); a **non-local** open must pre-assign the
  host's `pipe` before `restore()` (the resolver already builds one — route it in, see Step 2).
- `TextFileModel extends TDialogModel` (**not** `EditorModel`) — it has a public `pipe` field
  (`TextEditorModel.ts:84`) but **no** `contentHost` accessor, so `(editor as EditorModel).contentHost`
  is `undefined` on a bare host and `_host` on a `BoardContentEditorModel` — a clean discriminator.
- `EditorModel.getRestoreData` (`EditorModel.ts:341`) puts the **full editor state** in `d.state`;
  `BoardEditorModel.getRestoreData` pins `editorId: "board-view"`; `BoardContentEditorModel.getRestoreData`
  adds `d.host`. So a content-host board descriptor is `{ editorId: "board-view", id, state: <full
  BoardEditorState incl. boardRoot/filePath>, host: <HostDescriptor> }`.
- `setMainEditor` (`PageModel.ts:398`) already preserves cache files across a switch when
  `oldMain.id === newEditor.id` (`idTransferred`, `:410`) — `switchFrom` copies the old id, so the
  host-transfer branch inherits cache continuity for free (same as the built-in↔built-in tail).
- The zombie guard (`PagesPersistenceModel.ts:75`: `board-view` non-main → drop) is a no-op for a
  content-host board (always the main editor), so the new branch sits safely after it.

### Files that need NO changes (do not edit)

- `src/renderer/editors/board/BoardContentEditorModel.ts` — the model is complete (US-844). This task
  only **constructs** it; it imports the class by file path (`board/BoardContentEditorModel`).
- `src/renderer/editors/register-editors.ts` — `board-view` stays `hasContentHost: false` (CH5). The
  content-host board is built in the `board-editor:<root>` branch, never host-first.
- `src/renderer/editors/board/index.tsx` — no barrel re-export needed (direct file-path imports).
- `src/renderer/editors/board/BoardEditorModel.ts`, `board-manifest.ts`, `custom-editor-registry.ts`
  (except `resolveEditorIdForFile`) — the simple-board path and the registry are reused unchanged.
- `src/renderer/content/resolvers.ts` / `open-handler.ts` — the openRawLink pipeline already routes a
  `board-editor:<root>` target through `openFile` → `createEditorFromFile` (see Concern C4 for the
  one deliberate non-local limitation).
- `BoardWebview.tsx` / `BoardEditorView.tsx` / `board-shim.ts` / `board-bridge*.ts` — the content
  bridge + view wiring are **US-846**. Until then a content-host board mounts host-less (blank),
  which is expected between this task and the next.

## Implementation plan

### Step 1 — `buildEditorById`: build the content-host board with a host

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts`

Add `customEditorRegistry` to the existing import from `custom-editor-registry` (`:35`):

```ts
// before
import {
    resolveEditorIdForFile,
    parseBoardEditorId,
} from "../../editors/board/custom-editor-registry";
// after
import {
    resolveEditorIdForFile,
    parseBoardEditorId,
    customEditorRegistry,
} from "../../editors/board/custom-editor-registry";
```

Replace the `board-editor:<root>` branch (`:291`–`:297`):

```ts
// before
        const boardRoot = parseBoardEditorId(editorId);
        if (boardRoot !== null) {
            const { boardModule } = await import("../../editors/board");
            const model = boardModule.createEditor() as unknown as BoardEditorModel;
            model.initFromBoardRoot(boardRoot, filePath);
            return model as unknown as EditorOrHost;
        }
// after
        const boardRoot = parseBoardEditorId(editorId);
        if (boardRoot !== null) {
            // Content-host board (EPIC-043): build the subclass WITH an adopted host so
            // Persephone owns the pipe/encoding/encryption/cache/dirty state. The host's
            // pipe is assigned by `createEditorFromFile` (Step 2) and restored below.
            const match = customEditorRegistry.entries.find((e) => e.editorId === editorId);
            if (match?.editorKind === "content-host") {
                const { getDefaultBoardEditorState } = await import("../../editors/board");
                const { BoardContentEditorModel } = await import(
                    "../../editors/board/BoardContentEditorModel"
                );
                const model = new BoardContentEditorModel(
                    new TComponentState(getDefaultBoardEditorState()),
                );
                model.initFromBoardRoot(boardRoot, filePath);
                model.adoptHost(newTextFileModel(filePath));
                return model as unknown as EditorOrHost;
            }
            const { boardModule } = await import("../../editors/board");
            const model = boardModule.createEditor() as unknown as BoardEditorModel;
            model.initFromBoardRoot(boardRoot, filePath);
            return model as unknown as EditorOrHost;
        }
```

### Step 2 — `createEditorFromFile`: route the pipe to the host

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts` (`:360`)

```ts
// before
        if (pipe) {
            editor.pipe = pipe;
        }
// after
        if (pipe) {
            // A content-host board (EPIC-043) owns the pipe on its content HOST, not on the
            // board's own (unused) `pipe` field. A bare TextFileModel host has no
            // `contentHost` accessor → falls through to the direct assignment (unchanged for
            // every text editor and the simple board, whose never-read pipe is disposed on
            // dispose).
            const host = (editor as EditorModel).contentHost;
            if (host) {
                (host as unknown as TextFileModel).pipe = pipe;
            } else {
                editor.pipe = pipe;
            }
        }
```

`EditorModel` and `TextFileModel` are already imported (`:2`, `:11`).

### Step 3 — `switchMainEditor`: host-transfer vs dispose-and-rebuild, by kind

**File:** `src/renderer/api/pages/PageModel.ts`

Replace the `boardInvolved` branch (`:461`–`:490`). The logic: a switch **transfers the shared
host** (no reload, no `confirmRelease`) iff **both** endpoints are host-capable — the old side
exposes a `contentHost` (a built-in text editor or a content-host board), and the new side is a
content-host board or a built-in content-host editor. Otherwise (a **simple** board on either side,
or a non-host built-in like PDF/Image) keep EPIC-042's dispose-and-rebuild + `confirmRelease`.

```ts
// before
        const boardInvolved =
            parseBoardEditorId(newEditorId) !== null
            || parseBoardEditorId(oldEditor.editorId) !== null;
        if (boardInvolved) {
            const filePath =
                (oldEditor.contentHost as { filePath?: string } | null)?.filePath
                ?? oldEditor.filePath;
            if (!filePath) return;
            const released = await oldEditor.confirmRelease();
            if (!released) return; // Cancel → stay on the current editor
            const { pagesModel } = await import("../pages");
            const { attachEditorToPage } = await import("./PagesLifecycleModel");
            const built = await pagesModel.lifecycle.createEditorFromFile(
                filePath,
                undefined,
                newEditorId,
            );
            // Honor an explicit built-in target that differs from the file's natural
            // resolveId (mirrors openFile / navigatePageTo); no-op for board targets.
            if (
                built.state.get().type === "textFile"
                && parseBoardEditorId(newEditorId) === null
            ) {
                built.state.update((s) => {
                    (s as { editor?: string }).editor = newEditorId;
                });
            }
            await this.setMainEditor(attachEditorToPage(built));
            return;
        }
// after
        const newBoardRoot = parseBoardEditorId(newEditorId);
        const boardInvolved =
            newBoardRoot !== null
            || parseBoardEditorId(oldEditor.editorId) !== null;
        if (boardInvolved) {
            const { editorRegistry } = await import("../../editors/base");
            // A content-host board (EPIC-043) transfers the shared host like Monaco↔Grid;
            // a simple board (EPIC-042) has no host and dispose-and-rebuilds. Determine the
            // NEW board's kind from the registry (a plain built-in is host-capable iff it
            // declares `hasContentHost`).
            let newBoardKind: "simple" | "content-host" | undefined;
            if (newBoardRoot !== null) {
                const { customEditorRegistry } = await import(
                    "../../editors/board/custom-editor-registry"
                );
                newBoardKind =
                    customEditorRegistry.entries.find((e) => e.editorId === newEditorId)
                        ?.editorKind ?? "simple";
            }
            const oldHostCapable = !!oldEditor.contentHost;
            const newHostCapable =
                newBoardRoot !== null
                    ? newBoardKind === "content-host"
                    : !!editorRegistry.getById(newEditorId)?.hasContentHost;

            if (oldHostCapable && newHostCapable) {
                // Host-transfer switch — no reload, no confirmRelease (nothing is lost).
                let newEditor: EditorModel;
                if (newBoardRoot !== null) {
                    const { getDefaultBoardEditorState } = await import("../../editors/board");
                    const { BoardContentEditorModel } = await import(
                        "../../editors/board/BoardContentEditorModel"
                    );
                    const filePath =
                        (oldEditor.contentHost as { filePath?: string } | null)?.filePath
                        ?? oldEditor.filePath;
                    const model = new BoardContentEditorModel(
                        new TComponentState(getDefaultBoardEditorState()),
                    );
                    model.initFromBoardRoot(newBoardRoot, filePath ?? undefined);
                    newEditor = model as unknown as EditorModel;
                } else {
                    newEditor = await editorRegistry.createEditor(newEditorId);
                }
                newEditor.switchFrom(oldEditor); // extracts + adopts the shared host
                await newEditor.restore();
                await this.setMainEditor(newEditor);
                return;
            }

            // Simple board (either direction) — dispose-and-rebuild + confirmRelease (EPIC-042).
            const filePath =
                (oldEditor.contentHost as { filePath?: string } | null)?.filePath
                ?? oldEditor.filePath;
            if (!filePath) return;
            const released = await oldEditor.confirmRelease();
            if (!released) return; // Cancel → stay on the current editor
            const { pagesModel } = await import("../pages");
            const { attachEditorToPage } = await import("./PagesLifecycleModel");
            const built = await pagesModel.lifecycle.createEditorFromFile(
                filePath,
                undefined,
                newEditorId,
            );
            if (
                built.state.get().type === "textFile"
                && parseBoardEditorId(newEditorId) === null
            ) {
                built.state.update((s) => {
                    (s as { editor?: string }).editor = newEditorId;
                });
            }
            await this.setMainEditor(attachEditorToPage(built));
            return;
        }
```

`TComponentState` is already imported (`:1`); `EditorModel` is a type-only import (`:2`) — the
`let newEditor: EditorModel` annotation is type-only, and the runtime value comes from the dynamic
imports, so no import change is needed.

### Step 4 — `restorePage`: reconstruct a content-host board before `if (d.host)`

**File:** `src/renderer/api/pages/PagesPersistenceModel.ts`

Add a type-only import for `BoardEditorState` at the top (near `:22`):

```ts
import type { BoardEditorState } from "../../editors/board";
```

Insert the branch **after** the zombie guard (`:75`–`:77`) and **before** `if (d.host)` (`:78`):

```ts
                    if (d.editorId === "board-view" && d.id !== desc.mainEditorId) {
                        return null;
                    }
                    // Content-host board (EPIC-043): persisted `board-view` + a host
                    // descriptor. Rebuild the subclass, apply the board state (boardRoot /
                    // filePath live in `d.state`, NOT the host descriptor), reconstruct the
                    // host from `d.host`, then restore. MUST precede the generic `if (d.host)`
                    // branch, which would else build a plain BoardEditorModel that throws
                    // "legacy project-mode board editor" on restore (HIGH-1).
                    if (d.editorId === "board-view" && d.host) {
                        const { getDefaultBoardEditorState } = await import(
                            "../../editors/board"
                        );
                        const { BoardContentEditorModel } = await import(
                            "../../editors/board/BoardContentEditorModel"
                        );
                        const model = new BoardContentEditorModel(
                            new TComponentState({
                                ...getDefaultBoardEditorState(),
                                ...(d.state as Partial<BoardEditorState>),
                                id: d.id,
                            }),
                        );
                        model.applyRestoreData(
                            d as unknown as Parameters<typeof model.applyRestoreData>[0],
                        );
                        await model.restore();
                        return model;
                    }
                    if (d.host) {
                        // …existing generic host branch…
```

`TComponentState` is already imported (`:16`). `applyRestoreData(d)` sets `_pendingHost = d.host`;
`restore()` runs `super.restore()` (board validation) then rebuilds the host via
`TextFileModel.fromDescriptor(_pendingHost)` and `adoptHost`. This covers app-restart (`applyState`),
cross-window move (`movePageIn` → `restorePage`), and `duplicatePage` — all route through
`restorePage`, so no other edit is needed for those.

### Step 5 — `resolveEditorIdForFile`: scan content-host boards on non-local paths

**File:** `src/renderer/editors/board/custom-editor-registry.ts` (`:165`–`:177`)

```ts
// before
export function resolveEditorIdForFile(filePath?: string): string | undefined {
    const builtinDef = filePath ? editorRegistry.resolve(filePath) : undefined;
    const builtinId = builtinDef?.id;
    if (!filePath || !isPlainLocalPath(filePath)) return builtinId;
    const builtinPriority = builtinDef?.match?.acceptFile?.(filePath) ?? 0;
    let best: CustomEditorMatch | undefined;
    for (const b of customEditorRegistry.getBoardsForFile(filePath)) {
        // Strict `>` so the FIRST (earliest-trusted) board wins ties among boards.
        if (!best || b.priority > best.priority) best = b;
    }
    if (best && best.priority > builtinPriority) return best.editorId;
    return builtinId;
}
// after
export function resolveEditorIdForFile(filePath?: string): string | undefined {
    const builtinDef = filePath ? editorRegistry.resolve(filePath) : undefined;
    const builtinId = builtinDef?.id;
    if (!filePath) return builtinId;
    // Simple boards edit real local files only (EPIC-042 CE4); content-host boards also
    // handle https/archive/encrypted (EPIC-043 CH4). So the local-path gate now filters
    // the board scan by kind rather than short-circuiting it entirely.
    const local = isPlainLocalPath(filePath);
    const builtinPriority = builtinDef?.match?.acceptFile?.(filePath) ?? 0;
    let best: CustomEditorMatch | undefined;
    for (const b of customEditorRegistry.getBoardsForFile(filePath)) {
        if (!local && b.editorKind !== "content-host") continue;
        // Strict `>` so the FIRST (earliest-trusted) board wins ties among boards.
        if (!best || b.priority > best.priority) best = b;
    }
    if (best && best.priority > builtinPriority) return best.editorId;
    return builtinId;
}
```

### Step 6 — `PageToolbar` switch widget: surface content-host boards over non-local files

**File:** `src/renderer/editors/base/PageToolbar.tsx` (`:79`–`:82`)

```ts
// before
    const filePath = (model.contentHost as { filePath?: string } | null)?.filePath ?? model.filePath;
    const boardMatches = customEditorRegistry.useBoardsForFile(
        filePath && isPlainLocalPath(filePath) ? filePath : "",
    );
// after
    const filePath = (model.contentHost as { filePath?: string } | null)?.filePath ?? model.filePath;
    const local = !!filePath && isPlainLocalPath(filePath);
    // Simple boards need a local file; content-host boards also handle https/archive (CH4).
    const boardMatchesAll = customEditorRegistry.useBoardsForFile(filePath ?? "");
    const boardMatches = local
        ? boardMatchesAll
        : boardMatchesAll.filter((b) => b.editorKind === "content-host");
```

### Step 7 — Verify

Run `npx tsc --noEmit -p tsconfig.json` and `npx eslint` on the four touched files. Manual smoke
(deferred until US-846 delivers the bridge, since the board renders host-less until then, but the
non-visual paths are testable now via logging): a `.drawio` file whose trusted board declares
`editorKind: "content-host"` opens into a `BoardContentEditorModel` (`list_pages` shows
`board-editor:<root>`), the switch widget offers Monaco + the board, switching preserves the file
content on the host, and the tab restores after an app restart.

## Concerns

- **C1 — the host-transfer branch mirrors the generic tail exactly.** The proven built-in↔built-in
  path is `createEditor → switchFrom(old) → restore → setMainEditor` (`PageModel.ts:497`–`:500`); the
  board branch differs only in **how** the new editor is built (`new BoardContentEditorModel` +
  `initFromBoardRoot` instead of `editorRegistry.createEditor`, because `board-editor:<root>` isn't in
  the registry — HIGH-2). `setMainEditor`'s `idTransferred` logic (`:410`) preserves cache files
  because `switchFrom` copies `oldEditor.id`; the old editor is disposed after its host is extracted,
  and both `MonacoEditor.dispose` and `BoardContentEditorModel.dispose` dispose `_host` **only if**
  it's still present (it's null post-extraction), so the transferred host survives.

- **C2 — `initFromBoardRoot` then `switchFrom` ordering.** In the to-board host-transfer,
  `initFromBoardRoot(root, filePath)` sets `boardRoot`/`title`/`filePath` + `selectBoard` +
  `refreshBoards`, then `switchFrom` sets `s.id = oldEditor.id` and `adoptHost` (which overwrites the
  title with the file basename and re-copies the id). `restore()` then re-runs `super.restore()`
  (board re-validate — idempotent) and skips the host build (already adopted) and the host restore
  (the transferred host is already `restored`). This is the intended sequence; no double-build.

- **C3 — pipe routing depends on `contentHost` being absent on a bare host.** `TextFileModel` does
  **not** extend `EditorModel` and has no `contentHost` member, so `(editor as EditorModel).contentHost`
  is `undefined` for a text-file open (→ direct `editor.pipe = pipe`, unchanged) and `_host` for a
  content-host board (→ `host.pipe = pipe`). The simple board also has `contentHost === null` (base
  getter), so its never-read pipe still lands on `board.pipe` and is disposed on dispose — EPIC-042
  behavior preserved. Verified: `TextEditorModel.ts:63` (`extends TDialogModel`), `EditorModel.ts:242`
  (base `contentHost` → null).

- **C4 — open-time auto-routing over a raw non-local URL is intentionally NOT wired.** The openRawLink
  resolver (`resolvers.ts:166`) calls `resolveEditorIdForFile` **only** for local paths; for a
  non-local URL it uses `editorRegistry.resolveId(extractEffectivePath(...))` (built-ins only). So
  opening `https://…/x.drawio` directly still lands in the built-in editor — the user then **switches**
  to the content-host board (now offered by Step 6). Restructuring `resolveEditorIdForFile` (Step 5)
  keeps that function correct in isolation and serves the direct `newEditorModel` path, but the
  resolver gate is deliberately left as-is: CH4's headline is *sharing a host over non-local files*,
  which the switch delivers. Auto-routing raw non-local URLs to a board is out of scope (would need a
  `resolvers.ts` change not listed in the epic). Flagged so a future task can lift it if wanted.

- **C5 — `customEditorRegistry.entries` read is synchronous and safe.** Both `buildEditorById` and
  `switchMainEditor` reach a `board-editor:<root>` id only *after* the registry resolved that id (or
  the switch widget offered it), so the registry is populated. A cold read would default `editorKind`
  to `"simple"` (dispose-and-rebuild) — a safe degradation, never a crash. No `ensureInitialized`
  await is added on these hot paths (mirrors EPIC-042's sync `getBoardsForFile` usage).

- **C6 — the tab title MUST be the open file name, not the board name (confirmed requirement).**
  This is already satisfied by US-844's `adoptHost` + the host restore, so **no US-845 change is
  needed** — but it is a deliberate requirement, recorded here so no future change reverts it to the
  board folder name. Flow: `TextFileIOModel.restore` sets `state.title = fpBasename(filePath)` when the
  host title is still the default `"untitled"` (`TextFileIOModel.ts:263`); `adoptHost` copies that host
  title onto the board's `state.title` (`s.title = title || fpBasename(filePath)`), and
  `BoardContentEditorModel.restore` re-runs `adoptHost` **after** `host.restore()`, so the final tab
  shows the **file name** while the tab **icon** still comes from the board's `getIcon()`. There is a
  sub-frame window (before restore) where the title is `"untitled"` — `buildEditorById` adopts a
  freshly-built host whose default title is `"untitled"`; `restore()` (immediately, inside
  `createEditorFromFile`) fills in the basename. Not worth special-casing.

- **C7 — no visual output until US-846.** With no content bridge yet, a constructed content-host board
  mounts blank (the shim has no `persephone.host.*`). All of this task's behavior (construction,
  switch, save, dirty, persistence) is nonetheless live and testable via `list_pages` / logging /
  restart. The DrawIO proving ground (US-847) only lights up after US-846.

## Acceptance criteria

1. Opening a file claimed by a trusted `editorKind: "content-host"` board constructs a
   `BoardContentEditorModel` with an adopted, restored host (the resolver's pipe reaches the host, not
   the board's `pipe` field).
2. Switching **built-in → content-host board** and **content-host board → built-in** transfers the
   shared host (no reload, no "save changes?" prompt); the file content and dirty state are preserved
   across the swap; cache files are not deleted (id transferred).
3. Switching to/from a **simple** board still dispose-and-rebuilds with `confirmRelease` (EPIC-042
   unchanged).
4. A content-host board tab restores after an app restart / cross-window move / duplicate with its
   content and file intact (no "legacy project-mode board editor" drop).
5. A content-host board appears as a switch option for `https://`/archive files (Step 6); a simple
   board does not.
6. `npx tsc --noEmit` and `npx eslint` are clean on the four touched files; no other file is modified.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `buildEditorById` `board-editor:<root>` branch now builds a `BoardContentEditorModel` + adopted host for `editorKind: "content-host"` (else the simple board, unchanged); `createEditorFromFile` routes the pipe to the content host when present. Import `customEditorRegistry`. |
| `src/renderer/api/pages/PageModel.ts` | `switchMainEditor` board branch splits into a **host-transfer** path (both endpoints host-capable → `switchFrom`, no `confirmRelease`, content-host board built directly) and the existing **dispose-and-rebuild** path (simple board / non-host built-in). |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | `restorePage` gains a content-host board branch (`board-view` + `d.host`) **before** `if (d.host)` that rebuilds `BoardContentEditorModel`, applies `d.state`, reconstructs the host from `d.host`, and restores. Import type `BoardEditorState`. |
| `src/renderer/editors/board/custom-editor-registry.ts` | `resolveEditorIdForFile` no longer short-circuits on a non-local path; it filters the board scan by `editorKind` (content-host boards allowed on non-local, simple boards local-only). |
| `src/renderer/editors/base/PageToolbar.tsx` | Switch widget passes the file path to `useBoardsForFile` unconditionally, then filters to content-host boards for non-local paths (simple boards still local-only). |
