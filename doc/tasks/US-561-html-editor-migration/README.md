# US-561: Html editor migration

EPIC-028 Phase C — third of four sibling preview-group migrations (walkthrough 22). Promotes the legacy `HtmlViewModel` (a near-empty `ContentViewModel<{}>` over `TextFileModel`) to a native v4 `HtmlEditor` extending `EditorModel`. Retires the `useContentViewModel("html-view")` consumer site and the `acquireViewModel("html-view")` facade-acquire pair.

Walkthrough: [`doc/epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md). Concerns PV1, PV7, PV8 cover Html directly; PV2 / PV3 / PV4 are Markdown-specific; PV5 / PV6 are Mermaid-specific; PV9 (DOM peek) doesn't apply because the iframe is sandboxed and the facade reads host content, not rendered DOM.

Direct precedent: [`US-560 (Svg)`](../US-560-svg-editor-migration/README.md) — same identity-only state slice (`HtmlEditorState = EditorStateBase`); the only material differences are (1) Html has **zero toolbar buttons** (vs Svg's two), so no `<HtmlToolbarBits>` and no `BaseImageViewRef` bridge, and (2) Html has **zero `addEditorPage("html-view", ...)` callers** in the codebase (vs Svg's `DrawView.tsx:257`), so the only entry-points are open-file flow + `Open as → HTML Preview` dropdown.

## Goal

Replace the host + content-view pair (`TextFileModel` wrapped in `LegacyEditorAdapter` + `HtmlViewModel` acquired via `useContentViewModel`) with a single native `HtmlEditor` that IS the page's `mainEditor` and HAS a `TextFileModel` as its `IContentHost` via `CONTENT_HOST_TRAIT`. The `HtmlEditorFacade` flips from wrapping `HtmlViewModel` to wrapping `HtmlEditor` directly (stays sync). State slice equals `EditorStateBase` (identity only — `HtmlEditorState = EditorStateBase` per PV7); no HS1 host-slot mirror is needed because there is no per-editor user-toggleable state to persist.

## Background

### Reference shape — SvgEditor (US-560) and the Tier-5 template

This task is the **third exercise of the Tier-5 template on a preview-group editor**, after US-554 (Markdown) and US-560 (Svg). Html is the **simplest of the four siblings** — even simpler than Svg:

- No persisted editor-specific state (no compact toggle, no light-mode toggle, no search) — state slice equals `EditorStateBase` exactly. Same as Svg.
- No HS1 host slot — nothing user-set-and-sticky to persist beyond identity. Same as Svg.
- No async render pipeline (Mermaid has one; Html renders synchronously via `<iframe srcDoc={...}>` on every host-content change).
- No imperative scroll restore (Markdown has one; Html doesn't — the iframe owns its own scroll and is sandboxed).
- No FindBar search machinery.
- No view-container DOM peek for the facade (PV9 doesn't apply — the iframe is sandboxed, the facade reads host content not rendered DOM).
- **Zero toolbar contributions** — Html has no portal buttons today (Svg has open-draw + copy; Markdown has compact toggle; Mermaid has theme + open-draw + copy). The chrome composes `<TextChrome model={model}>` with no `toolbarContributions` / `rightToolbarContributions` props.
- **Zero imperative view refs** — Svg holds `BaseImageViewRef` for the copy button; Html has nothing analogous. The iframe is a self-contained DOM child; no view-local ref bridge needed.
- **Zero `addEditorPage("html-view", ...)` callers** — Svg has `DrawView.tsx:257` (draw → svg interop); Html has no analogous bridge in the codebase. The only entry-points are open-file flow (via legacy `switchOption` for HTML files) + the `Open as → HTML Preview` dropdown (`EditLinkDialog.tsx:53`).

`src/renderer/editors/svg/SvgEditor.ts` is the canonical reference shape. Html reproduces the same eight-piece Tier-5 skeleton with the toolbar-bits slot removed entirely and `editorId = "html-view"`:

1. Class extends `V4EditorModel<EditorStateBase, void, HtmlQueueEvent>` with `readonly editorId = "html-view"`, `_host: TextFileModel | null`, single host-state subscription handle. No `_settingsUnsub` field (no HS1 mirror); no `_containerRef` field (no PV9 facade peek); no `_imageRef` field (no Svg-style toolbar copy).
2. Constructor adds `CONTENT_HOST_TRAIT` with `extractContentHost` that tears down the single host-state subscription before returning the host.
3. `applyRestoreData` stashes `_pendingHost` for restore; no extra state-slice promotion (descriptor carries only `title` / `modified` / `secondaryEditor`).
4. `switchFrom(oldEditor)` extracts the host via the trait, copies the editor id (cache-file continuity), tags `host.state.editor = "html-view"`, then calls `adoptHost`.
5. `restore()` rebuilds the host from `_pendingHost` (or constructs an empty one), calls `host.restore()`, then `adoptHost`.
6. `adoptHost(host)` wires the host-state forwarder and the title sync. NO HS1 mirror; NO host-content subscription (the view reads `host.state.use((s) => s.content)` directly; the iframe re-renders on every `srcDoc` prop change).
7. `dispose()` tears down the host-state subscription before disposing the host (only if not extracted).
8. Module file (`html/index.tsx`) exports an `EditorModule` (`{ createEditor, Component }`) consumed by the v4 registry; `register-editors.ts` appends a v4 native registration via `v4EditorRegistry.register({ id, accepts, loadModule })` on top of the legacy bare-adapter mirror. The legacy `loadModule` is preserved with eager imports for notebook embedding — see HT1.

### Today's per-editor surface

`src/renderer/editors/html/`:

| File | Today's role | After US-561 |
|------|--------------|--------------|
| `HtmlViewModel.ts` | `ContentViewModel<{}>` over `TextFileModel`; literally no state, no `onContentChanged` work. `pageModel` getter returns the host as `TextFileModel`. | **Retained verbatim** for notebook embedding (see HT1 below). The page-level v4 path no longer constructs it. |
| `HtmlView.tsx` | React component, props `{ model: TextFileModel }`, uses `useContentViewModel<HtmlViewModel>` + `useSyncExternalStore` for VM-state subscription. Renders `<iframe srcDoc={content + navigationBlockerScript} sandbox="allow-scripts" />`. NO portal/toolbar contributions. | **Retained verbatim** for notebook embedding (see HT1). The page-level v4 path uses the new `HtmlBody.tsx`. |
| (new) `HtmlEditor.ts` | — | Native v4 `HtmlEditor` class — trait, lifecycle, host adoption. No editor-specific state. ~200 LOC. |
| (new) `HtmlBody.tsx` | — | View body — iframe host + `model.typedQueue.use` focus drain. Reads host content via `host.state.use`. ~30 LOC. |
| (new) `index.tsx` | — | Module shell — `EditorModule` export (`htmlModule`), `HtmlEditorView` (just `<TextChrome>` + `<HtmlBody>`, no toolbar bits), re-export of class. Replaces today's `index.ts`. ~40 LOC. |

`src/renderer/editors/html/index.ts` (existing) — re-exports `HtmlView` + `HtmlViewProps`. Deleted because `index.tsx` supersedes it; the notebook embedding path imports `./HtmlView` directly via the legacy `loadModule`'s `Promise.all`.

### The `navigationBlockerScript` — preserved as-is

`HtmlView.tsx:7` defines an inline `<script>` that hooks `click` events on the document and `preventDefault`s any anchor with `href`. This blocks the iframe from navigating away (the sandbox already blocks top-frame navigation, but in-frame `<a href>` would still try). The same string carries over into `HtmlBody.tsx` byte-for-byte — `srcDoc = content + navigationBlockerScript`.

The sandbox attribute (`allow-scripts`) also carries over verbatim. This is the same isolation we ship today:
- `allow-scripts` enables `<script>` tags inside the rendered HTML (and the blocker script).
- No `allow-same-origin` — the iframe runs in a unique origin; cannot read parent storage/cookies/etc.
- No `allow-top-navigation` — even if the blocker script were bypassed, the top frame can't be navigated.
- No `allow-popups` — `window.open` is suppressed.

### Consumer sites of HtmlViewModel / HtmlView — full grep result

| File | Line(s) | Pattern today | After US-561 |
|------|---------|---------------|--------------|
| `src/renderer/editors/html/HtmlView.tsx` | 26 | `useContentViewModel<HtmlViewModel>(model, "html-view")` | **Unchanged.** Preserved for notebook embedding (HT1). |
| `src/renderer/editors/html/index.ts` | 1–2 | Re-exports `HtmlView` + `HtmlViewProps` | **Deleted.** Replaced by `index.tsx` (different surface — adds `htmlModule` + class re-export). Notebook embedding path imports `./HtmlView` directly via the legacy `loadModule`'s `Promise.all`. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | 16, 256–265 | `import type { HtmlViewModel }` + `await model.acquireViewModel("html-view") as HtmlViewModel` + `releaseList.push(...)` | `this.v4 instanceof HtmlEditor` direct check; `new HtmlEditorFacade(this.v4)`; releaseList push deletes. Same pattern as `asMarkdown` / `asSvg`. |
| `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` | constructor + `html` getter | Wraps `HtmlViewModel`; reads `vm.pageModel.state.get().content` | Wraps `HtmlEditor`; reads `editor.host?.state.get().content ?? ""` via a typed `host` getter on the editor (MK4 pattern from US-554, identical to Svg facade). Stays sync. |
| `src/renderer/editors/link-editor/EditLinkDialog.tsx` | 53 | `{ value: "html-view", label: "HTML Preview" }` dropdown option | **Unchanged.** The editor id is preserved. |
| `src/shared/types.ts` | 2 | `EditorView` union | **Unchanged.** `"html-view"` retained. |
| `src/renderer/api/types/common.d.ts` | 38 | `EditorView` union | **Unchanged.** |

**Note:** there is **no `mcp-http-server.ts` reference to `"html-view"`** today (Svg has `src/main/mcp-http-server.ts:345`). MCP `create_page` accepts `html-view` as a valid editor id implicitly via the `EditorView` union but doesn't single it out in the description string. No change.

The `acquireViewModel*` machinery itself does NOT die in this task — `NoteItemEditModel.ts` is still a consumer (notebook embedding) AND we are intentionally KEEPING the legacy `loadModule` populated for the notebook path. Full removal happens in US-557 (Notebook) and US-559 (cleanup).

### Open-file path — `wrapLegacyForPage`

`src/renderer/api/pages/PagesLifecycleModel.ts:56` (`wrapLegacyForPage`) is the bridge that converts legacy `TextFileModel` instances into v4 editors during page creation. It has five `if` branches today (Monaco, Grid, LogView, Markdown, Svg) that produce native v4 editors; everything else falls through to `LegacyEditorAdapter`. US-561 adds the Html branch:

```typescript
// EPIC-028 / US-561 — Html migrated to native v4 module. Construct
// HtmlEditor over the legacy TextFileModel host. No initial parse step —
// the body reads host.state.content via state.use() and the iframe
// re-renders on every srcDoc prop change.
if (isTextFile && targetEditorId === "html-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const html = new HtmlEditor(
        new TComponentState({ ...defaultHtmlEditorState, id }),
    );
    html.adoptHost(legacy as TextFileModel);
    return html;
}
```

This makes:
- Open an `.html` or `.htm` file from explorer → routed via legacy registry's `switchOption` (legacy `validForLanguage: (id) => id === "html"`; `switchOption: (id) => id === "html" ? 10 : -1`) → `wrapLegacyForPage` → `HtmlEditor` via the new branch.
- Html picked via `Open as → HTML Preview` dropdown (`EditLinkDialog.tsx:53`) → same path through `pagesModel.openLink(...)` with `editor = "html-view"`.

The legacy registry's `html-view` entry stays populated (legacy `Editor` slot = `HtmlView`; `createViewModel` = `createHtmlViewModel`) for notebook embedding compatibility (HT1). The bare-adapter mirror in the v4 bridge loop drops `"html-view"` from the bridge set — a native v4 registration replaces it (same mechanism as US-554 / US-560).

### Notebook embedding — the HT1 lesson from US-554 / US-560

`src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx:15-19` (per-note content-view dispatch) reads `editorRegistry.getById(editor).loadModule()` at runtime and mounts the returned `module.Editor` inside `<AsyncEditor>`. The editor name is whatever's saved on the note (`state.editor`) — `"html-view"` is a legitimate value if the user has an HTML note inside a notebook.

US-554 originally collapsed the legacy md-view `loadModule` to `return textEditorModule`, which broke startup on sessions containing notebook-embedded markdown notes (Vite/Electron CJS resolver doesn't know about `.tsx` lazy requires). The fix preserved the legacy `MarkdownView.tsx` + `MarkdownViewModel.ts` and the eager `Promise.all([import("./markdown/MarkdownView"), import("./markdown/MarkdownViewModel")])` block in the legacy `loadModule`. US-560 applied the same lesson up front for Svg.

**US-561 applies the same lesson up front**: keep `HtmlView.tsx` + `HtmlViewModel.ts` files alive AND keep the legacy `loadModule`'s eager imports of both. The v4 native module lives in parallel (`v4EditorRegistry.register({ id: "html-view", ... })`) and is the path the open-file flow takes. The notebook embedding path keeps using the legacy module until US-557 migrates Notebook.

### Backwards compatibility — pre-US-561 session data

Today's session data:
- `<host.id>-host.txt` — HTML content; cache-keyed by editor id. Survives across migration since `HtmlEditor` inherits the host's id (C9). No content shape change.
- `EditorDescriptor` shape — today's html-view pages are persisted as `editor: "html-view"` + `type: "textFile"` (legacy adapter shape). After US-561 they save as `editorId: "html-view"` + a host descriptor (native v4 shape). v3 restore path auto-promotes pre-US-561 sessions by calling `wrapLegacyForPage` on the restored `TextFileModel` — the new Html branch handles the promotion.

No per-editor cache files to clean up — `HtmlViewModel` never wrote any (state was empty `{}`). No legacy promotion in `applyRestoreData` — today's session never wrote anything beyond identity.

## Implementation plan

### Step 1 — Create `src/renderer/editors/html/HtmlEditor.ts`

New file. Skeleton mirrors `src/renderer/editors/svg/SvgEditor.ts` byte-for-byte except for the editor id, type names, and error messages.

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
 * EPIC-028 / US-561 — native v4 HTML preview editor. One class with
 * TextFileModel as its `IContentHost`. Replaces the legacy `HtmlViewModel`
 * + `LegacyEditorAdapter` pair. Identity-only state slice (PV7) — no
 * editor-specific persisted fields.
 *
 * Design rationale: doc/epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md.
 */

export type HtmlQueueEvent = { type: "focus" };

export type HtmlQueueRequest = never;

export type HtmlEditorState = EditorStateBase;

export const defaultHtmlEditorState: HtmlEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class HtmlEditor extends V4EditorModel<HtmlEditorState, void, HtmlQueueEvent> {
    readonly editorId = "html-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    readonly typedQueue: ComponentQueue<HtmlQueueEvent, HtmlQueueRequest>;

    constructor(state: TComponentState<HtmlEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            HtmlQueueEvent,
            HtmlQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from HtmlEditor");
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

    applyRestoreData(data: RestoreData<HtmlEditorState>): void {
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
                `HtmlEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("HtmlEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore HTML editor.", "error");
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
        // `host.state.use((s) => s.content)` directly; iframe re-renders
        // on every srcDoc prop change.

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

