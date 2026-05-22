# US-554: Markdown editor migration

EPIC-028 Phase C — first of four sibling preview-group migrations (walkthrough 22). Promotes the legacy `MarkdownViewModel` (a `ContentViewModel` over `TextFileModel`) to a native v4 `MarkdownEditor` extending `EditorModel`. Retires the `useContentViewModel("md-view")` consumer site and the `acquireViewModel("md-view")` facade-acquire pair.

Walkthrough: [`doc/epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md). Concerns PV1–PV10 (PV2 / PV6 amended 2026-05-21 by HS1).

## Goal

Replace the host + content-view pair (`TextFileModel` wrapped in `LegacyEditorAdapter` + `MarkdownViewModel` acquired via `useContentViewModel`) with a single native `MarkdownEditor` that IS the page's `mainEditor` and HAS a `TextFileModel` as its `IContentHost` via `CONTENT_HOST_TRAIT`. The `MarkdownEditorFacade` flips from wrapping `MarkdownViewModel` to wrapping `MarkdownEditor` directly (stays sync). `compactMode` rides the HS1 host slot (`host.editorSettings["md-view"]`) so it survives Markdown↔Monaco switches AND app restarts.

## Background

### Reference shape — LogViewEditor (US-553) and GridEditor (US-552)

`src/renderer/editors/log-view/LogViewEditor.ts` and `src/renderer/editors/grid/GridEditor.ts` are the canonical native-v4 text-bearing editor classes. Markdown follows the same eight-piece Tier-5 template:

1. Class extends `V4EditorModel<XState, void, XQueueEvent>` with `readonly editorId = "md-view"`, `_host: TextFileModel | null`, subscription handles, and an HS1 mirror handle.
2. Constructor adds `CONTENT_HOST_TRAIT` with `extractContentHost` that tears down every subscription before returning the host.
3. `applyRestoreData` stashes `_pendingHost` for restore; no legacy promotion needed (today's `MarkdownViewModel` doesn't persist `compactMode` — it's in-memory only).
4. `switchFrom(oldEditor)` extracts the host via the trait, copies the editor id (cache-file continuity), tags `host.state.editor = "md-view"`, then calls `adoptHost`.
5. `restore()` either rebuilds the host from `_pendingHost` or constructs an empty one, calls `host.restore()`, then `adoptHost`.
6. `adoptHost(host)` wires the host-state forwarder, the HS1 seed-from-slot for `compactMode`, the HS1 mirror back to the slot, and the title sync. NO host-content subscription is needed — the view reads `host.state.use((s) => s.content)` directly (MarkdownBlock re-renders on every content change via React props).
7. `dispose()` tears down every subscription before disposing the host (only if not extracted).
8. Module file (`markdown/index.tsx`) exports an `EditorModule` (`{ createEditor, Component }`) consumed by the v4 registry; `register-editors.ts` overrides the bare-adapter mirror with the native module via `v4EditorRegistry.register({ id, accepts, loadModule })`.

Markdown reproduces this shape but adds three editor-specific mechanisms:

- **Imperative `MarkdownBlockHandle`** — view holds `useRef<MarkdownBlockHandle>(null)`; calls `blockRef.current?.scrollToMatch(index)` via a `useEffect` on `currentMatchIndex` change. Handle preserved verbatim from today.
- **DOM peek for facade** (PV9) — non-state private `_containerRef: HTMLDivElement | null` field on `MarkdownEditor`; view's scroll panel sets it via callback ref (`model.setContainer(el)`); facade reads `editor.containerInnerHtml` / `editor.viewMounted` via public getters. Sync.
- **View-local scroll restoration** (PV4) — `scrollTopRef = useRef(0)` + `pagesModel.onFocus` subscription inside `MarkdownBody`. Not persisted; restored on tab focus only (mirrors today's behavior).

### HS1 amendment for Markdown (PV2 / PV6 supersession, 2026-05-21)

US-552-B introduced `host.getEditorState<T>(editorId)` / `host.setEditorState<T>(editorId, value)` on `IContentHost`, backed by an `editorSettings: Record<string, unknown>` slot on `TextFileModel.state`. Each text-bearing editor reads its own slot via `this.editorId`, seeds editor state from it in `adoptHost`, and mirrors changes back via a `state.subscribe` selector mirror.

The walkthrough's original PV2 resolution put `compactMode` on `EditorDescriptor.state`. **HS1 amendment moves it to `host.editorSettings["md-view"]`** so it survives Markdown↔Monaco switches (host outlives the editor) AND app restarts (host descriptor rides `openFiles.txt`). Small new feature vs. today (today's `MarkdownViewModel.compactMode` is in-memory only — no persistence; first-open always renders non-compact).

**Persisted slot shape** (`MarkdownViewSettings`):
```typescript
interface MarkdownViewSettings {
    compactMode?: boolean;
}
```

`searchVisible / searchText / currentMatchIndex / totalMatches` remain on `editor.state` for in-session reactivity but are **stripped from `getRestoreData`** per the MO5 / GR8 / PV2 pattern. Search is a transient gesture; persisting it surprises users on next open with a stale query.

**No legacy descriptor migration needed:** today's `MarkdownViewModel` doesn't persist `compactMode` — first-load post-upgrade starts with `compactMode = false`, same as today.

### Current state — files in scope

`src/renderer/editors/markdown/`:

| File | Today's role | After US-554 |
|------|--------------|--------------|
| `MarkdownViewModel.ts` | `ContentViewModel<MarkdownViewState>` over `TextFileModel` | **Deleted.** State + setters + `containerScrollTop` + `pageFocused` absorb into the new editor / body. |
| `MarkdownView.tsx` | React component, props `{ model: TextFileModel }`, uses `useContentViewModel<MarkdownViewModel>` + `createPortal(...editorToolbarRefLast)` | **Renamed to `MarkdownBody.tsx`.** Drops `useContentViewModel`; reads via `state.use` on `MarkdownEditor`. Compact-toggle button migrates to inline `<MarkdownToolbarBits>` inside `<TextChrome>`. Portal retires. |
| (new) `MarkdownEditor.ts` | — | Native v4 `MarkdownEditor` class + state shape + queue event union. |
| (new) `index.tsx` | — | Module shell — `EditorModule` export (`markdownModule`), `MarkdownEditorView` ({ TextChrome + MarkdownToolbarBits + MarkdownBody }), re-exports of class and types. Replaces today's `index.ts` (which re-exports `MarkdownView` / `MarkdownViewModule` / `MarkdownBlock`). |
| `MarkdownBlock.tsx`, `CodeBlock.tsx`, `rehypeHighlight.ts` | Pure rendering primitives consumed by `MarkdownView` AND three other sites (`McpInspectorView`, `ResourceContentView`, `log-view/items/MarkdownOutputView`) | **Verbatim.** `MarkdownBlockHandle` imperative ref interface unchanged. |

`src/renderer/editors/shared/FindBar.tsx` — unchanged (consumed by Markdown body).

### Consumer sites of `MarkdownBlock` (NOT in scope — preserved verbatim)

These import `MarkdownBlock` as a reusable component, not `MarkdownView` / `MarkdownViewModel`. Nothing to change:

- `src/renderer/editors/mcp-inspector/McpInspectorView.tsx`
- `src/renderer/editors/mcp-inspector/ResourceContentView.tsx`
- `src/renderer/editors/log-view/items/MarkdownOutputView.tsx`

### `useContentViewModel("md-view")` / `acquireViewModel("md-view")` callsites to retire

| File | Line(s) | Pattern today | After |
|------|---------|---------------|-------|
| `src/renderer/editors/markdown/MarkdownView.tsx` | 24 | `useContentViewModel<MarkdownViewModel>(model, "md-view")` | Read via `state.use` on `MarkdownEditor` (the body owns the editor directly). |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | 238–239 | `await model.acquireViewModel("md-view") as MarkdownViewModel` + `releaseList.push(() => model.releaseViewModel("md-view"))` | `this.v4 instanceof MarkdownEditor` direct check; `new MarkdownEditorFacade(this.v4)`; releaseList push deletes. Same pattern as `asGrid` / `asText`. |
| `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts` | constructor + getters | Wraps `MarkdownViewModel`; reads `vm.state.get().container?.innerHTML` and `vm.state.get().container !== null` | Wraps `MarkdownEditor`; reads `editor.containerInnerHtml` and `editor.viewMounted` via public getters (PV9). Stays sync. |

The `acquireViewModel*` machinery itself does NOT die in this task — `NoteItemEditModel.ts` is still a consumer; the interface declaration in `editors/base/IContentHost.ts` and the `TextEditorModel.ts` implementation stay. Full removal happens in US-557 (Notebook) and US-559 (cleanup).

### Open-file path — `wrapLegacyForPage`

`src/renderer/api/pages/PagesLifecycleModel.ts:54` (`wrapLegacyForPage`) is the bridge that converts legacy `TextFileModel` instances into v4 editors during page creation. It has three `if` branches today (Monaco, Grid, LogView) that produce native v4 editors; everything else falls through to `LegacyEditorAdapter`. US-554 adds the Markdown branch:

```typescript
if (isTextFile && targetEditorId === "md-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const markdown = new MarkdownEditor(
        new TComponentState({ ...defaultMarkdownEditorState, id }),
    );
    markdown.adoptHost(legacy as TextFileModel);
    return markdown;
}
```

Simpler than Grid / LogView — no initial parse / detect step; the view reads `host.state.use((s) => s.content)` and `MarkdownBlock` re-renders on every content change.

This makes:
- `pagesModel.addEditorPage("md-view", "markdown", title, content)` produce a v4-native `MarkdownEditor` as `page.mainEditorV4`. Callers: `src/renderer/scripting/api-wrapper/Markdown.ts:38`, `src/renderer/editors/graph/GraphViewModel.ts:1199`, `src/renderer/editors/graph/GraphTooltip.tsx:222`, `src/renderer/editors/log-view/items/MarkdownOutputView.tsx:20`.
- Markdown picked via `Open as → Markdown Preview` dropdown (`EditLinkDialog.tsx:52`) produce the same.

The legacy registry's `md-view` entry (`register-editors.ts:186`) keeps `editorType: "textFile"` so `editorRegistry.validateForLanguage("md-view", "markdown")` still resolves correctly during page creation. The bare-adapter mirror in the v4 bridge loop (`register-editors.ts:714`) drops `"md-view"` from the bridge set — a native v4 registration replaces it (same pattern as Grid / LogView).

### Backwards compatibility — pre-US-554 session data

Today's session data:
- `<host.id>-host.txt` — markdown content; cache-keyed by editor id. Survives across migration since `MarkdownEditor` inherits the host's id (C9). No content shape change.
- `EditorDescriptor` shape — today's md-view pages are persisted as `editor: "md-view"` + `type: "textFile"` (legacy adapter shape). After US-554 they save as `editorId: "md-view"` + a host descriptor (native v4 shape). v3 restore path auto-promotes pre-US-551 sessions by calling `wrapLegacyForPage` on the restored TextFileModel — the new Markdown branch handles the promotion.

No per-editor cache files to clean up — `MarkdownViewModel` never wrote any. No legacy promotion in `applyRestoreData` — today's session never wrote `compactMode` to the descriptor.

## Implementation plan

### Step 1 — Create `src/renderer/editors/markdown/MarkdownEditor.ts`

New file. Class skeleton mirrors `src/renderer/editors/log-view/LogViewEditor.ts` with Markdown-specific surfaces.

**State shape** (`MarkdownEditorState`):

```typescript
import type { EditorStateBase } from "../base/v4/EditorModel";

