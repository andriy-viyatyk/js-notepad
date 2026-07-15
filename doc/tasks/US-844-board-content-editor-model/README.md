# US-844: `BoardContentEditorModel` — the content-host board model (crux)

**Epic:** [EPIC-043 — Content-Host Boards](../../epics/EPIC-043.md) (task 2 of 5)
**Status:** Not started
**Depends on:** US-843 (`editorKind` on `CustomEditorMatch`)
**Blocks:** US-845 (construction/switch/persistence), US-846 (content bridge + view wiring)

## Goal

Create `BoardContentEditorModel extends BoardEditorModel`, a board editor that **composes an
`IContentHost`** exactly as `MonacoEditor` does — `_host` + `CONTENT_HOST_TRAIT`, host adoption,
save/dirty/confirm delegated to the host, host descriptor in `getRestoreData` — while inheriting
**all** of `BoardEditorModel`'s board machinery (iframe, trust, toolbar, automation, icon) for free.
This is the crux of the epic; the model is defined here and **wired** in US-845 (construction) and
US-846 (bridge). After this task the class **compiles and type-checks but is unreferenced** — nothing
constructs it yet. That is expected.

## Background

The class sits at the intersection of two proven patterns. It is a **mechanical merge**: take
`MonacoEditor`'s host-composition surface and graft it onto `BoardEditorModel`, overriding the few
board behaviors that a real editor must change (save, dirty, switch, busy).

### Template 1 — `MonacoEditor` (the host-composition surface)

`src/renderer/editors/monaco/MonacoEditor.ts` is the smallest content-host editor. The parts US-844
copies (with line refs, verified 2026-07-15):

- **Fields** (`:55`–`:57`): `_host: TextFileModel | null`, `_hostStateUnsub: (() => void) | null`,
  `_pendingHost: HostDescriptor | undefined`.
- **Constructor trait registration** (`:72`–`:84`): build an `IContentHostTrait` whose
  `extractContentHost()` unsubscribes, nulls `_host`, and returns the host; `this.traits.add(CONTENT_HOST_TRAIT, trait)`.
- **`get contentHost()`** (`:89`): returns `_host` (as `IContentHost`) or null.
- **`switchFrom(oldEditor)`** (`:214`–`:236`): pull the old editor's host via `CONTENT_HOST_TRAIT`,
  preserve `oldEditor.id` (cache continuity), `adoptHost`. (Monaco also stamps `host.state.editor = "monaco"`;
  the board deliberately does **not** — see Concern C1.)
- **`restore()`** (`:238`–`:260`): if no `_host`, build from `_pendingHost`
  (`TextFileModel.fromDescriptor`) or `newTextFileModel(...)`; if the host isn't `restored`, `await
  host.restore()`; `adoptHost`; notify + fall back on error.
- **`adoptHost(host)`** (`:268`–`:287`): set `_host`, (re)subscribe `host.state → descriptorChanged.send`,
  copy title/id from host state, forward `page` via `host.setPage`.
- **`setPage`** (`:289`–`:292`): `super.setPage` + `_host?.setPage`.
- **`getRestoreData()`** (`:183`–`:195`): attach `host: this._host?.getDescriptor()`.
- **`applyRestoreData()`** (`:197`–`:210`): `if (data.host) this._pendingHost = data.host`.
- **`confirmRelease`** (`:296`–`:298`) → `_host?.confirmRelease(closing)`; **`saveState`** (`:300`–`:302`)
  → `_host?.io.saveState()`.
- **`dispose()`** (`:304`–`:312`): unsub, dispose `_host` iff present, `super.dispose()`.

### Template 2 — `BoardEditorModel` (the board machinery, inherited)

`src/renderer/editors/board/BoardEditorModel.ts`. The subclass inherits everything and overrides
only what diverges:

| Inherited member | Keep as-is? | US-844 action |
|---|---|---|
| `get editorId()` (`:80`) — `board-editor:<root>` when editing a file, else `board-view` | ✅ keep | none |
| `noLanguage = true`, `showBackgroundOrnament = true` (`:85`,`:87`) | ✅ keep | none |
| `skipSave = true` (`:86`) | ❌ | override → `false` (a real editor whose dirty state Persephone tracks) |
| `target`, `currentIframe`, `setIframe`/`clearIframe`, `getIcon` (`:91`–`:123`) | ✅ keep | none |
| `setBusy` (`:131`), `keepAliveOnNavigation` (`:141`), `survivesNavigation` (`:148`) | ❌ | override — no busy (CH7) |
| `matchesNavigationTarget` (`:155`), `currentFilePath` (`:166`), `get filePath` (`:173`) | ✅ keep | none |
| `findCompatibleEditors` (`:180`) — gated on `isPlainLocalPath` | ❌ | override — drop the local gate (CH4) |
| `getRestoreData` (`:191`) — pins `editorId: "board-view"`, full state | ⚠️ extend | override → `super` + `data.host = ...` |
| `initFromBoardRoot` (`:200`), `refreshBoards` (`:230`), `selectBoard`, `reloadBoard`, `getSelectedBoardLogPath` | ✅ keep | none |
| `restore()` (`:217`) — board validation + legacy throw | ⚠️ extend | override → `super.restore()` then ensure/adopt host |
| `dispose()` (`:280`) — reap jobs, unregister frame | ⚠️ extend | override → dispose host, then `super.dispose()` |
| base `get contentHost()` returns null (`EditorModel.ts:242`) | ❌ | override → `_host` |
| base `confirmRelease` returns true (`EditorModel.ts:352`), base `saveState` no-op (`:334`) | ❌ | override — delegate to host |

### Key host-API facts (verified in `src/renderer/editors/text/TextEditorModel.ts`)

- `TextFileModel implements IContentHost`, discriminated by `state.type === "textFile"` (`:63`, `:96`).
- `newTextFileModel(filePath?)` (`:440`) — builds a fresh host; resolves `editor` from the path. The
  host **lazily self-creates its pipe on `restore()`** (via `TextFileIOModel.ensurePipe()`), so for a
  **local** file `newTextFileModel(path)` + `host.restore()` is sufficient with no explicit pipe. For
  **non-local** (`https://`/archive) opens, US-845 pre-builds the pipe and adopts the host before
  `restore()` — see Concern C3.