### Step 2 — Create `src/renderer/editors/html/HtmlBody.tsx`

New file. Replaces today's `HtmlView.tsx` body (for v4-native pages — the legacy file stays alive for notebook embedding per HT1).

```typescript
import { useMemo } from "react";
import type { HtmlEditor } from "./HtmlEditor";

/**
 * EPIC-028 / US-561 — Html preview body. Reads host content via state.use,
 * builds the srcDoc inline, and renders a sandboxed `<iframe>`. Focus events
 * drain via `model.typedQueue.use`.
 *
 * Sandbox isolation matches today's HtmlView:
 *   - `allow-scripts` enables scripts inside the iframe (and the
 *     `navigationBlockerScript` appended below).
 *   - No `allow-same-origin` — iframe runs in a unique origin.
 *   - No `allow-top-navigation` — can't escape to the app shell.
 *   - No `allow-popups` — `window.open` suppressed.
 *
 * The blocker script preventDefaults click events on any anchor with `href`,
 * blocking in-frame navigation that the sandbox alone wouldn't catch.
 */

const navigationBlockerScript = `<script>document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.href){e.preventDefault();}},true);</script>`;

interface HtmlBodyProps {
    model: HtmlEditor;
}

export function HtmlBody({ model }: HtmlBodyProps) {
    const host = model.host;

    const content = host ? host.state.use((s) => s.content) : "";

    // PV8 — focus queue drain. <TextChrome>'s root-focus (TC8) puts focus
    // on its outer panel, which is sufficient — the iframe takes keyboard
    // focus on click via the browser's default tab order. Drain events to
    // keep the queue lifecycle clean.
    model.typedQueue.use(() => {
        // no-op
    });

    const safeSrcDoc = useMemo(
        () => content + navigationBlockerScript,
        [content],
    );

    return (
        <iframe
            srcDoc={safeSrcDoc}
            sandbox="allow-scripts"
            title="HTML Preview"
            style={{ flex: 1, border: "none" }}
        />
    );
}
```