export interface MarkdownEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["md-view"]. Bounded boolean, safe to persist.
    compactMode: boolean;
    // View-derived — present on state for reactivity, stripped from getRestoreData (PV2 / MO5).
    searchVisible: boolean;
    searchText: string;
    currentMatchIndex: number;
    totalMatches: number;
}

export const defaultMarkdownEditorState: MarkdownEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    compactMode: false,
    searchVisible: false,
    searchText: "",
    currentMatchIndex: 0,
    totalMatches: 0,
};
```

**Queue event union** (PV8):

```typescript
export type MarkdownQueueEvent = { type: "focus" };
export type MarkdownQueueRequest = never;  // facade is sync (PV9 / PV10)
```

**HS1 host-slot interface:**

```typescript
interface MarkdownViewSettings {
    compactMode?: boolean;
}
```

**Class structure:**

```typescript
export class MarkdownEditor extends V4EditorModel<MarkdownEditorState, void, MarkdownQueueEvent> {
    readonly editorId = "md-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    /** PV9 — non-state DOM ref set by the body via `setContainer(el)` callback. */
    private _containerRef: HTMLDivElement | null = null;

    readonly typedQueue: ComponentQueue<MarkdownQueueEvent, MarkdownQueueRequest>;

    constructor(state: TComponentState<MarkdownEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<MarkdownQueueEvent, MarkdownQueueRequest>;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from MarkdownEditor");
                this._hostStateUnsub?.();
                this._settingsUnsub?.();
                this._hostStateUnsub = null;
                this._settingsUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ─────────────────────────────────────────────────

    get contentHost(): IContentHost | null { return (this._host as unknown as IContentHost) ?? null; }
    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return v4Registry.findEditorsAccepting(this._host as unknown as IContentHost);
    }
    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }
    focus(): void { this.typedQueue.send({ type: "focus" }); }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // HS1 — descriptor collapses to identity-only. `compactMode` rides
        // host.editorSettings["md-view"]; search fields stripped per PV2 / MO5.
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<MarkdownEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        // No legacy promotion needed — today's MarkdownViewModel doesn't
        // persist compactMode (in-memory only). `adoptHost` seeds compactMode
        // from the host slot on first read.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(`MarkdownEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`);
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("MarkdownEditor.switchFrom: extracted host is not a TextFileModel");
        }
        this.state.update((s) => { s.id = oldEditor.id; });
        host.state.update((s) => { s.editor = this.editorId; });
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel("");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Markdown editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._settingsUnsub?.();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send(undefined));

        // No host-content subscription needed — the view reads
        // `host.state.use((s) => s.content)` directly; MarkdownBlock re-renders
        // on every content change via React props.

        // HS1 — seed `compactMode` from host slot (sync, no flicker).
        const saved = host.getEditorState<MarkdownViewSettings>(this.editorId);
        if (saved?.compactMode !== undefined) {
            this.state.update((s) => { s.compactMode = saved.compactMode!; });
        }

        // HS1 — mirror `compactMode` changes back to host slot via a selector
        // subscription. Slice-subscribe keeps the mirror from firing on
        // search-state mutations (the dominant write source on markdown pages) —
        // only the bounded boolean actually triggers a host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (compactMode) => {
                if (!this._host) return;
                this._host.setEditorState<MarkdownViewSettings>(this.editorId, {
                    compactMode: compactMode as boolean,
                });
            },
            (s) => s.compactMode,
        );

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── View-driven setters / state mutators ────────────────────────────

    /** PV9 — view callback ref: scroll panel sets its DOM node here.
     *  Reads via `containerInnerHtml` / `viewMounted` getters (facade-only). */
    setContainer = (el: HTMLDivElement | null): void => {
        this._containerRef = el;
    };

    toggleCompact = (): void => {
        this.state.update((s) => { s.compactMode = !s.compactMode; });
    };

    openSearch = (): void => {
        this.state.update((s) => { s.searchVisible = true; });
    };

    closeSearch = (): void => {
        this.state.update((s) => {
            s.searchVisible = false;
            s.searchText = "";
            s.currentMatchIndex = 0;
            s.totalMatches = 0;
        });
    };

    setSearchText = (text: string): void => {
        this.state.update((s) => {
            s.searchText = text;
            s.currentMatchIndex = 0;
        });
    };

    /** Called from the view's `onMatchCountChange` bridge — clamps the index
     *  when the count changes (e.g., user types extra chars and total drops). */
    setMatchCount = (count: number): void => {
        this.state.update((s) => {
            const newIndex = count > 0 && s.currentMatchIndex >= count ? 0 : s.currentMatchIndex;
            s.totalMatches = count;
            s.currentMatchIndex = newIndex;
        });
    };

    nextMatch = (): void => {
        const { totalMatches, currentMatchIndex } = this.state.get();
        if (totalMatches === 0) return;
        this.state.update((s) => {
            s.currentMatchIndex = (currentMatchIndex + 1) % totalMatches;
        });
    };

    prevMatch = (): void => {
        const { totalMatches, currentMatchIndex } = this.state.get();
        if (totalMatches === 0) return;
        this.state.update((s) => {
            s.currentMatchIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
        });
    };

    // ── Facade-only accessors (PV9) ─────────────────────────────────────

    get containerInnerHtml(): string {
        return this._containerRef?.innerHTML ?? "";
    }

    get viewMounted(): boolean {
        return this._containerRef !== null;
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        this._hostStateUnsub?.();
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._settingsUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

Imports follow LogViewEditor's structure: `V4EditorModel` / `EditorStateBase` / `RestoreData` from `../base/v4/EditorModel`; `CONTENT_HOST_TRAIT` / `IContentHostTrait` from `../base/v4/editor-traits`; `IContentHost` from `../base/v4/IContentHost`; `ComponentQueue` from `../../core/state/ComponentQueue`; `EditorDescriptor` / `HostDescriptor` from `../../../shared/persistence-v4`; `IContentPipe` from `../../api/types/io.pipe`; `PageModel` from `../../api/pages/PageModel` (type-only); `TextFileModel` / `newTextFileModel` from `../text/TextEditorModel`; `editorRegistry as v4Registry` from `../base/v4/editorRegistry`; `fpBasename` from `../../core/utils/file-path`; `ui` from `../../api/ui`. Define a file-local `isLegacyTextFileHost` (same pattern as LogViewEditor / GridEditor).

### Step 2 — Create `src/renderer/editors/markdown/MarkdownBody.tsx`

New file replacing today's `MarkdownView.tsx`. Drops `useContentViewModel` + `createPortal` machinery; absorbs the scroll-restore / search-bridge / key-handler / render skeleton from today.

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarkdownEditor } from "./MarkdownEditor";
import { pagesModel } from "../../api/pages";
import { useEditorConfig } from "../base";
import { FindBar } from "../shared/FindBar";
import { MarkdownBlock, MarkdownBlockHandle } from "./MarkdownBlock";
import { Minimap, Panel } from "../../uikit";

