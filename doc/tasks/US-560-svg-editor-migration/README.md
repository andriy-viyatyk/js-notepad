# US-560: Svg editor migration

EPIC-028 Phase C — second of four sibling preview-group migrations (walkthrough 22). Promotes the legacy `SvgViewModel` (a near-empty `ContentViewModel` over `TextFileModel`) to a native v4 `SvgEditor` extending `EditorModel`. Retires the `useContentViewModel("svg-view")` consumer site and the `acquireViewModel("svg-view")` facade-acquire pair.

Walkthrough: [`doc/epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md). Concerns PV1, PV7, PV8 cover Svg directly; PV4 / PV9 are Markdown-specific and don't apply.

## Goal

Replace the host + content-view pair (`TextFileModel` wrapped in `LegacyEditorAdapter` + `SvgViewModel` acquired via `useContentViewModel`) with a single native `SvgEditor` that IS the page's `mainEditor` and HAS a `TextFileModel` as its `IContentHost` via `CONTENT_HOST_TRAIT`. The `SvgEditorFacade` flips from wrapping `SvgViewModel` to wrapping `SvgEditor` directly (stays sync). State slice equals `EditorStateBase` (identity only — `SvgEditorState = EditorStateBase` per PV7); no HS1 host-slot mirror is needed because there is no per-editor user-toggleable state to persist.

## Background

### Reference shape — MarkdownEditor (US-554) and the Tier-5 template

This task is the **second exercise of the Tier-5 template on a preview-group editor**, after US-554. SVG is the *simplest* of the four siblings:

- No persisted editor-specific state (no compact toggle, no light-mode toggle, no search) — state slice equals `EditorStateBase` exactly.
- No HS1 host slot — there is nothing user-set-and-sticky to persist beyond identity.
- No async render pipeline (Mermaid has one; SVG renders synchronously via `data:image/svg+xml,…` URL on every host-content change).
- No imperative scroll restore (Markdown has one; SVG doesn't — `BaseImageView` keeps zoom/pan view-local, intentionally).
- No FindBar search machinery.
- No view-container DOM peek for the facade (PV9 doesn't apply — the facade reads host content, not rendered DOM).

`src/renderer/editors/markdown/MarkdownEditor.ts` is the canonical reference shape. SVG reproduces the same eight-piece Tier-5 skeleton with these slots collapsed or removed:

1. Class extends `V4EditorModel<EditorStateBase, void, SvgQueueEvent>` with `readonly editorId = "svg-view"`, `_host: TextFileModel | null`, and subscription handles. No `_settingsUnsub` field (no HS1 mirror); no `_containerRef` field (no PV9 facade peek).
2. Constructor adds `CONTENT_HOST_TRAIT` with `extractContentHost` that tears down the single host-state subscription before returning the host.
3. `applyRestoreData` stashes `_pendingHost` for restore; no extra state-slice promotion (descriptor carries only `title` / `modified` / `secondaryEditor`).
4. `switchFrom(oldEditor)` extracts the host via the trait, copies the editor id (cache-file continuity), tags `host.state.editor = "svg-view"`, then calls `adoptHost`.
5. `restore()` rebuilds the host from `_pendingHost` (or constructs an empty one), calls `host.restore()`, then `adoptHost`.
6. `adoptHost(host)` wires the host-state forwarder and the title sync. NO HS1 mirror (no user-toggleable persisted state); NO host-content subscription (the view reads `host.state.use((s) => s.content)` directly and `BaseImageView` re-renders on every prop change).
7. `dispose()` tears down the host-state subscription before disposing the host (only if not extracted).
8. Module file (`svg/index.tsx`) exports an `EditorModule` (`{ createEditor, Component }`) consumed by the v4 registry; `register-editors.ts` appends a v4 native registration via `v4EditorRegistry.register({ id, accepts, loadModule })` on top of the legacy bare-adapter mirror (the legacy `loadModule` is preserved with eager imports for notebook embedding — see SV1).

### Today's per-editor surface

`src/renderer/editors/svg/`:

| File | Today's role | After US-560 |
|------|--------------|--------------|
| `SvgViewModel.ts` | `ContentViewModel<{}>` over `TextFileModel`; literally no state, no `onContentChanged` work. `pageModel` getter returns the host as `TextFileModel`. | **Retained verbatim** for notebook embedding (see SV1 below). The page-level v4 path no longer constructs it. |
| `SvgView.tsx` | React component, props `{ model: TextFileModel }`, uses `useContentViewModel<SvgViewModel>` + `createPortal(...editorToolbarRefLast)` for two toolbar buttons (open-draw + copy). Renders `BaseImageView` with `src = data:image/svg+xml,${encodeURIComponent(content)}`. | **Retained verbatim** for notebook embedding (see SV1). The page-level v4 path uses the new `SvgBody.tsx`. |
| (new) `SvgEditor.ts` | — | Native v4 `SvgEditor` class — trait, lifecycle, host adoption. No editor-specific state. |
| (new) `SvgBody.tsx` | — | View body — `BaseImageView` host + `model.typedQueue.use` focus drain. Reads host content via `host.state.use`. ~30 LOC. |
| (new) `index.tsx` | — | Module shell — `EditorModule` export (`svgModule`), `SvgEditorView` (`<TextChrome>` + `<SvgToolbarBits>` + `<SvgBody>`), re-export of class. Replaces today's `index.ts`. |

`src/renderer/editors/shared/BaseImageView.tsx` — unchanged (consumed by Svg body, Mermaid body — and Image editor).

### Consumer sites of SvgViewModel / SvgView — full grep result

| File | Line(s) | Pattern today | After US-560 |
|------|---------|---------------|--------------|
| `src/renderer/editors/svg/SvgView.tsx` | 31 | `useContentViewModel<SvgViewModel>(model, "svg-view")` | **Unchanged.** Preserved for notebook embedding (SV1). |
| `src/renderer/editors/svg/index.ts` | 1–2 | Re-exports `SvgView` + `SvgViewProps` | Replaced by `index.tsx` (different surface — adds `svgModule` + class re-export). |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | 15, 244–252 | `import type { SvgViewModel }` + `await model.acquireViewModel("svg-view") as SvgViewModel` + `releaseList.push(...)` | `this.v4 instanceof SvgEditor` direct check; `new SvgEditorFacade(this.v4)`; releaseList push deletes. Same pattern as `asMarkdown` (US-554). |
| `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts` | constructor + `svg` getter | Wraps `SvgViewModel`; reads `vm.pageModel.state.get().content` | Wraps `SvgEditor`; reads `editor.host?.state.get().content ?? ""` via a typed `host` getter on the editor (MK4 pattern from US-554). Stays sync. |
| `src/renderer/editors/draw/DrawView.tsx` | 257 | `pagesModel.addEditorPage("svg-view", "xml", getDefaultName("svg"), svgText)` | **Unchanged.** Routed transparently through the new `wrapLegacyForPage` branch. |
| `src/renderer/editors/link-editor/EditLinkDialog.tsx` | 54 | `{ value: "svg-view", label: "SVG Preview" }` dropdown option | **Unchanged.** The editor id is preserved. |
| `src/main/mcp-http-server.ts` | 345 | String literal `"svg-view"` in `create_page` tool description | **Unchanged.** Editor id preserved. |
| `src/shared/types.ts` | 2 | `EditorView` union | **Unchanged.** `"svg-view"` retained. |

The `acquireViewModel*` machinery itself does NOT die in this task — `NoteItemEditModel.ts` is still a consumer (notebook embedding) AND we are intentionally KEEPING the legacy `loadModule` populated for the notebook path. Full removal happens in US-557 (Notebook) and US-559 (cleanup).

### Open-file path — `wrapLegacyForPage`

`src/renderer/api/pages/PagesLifecycleModel.ts:55` (`wrapLegacyForPage`) is the bridge that converts legacy `TextFileModel` instances into v4 editors during page creation. It has four `if` branches today (Monaco, Grid, LogView, Markdown) that produce native v4 editors; everything else falls through to `LegacyEditorAdapter`. US-560 adds the Svg branch:

```typescript
// EPIC-028 / US-560 — Svg migrated to native v4 module. Construct
// SvgEditor over the legacy TextFileModel host. No initial parse or
// detect step — the body reads host.state.content via state.use() and
// BaseImageView re-renders on every src prop change.
if (isTextFile && targetEditorId === "svg-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const svg = new SvgEditor(
        new TComponentState({ ...defaultSvgEditorState, id }),
    );
    svg.adoptHost(legacy as TextFileModel);
    return svg;
}
```

This makes:
- `pagesModel.addEditorPage("svg-view", "xml", title, content)` (called from `DrawView.tsx:257`) produce a v4-native `SvgEditor` as `page.mainEditorV4`.
- Open a `.svg` file from explorer → routed via legacy registry's `switchOption` (legacy id is still `"svg-view"` after collapse-or-keep) → `wrapLegacyForPage` → `SvgEditor` via the new branch.
- Svg picked via `Open as → SVG Preview` dropdown (`EditLinkDialog.tsx:54`) → same path.

The legacy registry's `svg-view` entry stays populated (legacy `Editor` slot = `SvgView`; `createViewModel` = `createSvgViewModel`) for notebook embedding compatibility (SV1). The bare-adapter mirror in the v4 bridge loop (`register-editors.ts:725`) drops `"svg-view"` from the bridge set — a native v4 registration replaces it (same mechanism as US-554).

### Notebook embedding — the SV1 lesson from US-554

`src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx:15-19` (per-note content-view dispatch) reads `editorRegistry.getById(editor).loadModule()` at runtime and mounts the returned `module.Editor` inside `<AsyncEditor>`. The editor name is whatever's saved on the note (`state.editor`) — `"svg-view"` is a legitimate value if the user has an SVG note inside a notebook.

US-554 originally collapsed the legacy md-view `loadModule` to `return textEditorModule`, which broke startup on sessions containing notebook-embedded markdown notes (the legacy bundled `markdownModule` getter at runtime tried to `require("./markdown/MarkdownView.tsx")` and Node's resolver doesn't know about `.tsx`). The fix preserved the legacy `MarkdownView.tsx` + `MarkdownViewModel.ts` files and the eager Promise.all import block in the legacy `loadModule`.

**US-560 applies the same lesson up front**: keep `SvgView.tsx` + `SvgViewModel.ts` files alive AND keep the legacy `loadModule`'s eager imports of both. The v4 native module lives in parallel (`v4EditorRegistry.register({ id: "svg-view", ... })`) and is the path the open-file flow takes. The notebook embedding path keeps using the legacy module until US-557 migrates Notebook.

### Backwards compatibility — pre-US-560 session data

Today's session data:
- `<host.id>-host.txt` — SVG content; cache-keyed by editor id. Survives across migration since `SvgEditor` inherits the host's id (C9). No content shape change.
- `EditorDescriptor` shape — today's svg-view pages are persisted as `editor: "svg-view"` + `type: "textFile"` (legacy adapter shape). After US-560 they save as `editorId: "svg-view"` + a host descriptor (native v4 shape). v3 restore path auto-promotes pre-US-551 sessions by calling `wrapLegacyForPage` on the restored `TextFileModel` — the new Svg branch handles the promotion.

No per-editor cache files to clean up — `SvgViewModel` never wrote any (state was empty). No legacy promotion in `applyRestoreData` — today's session never wrote anything beyond identity.

## Implementation plan

### Step 1 — Create `src/renderer/editors/svg/SvgEditor.ts`

New file. Skeleton mirrors `src/renderer/editors/markdown/MarkdownEditor.ts` with state and HS1 plumbing removed.

```typescript
import { TComponentState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/v4/editor-traits";
import type { IContentHost } from "../base/v4/IContentHost";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence-v4";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { PageModel } from "../../api/pages/PageModel";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry as v4Registry } from "../base/v4/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";

/**
 * EPIC-028 / US-560 — native v4 SVG preview editor. One class with
 * TextFileModel as its `IContentHost`. Replaces the legacy `SvgViewModel`
 * + `LegacyEditorAdapter` pair. Identity-only state slice (PV7) — no
 * editor-specific persisted fields.
 *
 * Design rationale: doc/epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md.
 */

export type SvgQueueEvent = { type: "focus" };
export type SvgQueueRequest = never;

export type SvgEditorState = EditorStateBase;

export const defaultSvgEditorState: SvgEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class SvgEditor extends V4EditorModel<SvgEditorState, void, SvgQueueEvent> {
    readonly editorId = "svg-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    readonly typedQueue: ComponentQueue<SvgQueueEvent, SvgQueueRequest>;

    constructor(state: TComponentState<SvgEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            SvgQueueEvent,
            SvgQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from SvgEditor");
                this._hostStateUnsub?.();
                this._hostStateUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + facade consumption (avoids the
     *  `IContentHost`→`TextFileModel` cast at every read site). MK4 pattern
     *  from US-554. */
    get host(): TextFileModel | null {
        return this._host;
    }

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

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Identity-only descriptor (PV7 — no editor-specific state to persist).
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

    applyRestoreData(data: RestoreData<SvgEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `SvgEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("SvgEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore SVG editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // No host-content subscription needed — the body reads
        // `host.state.use((s) => s.content)` directly; BaseImageView
        // re-renders on every src prop change (data URL recomputed inline).

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

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
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

### Step 2 — Create `src/renderer/editors/svg/SvgBody.tsx`

New file. Replaces today's `SvgView.tsx` body (for v4-native pages — the legacy file stays alive for notebook embedding per SV1).

```typescript
import { useRef } from "react";
import type { SvgEditor } from "./SvgEditor";
import type { BaseImageViewRef } from "../shared/BaseImageView";
import { BaseImageView } from "../shared/BaseImageView";

/**
 * EPIC-028 / US-560 — Svg preview body. Reads host content via state.use,
 * builds the data URL inline, and renders `BaseImageView`. The imperative
 * `BaseImageViewRef` is exposed to the toolbar via a view-local ref bridge
 * (see SV2). Focus events drain via `model.typedQueue.use`.
 */

interface SvgBodyProps {
    model: SvgEditor;
    /** Set by the toolbar bits — accepts the BaseImageView ref so the
     *  copy-to-clipboard button can call `imageRef.copyToClipboard()`. */
    imageRefSetter?: (ref: BaseImageViewRef | null) => void;
}

export function SvgBody({ model, imageRefSetter }: SvgBodyProps) {
    const host = model.host;
    const localRef = useRef<BaseImageViewRef>(null);

    // Read content directly off the host. BaseImageView re-renders on src
    // prop change; the data URL is recomputed inline on every host content
    // change.
    const content = host
        ? host.state.use((s) => s.content)
        : "";

    // PV8 — focus queue drain. <TextChrome>'s root-focus (TC8) sends focus
    // events; we route them to the BaseImageView's root via a no-op (image
    // view manages its own keyboard via tabIndex={0} + onKeyDown).
    model.typedQueue.use((ev) => {
        if (ev.type === "focus") {
            // BaseImageView doesn't expose a focus() handle; root-focus from
            // TextChrome puts focus on its outer panel, which is sufficient
            // for keyboard zoom (+/-/0) to reach the image-view's onKeyDown.
        }
    });

    // Bridge imperative ref out to toolbar bits via callback ref.
    const setImageRef = (ref: BaseImageViewRef | null) => {
        localRef.current = ref;
        imageRefSetter?.(ref);
    };

    // Build data URL from SVG content. `encodeURIComponent` matches today's
    // SvgView.tsx behavior — Buffer.from(...).toString("base64") is used
    // ONLY by the open-draw toolbar button (today: SvgView.tsx:57-58).
    const src = `data:image/svg+xml,${encodeURIComponent(content)}`;

    return <BaseImageView ref={setImageRef} src={src} alt="SVG Preview" />;
}
```

### Step 3 — Create `src/renderer/editors/svg/index.tsx`

New file. Replaces today's `index.ts`. Exports `EditorModule` (`svgModule`), the `SvgEditorView` shell, and re-exports the class.

```typescript
import { useRef, useState } from "react";
import { TComponentState } from "../../core/state/state";
import { SvgEditor, defaultSvgEditorState } from "./SvgEditor";
import { SvgBody } from "./SvgBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit";
import { CopyIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage, getImageDimensions } from "../draw/drawExport";
import type { BaseImageViewRef } from "../shared/BaseImageView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-560 — native SVG preview editor module. Registered with the
 * v4 `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorV4` is a v4-native SvgEditor instance.
 */

interface SvgToolbarBitsProps {
    model: SvgEditor;
    imageRef: React.MutableRefObject<BaseImageViewRef | null>;
}

function SvgToolbarBits({ model, imageRef }: SvgToolbarBitsProps) {
    const onOpenDraw = async () => {
        const host = model.host;
        if (!host) return;
        const svgContent = host.state.get().content;
        if (!svgContent.trim()) return;
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent, "utf-8").toString("base64")}`;
        const dims = await getImageDimensions(dataUrl);
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/svg+xml", dims.width, dims.height);
        const title = host.state.get().title.replace(/\.svg$/i, "") + ".excalidraw";
        pagesModel.addEditorPage("draw-view", "json", title, json);
    };

    return (
        <>
            <IconButton
                name="svg-open-draw"
                size="sm"
                title="Open in Drawing Editor"
                onClick={onOpenDraw}
                icon={<DrawIcon />}
            />
            <IconButton
                name="svg-copy"
                size="sm"
                title="Copy Image to Clipboard (Ctrl+C)"
                onClick={() => imageRef.current?.copyToClipboard()}
                icon={<CopyIcon />}
            />
        </>
    );
}

function SvgEditorView({ model }: { model: V4EditorModel }) {
    const svg = model as SvgEditor;
    // SV2 — view-local imageRef bridges the BaseImageView imperative handle
    // to the toolbar's copy button. Held by the view (NOT the editor) because
    // it's a purely view-side imperative concern with no model/facade consumer.
    const imageRef = useRef<BaseImageViewRef | null>(null);
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<SvgToolbarBits model={svg} imageRef={imageRef} />}
        >
            <SvgBody model={svg} imageRefSetter={(r) => { imageRef.current = r; }} />
        </TextChrome>
    );
}

export const svgModule: EditorModule = {
    createEditor: () =>
        new SvgEditor(new TComponentState({ ...defaultSvgEditorState })),
    Component: SvgEditorView,
};

export { SvgEditor, defaultSvgEditorState };
export type { SvgEditorState, SvgQueueEvent } from "./SvgEditor";
```

### Step 4 — DO NOT delete `SvgView.tsx` / `SvgViewModel.ts`

Per SV1 — the legacy files stay alive for notebook embedding. Today's `index.ts` (re-exports `SvgView` / `SvgViewProps`) is replaced by `index.tsx` (new surface above). The `index.ts` file is DELETED only because `index.tsx` supersedes it.

This means:
- `SvgView.tsx` continues to exist, continues to import `SvgViewModel`, continues to use `useContentViewModel`, continues to render via `createPortal(... editorToolbarRefLast)`. Page-level open-file flow won't reach it (the v4 path wraps via `wrapLegacyForPage`), but notebook per-note dispatch will via `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor`.
- `SvgViewModel.ts` continues to exist for `NoteItemEditModel.acquireViewModel("svg-view")` calls.

### Step 5 — Update `src/renderer/api/pages/PagesLifecycleModel.ts`

Two changes (mirrors US-554):

**Change 1** — add Svg branch in `wrapLegacyForPage` after the Markdown branch (~line 125):

```typescript
// EPIC-028 / US-560 — Svg migrated to native v4 module. Construct
// SvgEditor over the legacy TextFileModel host. No initial parse step —
// the body reads host.state.content via state.use() and BaseImageView
// re-renders on every src prop change.
if (isTextFile && targetEditorId === "svg-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const svg = new SvgEditor(
        new TComponentState({ ...defaultSvgEditorState, id }),
    );
    svg.adoptHost(legacy as TextFileModel);
    return svg;
}
```

**Change 2** — add import at the top (after the Markdown import on line 16):

```typescript
import { SvgEditor, defaultSvgEditorState } from "../../editors/svg";
```

### Step 6 — Update `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts`

Flip from wrapping `SvgViewModel` to wrapping `SvgEditor`.

```typescript
import type { SvgEditor } from "../../editors/svg";

/**
 * Safe facade around SvgEditor for script access.
 * Implements the ISvgEditor interface from api/types/svg-editor.d.ts.
 *
 * - Minimal read-only facade — exposes the raw SVG source from the host.
 * - Stays sync; no queue.execute requests.
 */
export class SvgEditorFacade {
    constructor(private readonly editor: SvgEditor) {}

    get svg(): string {
        return this.editor.host?.state.get().content ?? "";
    }
}
```

### Step 7 — Update `src/renderer/scripting/api-wrapper/PageWrapper.ts`

Flip `asSvg(force?: boolean)` to consume `SvgEditor` directly (lines 15, 244–252).

```typescript
// at the top (~line 15):
// remove: import type { SvgViewModel } from "../../editors/svg/SvgViewModel";
import { SvgEditor } from "../../editors/svg";

// at line ~244:
async asSvg(force = false): Promise<SvgEditorFacade> {
    await this.ensureEditor("svg-view", "SVG", "asSvg", force);
    // EPIC-028 / US-560 — Svg is v4-native. After ensureEditor, the
    // page's mainEditorV4 IS a SvgEditor; the facade wraps it directly.
    // No acquireViewModel round-trip.
    const v4 = this.v4;
    if (!(v4 instanceof SvgEditor)) {
        throw new Error("asSvg(): page is not a SvgEditor after switch");
    }
    return new SvgEditorFacade(v4);
}
```

Removes `model.acquireViewModel("svg-view")` + `releaseList.push(() => model.releaseViewModel("svg-view"))` — mirrors the `asMarkdown` pattern.

### Step 8 — Update `src/renderer/editors/register-editors.ts`

Three changes (mirrors US-554):

**Change 1** — keep the legacy `svg-view` `loadModule` AS-IS (eager imports of `SvgView` + `SvgViewModel`). Adding a comment to document why:

```typescript
// SVG preview (content-view for SVG files)
editorRegistry.register({
    id: "svg-view",
    name: "Preview",
    editorType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "xml",
    switchOption: (_languageId, fileName) => {
        // Only show for .svg files
        if (fileName && matchesExtension(fileName, [".svg"])) return 10;
        return -1;
    },
    loadModule: async () => {
        // EPIC-028 / US-560 — Svg migrated to native v4 module
        // (`svgModule` in `./svg/index.tsx`). Legacy SvgView + SvgViewModel
        // are PRESERVED here because notebook per-note dispatch
        // (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`) still
        // consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createSvgViewModel }] = await Promise.all([
            import("./svg/SvgView"),
            import("./svg/SvgViewModel"),
        ]);
        return {
            Editor: module.SvgView,
            createViewModel: createSvgViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});