### Step 3 — Create `src/renderer/editors/html/index.tsx`

New file. Replaces today's `index.ts`. Exports `EditorModule` (`htmlModule`), the `HtmlEditorView` shell, and re-exports the class.

```typescript
import { TComponentState } from "../../core/state/state";
import { HtmlEditor, defaultHtmlEditorState } from "./HtmlEditor";
import { HtmlBody } from "./HtmlBody";
import { TextChrome } from "../base/v4/TextChrome";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-561 — native HTML preview editor module. Registered with the
 * v4 `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorV4` is a v4-native HtmlEditor instance.
 *
 * No toolbar contributions — Html has no preview-side buttons today (vs Svg's
 * open-draw + copy or Markdown's compact toggle). `<TextChrome>` mounts with
 * the default auto-spacer + switch widget only.
 */

function HtmlEditorView({ model }: { model: V4EditorModel }) {
    const html = model as HtmlEditor;
    return (
        <TextChrome model={model}>
            <HtmlBody model={html} />
        </TextChrome>
    );
}

export const htmlModule: EditorModule = {
    createEditor: () =>
        new HtmlEditor(new TComponentState({ ...defaultHtmlEditorState })),
    Component: HtmlEditorView,
};

export { HtmlEditor, defaultHtmlEditorState };
export type { HtmlEditorState, HtmlQueueEvent } from "./HtmlEditor";
```