- `TextFileModel.fromDescriptor(desc)` (`:356`) — async; rebuilds host + pipe from a `HostDescriptor`.
  Caller still owns calling `restore()`.
- `isTextFileModel(model)` (`:465`) — exported type guard; use it instead of Monaco's private
  `isLegacyTextFileHost`.
- `host.getDescriptor()` (`:315`), `host.io.saveState()` (via `saveState`, `:370`), `host.confirmRelease()`
  (`:434`), `host.changeContent(str, byUser)` (`:249` — used by US-846, not here), `host.dispose()` (`:384`).

### Files that need NO changes in US-844 (do not edit)

- `PagesLifecycleModel.ts`, `PagesPersistenceModel.ts` — **construction / restore wiring is US-845.**
- `register-editors.ts`, `board/index.tsx` — the content-host board reuses the `board-view`
  registration and `BoardEditorView` component (CH5); no new registry entry. (US-845 imports the new
  class directly by file path; adding a barrel re-export to `index.tsx` is optional and left to US-845.)
- `BoardWebview.tsx`, `BoardEditorView.tsx`, `board-shim.ts`, `board-bridge*.ts` — **the content
  bridge and view wiring are US-846.**
- `BoardEditorModel.ts` — the base is inherited unchanged; do **not** fork it.

## Implementation plan

### Step 1 — Create `src/renderer/editors/board/BoardContentEditorModel.ts`

Full file (this is the deliverable — every method mirrors a verified template above):