```

**Change 2** — drop `"svg-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 725):

```typescript
const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules.
    // log-view removed — US-553 ships native v4 module.
    // md-view removed — US-554 ships native v4 module.
    // svg-view removed — US-560 ships native v4 module.
    "mermaid-view",
    "html-view",
    "notebook-view",
    "todo-view",
    "link-view",
    "rest-client",
    "graph-view",
    "draw-view",
]);
```

**Change 3** — append the native v4 registration override after the US-554 block (~line 918):

```typescript
// US-560 — replace the legacy bare-adapter mirror for svg-view with a native
// v4 module. `v4EditorRegistry.register` overwrites by id, so this supersedes
// the bare-adapter stub the mirror loop wrote. `accepts` delegates to the
// legacy registry def's `acceptFile` / `switchOption` to avoid duplicating
// extension rules.
v4EditorRegistry.register({
    id: "svg-view",
    name: "Preview",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("svg-view");
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
        const { svgModule } = await import("./svg");
        return svgModule;
    },
});
```

### Step 9 — Delete `src/renderer/editors/svg/index.ts`

After step 3 there is `index.tsx` with the new surface. Today's `index.ts` only re-exports `SvgView` + `SvgViewProps`; those names are still importable directly from `./SvgView.tsx` for the notebook embedding path (no external consumer imports them from `./svg` — verified via grep below). Delete it cleanly.