### Step 4 — DO NOT delete `HtmlView.tsx` / `HtmlViewModel.ts`

Per HT1 — the legacy files stay alive for notebook embedding. Today's `index.ts` (re-exports `HtmlView` / `HtmlViewProps`) is replaced by `index.tsx` (new surface above). The `index.ts` file is DELETED only because `index.tsx` supersedes it.

This means:
- `HtmlView.tsx` continues to exist, continues to import `HtmlViewModel`, continues to use `useContentViewModel`, continues to render the sandboxed iframe. Page-level open-file flow won't reach it (the v4 path wraps via `wrapLegacyForPage`), but notebook per-note dispatch will via `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor`.
- `HtmlViewModel.ts` continues to exist for `NoteItemEditModel.acquireViewModel("html-view")` calls.

### Step 5 — Update `src/renderer/api/pages/PagesLifecycleModel.ts`

Two changes (mirrors US-560):

**Change 1** — add Html branch in `wrapLegacyForPage` after the Svg branch (~line 139):

```typescript
// EPIC-028 / US-561 — Html migrated to native v4 module. Construct
// HtmlEditor over the legacy TextFileModel host. No initial parse step —
// the body reads host.state.content via state.use() and the iframe
// re-renders on every srcDoc prop change.
if (isTextFile && targetEditorId === "html-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const html = new HtmlEditor(
        new TComponentState({ ...defaultHtmlEditorState, id }),
    );
    html.adoptHost(legacy as TextFileModel);
    return html;
}
```

**Change 2** — add import after the Svg import on line 17:

```typescript
import { HtmlEditor, defaultHtmlEditorState } from "../../editors/html";
```