export function MarkdownBody({ model }: { model: MarkdownEditor }) {
    const host = model.contentHost;  // TextFileModel (typed as IContentHost; cast below)
    const blockRef = useRef<MarkdownBlockHandle>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    // PV4 — view-local scroll-restore state.
    const scrollTopRef = useRef(0);
    // MK1 — Minimap needs the scroll-container DOM node reactively (today's
    // pageState.container behavior). Local React state mirrors the ref so
    // Minimap re-renders when the ref attaches.
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const editorConfig = useEditorConfig();
    const pageState = model.state.use((s) => ({
        compactMode: s.compactMode,
        searchVisible: s.searchVisible,
        searchText: s.searchText,
        currentMatchIndex: s.currentMatchIndex,
        totalMatches: s.totalMatches,
    }));
    // host content subscription — read directly off the host (PV5-style; no
    // editor-side onContentChanged needed for markdown).
    const { content, filePath } = (host as unknown as import("../text").TextFileModel)
        .state.use((s) => ({ content: s.content, filePath: s.filePath }));

    // PV8 — focus queue drain. Routes <TextChrome>'s root-focus (TC8) into the
    // scroll panel so Tab / arrows work from the page.
    model.typedQueue.use((ev) => {
        if (ev.type === "focus") scrollRef.current?.focus();
    });

    // PV4 — scroll-restore on page focus. View-local; not persisted across restart.
    useEffect(() => {
        const sub = pagesModel.onFocus.subscribe((page) => {
            if (page !== model.page) return;
            Promise.resolve().then(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollTopRef.current;
            });
        });
        return () => sub.unsubscribe();
    }, [model]);

    // Track scroll position for PV4 restore.
    const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        scrollTopRef.current = e.currentTarget?.scrollTop ?? 0;
    }, []);

    // Highlight text: own search takes priority over external (embedded-in-notebook).
    const highlightText = pageState.searchVisible && pageState.searchText
        ? pageState.searchText
        : editorConfig.highlightText || "";

    // Bridge MarkdownBlock's DOM match count back to editor state.
    const onMatchCountChange = useCallback((count: number) => {
        const { totalMatches, currentMatchIndex } = model.state.get();
        if (count !== totalMatches) {
            model.setMatchCount(count);
            if (count > 0) {
                const newIndex = currentMatchIndex >= count ? 0 : currentMatchIndex;
                blockRef.current?.scrollToMatch(newIndex);
            }
        }
    }, [model]);

    // Navigate to match when currentMatchIndex changes (next/prev).
    useEffect(() => {
        if (pageState.totalMatches > 0) {
            blockRef.current?.scrollToMatch(pageState.currentMatchIndex);
        }
    }, [pageState.currentMatchIndex]);

    // Keyboard handler — same shortcuts as today.
    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            model.openSearch();
        } else if (e.key === "Escape" && pageState.searchVisible) {
            e.preventDefault();
            model.closeSearch();
        } else if (e.key === "F3" && e.shiftKey) {
            e.preventDefault();
            model.prevMatch();
        } else if (e.key === "F3") {
            e.preventDefault();
            model.nextMatch();
        }
    }, [model, pageState.searchVisible]);

    const showMinimap = !editorConfig.hideMinimap;
    const compact = editorConfig.compact || pageState.compactMode;
    // Only show own search bar when not embedded with external highlight (notebook).
    const showSearchBar = pageState.searchVisible && !editorConfig.highlightText;

    // Callback ref: fan out to model (PV9), local ref (focus + scroll-restore),
    // and Minimap React state (MK1).
    const setScrollContainer = useCallback((el: HTMLDivElement | null) => {
        scrollRef.current = el;
        model.setContainer(el);
        setScrollEl(el);
    }, [model]);

    return (
        <Panel
            name="markdown-view-root"
            direction="row"
            flex={1}
            height={0}
            overflow="hidden"
            maxHeight={editorConfig.maxEditorHeight}
            tabIndex={-1}
            onKeyDown={onKeyDown}
        >
            <Panel
                name="markdown-find-column"
                direction="column"
                flex={1}
                width={0}
            >
                {showSearchBar && (
                    <FindBar
                        text={pageState.searchText}
                        currentMatch={pageState.currentMatchIndex}
                        totalMatches={pageState.totalMatches}
                        onTextChange={model.setSearchText}
                        onNext={model.nextMatch}
                        onPrev={model.prevMatch}
                        onClose={model.closeSearch}
                    />
                )}
                <Panel
                    name="markdown-scroll"
                    direction="column"
                    flex={1}
                    height={0}
                    overflowY="auto"
                    overflowX="hidden"
                    scrollbar={showMinimap ? "hidden" : "auto"}
                    paddingX={compact ? "md" : "xxl"}
                    ref={setScrollContainer}
                    onScroll={onScroll}
                >
                    <MarkdownBlock
                        ref={blockRef}
                        content={content}
                        highlightText={highlightText}
                        compact={compact}
                        filePath={filePath}
                        onMatchCountChange={onMatchCountChange}
                    />
                </Panel>
            </Panel>
            {showMinimap && (
                <Minimap
                    name="markdown-minimap"
                    scrollContainer={scrollEl}
                />
            )}
        </Panel>
    );
}
```

Note on TextFileModel typing — `model.contentHost` is `IContentHost`. To read `content` / `filePath` reactively the body casts to `TextFileModel` (same approach as `LogBody.tsx` doesn't need this because it doesn't read content directly; `MarkdownBody` does). If the cast is too ugly, expose a typed `markdownEditor.host` getter on `MarkdownEditor` returning `TextFileModel | null` for body-only consumption (private to this module).

### Step 3 — Create `src/renderer/editors/markdown/index.tsx`

New file. Replaces today's `index.ts`. Exports `EditorModule` (`markdownModule`), the `MarkdownEditorView` shell, and re-exports the class + types + `MarkdownBlock` re-exports the other three consumer sites still need.

```typescript
import { TComponentState } from "../../core/state/state";
import { MarkdownEditor, defaultMarkdownEditorState } from "./MarkdownEditor";
import { MarkdownBody } from "./MarkdownBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit";
import { CompactViewIcon, NormalViewIcon } from "../../theme/icons";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-554 — native Markdown preview editor module. Registered with
 * the v4 `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorV4` is a v4-native MarkdownEditor instance.
 */