Before deleting, confirm with grep that nothing outside the svg folder imports from `./svg/index`:

```powershell
Grep "from.*editors/svg['\"]" src\
Grep "from.*editors/svg/index['\"]" src\
```

These should return no hits (or only hits inside the svg folder itself).

### Step 10 — Files that need NO changes

To save investigation time during implementation, these are confirmed unaffected:

- `src/renderer/editors/svg/SvgView.tsx` — preserved verbatim for notebook embedding (SV1).
- `src/renderer/editors/svg/SvgViewModel.ts` — preserved verbatim for notebook embedding (SV1).
- `src/renderer/editors/shared/BaseImageView.tsx` — consumed by `SvgBody` + Mermaid + Image editors. No change.
- `src/renderer/editors/draw/DrawView.tsx:257` — `pagesModel.addEditorPage("svg-view", "xml", ...)` call. Routed transparently through the new `wrapLegacyForPage` branch.
- `src/renderer/editors/draw/drawExport.ts` — `buildExcalidrawJsonWithImage` / `getImageDimensions` consumed by `SvgToolbarBits`. No change.
- `src/renderer/editors/link-editor/EditLinkDialog.tsx:54` — dropdown option `{ value: "svg-view", label: "SVG Preview" }`. Editor id unchanged.
- `src/main/mcp-http-server.ts:345` — string literal in MCP `create_page` tool description. Editor id unchanged.
- `src/shared/types.ts` — `EditorView` union still contains `"svg-view"`. No change.
- `src/renderer/api/types/svg-editor.d.ts` — `ISvgEditor` interface (`svg: string`). Facade shape preserved; read stays sync. No change.
- `src/renderer/api/pages/PageModel.ts` — already supports v4-native main editors.
- `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` — dispatches via `editorRegistry.getById(editor).loadModule()` for non-monaco editors. The legacy `svg-view` `loadModule` stays populated → no change needed.
- `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` — `acquireViewModel("svg-view")` reaches the legacy `createSvgViewModel` via the preserved `loadModule`. No change.