### Step 6 — Update `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts`

Flip from wrapping `HtmlViewModel` to wrapping `HtmlEditor`.

```typescript
import type { HtmlEditor } from "../../editors/html";

/**
 * Safe facade around HtmlEditor for script access.
 * Implements the IHtmlEditor interface from api/types/html-editor.d.ts.
 *
 * - Minimal read-only facade — exposes the raw HTML source from the host.
 * - Stays sync; no queue.execute requests.
 */
export class HtmlEditorFacade {
    constructor(private readonly editor: HtmlEditor) {}

    get html(): string {
        return this.editor.host?.state.get().content ?? "";
    }
}
```

### Step 7 — Update `src/renderer/scripting/api-wrapper/PageWrapper.ts`

Flip `asHtml(force?: boolean)` to consume `HtmlEditor` directly (lines 16, 256–265).

```typescript
// at the top (~line 16):
// remove: import type { HtmlViewModel } from "../../editors/html/HtmlViewModel";
import { HtmlEditor } from "../../editors/html";

// at line ~256:
async asHtml(force = false): Promise<HtmlEditorFacade> {
    await this.ensureEditor("html-view", "HTML", "asHtml", force);
    // EPIC-028 / US-561 — Html is v4-native. After ensureEditor, the
    // page's mainEditorV4 IS an HtmlEditor; the facade wraps it directly.
    // No acquireViewModel round-trip.
    const v4 = this.v4;
    if (!(v4 instanceof HtmlEditor)) {
        throw new Error("asHtml(): page is not an HtmlEditor after switch");
    }
    return new HtmlEditorFacade(v4);
}
```

Removes `model.acquireViewModel("html-view")` + `releaseList.push(() => model.releaseViewModel("html-view"))` — mirrors the `asSvg` / `asMarkdown` pattern.

### Step 8 — Update `src/renderer/editors/register-editors.ts`

Three changes (mirrors US-560):

**Change 1** — keep the legacy `html-view` `loadModule` AS-IS (eager imports of `HtmlView` + `HtmlViewModel`). Add a comment to document why (parallel to the Svg comment block at lines 300–319):

```typescript
// HTML preview (content-view for HTML files)
editorRegistry.register({
    id: "html-view",
    name: "Preview",
    editorType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "html",
    switchOption: (languageId) => {
        if (languageId !== "html") return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-561 — Html migrated to native v4 module
        // (`htmlModule` in `./html/index.tsx`). Legacy HtmlView + HtmlViewModel
        // are PRESERVED here because notebook per-note dispatch
        // (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`) still
        // consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createHtmlViewModel }] = await Promise.all([
            import("./html/HtmlView"),
            import("./html/HtmlViewModel"),
        ]);
        return {
            Editor: module.HtmlView,
            createViewModel: createHtmlViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});
```

**Change 2** — drop `"html-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 732):

```typescript
const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules.
    // log-view removed — US-553 ships native v4 module.
    // md-view removed — US-554 ships native v4 module.
    // svg-view removed — US-560 ships native v4 module.
    // html-view removed — US-561 ships native v4 module.
    "mermaid-view",
    "notebook-view",
    "todo-view",
    "link-view",
    "rest-client",
    "graph-view",
    "draw-view",
]);
```

**Change 3** — append the native v4 registration override after the US-560 block (~line 952):

```typescript
// US-561 — replace the legacy bare-adapter mirror for html-view with a native
// v4 module. `v4EditorRegistry.register` overwrites by id, so this supersedes
// the bare-adapter stub the mirror loop wrote. `accepts` delegates to the
// legacy registry def's `acceptFile` / `switchOption` to avoid duplicating
// language rules.
v4EditorRegistry.register({
    id: "html-view",
    name: "Preview",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("html-view");
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
        const { htmlModule } = await import("./html");
        return htmlModule;
    },
});
```

### Step 9 — Delete `src/renderer/editors/html/index.ts`

After step 3 there is `index.tsx` with the new surface. Today's `index.ts` only re-exports `HtmlView` + `HtmlViewProps`; those names are still importable directly from `./HtmlView.tsx` for the notebook embedding path (the legacy `loadModule` uses `import("./html/HtmlView")` directly — verified in step 8 change 1). Delete it cleanly.

Before deleting, confirm with grep that nothing outside the html folder imports from `./html/index`:

```powershell
Grep "from.*editors/html['\"]" src\
Grep "from.*editors/html/index['\"]" src\
```

These should return no hits (or only hits inside the html folder itself).

### Step 10 — Files that need NO changes

To save investigation time during implementation, these are confirmed unaffected:

- `src/renderer/editors/html/HtmlView.tsx` — preserved verbatim for notebook embedding (HT1).
- `src/renderer/editors/html/HtmlViewModel.ts` — preserved verbatim for notebook embedding (HT1).
- `src/renderer/editors/link-editor/EditLinkDialog.tsx:53` — dropdown option `{ value: "html-view", label: "HTML Preview" }`. Editor id unchanged.
- `src/shared/types.ts` — `EditorView` union still contains `"html-view"`. No change.
- `src/renderer/api/types/common.d.ts` — same union, no change.
- `src/renderer/api/types/html-editor.d.ts` — `IHtmlEditor` interface (`html: string`). Facade shape preserved; read stays sync. No change.
- `src/renderer/api/pages/PageModel.ts` — already supports v4-native main editors.
- `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` — dispatches via `editorRegistry.getById(editor).loadModule()` for non-monaco editors. The legacy `html-view` `loadModule` stays populated → no change needed.
- `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` — `acquireViewModel("html-view")` reaches the legacy `createHtmlViewModel` via the preserved `loadModule`. No change.
- `src/main/mcp-http-server.ts` — no `"html-view"` string literal in the create_page description (unlike svg-view at line 345). No change.

## Concerns / open questions

### HT1 — Notebook per-note HTML dispatch (the US-554 / US-560 lesson, applied upfront)

**Context:** US-554 originally collapsed `md-view`'s legacy `loadModule` to `return textEditorModule`, mirroring the US-552 / US-553 pattern. This crashed the app on session restore when any notebook contained a markdown-typed note, because `NoteItemActiveEditor.tsx:33-38` mounts `<EditorModule.Editor model={model} />` from the legacy registry's `loadModule()` result, and the lazy `require()` in `textEditorModule.get Editor()` failed at runtime (Vite/Electron CJS resolver doesn't know about `.tsx`). The fix preserved `MarkdownView.tsx` + `MarkdownViewModel.ts` and reverted the legacy `loadModule` to keep eager `Promise.all([import("./markdown/MarkdownView"), import("./markdown/MarkdownViewModel")])`. US-560 applied the same lesson up front for Svg.

**Same scenario applies to HTML.** A user can have an HTML-typed note inside a notebook (`note.content.editor = "html-view"`). If we collapse the legacy `loadModule`, the notebook page renderer crashes on first display.

**Resolution:** apply the US-554 / US-560 retrospective up front. Keep `HtmlView.tsx` + `HtmlViewModel.ts` alive as parallel implementation; keep the legacy `loadModule` returning the eager Promise.all imports; register the v4 native module separately. Page-level pages take the v4 path; notebook-embedded notes take the legacy path. Both coexist until US-557 migrates Notebook (which will retire the per-note content-view dispatch).

No design decision needed — pattern locked in by US-554's fix and US-560's preemptive application. Step 8 Change 1 documents this in a code comment so future maintainers don't try to collapse the loader.

**Verification during implementation:** after applying the change, manually create a notebook with an HTML note, save and reload the app — the notebook page should display the HTML iframe without errors.

### HT2 — No toolbar contributions (zero buttons) — confirm `<TextChrome>` mounts cleanly without `toolbarContributions` / `rightToolbarContributions` props

**Context:** US-560's `SvgEditorView` passes `rightToolbarContributions={<SvgToolbarBits .../>}` to `<TextChrome>`; US-554's `MarkdownEditorView` passes `rightToolbarContributions={<MarkdownToolbarBits .../>}`. Html has nothing analogous — today's `HtmlView.tsx` portals NOTHING (no `createPortal(... editorToolbarRefLast)` calls in the file). The view shell becomes just `<TextChrome model={model}><HtmlBody model={html} /></TextChrome>`.

**Question:** does `<TextChrome>` render correctly when both `toolbarContributions` and `rightToolbarContributions` are undefined? Specifically:
- Does the auto-spacer still render?
- Does the switch widget still render?
- Does the NavPanel button (when `getNavigatorTarget()` returns a value) still render?

**Resolution:** confirmed by reading `<TextChrome>` and walkthroughs 09 / 10:
- `<TextChrome>` mounts `<PageToolbar model={model}>` with optional `{toolbarContributions}` on the left and `{rightToolbarContributions}` on the right of the auto-spacer.
- `<PageToolbar>` always renders: NavPanel button (if `editor.getNavigatorTarget()`), Compare button (if applicable), then `{toolbarContributions}`, then `<Spacer />`, then `{rightToolbarContributions}`, then the switch widget (if `findCompatibleEditors().length >= 2`).
- When `toolbarContributions` and `rightToolbarContributions` are both undefined, React renders nothing in those slots; the spacer + switch widget still show. Auto-controls are always there.

No design ambiguity. The Html view shell just omits both props. Step 3 confirms.

**Verification during implementation:** after applying the change, open a `.html` file → toolbar shows: NavPanel button (if file is on disk) + Spacer + switch widget. No phantom toolbar bits.

### HT3 — Typed `host` getter on `HtmlEditor` (MK4 pattern adoption)

**Context:** US-554 added a typed `get host(): TextFileModel | null` getter on `MarkdownEditor` to avoid the `IContentHost` → `TextFileModel` cast at body and facade read sites (MK4 resolution). US-560 adopted the same pattern. The pattern is now standard for preview-group editors.

**For HTML:** the facade reads `host.state.get().content`; the body reads `host.state.use((s) => s.content)`. Two read sites — two casts saved.

**Resolution:** adopt the MK4 pattern from day one. `HtmlEditor.host` typed getter included in Step 1's class skeleton. Same pattern propagates to US-562 (Mermaid).

### HT4 — `accepts` predicate — language-only matching (no `acceptFile`)

**Context:** today's legacy `html-view` definition has NO `acceptFile`; its `validForLanguage: (id) => id === "html"` is the only entry-point hook, and `switchOption: (id) => id === "html" ? 10 : -1` controls the switch-widget visibility. The `acceptFile` slot is unset (returns undefined → `acceptFile?.(...)` evaluates to `undefined ?? -1 = -1`).

**After migration:** the v4 `accepts(input)` predicate delegates to legacy `acceptFile` + `switchOption`. Since `acceptFile` is null, the predicate falls through to `switchOption("html", fileName) = 10` when language === "html". Works as today.

**Edge case — `.html` / `.htm` filename without `language: "html"`:** the legacy `validForLanguage` chain triggers via Monaco's `getLanguageByExtension` when the file is opened from disk (`/src/renderer/core/utils/language-mapping.ts` maps `.html` and `.htm` to `"html"`). So in practice every `.html` file gets `language: "html"` before hitting `accepts()`. The switch widget's "show me compatible editors" call also passes `language` from the current host's state.

**Resolution:** delegate to legacy verbatim. No explicit `acceptFile`. If a future task wants to accept arbitrary HTML-shaped content from non-`html`-language files (e.g., `.htm`, `.xhtml`), it can amend the accepts predicate independently. YAGNI for US-561.

### HT5 — Iframe sandbox + navigation-blocker script preservation

**Context:** today's `HtmlView.tsx:7` defines `navigationBlockerScript` as a constant inline string and appends it to the user's HTML via `safeSrcDoc = content + navigationBlockerScript`. The iframe's `sandbox="allow-scripts"` prevents `allow-same-origin` / `allow-popups` / `allow-top-navigation` automatically. The blocker script adds belt-and-suspenders click prevention so in-frame anchor clicks don't navigate the iframe away from the rendered preview (defense against the iframe's content trying to navigate itself via JS or markup that the sandbox alone wouldn't catch).

**Migration choices:**

(a) **Preserve byte-for-byte in `HtmlBody.tsx`** — copy the constant string and the append logic verbatim. Same `sandbox="allow-scripts"` attribute. Identical user-facing behavior.

(b) **Move to a shared utility** — extract `navigationBlockerScript` + iframe-mounting helper into `src/renderer/editors/shared/`. No current consumer beyond Html.

(c) **Tighten the sandbox** — add `allow-forms` or `allow-modals` for richer preview support. Out of scope.

**Resolution (a)** — byte-for-byte preservation. Reasons:

1. **Identical isolation profile is the safe migration default.** Any change to sandbox attributes or to the blocker script semantics is a behavior change orthogonal to the EPIC-028 migration. Preserve verbatim; tighten or loosen sandbox independently if needed.
2. **No second consumer.** Extracting to `shared/` is speculative — no other editor renders a sandboxed iframe today. YAGNI.
3. **Identical script string** means SHA-equivalence across the migration; if the legacy `HtmlView.tsx` is removed someday (US-557), the v4 path is already isomorphic.

No design ambiguity. Step 2 inlines the constant exactly as today.

### HT6 — Queue event union — `focus` only

**Context:** PV8 from the walkthrough mandates all four preview editors get `{ type: "focus" }` queue events for `<TextChrome>`'s TC8 200ms root-focus subscription. The base class's no-op MO7 default doesn't propagate; we have to override `focus()` to fire on the queue.

**For HTML specifically:** the iframe takes keyboard focus on click via the browser's default tab order. There's no JS-level "focus the iframe" call that's reliable across browsers (the iframe's contentWindow may not be the right target depending on sandbox). `<TextChrome>`'s root-focus is sufficient — it puts focus on the outer panel, the user's next tab key reaches the iframe's tab-stop, and keyboard then flows into the iframe's contents.