```ts
import type { TComponentState } from "../../core/state/state";
import { EditorModel } from "../base/EditorModel";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import { editorRegistry } from "../base/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { TextFileModel, newTextFileModel, isTextFileModel } from "../text/TextEditorModel";
import { BoardEditorModel, type BoardEditorState } from "./BoardEditorModel";
import { boardEditorId } from "./custom-editor-registry";

/**
 * Content-host board (EPIC-043). A board that edits a file through Persephone's content host —
 * the same `TextFileModel` (`IContentHost`) that backs Monaco / Grid / Notebook. Persephone owns
 * the pipe, encoding, encryption, auto-save cache, and dirty state; the board works with the
 * content over the `persephone.host.*` bridge (US-846). It switches with the built-in editors by
 * TRANSFERRING the shared host (no reload / no data loss), via `CONTENT_HOST_TRAIT`.
 *
 * Subclass of `BoardEditorModel`: inherits the iframe / trust / toolbar / automation / icon
 * machinery unchanged, and adds only the host composition (template: `MonacoEditor`). Built in the
 * `board-editor:<root>` construction branch when the manifest declares `editorKind: "content-host"`
 * (US-845).
 */
export class BoardContentEditorModel extends BoardEditorModel {
    /** A real editor whose dirty state Persephone tracks (base board is `true`). */
    override skipSave = false;

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    constructor(state: TComponentState<BoardEditorState>) {
        super(state);
        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) {
                    throw new Error("Host already extracted from BoardContentEditorModel");
                }
                this._hostStateUnsub?.();
                this._hostStateUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ──────────────────────────────────────────────────

    override get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Switch options while ON the board: the file's natural built-in editor (to switch back)
     *  plus this board. UNLIKE the base board, NO `isPlainLocalPath` gate — content-host boards
     *  edit https/archive/encrypted files too (CH4). */
    override findCompatibleEditors(): string[] {
        const filePath = this.currentFilePath();
        const root = this.state.get().boardRoot;
        if (!filePath || !root) return [];
        const builtinId = editorRegistry.resolveId(filePath) ?? "monaco";
        return [builtinId, boardEditorId(root)];
    }

    // ── Host transfer on editor switch (template: MonacoEditor.switchFrom) ──

    override switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `BoardContentEditorModel.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isTextFileModel(host)) {
            throw new Error(
                "BoardContentEditorModel.switchFrom: extracted host is not a TextFileModel",
            );
        }
        // Preserve cache-file id across the swap (<id>-host.txt etc.) — like Monaco.
        this.state.update((s) => { s.id = oldEditor.id; });
        // `host.state.editor` is stamped "board-view" inside `adoptHost` (Concern C1).
        this.adoptHost(host);
    }

    /** Adopt a host (from `switchFrom`, from US-845 construction, or from `restore`). Wires host
     *  state → `descriptorChanged` for persistence, copies title/id, forwards `page`. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );
        const { filePath, title, id } = host.state.get();
        this.state.update((s) => {
            // Tab shows the FILE name (the board's own icon still comes from `getIcon`).
            s.title = title || (filePath ? fpBasename(filePath) : s.title);
            if (id) s.id = id;
        });
        // Mark the host as board-rendered for introspection consistency (Concern C1).
        // "board-view" is the valid EditorView token (there is no "board"); it is never
        // persisted (`getDescriptor` omits `editor`) and is overwritten by the receiving
        // built-in's `switchFrom` on a switch away.
        host.state.update((s) => {
            if (s.editor !== "board-view") s.editor = "board-view";
        });
        if (this.page) host.setPage(this.page);
    }

    override setPage(page: Parameters<EditorModel["setPage"]>[0]): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Lifecycle ───────────────────────────────────────────────────────

    /** Board validation (trust, refreshBoards, legacy-throw) via `super.restore()`, THEN ensure
     *  the content host. Prefers an already-adopted host (US-845 pre-builds the pipe for non-local
     *  files); otherwise builds a fallback from `_pendingHost` or the local file path. */
    override async restore(): Promise<void> {
        await super.restore();
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel(this.currentFilePath() ?? "");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
        } catch (err) {
            ui.notify(
                (err as Error).message || "Failed to restore board content.",
                "error",
            );
            // Leave the host-restore-failure empty state to the view (US-846).
        }
        this._pendingHost = undefined;
    }

    // ── Persistence ─────────────────────────────────────────────────────

    /** Base board pins `editorId: "board-view"` + the full board state; we add the host
     *  descriptor. `d.host` present on a `board-view` descriptor is the content-host-vs-plain
     *  discriminator at restore (US-845's `restorePage` branch). */
    override getRestoreData(): EditorDescriptor {
        const data = super.getRestoreData();
        data.host = this._host?.getDescriptor();
        return data;
    }

    override applyRestoreData(
        data: Parameters<EditorModel<BoardEditorState>["applyRestoreData"]>[0],
    ): void {
        super.applyRestoreData(data);
        if (data.host) this._pendingHost = data.host;
    }

    // ── Save / dirty (delegate to host) ─────────────────────────────────

    override async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    override async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    // ── No busy for content-host boards (CH7) ───────────────────────────

    /** The host TRANSFERS OUT on switch, so a surviving host-less board is a broken zombie, and
     *  duplicating the host would give two unsynchronized writers of the same file. So no busy. */
    override setBusy(_busy: boolean): void {
        console.warn(
            "[BoardContentEditorModel] setBoardBusy is not supported for content-host boards — ignoring.",
        );
    }

    override keepAliveOnNavigation(): boolean {
        return false;
    }

    override survivesNavigation(): boolean {
        return false;
    }

    // ── Dispose (host first, then board teardown) ───────────────────────

    override async dispose(): Promise<void> {
        this._hostStateUnsub?.();
        this._hostStateUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

### Step 2 — Verify it compiles clean

Run `npx tsc --noEmit -p tsconfig.json` and `npx eslint` on the new file. No downstream file
references the class yet (that's US-845), so there is nothing else to touch.

## Concerns

- **C1 — the board stamps `host.state.editor = "board-view"` in `adoptHost` (like Monaco stamps
  `"monaco"`), for introspection consistency with what is rendered.** Decision facts (all verified):
  - **Use `"board-view"`, not `"board"`.** `host.state.editor` is typed `EditorView`
    (`renderer/api/types/common.d.ts:26`); the union contains **`"board-view"`** (`:55`) but no
    `"board"`, so `"board"` would not type-check. `"board-view"` is the correct token and matches the
    board editor's own registry id / `BoardEditorState.editor`.
  - **It is safe.** The only code that dispatches on `host.state.editor` is `attachEditorToPage`
    (`PagesLifecycleModel.ts:66-75`), and only at **host-first construction**. A content-host board is
    **never** built that way (CH5 — it's built in the `board-editor:<root>` branch), so the field is
    inert while the board owns the host. It is **not persisted** — `TextFileModel.getDescriptor()`
    (`TextEditorModel.ts:315-335`) omits `editor` — so a restore can't be corrupted by it. On a switch
    **away**, the receiving built-in's own `switchFrom` re-stamps it (`monaco` / `grid-json` / …).
  - **Invariant to preserve:** never route a *board-owned* host through `attachEditorToPage`. That
    path does not exist in the content-host flow (construction goes through the board-editor branch,
    and the host is only ever extracted by a switch target), and US-845 must keep it that way. If it
    ever leaked, `attachEditorToPage` would build a plain `BoardEditorModel` via `boardModule` that
    does **not** adopt the host → silent host drop. Not reachable today; called out so US-845 keeps it
    unreachable.
- **C2 — `state.id` is copied from the host in `adoptHost` (mirrors Monaco).** `this.id` doubles as
  the cache-file prefix **and** the board-frame CDP registration key (`registerBoardFrame`/
  `unregisterBoardFrame`/`BoardTargetModel`/`reapBoardOwner`). Copying is safe because `adoptHost`
  runs at construction / `switchFrom` / `restore` — always **before** `BoardWebview` mounts and
  registers the frame — so the id is settled before any registration. On `switchFrom` the
  `s.id = oldEditor.id` line and the `adoptHost` id-copy resolve to the same value (the built-in had
  already synced its id to the host). Do not mutate `state.id` after mount.
- **C3 — `restore()` builds a fallback host only for local files.** The host self-creates its pipe on
  `restore()` for local paths (`ensurePipe`), so `newTextFileModel(localPath)` + `host.restore()` is
  complete. For `https://` / archive opens the pipe must be built at open time — that is **US-845's
  `buildEditorById` job** (build pipe → host → `adoptHost` before `restore()`), so by the time
  `restore()` runs `_host` is already adopted and the fallback branch is skipped. US-844's fallback is
  the local-file safety net only; it is not expected to fire on the non-local path.
- **C4 — inert until US-845.** Nothing constructs `BoardContentEditorModel` after this task. Do not
  attempt to wire construction, switch routing, or the `restorePage` branch here — those are US-845,
  and the content bridge/view is US-846. This task's success is a clean-compiling class.
- **C5 — field-initializer order.** `override skipSave = false` (a class field) runs after the base
  `skipSave = true` initializer during construction, so the final value is `false`. The trait
  registration in the constructor body runs after both. This ordering is correct and intended.

## Acceptance criteria

1. `src/renderer/editors/board/BoardContentEditorModel.ts` exists, exporting
   `class BoardContentEditorModel extends BoardEditorModel`.
2. It composes `_host: TextFileModel | null` and registers `CONTENT_HOST_TRAIT` with a working
   `extractContentHost()` (unsub → null → return).
3. Overrides present and correct: `contentHost`, `findCompatibleEditors` (no local gate),
   `switchFrom`, `adoptHost`, `setPage`, `restore`, `getRestoreData`, `applyRestoreData`, `saveState`,
   `confirmRelease`, `setBusy` (no-op + warn), `keepAliveOnNavigation` → false,
   `survivesNavigation` → false, `dispose`, and `skipSave = false`.
4. `npx tsc --noEmit` is clean; `npx eslint` on the new file is clean.
5. No other source file is modified (construction/bridge wiring is US-845/846).

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/board/BoardContentEditorModel.ts` | **New.** `BoardContentEditorModel extends BoardEditorModel` composing an `IContentHost` (host + `CONTENT_HOST_TRAIT`, `switchFrom`/`adoptHost`/`restore`, save/dirty/confirm delegation, host descriptor in `getRestoreData`, no-busy overrides, host-first `dispose`). Template: `MonacoEditor`. |