## Concerns / open questions

### SV1 — Notebook per-note SVG dispatch (the US-554 lesson, applied upfront)

**Context:** US-554 originally collapsed `md-view`'s legacy `loadModule` to `return textEditorModule`, mirroring the US-552 / US-553 pattern. This crashed the app on session restore when any notebook contained a markdown-typed note, because `NoteItemActiveEditor.tsx:33-38` mounts `<EditorModule.Editor model={model} />` from the legacy registry's `loadModule()` result, and the lazy `require()` in `textEditorModule.get Editor()` failed at runtime (Vite/Electron CJS resolver doesn't know about `.tsx`). The fix preserved `MarkdownView.tsx` + `MarkdownViewModel.ts` and reverted the legacy `loadModule` to keep eager `Promise.all([import("./markdown/MarkdownView"), import("./markdown/MarkdownViewModel")])`.

**Same scenario applies to SVG.** A user can have an SVG-typed note inside a notebook (`note.content.editor = "svg-view"`). If we collapse the legacy `loadModule`, the notebook page renderer crashes on first display.

**Resolution:** apply the US-554 retrospective up front. Keep `SvgView.tsx` + `SvgViewModel.ts` alive as parallel implementation; keep the legacy `loadModule` returning the eager Promise.all imports; register the v4 native module separately. Page-level pages take the v4 path; notebook-embedded notes take the legacy path. Both coexist until US-557 migrates Notebook (which will retire the per-note content-view dispatch).

No design decision needed — pattern locked in by US-554's fix. Step 8 Change 1 documents this in a code comment so future maintainers don't try to collapse the loader.

**Verification during implementation:** after applying the change, manually create a notebook with an SVG note, save and reload the app — the notebook page should display the SVG without errors.

### SV2 — `BaseImageViewRef.copyToClipboard()` plumbing — view-local ref bridge or model-side hook?

**Today:** `SvgView.tsx` holds `imageRef = useRef<BaseImageViewRef>(null)` view-locally and the copy button calls `imageRef.current?.copyToClipboard()` directly. Pure view concern; never reached the model.

**After migration:** the toolbar lives in `SvgEditorView`'s `<SvgToolbarBits>` (composed via `rightToolbarContributions` prop of `<TextChrome>`); the body lives separately in `<SvgBody>`. The two siblings need to share the `BaseImageViewRef`.

Three candidates:

(a) **View-local ref in `SvgEditorView`, passed as prop to both children** — `useRef<BaseImageViewRef>` in the view shell; `<SvgToolbarBits imageRef={imageRef} />` + `<SvgBody imageRefSetter={(r) => { imageRef.current = r; }} />`. View-local, no model surface. Selected in Step 3 / Step 2.

(b) **Hold the ref on `SvgEditor` (model-side)** — `model.setImageRef(ref)` from `SvgBody`; `<SvgToolbarBits>` reads via `model.imageRef`. Symmetric with the PV9 `_containerRef` pattern from Markdown.

(c) **Move the copy logic onto the editor as a method** — `editor.copyToClipboard()` reads the `_imageRef` private field and calls into BaseImageView. Toolbar button calls `model.copyToClipboard()`. Allows the script API to expose `await page.asSvg().copyToClipboard()` cheaply later.

**Resolution preference (a)** — view-local ref shared via React composition. Reasons:

1. **No script-API consumer today.** Unlike Markdown's `containerInnerHtml` (script reads via `page.asMarkdown().html`), nothing in the script API reads the rendered SVG bitmap. No reason to put the ref on the model preemptively.
2. **Pure view concern.** The imperative call is "view component telling another view component about a DOM-derived value." Walkthrough 22 / PV9 explicitly says ride-state-for-reactivity-doesn't-apply when there's no consumer subscribing. Same logic applies here: nothing subscribes; hold view-locally.
3. **YAGNI script-API hook.** If a future user asks for `page.asSvg().copyToClipboard()`, option (c) is a small additive change (move `imageRef` to model, add a method). Premature now.

Rejected (b) — symmetric-with-Markdown is a weak argument; PV9 was justified by the script-API need, which doesn't exist here. Rejected (c) — speculative; locks the implementation onto an API surface that no one's asked for.

### SV3 — Toolbar position — right or left of spacer?

**Today:** `SvgView.tsx` portals two buttons into `model.editorToolbarRefLast` — the legacy `EditorToolbar`'s right-side slot. Buttons render right of the spacer, before the switch widget.

**Migration choices:**

(a) **`rightToolbarContributions` prop of `<TextChrome>`** — renders AFTER the auto-spacer and BEFORE the switch widget. Mirrors today's position. Same place as US-554's compact-toggle after the toolbar-position bug fix.

(b) **`toolbarContributions` prop** — renders BEFORE the auto-spacer (left side of toolbar, next to Run/Compare/etc.). Different visual position than today.

**Resolution (a)** — use `rightToolbarContributions`. Reasons:

1. Matches today's visual position (right of spacer).
2. Matches the US-554 fix pattern — the user explicitly flagged "Compact button should be on the right side" and we corrected it. Same correction applied up front here.
3. Consistent with Grid's search input (also right-side).

No design ambiguity; just locked in to avoid the round-trip-correction the Markdown task incurred.

### SV4 — Typed `host` getter on `SvgEditor` (MK4 pattern adoption)

**Context:** US-554 added a typed `get host(): TextFileModel | null` getter on `MarkdownEditor` to avoid the `IContentHost` → `TextFileModel` cast at body and facade read sites (MK4 resolution). This was an upgrade from the initial inline-cast plan in the US-554 doc.

**For SVG:** the facade reads `host.state.get().content`; the body reads `host.state.use((s) => s.content)`; the toolbar bits read `host.state.get().content` + `host.state.get().title`. Three read sites — three casts saved.

**Resolution:** adopt the MK4 pattern from day one. `SvgEditor.host` typed getter included in Step 1's class skeleton. Same pattern propagates to US-561 (Html) and US-562 (Mermaid).

### SV5 — `accepts` predicate — should it match `language === "xml"`?

**Context:** today's legacy `svg-view` `switchOption` returns 10 only when `fileName.endsWith(".svg")`; it ignores the language parameter. The legacy `validForLanguage: (id) => id === "xml"` is the only language hook (legacy concept retiring in US-559).

**After migration:** the v4 `accepts(input)` predicate delegates to legacy `acceptFile` + `switchOption` (per Step 8 Change 3). `acceptFile` is null (not set on the legacy def), so language is the only check. Without an explicit `acceptFile` hook, `accepts()` will return `switchOption("xml", "foo.svg") = 10` — works as today.

**One edge case:** opening a `.svg` file via `Open as → SVG Preview` dropdown. The dropdown today (`EditLinkDialog.tsx:54`) sends the editor id directly to `pagesModel.openLink(...)`, bypassing `accepts()`. So `accepts()` only matters for the switch widget's "show me compatible editors" path. SVG is a niche file type — `findEditorsAccepting(host)` should return `["monaco", "svg-view"]` for an SVG host; the user picks via the switch widget; the legacy `switchOption` rules return 10 in the file-name-match case which is sufficient for inclusion.

**Resolution:** delegate to legacy verbatim. No explicit `acceptFile`. If a future task wants tighter typing (e.g., reject XML files that aren't SVG), it can amend the accepts predicate independently. YAGNI for US-560.

### SV6 — `pagesModel.openImageInNewTab` / draw-export interaction

**Today:** the open-draw button computes `buildExcalidrawJsonWithImage(dataUrl, "image/svg+xml", width, height)` and opens via `pagesModel.addEditorPage("draw-view", "json", title, json)`. Draw-editor migration is US-565 (later — skipped in design); until then, the draw page is a `LegacyEditorAdapter`-wrapped legacy Draw editor.

**After US-560:** the same call path works — `addEditorPage("draw-view", "json", ...)` routes through `wrapLegacyForPage`, hits the fall-through `LegacyEditorAdapter` branch (no Draw branch yet), produces a legacy adapter as today.

**Resolution:** no change. Drawing-side interop is preserved verbatim through the legacy adapter path; US-565 migrates Draw to v4 native at which point the route becomes v4-native end-to-end.

## Acceptance criteria

1. **App still opens SVG files end-to-end:**
   - Open a `.svg` file from file explorer → renders in the new `SvgEditor` (verify via DevTools: page's `mainEditorV4` is `SvgEditor`, not `LegacyEditorAdapter`).
   - Edit raw SVG XML in Monaco → switch to SVG via the switch widget → preview reflects updated content (host transfer via `CONTENT_HOST_TRAIT`).
   - Restart app → file reopens via the v4 native path.

2. **Toolbar buttons work as today:**
   - "Open in Drawing Editor" button — opens the SVG content as an Excalidraw page with embedded SVG image. Title becomes `<original>.excalidraw`.
   - "Copy Image to Clipboard" button — copies the rendered SVG as a PNG to the system clipboard (via `BaseImageView`'s canvas-toBlob route).
   - Buttons render on the right side of the toolbar (after spacer, before switch widget) — matches today's portal placement.

3. **BaseImageView zoom/pan still works:**
   - Mouse wheel zooms toward cursor.
   - Click-and-drag pans.
   - Double-click resets to fit-to-viewport.
   - `+` / `-` / `0` keyboard zoom controls work.
   - Ctrl+C invokes copy-to-clipboard (BaseImageView's own onKeyDown handler).
   - Zoom indicator (bottom-right) shows percentage; clicking it resets zoom.

4. **Scripting facade `page.asSvg()` works:**
   - From an SVG page: `const svg = await page.asSvg(); console.log(svg.svg.length > 0)` returns true.
   - From a non-SVG page: `await page.asSvg(true)` switches the page if compatible (force flag — SF1).
   - `page.asSvg(false)` (default) throws on non-SVG page.
   - Facade `svg` getter returns the same string as `page.content` (raw host content).

5. **All `addEditorPage("svg-view", ...)` callers still work:**
   - Draw editor → "Open as SVG" menu item (`DrawView.tsx:257`) — produces a v4-native `SvgEditor` page.

6. **Persistence round-trip:**
   - Open an SVG file → restart app → file reopens at the same v4-native editor.
   - Pre-US-560 session data (legacy `editor: "svg-view"` + `type: "textFile"` descriptor) still loads via `wrapLegacyForPage` (v3 restore path).

7. **Notebook embedding still works (SV1 verification):**
   - Create a notebook page with an SVG-typed note (in-app: add a note, switch its editor to `svg-view`, save the notebook).
   - Restart app → reload the notebook → the SVG note renders without console errors.
   - This is the critical test that bit US-554 retrospectively; running it during US-560 implementation prevents the regression.

8. **No regression in SVG rendering:**
   - SVG content updates reactively when the host content changes (e.g., script writes new content; preview re-renders).
   - Multi-line SVG content with viewBox, viewport scaling, embedded styles, animations — all preserved (BaseImageView consumes the data URL via an `<img>` tag, so this is the browser's SVG rasterizer, not our concern).

9. **Cleanup verified:**
   - `Grep "acquireViewModel.*svg-view"` returns hits only in `NoteItemEditModel.ts` and `note-editor` flow (legacy path) — not in `PageWrapper.ts`.
   - `Grep "useContentViewModel.*svg-view"` returns hits only in `SvgView.tsx` (legacy file preserved per SV1).
   - `src/renderer/editors/svg/index.ts` is deleted; `src/renderer/editors/svg/index.tsx` exists with the new surface.
   - `SvgView.tsx` + `SvgViewModel.ts` exist unchanged.
   - TypeScript + ESLint pass with zero new errors in touched files.

## Files changed summary

### New files

| File | Purpose |
|------|---------|
| `src/renderer/editors/svg/SvgEditor.ts` | Native v4 `SvgEditor` class — identity-only state, trait wiring, three-phase lifecycle, host adoption. ~200 LOC. |
| `src/renderer/editors/svg/SvgBody.tsx` | Body view — reads host content via `state.use`; renders `BaseImageView`; bridges `BaseImageViewRef` to parent via callback prop. ~50 LOC. |
| `src/renderer/editors/svg/index.tsx` | Module shell — `SvgEditorView` (`<TextChrome>` + `<SvgToolbarBits>` + `<SvgBody>`), `svgModule` export, class re-export. Replaces today's `index.ts`. ~80 LOC. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `if (isTextFile && targetEditorId === "svg-view")` branch in `wrapLegacyForPage`; add import of `SvgEditor` + `defaultSvgEditorState`. |
| `src/renderer/editors/register-editors.ts` | Keep legacy `svg-view` `loadModule` (eager imports preserved for notebook); drop `"svg-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; append v4 native registration; add comment documenting SV1 rationale. |
| `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts` | Wrap `SvgEditor` instead of `SvgViewModel`; `svg` getter reads `editor.host?.state.get().content`. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | `asSvg` flips to `instanceof SvgEditor`; drop `acquireViewModel("svg-view")` + `releaseList` push; remove the `SvgViewModel` type-import. |

### Deleted files

| File | Reason |
|------|--------|
| `src/renderer/editors/svg/index.ts` | Replaced by `index.tsx` (different re-export surface; new `svgModule` + class exports). |

### Preserved files (intentional — SV1)

| File | Rationale |
|------|-----------|
| `src/renderer/editors/svg/SvgView.tsx` | Consumed by `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor` for SVG-typed notebook notes. Removed by US-557 once Notebook migrates. |
| `src/renderer/editors/svg/SvgViewModel.ts` | Consumed by `NoteItemEditModel.acquireViewModel("svg-view")` for SVG-typed notebook notes. Removed by US-557. |

### Unchanged files

| File | Notes |
|------|-------|
| `src/renderer/editors/shared/BaseImageView.tsx` | Shared primitive; consumed by Svg + Mermaid + Image editors. |
| `src/renderer/editors/draw/DrawView.tsx` | `pagesModel.addEditorPage("svg-view", ...)` call routed transparently. |
| `src/renderer/editors/draw/drawExport.ts` | `buildExcalidrawJsonWithImage` / `getImageDimensions` consumed by `SvgToolbarBits`. |
| `src/renderer/editors/link-editor/EditLinkDialog.tsx` | Dropdown option — editor id unchanged. |
| `src/main/mcp-http-server.ts` | String literal in MCP tool description — editor id unchanged. |
| `src/renderer/api/types/svg-editor.d.ts` | Facade interface — shape preserved. |
| `src/renderer/api/pages/PageModel.ts` | Already supports v4-native main editors. |
| `src/shared/types.ts` | `EditorView` union — `"svg-view"` retained. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | Per-note dispatch reaches legacy `module.Editor` via the preserved `loadModule`. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | `acquireViewModel("svg-view")` reaches legacy `createSvgViewModel` via the preserved `loadModule`. |