**Resolution:** all four preview editors share `type QueueEvent = { type: "focus" }`; `type QueueRequest = never`. Step 1 confirms.

The `HtmlBody`'s `model.typedQueue.use(() => {})` no-op subscriber is solely for queue lifecycle hygiene (so the event doesn't pile up in the queue with no subscriber). The body intentionally doesn't act on focus — the iframe self-manages keyboard focus.

## Acceptance criteria

1. **App still opens HTML files end-to-end:**
   - Open a `.html` or `.htm` file from file explorer → renders in the new `HtmlEditor` (verify via DevTools: page's `mainEditorV4` is `HtmlEditor`, not `LegacyEditorAdapter`).
   - Edit raw HTML in Monaco → switch to HTML Preview via the switch widget → preview reflects updated content (host transfer via `CONTENT_HOST_TRAIT`).
   - Restart app → file reopens via the v4 native path.

2. **Iframe sandbox + navigation blocker still work as today:**
   - User-authored `<script>` tags inside the HTML still execute.
   - User-authored `<a href="https://...">` links inside the HTML do NOT navigate (blocker script prevents default).
   - `window.open(...)` from user-authored script does nothing (sandbox blocks popups).
   - Top-frame navigation cannot escape the iframe (sandbox blocks `allow-top-navigation`).
   - `localStorage` / `cookie` access from inside the iframe is unique-origin (sandbox blocks `allow-same-origin`).

3. **Toolbar renders cleanly with no preview-specific buttons:**
   - Toolbar shows: NavPanel button (when file is on disk), Compare button (when applicable), Spacer, switch widget. NO phantom IconButtons.
   - Switch widget lists `Monaco` + `HTML Preview` for an HTML host.
   - Switching back to Monaco transfers the host correctly (raw HTML reappears in the text editor).

4. **Scripting facade `page.asHtml()` works:**
   - From an HTML page: `const html = await page.asHtml(); console.log(html.html.length > 0)` returns true.
   - From a non-HTML page: `await page.asHtml(true)` switches the page if compatible (force flag — SF1).
   - `page.asHtml(false)` (default) throws on non-HTML page.
   - Facade `html` getter returns the same string as `page.content` (raw host content).

5. **Persistence round-trip:**
   - Open an HTML file → restart app → file reopens at the same v4-native editor.
   - Pre-US-561 session data (legacy `editor: "html-view"` + `type: "textFile"` descriptor) still loads via `wrapLegacyForPage` (v3 restore path).

6. **Notebook embedding still works (HT1 verification):**
   - Create a notebook page with an HTML-typed note (in-app: add a note, switch its editor to `html-view`, save the notebook).
   - Restart app → reload the notebook → the HTML note renders without console errors.
   - This is the critical test that bit US-554 retrospectively; running it during US-561 implementation prevents the regression.

7. **No regression in HTML rendering:**
   - HTML content updates reactively when the host content changes (e.g., script writes new content; preview re-renders).
   - Inline `<style>`, embedded `<script>`, external `<link rel="stylesheet">` (CDN), `<img>` tags, forms, tables — all render as today (the iframe's HTML parser is unchanged).

8. **Cleanup verified:**
   - `Grep "acquireViewModel.*html-view"` returns hits only in `NoteItemEditModel.ts` and `note-editor` flow (legacy path) — not in `PageWrapper.ts`.
   - `Grep "useContentViewModel.*html-view"` returns hits only in `HtmlView.tsx` (legacy file preserved per HT1).
   - `src/renderer/editors/html/index.ts` is deleted; `src/renderer/editors/html/index.tsx` exists with the new surface.
   - `HtmlView.tsx` + `HtmlViewModel.ts` exist unchanged.
   - TypeScript + ESLint pass with zero new errors in touched files.

## Files changed summary

### New files

| File | Purpose |
|------|---------|
| `src/renderer/editors/html/HtmlEditor.ts` | Native v4 `HtmlEditor` class — identity-only state, trait wiring, three-phase lifecycle, host adoption. ~200 LOC. |
| `src/renderer/editors/html/HtmlBody.tsx` | Body view — reads host content via `state.use`; renders sandboxed iframe with navigation blocker script. ~40 LOC. |
| `src/renderer/editors/html/index.tsx` | Module shell — `HtmlEditorView` (`<TextChrome>` + `<HtmlBody>`, no toolbar bits), `htmlModule` export, class re-export. Replaces today's `index.ts`. ~40 LOC. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `if (isTextFile && targetEditorId === "html-view")` branch in `wrapLegacyForPage`; add import of `HtmlEditor` + `defaultHtmlEditorState`. |
| `src/renderer/editors/register-editors.ts` | Keep legacy `html-view` `loadModule` (eager imports preserved for notebook); drop `"html-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; append v4 native registration; add comment documenting HT1 rationale. |
| `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` | Wrap `HtmlEditor` instead of `HtmlViewModel`; `html` getter reads `editor.host?.state.get().content`. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | `asHtml` flips to `instanceof HtmlEditor`; drop `acquireViewModel("html-view")` + `releaseList` push; remove the `HtmlViewModel` type-import. |

### Deleted files

| File | Reason |
|------|--------|
| `src/renderer/editors/html/index.ts` | Replaced by `index.tsx` (different re-export surface; new `htmlModule` + class exports). Notebook embedding path imports `./HtmlView` directly via the legacy `loadModule`'s `Promise.all`. |

### Preserved files (intentional — HT1)

| File | Rationale |
|------|-----------|
| `src/renderer/editors/html/HtmlView.tsx` | Consumed by `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor` for HTML-typed notebook notes. Removed by US-557 once Notebook migrates. |
| `src/renderer/editors/html/HtmlViewModel.ts` | Consumed by `NoteItemEditModel.acquireViewModel("html-view")` for HTML-typed notebook notes. Removed by US-557. |

### Unchanged files

| File | Notes |
|------|-------|
| `src/renderer/editors/link-editor/EditLinkDialog.tsx` | Dropdown option — editor id unchanged. |
| `src/renderer/api/types/html-editor.d.ts` | Facade interface — shape preserved (sync `html: string` getter). |
| `src/renderer/api/types/common.d.ts` | `EditorView` union — `"html-view"` retained. |
| `src/renderer/api/pages/PageModel.ts` | Already supports v4-native main editors. |
| `src/shared/types.ts` | `EditorView` union — `"html-view"` retained. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | Per-note dispatch reaches legacy `module.Editor` via the preserved `loadModule`. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | `acquireViewModel("html-view")` reaches legacy `createHtmlViewModel` via the preserved `loadModule`. |
| `src/main/mcp-http-server.ts` | No `"html-view"` literal in the create_page description string. |