function MarkdownToolbarBits({ model }: { model: MarkdownEditor }) {
    const compactMode = model.state.use((s) => s.compactMode);
    return (
        <IconButton
            name="markdown-compact-toggle"
            size="sm"
            active={compactMode}
            title={compactMode ? "Normal View" : "Compact View"}
            icon={compactMode ? <NormalViewIcon /> : <CompactViewIcon />}
            onClick={model.toggleCompact}
        />
    );
}

function MarkdownEditorView({ model }: { model: V4EditorModel }) {
    const md = model as MarkdownEditor;
    return (
        <TextChrome
            model={model}
            toolbarContributions={<MarkdownToolbarBits model={md} />}
        >
            <MarkdownBody model={md} />
        </TextChrome>
    );
}

export const markdownModule: EditorModule = {
    createEditor: () =>
        new MarkdownEditor(new TComponentState({ ...defaultMarkdownEditorState })),
    Component: MarkdownEditorView,
};

// Re-exports preserved for the three sites that still consume MarkdownBlock
// (McpInspectorView, ResourceContentView, log-view/items/MarkdownOutputView)
// and any import of `MarkdownEditor` from outside.
export { MarkdownEditor, defaultMarkdownEditorState };
export type { MarkdownEditorState, MarkdownQueueEvent } from "./MarkdownEditor";
export { MarkdownBlock } from "./MarkdownBlock";
export type { MarkdownBlockProps, MarkdownBlockHandle } from "./MarkdownBlock";
```

Today's `index.ts` (`MarkdownViewModule` + `MarkdownView` exports) — replaced by `index.tsx`. Today's `MarkdownView` / `MarkdownViewProps` exports are no longer needed (no external consumers — confirmed via the grep at investigation time).

### Step 4 — Delete `src/renderer/editors/markdown/MarkdownView.tsx` and `src/renderer/editors/markdown/MarkdownViewModel.ts`

After steps 1–3 there are no consumers left:
- The body (renamed `MarkdownBody`) consumes `MarkdownEditor` directly.
- Scripting consumer (`MarkdownEditorFacade`) flips to wrap `MarkdownEditor` — step 6.
- `register-editors.ts` md-view entry switches to delegate to `textEditorModule` (step 7).

Before deleting, confirm with grep:

```powershell
Grep "MarkdownViewModel" src\
Grep "from.*markdown/MarkdownView['\"]" src\
```

returns no hits outside the markdown folder itself.

### Step 5 — Update `src/renderer/api/pages/PagesLifecycleModel.ts`

Two changes:

**Change 1** — add Markdown branch in `wrapLegacyForPage` after the LogView branch (line 111):

```typescript
// EPIC-028 / US-554 — Markdown migrated to native v4 module. Construct
// MarkdownEditor over the legacy TextFileModel host. No initial parse step
// needed — the body reads host.state.content via state.use().
if (isTextFile && targetEditorId === "md-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const markdown = new MarkdownEditor(
        new TComponentState({ ...defaultMarkdownEditorState, id }),
    );
    markdown.adoptHost(legacy as TextFileModel);
    return markdown;
}
```

**Change 2** — add import at the top:

```typescript
import { MarkdownEditor, defaultMarkdownEditorState } from "../../editors/markdown";
```

### Step 6 — Update `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts`

Flip from wrapping `MarkdownViewModel` to wrapping `MarkdownEditor`. Reads route through public getters (PV9).

```typescript
import type { MarkdownEditor } from "../../editors/markdown";

/**
 * Safe facade around MarkdownEditor for script access.
 * Implements the IMarkdownEditor interface from api/types/markdown-editor.d.ts.
 *
 * - `html` reads from the DOM container (rendered by react-markdown)
 * - `viewMounted` indicates whether the container is available
 */
export class MarkdownEditorFacade {
    constructor(private readonly editor: MarkdownEditor) {}

    get viewMounted(): boolean {
        return this.editor.viewMounted;
    }

    get html(): string {
        return this.editor.containerInnerHtml;
    }
}
```

### Step 7 — Update `src/renderer/scripting/api-wrapper/PageWrapper.ts`

Flip `asMarkdown(force?: boolean)` to consume `MarkdownEditor` directly (lines 232–241).

```typescript
// at the top (~line 14):
// remove: import type { MarkdownViewModel } from "../../editors/markdown/MarkdownViewModel";
import { MarkdownEditor } from "../../editors/markdown";

async asMarkdown(force = false): Promise<MarkdownEditorFacade> {
    await this.ensureEditor("md-view", "Markdown", "asMarkdown", force);
    // EPIC-028 / US-554 — Markdown is v4-native. After ensureEditor, the
    // page's mainEditorV4 IS a MarkdownEditor; the facade wraps it directly.
    // No acquireViewModel round-trip.
    const v4 = this.v4;
    if (!(v4 instanceof MarkdownEditor)) {
        throw new Error("asMarkdown(): page is not a MarkdownEditor after switch");
    }
    return new MarkdownEditorFacade(v4);
}
```

Removes `model.acquireViewModel("md-view")` + `releaseList.push(() => model.releaseViewModel("md-view"))` — mirrors the `asGrid` / `asText` pattern.

### Step 8 — Update `src/renderer/editors/register-editors.ts`

Three changes (mirrors the US-553 / US-552 pattern):

**Change 1** — collapse the legacy `md-view` `loadModule` to delegate to `textEditorModule` (line 196). Replace the current `Promise.all([import("./markdown/MarkdownView"), import("./markdown/MarkdownViewModel")])` block:

```typescript
editorRegistry.register({
    id: "md-view",
    name: "Preview",
    editorType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "markdown",
    switchOption: (languageId) => {
        if (languageId !== "markdown") return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-554 — Markdown migrated to a native v4 module. The
        // legacy `Editor` + `createViewModel` slots are unused; the
        // newEditorModel* factories are still consumed by the open-file flow
        // to construct the underlying TextFileModel host that v4 MarkdownEditor
        // wraps. Delegate to `textEditorModule` (mirrors US-552 Grid / US-553
        // LogView pattern).
        return textEditorModule;
    },
});
```

**Change 2** — drop `"md-view"` from the bare-adapter bridge set (line 714):

```typescript
const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules.
    // log-view removed — US-553 ships native v4 module.
    // md-view removed — US-554 ships native v4 module.
    "mermaid-view",
    "svg-view",
    "html-view",
    "notebook-view",
    "todo-view",
    "link-view",
    "rest-client",
    "graph-view",
    "draw-view",
]);
```

**Change 3** — append the native v4 registration override after the US-553 block (~line 885):

```typescript
// US-554 — replace the legacy bare-adapter mirror for md-view with a native v4
// module. `v4EditorRegistry.register` overwrites by id, so this supersedes the
// bare-adapter stub the mirror loop wrote. `accepts` delegates to the legacy
// registry def's `switchOption` to avoid duplicating language rules.
v4EditorRegistry.register({
    id: "md-view",
    name: "Preview",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("md-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { markdownModule } = await import("./markdown");
        return markdownModule;
    },
});
```

### Step 9 — Files that need NO changes

To save investigation time during implementation, these are confirmed unaffected:

- `src/renderer/editors/markdown/MarkdownBlock.tsx`, `CodeBlock.tsx`, `rehypeHighlight.ts` — pure rendering primitives; consumed by `MarkdownBody` AND three other sites (`McpInspectorView`, `ResourceContentView`, `log-view/items/MarkdownOutputView`). No change.
- `src/renderer/editors/mcp-inspector/McpInspectorView.tsx`, `ResourceContentView.tsx` — import `MarkdownBlock`, never touched `MarkdownViewModel` / `MarkdownView`. No change.
- `src/renderer/editors/log-view/items/MarkdownOutputView.tsx` — same. The `pagesModel.addEditorPage("md-view", "markdown", title, entry.text)` call at line 20 routes through the new `wrapLegacyForPage` branch transparently.
- `src/renderer/scripting/api-wrapper/Markdown.ts` — `class Markdown` wrapping a `LogViewEditor` for `ui.show.markdown(...)`. `openInEditor` calls `pagesModel.addEditorPage("md-view", "markdown", ...)` — routed transparently.
- `src/renderer/editors/graph/GraphViewModel.ts:1199`, `GraphTooltip.tsx:222` — `pagesModel.addEditorPage("md-view", "markdown", title, md)`. Routed transparently.
- `src/renderer/editors/link-editor/EditLinkDialog.tsx:52` — dropdown option `{ value: "md-view", label: "Markdown Preview" }`. The editor id is unchanged.
- `src/main/mcp-http-server.ts:345` — string literal "md-view" in a `create_page` tool description. The editor id is unchanged.
- `src/shared/types.ts` — `EditorView` union still contains `"md-view"`. No change.
- `src/renderer/api/types/markdown-editor.d.ts` — `IMarkdownEditor` interface (`viewMounted` + `html`). The facade shape is preserved; both reads stay sync (PV9 / PV10). No change.
- `src/renderer/api/pages/PageModel.ts` — references to `monaco ↔ md-view` in comments only.

## Concerns / open questions

### MK1 — Minimap reactivity to the scroll container DOM node

**Today:** `MarkdownView.tsx` puts the scroll-panel DOM element on `vm.state.container` (line 64–68 — `vm.setContainer = el => state.update(s => s.container = el)`). The `Minimap` reads `pageState.container` from the same `vm.state` subscription, so when the ref callback fires, the Minimap re-renders with the populated DOM node.

**After migration:** PV9 explicitly forbids putting DOM refs on `editor.state` (no reactivity benefit; pollutes the descriptor; ride-state-for-reactivity doesn't apply). So `_containerRef` is a non-state private field on the editor — fine for the facade peek, but the Minimap (a *view* component, sibling of the scroll panel inside `MarkdownBody`) still needs to react when the ref attaches.

**Resolution:** view-local `const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)`. The callback ref `setScrollContainer` fans out to three places — the model's `_containerRef` (facade), a `useRef` for focus + scroll-restore reads, and `setScrollEl` for Minimap reactivity. Standard React idiom for "I need to react to a ref being populated". No mockup change; landed inline in Step 2's `MarkdownBody.tsx`.

### MK2 — `useEditorConfig().compact` vs `pageState.compactMode`

Both still exist. `editorConfig.compact` is the embedded-in-notebook context override (today read at `MarkdownView.tsx:83`); `pageState.compactMode` is the user-toggleable, per-page override. They OR together. PV2 explicitly confirmed both stay. No change needed; preserved verbatim in Step 2.

### MK3 — `editorConfig.highlightText` external highlight from notebook embedding

Today: `MarkdownView.tsx:38–40` priorities own search over external. After migration, the same logic survives in `MarkdownBody`. Notebook (US-557) hasn't migrated yet, so the external-highlight path is exercised via the legacy notebook embedding (which still calls into MarkdownView indirectly). **Confirm during implementation** that the legacy notebook embedding path still works — concretely, that `NoteItemEditModel.acquireViewModel("md-view")` doesn't break when the registry's `loadModule` returns `textEditorModule` (which doesn't have `createViewModel`). If it does break, the registry entry can keep the legacy `Editor` / `createViewModel` slots populated by importing the now-deleted files — but those files won't exist post-step 4. **Decision needed before implementation:** does any notebook code path still call `acquireViewModel("md-view")` after US-554? If yes, the notebook embedding must temporarily continue creating a `MarkdownViewModel` (kept alive in the file but no longer used by the page-level Markdown editor). If no, the file deletion in Step 4 is safe.

**Investigation needed during implementation:** grep `acquireViewModel.*md-view` and `useContentViewModel.*md-view` across the codebase. Initial scan (Grep `md-view`) showed two `useContentViewModel` / `acquireViewModel` sites and both are removed by Steps 2/7. But the notebook editor's per-note content-view dispatch lives in `notebook/NoteItemEditModel.ts` / `notebook/NotebookEditor.tsx` — verify those don't dispatch md-view content-views per-note (they may; notebook supports markdown notes).

### MK4 — TextFileModel typing in `MarkdownBody`

`model.contentHost` returns `IContentHost`. The body needs `content` and `filePath` reactively from `host.state.use(...)`. Two options:

(a) **Cast in the body:** `(host as unknown as TextFileModel).state.use(...)`. Ugly but matches the LogBody / GridBody pattern (those don't read content directly; they consume state from the editor).
(b) **Expose a typed getter on the editor:** `get host(): TextFileModel | null { return this._host; }`. Body reads `model.host?.state.use(...)`. Cleaner but introduces a second host accessor alongside `contentHost`.

**Resolution preference (a)** — keep the cast inline; matches the established Tier-5 pattern. The cast is local to `MarkdownBody.tsx`. If multiple preview-group editors (US-560 Svg / US-561 Html / US-562 Mermaid) end up duplicating the same cast, US-562 or a follow-up cleanup can extract a shared helper. YAGNI for now.

### MK5 — `MarkdownViewProps` / `MarkdownView` / `MarkdownViewModule` exports

Today's `index.ts` exports `MarkdownView`, `MarkdownViewProps`, `MarkdownViewModule`, `MarkdownBlock`, `MarkdownBlockProps`, `MarkdownBlockHandle`. After migration:

- `MarkdownView` — internal name retired; replaced by `MarkdownEditorView` (the shell inside `index.tsx`) which is consumed only via the `markdownModule.Component` slot.
- `MarkdownViewProps` — internal name retired (no external consumers found via grep).
- `MarkdownViewModule` — default export of today's `MarkdownView.tsx` (`{ Editor: MarkdownView }`); consumed only by the now-collapsed `register-editors.ts` md-view entry. Retires.
- `MarkdownBlock`, `MarkdownBlockProps`, `MarkdownBlockHandle` — consumed by three external sites. **Preserved** via re-export from the new `index.tsx`.

**Resolution:** clean cut. Drop `MarkdownView*` / `MarkdownViewModule` exports; preserve `MarkdownBlock*` re-exports.

## Acceptance criteria

1. **App still opens markdown files end-to-end:**
   - Open a `.md` file from the file explorer → renders in the new `MarkdownEditor` (verify via DevTools: page's `mainEditorV4` is `MarkdownEditor`, not `LegacyEditorAdapter`).
   - Edit content in Monaco → switch to Markdown via the switch widget → content preserved (host transfer via `CONTENT_HOST_TRAIT`).
   - Toggle compact mode → switch to Monaco → switch back → compact mode preserved (HS1 host slot).
   - Restart app → file reopens with compact mode preserved AND search bar closed (search state stripped per MO5).

2. **Search machinery works as today:**
   - Ctrl+F opens FindBar, types `query`, F3 navigates next match, Shift+F3 navigates previous match, Escape closes.
   - Match counter updates correctly when query changes.
   - Out-of-range index clamps to 0 when results shrink (the `setMatchCount` clamp).
   - Embedded-in-notebook external highlight path still works (notebook still uses legacy embedding; verify a notebook page with a markdown note shows external highlight).

3. **Scroll restoration works on tab focus:**
   - Scroll halfway down a markdown page → switch to another tab → switch back → scroll position restored. Does NOT need to survive app restart (PV4).

4. **Minimap renders alongside the scroll panel:**
   - Hide-minimap setting respected.
   - Minimap reflects the actual scroll position (it now reads `scrollEl` from view-local React state per MK1).

5. **Scripting facade `page.asMarkdown()` works:**
   - From a markdown page: `await page.asMarkdown(); console.log(md.html.length > 0)` returns true.
   - From a non-markdown page: `await page.asMarkdown(true)` switches the page if compatible (force flag — SF1).
   - `page.asMarkdown(false)` (default) throws on non-markdown page.

6. **All four `addEditorPage("md-view", ...)` callers still work:**
   - `ui.show.markdown(...).openInEditor()` (via `api-wrapper/Markdown.ts`).
   - Graph node → "Open as markdown" (via `graph/GraphViewModel.ts`, `graph/GraphTooltip.tsx`).
   - Log view markdown-output entry → "Open in editor" button (via `log-view/items/MarkdownOutputView.tsx`).
   - All three resolve to a v4-native `MarkdownEditor` page (not a `LegacyEditorAdapter`).

7. **Persistence round-trip:**
   - Open a markdown file → restart app → file reopens at the same v4-native editor.
   - Toggle compact → restart → compact preserved.
   - Pre-US-554 session data (legacy `editor: "md-view"` + `type: "textFile"` descriptor) still loads via `wrapLegacyForPage` (v3 restore path, mirrors Grid / LogView behavior).

8. **No regression in markdown rendering:**
   - All `MarkdownBlock` features still work (mermaid diagrams via `:::mermaid` fences, code blocks with copy button, GitHub-flavored markdown, search highlighting, relative-link resolution including the US-577 percent-encoding fix).

9. **Cleanup verified:**
   - `Grep "MarkdownViewModel" src\` returns no hits.
   - `Grep "from.*markdown/MarkdownView['\"]" src\` returns no hits outside the markdown folder.
   - `Grep "acquireViewModel.*md-view"` and `Grep "useContentViewModel.*md-view"` return zero hits.
   - The two deleted files (`MarkdownView.tsx`, `MarkdownViewModel.ts`) are gone.

## Files changed summary

### New files

| File | Purpose |
|------|---------|
| `src/renderer/editors/markdown/MarkdownEditor.ts` | Native v4 `MarkdownEditor` class — state, queue events, trait wiring, lifecycle, HS1 mirror, view-driven setters, facade-only DOM accessors. |
| `src/renderer/editors/markdown/MarkdownBody.tsx` | Body view — drops `useContentViewModel`; subscribes to editor state; bridges search match count; owns scroll-restore + Minimap-ref-mirror. |
| `src/renderer/editors/markdown/index.tsx` | Module shell — `MarkdownEditorView` (TextChrome + toolbar bits + body), `markdownModule` export, re-exports of class / types / `MarkdownBlock`. Replaces today's `index.ts`. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `if (isTextFile && targetEditorId === "md-view")` branch in `wrapLegacyForPage`; add import of `MarkdownEditor` + `defaultMarkdownEditorState`. |
| `src/renderer/editors/register-editors.ts` | Collapse legacy `md-view` `loadModule` to delegate to `textEditorModule`; drop `"md-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; append v4 native registration. |
| `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts` | Wrap `MarkdownEditor` instead of `MarkdownViewModel`; getters read `editor.containerInnerHtml` / `editor.viewMounted`. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | `asMarkdown` flips to `instanceof MarkdownEditor`; drop `acquireViewModel("md-view")` + `releaseList` push; remove the `MarkdownViewModel` type-import. |

### Deleted files

| File | Reason |
|------|--------|
| `src/renderer/editors/markdown/MarkdownView.tsx` | Replaced by `MarkdownBody.tsx` + `index.tsx` shell. |
| `src/renderer/editors/markdown/MarkdownViewModel.ts` | State + setters absorbed into `MarkdownEditor.ts`. |
| `src/renderer/editors/markdown/index.ts` | Replaced by `index.tsx` (different re-export surface). |

### Unchanged files

| File | Notes |
|------|-------|
| `src/renderer/editors/markdown/MarkdownBlock.tsx` | Pure rendering primitive; consumed by three external sites in addition to the markdown editor. |
| `src/renderer/editors/markdown/CodeBlock.tsx` | Verbatim. |
| `src/renderer/editors/markdown/rehypeHighlight.ts` | Verbatim. |
| `src/renderer/editors/shared/FindBar.tsx` | Verbatim. |
| `src/renderer/editors/mcp-inspector/{McpInspectorView,ResourceContentView}.tsx` | Consume `MarkdownBlock` only. |
| `src/renderer/editors/log-view/items/MarkdownOutputView.tsx` | Consumes `MarkdownBlock` + calls `addEditorPage("md-view", ...)` (routed transparently). |
| `src/renderer/editors/graph/{GraphViewModel.ts,GraphTooltip.tsx}` | Call `addEditorPage("md-view", ...)` (routed transparently). |
| `src/renderer/editors/link-editor/EditLinkDialog.tsx` | String literal `"md-view"` in dropdown options — editor id unchanged. |
| `src/main/mcp-http-server.ts` | String literal `"md-view"` in MCP tool description — editor id unchanged. |
| `src/renderer/api/types/markdown-editor.d.ts` | Facade interface — shape preserved. |
| `src/renderer/api/pages/PageModel.ts` | Already supports v4-native main editors. |
| `src/shared/types.ts` | `EditorView` union — `"md-view"` retained. |
