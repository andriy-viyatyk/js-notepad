# US-562: Mermaid editor migration

EPIC-028 Phase C — fourth and final sibling of the preview-group migrations (walkthrough 22). Promotes the legacy `MermaidViewModel` (a `ContentViewModel<{svgUrl, error, loading, lightMode}>` over `TextFileModel` with a 400 ms debounced async `renderMermaid` pipeline) to a native v4 `MermaidEditor` extending `EditorModel`. Retires the `useContentViewModel("mermaid-view")` consumer site and the `acquireViewModel("mermaid-view")` facade-acquire pair.

Walkthrough: [`doc/epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md). Concerns PV4 / PV5 / PV6 cover Mermaid directly (async render pipeline location + `lightMode` persistence); PV1 / PV7 / PV8 / PV10 cover group-shared resolutions; PV2 / PV3 are Markdown-specific; PV9 (DOM peek) does not apply (the facade reads model state, not rendered DOM).

Direct precedents:
- [`US-554 (Markdown)`](../US-554-markdown-editor-migration/README.md) — the HS1 host-slot pattern (now applied to `lightMode` per the 2026-05-21 PV6 HS1 amendment).
- [`US-560 (Svg)`](../US-560-svg-editor-migration/README.md) — the toolbar shape with portal copy / open-draw buttons + `BaseImageView` imperative ref (MR2 mirrors SV2 directly; the open-draw button is the same draw-export call).
- [`US-561 (Html)`](../US-561-html-editor-migration/README.md) — the recently-fixed shape-based restore discriminator (`d.host !== undefined`) auto-includes Mermaid descriptors without a `PagesPersistenceModel` edit.

The material differences from US-560 (Svg):
1. **Async render pipeline (PV5)** — `MermaidEditor` owns a private `_renderTimer`, `renderDebounced()` method, and three view-derived state fields (`svgUrl`, `error`, `loading`). Subscribes to both host content AND `lightMode` selector changes; both retrigger render.
2. **Persisted `lightMode` (PV6 / HS1)** — `lightMode` rides `host.editorSettings["mermaid-view"]` (HS1 host-slot, identical mechanism to Markdown's `compactMode`). Default value from `isCurrentThemeDark()` on first construct; user override sticks across editor switches AND app restarts.
3. **Three toolbar buttons (PV10)** — theme toggle, open-in-draw, copy-image. Same `BaseImageView` ref bridge as Svg (`imageRef` held by view, shared with toolbar). One extra button (theme toggle) and a `disabled={!svgUrl}` gate on the other two (no SVG to act on yet during load).
4. **Loading overlay + render-error UI** — the body renders a `<Spinner />` overlay during loading + an error `<Panel>` when render fails. Svg/Html had neither.

## Goal

Replace the host + content-view pair (`TextFileModel` wrapped in `LegacyEditorAdapter` + `MermaidViewModel` acquired via `useContentViewModel`) with a single native `MermaidEditor` that IS the page's `mainEditor` and HAS a `TextFileModel` as its `IContentHost` via `CONTENT_HOST_TRAIT`. The `MermaidEditorFacade` flips from wrapping `MermaidViewModel` to wrapping `MermaidEditor` directly (stays sync — three sync getters: `svgUrl`, `loading`, `error`). State slice extends `EditorStateBase` with `lightMode` (HS1-mirrored) + three view-derived fields (`svgUrl`, `error`, `loading`) that ride state for reactivity and are stripped from `getRestoreData` per MO5.

## Background

### Reference shape — three precedents, one new piece

This task is the **fourth and final exercise of the Tier-5 template on a preview-group editor**, after US-554 (Markdown), US-560 (Svg), and US-561 (Html). The skeleton is identical to those three — the **single new piece** is the async render pipeline (PV5):

- `_renderTimer: ReturnType<typeof setTimeout> | undefined` — private debounce handle.
- `_hostContentUnsub: (() => void) | null` — slice-subscribe on `host.state.content` selector → `renderDebounced()`.
- `_lightModeUnsub: (() => void) | null` — slice-subscribe on `editor.state.lightMode` selector → `renderDebounced()`.
- `renderDebounced(): void` — clears prior timer, sets `loading: true`, schedules a 400 ms timer that calls `renderMermaid(content, lightMode)` and writes the result to state.
- Initial render: kicked off from `adoptHost()` (after host content is wired) — same as the today's `MermaidViewModel.onInit()` final `renderDebounced()` call.
- `dispose()` adds `clearTimeout(this._renderTimer)`.

Everything else mirrors US-554 / US-560 / US-561 byte-for-byte:

1. Class extends `V4EditorModel<MermaidEditorState, void, MermaidQueueEvent>` with `readonly editorId = "mermaid-view"`, `_host: TextFileModel | null`, `_hostStateUnsub`, `_settingsUnsub` (HS1 mirror for `lightMode`), `_hostContentUnsub`, `_lightModeUnsub` (PV5 render retriggers), `_renderTimer` (PV5 debounce).
2. Constructor adds `CONTENT_HOST_TRAIT` with `extractContentHost` that tears down ALL four subscriptions before returning the host (the host transfers; the editor must release every host-tied resource).
3. `getRestoreData()` strips `svgUrl` / `error` / `loading` / `lightMode` (PV5 view-derived + PV6 HS1 host-slot) — descriptor is identity-only.
4. `applyRestoreData()` stashes `_pendingHost`. No `lightMode` carry from descriptor (HS1 reads from host-slot in `adoptHost`).
5. `switchFrom(oldEditor)` extracts the host via trait, copies id, tags host with the new editor id, calls `adoptHost`. **Initial render kicks off from `adoptHost`** via the slice-subscribe firing for the first time (or explicit `this.renderDebounced()` call at the end of `adoptHost`).
6. `restore()` rebuilds the host from `_pendingHost`, calls `host.restore()`, then `adoptHost`. Same initial-render kick.
7. `adoptHost(host)` wires the host-state forwarder, the HS1 mirror for `lightMode` (seed from slot + slice-subscribe to mirror back), the content-change retrigger, the lightMode-change retrigger, AND calls `renderDebounced()` for the initial render.
8. `dispose()` clears timer + tears down all four subscriptions before disposing the host (only if not extracted).
9. Module file (`mermaid/index.tsx`) exports an `EditorModule` (`{ createEditor, Component }`) consumed by the v4 registry; `register-editors.ts` appends a v4 native registration. The legacy `loadModule` is preserved with eager imports for notebook embedding — see MR1.

### Today's per-editor surface

`src/renderer/editors/mermaid/`:

| File | Today's role | After US-562 |
|------|--------------|--------------|
| `MermaidViewModel.ts` | `ContentViewModel<{svgUrl, error, loading, lightMode}>` over `TextFileModel`. `onInit`: sets initial `lightMode = !isCurrentThemeDark()`; subscribes own state to retrigger render on `lightMode` change; kicks initial `renderDebounced()`. `onContentChanged`: retriggers render. `onDispose`: `clearTimeout(_renderTimer)`. Holds `_renderTimer` (private). `pageModel` getter returns the host as `TextFileModel`. `toggleLightMode` action. | **Retained verbatim** for notebook embedding (see MR1 below). The page-level v4 path no longer constructs it. |
| `MermaidView.tsx` | React component, props `{ model: TextFileModel }`, uses `useContentViewModel<MermaidViewModel>` + `useSyncExternalStore`. Renders `<Panel name="mermaid-root">` with portal-toolbar (3 buttons), error `<Panel>`, loading overlay `<Panel><Spinner /></Panel>`, and `<BaseImageView ref={imageRef} src={svgUrl} alt="Mermaid Diagram" />`. | **Retained verbatim** for notebook embedding (see MR1). The page-level v4 path uses the new `MermaidBody.tsx`. |
| `render-mermaid.ts` | Shared rendering utilities (`renderMermaidSvg`, `svgToDataUrl`, `renderMermaid`). Consumed by both `MermaidViewModel` AND `markdown/MarkdownBlock.tsx` (inline diagrams) AND `log-view/items/MermaidOutputView.tsx` (log entries). | **Unchanged.** Carried over verbatim; consumed from the new `MermaidEditor.renderDebounced` private method. Lazy mermaid import preserved. |
| (new) `MermaidEditor.ts` | — | Native v4 `MermaidEditor` class — trait, lifecycle, host adoption, async render pipeline, HS1 mirror for `lightMode`. ~270 LOC (Tier-5 skeleton + ~50 LOC of pipeline plumbing). |
| (new) `MermaidBody.tsx` | — | View body — reads `model.state.use((s) => ({svgUrl, error, loading}))`; reads `host.state.use((s) => s.content)` (not strictly needed at body level — `svgUrl` already encodes content — but mirrors the sibling pattern for the queue/focus subscription only); renders Panel + error + loading overlay + `BaseImageView`. Receives `imageRefSetter` callback (mirror of `SvgBody`). ~55 LOC. |
| (new) `index.tsx` | — | Module shell — `EditorModule` export (`mermaidModule`), `MermaidEditorView` (`<TextChrome>` with `rightToolbarContributions={<MermaidToolbarBits .../>}` + `<MermaidBody>` + view-local `imageRef`). Replaces today's `index.ts`. ~75 LOC. |

`src/renderer/editors/mermaid/index.ts` (existing) — re-exports `MermaidView` + `MermaidViewProps`. **Deleted** because `index.tsx` supersedes it; the notebook embedding path imports `./MermaidView` directly via the legacy `loadModule`'s `Promise.all`.

### The async render pipeline — moves from VM to editor (PV5)

Today's `MermaidViewModel.renderDebounced()`:
```typescript
private _renderTimer: ReturnType<typeof setTimeout> | undefined;

private renderDebounced(): void {
    clearTimeout(this._renderTimer);
    this.state.update((s) => { s.loading = true; });

    this._renderTimer = setTimeout(() => {
        const content = this.host.state.get().content;
        const { lightMode } = this.state.get();

        renderMermaid(content, lightMode)
            .then((url) => {
                this.state.update((s) => {
                    s.svgUrl = url;
                    s.error = "";
                    s.loading = false;
                });
            })
            .catch((e) => {
                this.state.update((s) => {
                    s.error = e.message || "Failed to render diagram";
                    s.loading = false;
                });
            });
    }, 400);
}
```

After migration, this lives on `MermaidEditor` byte-for-byte except: `this.host.state.get().content` becomes `this._host?.state.get().content ?? ""` (host can be null between switches). Same 400 ms debounce, same `renderMermaid` import, same state shape.

The trigger sources change from `onContentChanged` (called by ContentViewModelHost on host content change) + own-state `lightMode` watcher to two slice-subscribes on `editor.state.lightMode` and `host.state.content`:

```typescript
// in adoptHost(host):
this._hostContentUnsub = host.state.subscribe(
    () => this.renderDebounced(),
    (s) => s.content,
);
this._lightModeUnsub = this.state.subscribe(
    () => this.renderDebounced(),
    (s) => s.lightMode,
);
```

And a kickoff call at the end of `adoptHost`:
```typescript
this.renderDebounced();  // initial render against the freshly-adopted host
```

This matches today's behavior: `MermaidViewModel.onInit()` calls `this.renderDebounced()` at the end after wiring `lightMode` and its watcher.

### Persistence story (PV5 + PV6 + HS1)

**View-derived (stripped from `getRestoreData`):**
- `svgUrl` — recomputable from `host.content` + `lightMode`; potentially large data URL. Stripped per MO5 / GR8 pattern.
- `error` — recomputed by the next render.
- `loading` — recomputed by the next render (`renderDebounced()` sets `loading: true` immediately, then the async render flips it back).

**Persisted via HS1 host-slot (PV6 amendment 2026-05-21):**
- `lightMode` — rides `host.editorSettings["mermaid-view"]`. Initial value from `isCurrentThemeDark()` on first construct (no slot yet). User override sticks across:
  - Mermaid ↔ Monaco editor switches (host survives the switch; slot survives with it).
  - App restarts (slot rides host descriptor in `openFiles*.json`).
  - Re-open from disk (host pipe re-creates the slot — but the slot lives in `openFiles0.json`'s host descriptor, not in the file content, so the slot persists for as long as the host descriptor persists).

**Editor descriptor:**
```typescript
getRestoreData(): EditorDescriptor {
    const s = this.state.get();
    // Identity-only descriptor. lightMode rides host.editorSettings (HS1);
    // svgUrl/error/loading stripped (view-derived; recomputable on restore).
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
```

**Restore path on app startup:**
1. `PagesPersistenceModel.restorePage()` sees `d.host !== undefined` → routes through native v4 path (fix from US-561).
2. v4 registry's `mermaid-view` `createEditor()` constructs a fresh `MermaidEditor` with `defaultMermaidEditorState`. `lightMode` initially defaults to `!isCurrentThemeDark()` (mirrors today's behavior).
3. `editor.applyRestoreData(d)` stashes `_pendingHost`.
4. `editor.restore()` rebuilds the host via `TextFileModel.fromDescriptor(_pendingHost)`, calls `host.restore()`, then `adoptHost(host)`.
5. `adoptHost` reads `host.getEditorState("mermaid-view")` — if the slot exists with `lightMode`, overrides the default. Wires content + lightMode slice-subscribes. Calls `renderDebounced()` for the initial render.
6. The 400 ms debounce timer fires; `renderMermaid(content, lightMode)` runs; state updates with `svgUrl` / `loading: false` / `error: ""`. View re-renders with the SVG.

This is the same flow as today (modulo the HS1 persistence — today's `lightMode` always reverts to `!isCurrentThemeDark()` on every reopen).

### Consumer sites of MermaidViewModel / MermaidView — full grep result

| File | Line(s) | Pattern today | After US-562 |
|------|---------|---------------|--------------|
| `src/renderer/editors/mermaid/MermaidView.tsx` | 12, 26 | imports `MermaidViewModel` + `defaultMermaidViewState`; `useContentViewModel<MermaidViewModel>(model, "mermaid-view")` | **Unchanged.** Preserved for notebook embedding (MR1). |
| `src/renderer/editors/mermaid/index.ts` | 1–2 | Re-exports `MermaidView` + `MermaidViewProps` | **Deleted.** Replaced by `index.tsx` (different surface — adds `mermaidModule` + class re-export). Notebook embedding path imports `./MermaidView` directly via the legacy `loadModule`'s `Promise.all`. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | 17, 268–277 | `import type { MermaidViewModel }` + `await model.acquireViewModel("mermaid-view") as MermaidViewModel` + `releaseList.push(...)` | `this.v4 instanceof MermaidEditor` direct check; `new MermaidEditorFacade(this.v4)`; releaseList push deletes. Same pattern as `asMarkdown` / `asSvg` / `asHtml`. |
| `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts` | constructor + three getters | Wraps `MermaidViewModel`; reads `vm.state.get().svgUrl` / `.loading` / `.error` | Wraps `MermaidEditor`; reads `editor.state.get().svgUrl` / `.loading` / `.error` (one-symbol rename — `vm` → `editor`). Stays sync. |
| `src/renderer/editors/register-editors.ts` | 353–377, 738, ~959–986 (new) | Legacy registration + `TEXT_CONTENT_VIEW_BRIDGE_IDS` includes `"mermaid-view"` | Keep legacy registration (MR1 — eager imports preserved); drop `"mermaid-view"` from bridge set; append v4 native registration (same shape as svg/html). |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | ~16–17 (import) + after line 153 (`wrapLegacyForPage` Html branch) | No mermaid branch — falls through to `LegacyEditorAdapter` | Add `import { MermaidEditor, defaultMermaidEditorState } from "../../editors/mermaid";` + add `if (isTextFile && targetEditorId === "mermaid-view")` branch after the Html branch. |
| `src/main/mcp-http-server.ts` | 158, 345 | String literal `"mermaid-view"` in tool descriptions | **Unchanged.** Editor id preserved. |
| `src/shared/types.ts` | 2 | `EditorView` union contains `"mermaid-view"` | **Unchanged.** |
| `src/renderer/api/types/common.d.ts` | 37 | `EditorView` union contains `"mermaid-view"` | **Unchanged.** |
| `src/renderer/api/types/mermaid-editor.d.ts` | `IMermaidEditor` interface (3 readonly getters) | Facade interface — sync `svgUrl` / `loading` / `error` getters | **Unchanged.** Shape preserved. |
| `src/renderer/scripting/api-wrapper/Mermaid.ts` | 38 | `pagesModel.addEditorPage("mermaid-view", "mermaid", title, this._text)` | **Unchanged.** Creates a new page that takes the v4 path via `wrapLegacyForPage`'s new Mermaid branch. |
| `src/renderer/editors/markdown/CodeBlock.tsx` | 117 | `pagesModel.addEditorPage("mermaid-view", "mermaid", "Mermaid Diagram", code)` | **Unchanged.** Same path. |
| `src/renderer/editors/log-view/items/MermaidOutputView.tsx` | 76 | `pagesModel.addEditorPage("mermaid-view", "mermaid", title, entry.text)` | **Unchanged.** Same path. |
| `src/renderer/editors/base/v4/LegacyEditorAdapter.ts` | 151 | Comment mentions `mermaid-view` as an example of content-view editor | **Unchanged.** Comment is illustrative. |

The `acquireViewModel*` machinery itself does NOT die in this task — `NoteItemEditModel.ts` is still a consumer for notebook-embedded mermaid notes AND we are intentionally KEEPING the legacy `loadModule` populated for the notebook path. Full removal happens in US-557 (Notebook) and US-559 (cleanup).

### Open-file path — `wrapLegacyForPage`

`src/renderer/api/pages/PagesLifecycleModel.ts:57` (`wrapLegacyForPage`) is the bridge that converts legacy `TextFileModel` instances into v4 editors during page creation. It has six `if` branches today (Monaco, Grid, LogView, Markdown, Svg, Html) that produce native v4 editors; everything else falls through to `LegacyEditorAdapter`. US-562 adds the Mermaid branch after the Html branch (~line 153):

```typescript
// EPIC-028 / US-562 — Mermaid migrated to native v4 module. Construct
// MermaidEditor over the legacy TextFileModel host. The initial
// renderDebounced() call kicks off inside adoptHost via the
// content-slice subscription firing for the first time + an explicit
// kickoff call at the end of adoptHost (mirrors today's
// MermaidViewModel.onInit → renderDebounced).
if (isTextFile && targetEditorId === "mermaid-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const mermaid = new MermaidEditor(
        new TComponentState({ ...defaultMermaidEditorState, id }),
    );
    mermaid.adoptHost(legacy as TextFileModel);
    return mermaid;
}
```

This makes:
- Open an `.mmd` file from explorer → routed via legacy registry's `switchOption` (legacy `validForLanguage: (id) => id === "mermaid"`; `switchOption: (id) => id === "mermaid" ? 10 : -1`) → `wrapLegacyForPage` → `MermaidEditor` via the new branch.
- `pagesModel.addEditorPage("mermaid-view", "mermaid", title, content)` from script API / log-view / markdown code-block → same path through `wrapLegacyForPage` with `editor = "mermaid-view"`.

The legacy registry's `mermaid-view` entry stays populated (legacy `Editor` slot = `MermaidView`; `createViewModel` = `createMermaidViewModel`) for notebook embedding compatibility (MR1). The bare-adapter mirror in the v4 bridge loop drops `"mermaid-view"` from the bridge set — a native v4 registration replaces it (same mechanism as US-554 / US-560 / US-561).

### Notebook embedding — the MR1 lesson from US-554 / US-560 / US-561

`src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` (per-note content-view dispatch) reads `editorRegistry.getById(editor).loadModule()` at runtime and mounts the returned `module.Editor` inside `<AsyncEditor>`. The editor name is whatever's saved on the note (`state.editor`) — `"mermaid-view"` is a legitimate value if the user has a Mermaid note inside a notebook.

US-554 originally collapsed the legacy md-view `loadModule` to `return textEditorModule`, which broke startup on sessions containing notebook-embedded markdown notes. The fix preserved the legacy view + view-model files and the eager `Promise.all([import(view), import(view-model)])` block in the legacy `loadModule`. US-560 (Svg) and US-561 (Html) applied the same lesson up front.

**US-562 applies the same lesson up front**: keep `MermaidView.tsx` + `MermaidViewModel.ts` files alive AND keep the legacy `loadModule`'s eager imports of both. The v4 native module lives in parallel (`v4EditorRegistry.register({ id: "mermaid-view", ... })`) and is the path the open-file flow takes. The notebook embedding path keeps using the legacy module until US-557 migrates Notebook.

### Backwards compatibility — pre-US-562 session data

Today's session data:
- `<host.id>-host.txt` — Mermaid source; cache-keyed by editor id. Survives across migration since `MermaidEditor` inherits the host's id (C9). No content shape change.
- `EditorDescriptor` shape — today's mermaid-view pages are persisted as `editor: "mermaid-view"` + `type: "textFile"` (legacy adapter shape). After US-562 they save as `editorId: "mermaid-view"` + a host descriptor (native v4 shape). v3 restore path auto-promotes pre-US-562 sessions by calling `wrapLegacyForPage` on the restored `TextFileModel` — the new Mermaid branch handles the promotion.
- **`lightMode`** — today's value is in-memory only (re-initialized from theme on every reopen). After US-562 the slot didn't exist before; the editor falls back to `!isCurrentThemeDark()` on first construct (same behavior). First user toggle persists.

No per-editor cache files to clean up — `MermaidViewModel` never wrote any.

## Implementation plan

### Step 1 — Create `src/renderer/editors/mermaid/MermaidEditor.ts`

New file. Skeleton mirrors `src/renderer/editors/svg/SvgEditor.ts` with the additions for the async render pipeline + HS1 mirror for `lightMode`.

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
import { isCurrentThemeDark } from "../../theme/themes";
import { renderMermaid } from "./render-mermaid";

/**
 * EPIC-028 / US-562 — native v4 Mermaid preview editor. One class with
 * TextFileModel as its `IContentHost`. Replaces the legacy `MermaidViewModel`
 * + `LegacyEditorAdapter` pair. Owns the 400 ms debounced async render
 * pipeline (PV5) and the lightMode toggle (PV6 / HS1).
 *
 * Design rationale: doc/epics/EPIC-028-editor-architecture/walkthroughs/22-preview-group.md.
 */

export type MermaidQueueEvent = { type: "focus" };

export type MermaidQueueRequest = never;

/**
 * HS1 host-slot shape — `lightMode` rides `host.editorSettings["mermaid-view"]`
 * so it survives Mermaid↔Monaco switches AND app restarts (PV6 HS1 amendment
 * 2026-05-21). Identical mechanism to Markdown's `compactMode`.
 */
interface MermaidViewSettings {
    lightMode?: boolean;
}

export interface MermaidEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["mermaid-view"]. Bounded boolean.
    // Default seeded from isCurrentThemeDark() on first construct.
    lightMode: boolean;
    // View-derived — present on state for in-session reactivity, stripped
    // from getRestoreData per PV5 / MO5 pattern. Recomputed on every render.
    svgUrl: string;
    error: string;
    loading: boolean;
}

export const defaultMermaidEditorState: MermaidEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    lightMode: false,  // overridden in constructor to !isCurrentThemeDark()
    svgUrl: "",
    error: "",
    loading: true,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class MermaidEditor extends V4EditorModel<MermaidEditorState, void, MermaidQueueEvent> {
    readonly editorId = "mermaid-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _lightModeUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;
    private _renderTimer: ReturnType<typeof setTimeout> | undefined;

    readonly typedQueue: ComponentQueue<MermaidQueueEvent, MermaidQueueRequest>;

    constructor(state: TComponentState<MermaidEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            MermaidQueueEvent,
            MermaidQueueRequest
        >;

        // Seed lightMode from theme on first construct. HS1 slot read in
        // adoptHost overrides this if the user previously toggled.
        this.state.update((s) => {
            s.lightMode = !isCurrentThemeDark();
        });

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from MermaidEditor");
                this._tearDownHostSubscriptions();
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    private _tearDownHostSubscriptions(): void {
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._lightModeUnsub?.();
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._lightModeUnsub = null;
        this._settingsUnsub = null;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + toolbar consumption (MK4 pattern from
     *  US-554; mirrors Svg/Html/Markdown). */
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
        // Identity-only descriptor. lightMode rides host.editorSettings["mermaid-view"]
        // (HS1); svgUrl / error / loading stripped per PV5 / MO5 (view-derived,
        // recomputable on restore via renderDebounced).
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

    applyRestoreData(data: RestoreData<MermaidEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        // lightMode is NOT carried via descriptor — read from host.editorSettings
        // in adoptHost. svgUrl/error/loading re-derived by initial render.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `MermaidEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("MermaidEditor.switchFrom: extracted host is not a TextFileModel");
        }
        // Preserve cache-file id across the swap (C9).
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        // Tag the host with the target editor id so submodels keep their assumptions.
        host.state.update((s) => {
            s.editor = this.editorId;
        });
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
            ui.notify((err as Error).message || "Failed to restore Mermaid editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `wrapLegacyForPage` when constructing a fresh MermaidEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // HS1 — seed `lightMode` from host slot (sync, no flicker). If the
        // slot is absent, retain the theme-derived default set in constructor.
        const saved = host.getEditorState<MermaidViewSettings>(this.editorId);
        if (saved?.lightMode !== undefined) {
            this.state.update((s) => {
                s.lightMode = saved.lightMode!;
            });
        }

        // HS1 — mirror `lightMode` changes back to host slot. Slice-subscribe
        // keeps the mirror from firing on svgUrl/error/loading mutations (the
        // dominant write source) — only the bounded boolean triggers a
        // host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (lightMode) => {
                if (!this._host) return;
                this._host.setEditorState<MermaidViewSettings>(this.editorId, {
                    lightMode: lightMode as boolean,
                });
            },
            (s) => s.lightMode,
        );

        // PV5 — content changes retrigger render (replaces today's
        // ContentViewModelHost.onContentChanged → MermaidViewModel callback).
        this._hostContentUnsub = host.state.subscribe(
            () => this.renderDebounced(),
            (s) => s.content,
        );

        // PV5 — lightMode changes retrigger render (replaces today's
        // MermaidViewModel.onInit's own-state watcher).
        this._lightModeUnsub = this.state.subscribe(
            () => this.renderDebounced(),
            (s) => s.lightMode,
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

        // Initial render against the freshly-adopted host (mirrors today's
        // MermaidViewModel.onInit's final renderDebounced call).
        this.renderDebounced();
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Render pipeline (PV5 — relocated from MermaidViewModel) ─────────

    private renderDebounced(): void {
        clearTimeout(this._renderTimer);
        this.state.update((s) => {
            s.loading = true;
        });

        this._renderTimer = setTimeout(() => {
            const content = this._host?.state.get().content ?? "";
            const { lightMode } = this.state.get();

            renderMermaid(content, lightMode)
                .then((url) => {
                    this.state.update((s) => {
                        s.svgUrl = url;
                        s.error = "";
                        s.loading = false;
                    });
                })
                .catch((e) => {
                    this.state.update((s) => {
                        s.error = e.message || "Failed to render diagram";
                        s.loading = false;
                    });
                });
        }, 400);
    }

    // ── State mutators ──────────────────────────────────────────────────

    toggleLightMode = (): void => {
        this.state.update((s) => {
            s.lightMode = !s.lightMode;
        });
        // The slice-subscribe on `s.lightMode` (set up in adoptHost) fires
        // automatically and triggers renderDebounced. No explicit call needed.
    };

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        clearTimeout(this._renderTimer);
        this._tearDownHostSubscriptions();
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

### Step 2 — Create `src/renderer/editors/mermaid/MermaidBody.tsx`

New file. Replaces today's `MermaidView.tsx` body (for v4-native pages — the legacy file stays alive for notebook embedding per MR1).

```typescript
import type { MermaidEditor } from "./MermaidEditor";
import type { BaseImageViewRef } from "../shared/BaseImageView";
import { BaseImageView } from "../shared/BaseImageView";
import { Panel, Text, Spinner } from "../../uikit";

/**
 * EPIC-028 / US-562 — Mermaid preview body. Reads svgUrl/error/loading from
 * editor.state (the render pipeline lives on the editor per PV5). Renders the
 * loading overlay + error message + BaseImageView, mirroring today's
 * MermaidView.tsx output. The imperative BaseImageViewRef is forwarded via a
 * callback prop so the toolbar's copy button can reach it (MR2 — view-local
 * bridge, no model surface; mirrors Svg's SV2 resolution).
 */

interface MermaidBodyProps {
    model: MermaidEditor;
    /** Callback receiving the BaseImageView ref. The view shell holds the
     *  ref and shares it with `<MermaidToolbarBits>` (copy button). */
    imageRefSetter?: (ref: BaseImageViewRef | null) => void;
}

export function MermaidBody({ model, imageRefSetter }: MermaidBodyProps) {
    // Read render output reactively. svgUrl recomputes inside the editor's
    // 400 ms debounced renderDebounced on host content / lightMode change.
    const { svgUrl, error, loading } = model.state.use((s) => ({
        svgUrl: s.svgUrl,
        error: s.error,
        loading: s.loading,
    }));

    // PV8 — focus queue subscriber. <TextChrome>'s root-focus (TC8) puts
    // focus on its outer panel, which is sufficient — BaseImageView's
    // tabIndex={0} root receives focus naturally on click. Drain events to
    // keep the queue lifecycle clean.
    model.typedQueue.use(() => {
        // no-op
    });

    return (
        <Panel
            name="mermaid-root"
            direction="column"
            flex
            overflow="hidden"
            position="relative"
            height={0}
        >
            {error && (
                <Panel flex align="center" justify="center" padding="xxxl">
                    <Text color="warning" preWrap>{error}</Text>
                </Panel>
            )}
            {loading && svgUrl && (
                <Panel
                    position="absolute"
                    inset={0}
                    zIndex={1}
                    align="center"
                    justify="center"
                    background="overlay"
                >
                    <Spinner />
                </Panel>
            )}
            {loading && !svgUrl ? (
                <Panel flex align="center" justify="center" background="default">
                    <Spinner />
                </Panel>
            ) : svgUrl ? (
                <BaseImageView
                    ref={imageRefSetter}
                    src={svgUrl}
                    alt="Mermaid Diagram"
                />
            ) : null}
        </Panel>
    );
}
```

### Step 3 — Create `src/renderer/editors/mermaid/index.tsx`

New file. Replaces today's `index.ts`. Exports `EditorModule` (`mermaidModule`), the `MermaidEditorView` shell with `<MermaidToolbarBits>`, and re-exports the class.

```typescript
import { useRef } from "react";
import { TComponentState } from "../../core/state/state";
import { MermaidEditor, defaultMermaidEditorState } from "./MermaidEditor";
import { MermaidBody } from "./MermaidBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit";
import { CopyIcon, SunIcon, MoonIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage, getImageDimensions } from "../draw/drawExport";
import type { BaseImageViewRef } from "../shared/BaseImageView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-562 — native Mermaid preview editor module. Registered with
 * the v4 `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorV4` is a v4-native MermaidEditor instance.
 *
 * Three toolbar bits (mirrors today's MermaidView.tsx portal content):
 *   - theme toggle (sun/moon icon) — calls model.toggleLightMode
 *   - open-draw — converts svgUrl to base64 → opens in Draw editor
 *   - copy-image — delegates to BaseImageViewRef.copyToClipboard()
 *
 * Open-draw and copy buttons are gated on svgUrl presence (disabled during
 * load / on error).
 */

interface MermaidToolbarBitsProps {
    model: MermaidEditor;
    imageRef: React.MutableRefObject<BaseImageViewRef | null>;
}

function MermaidToolbarBits({ model, imageRef }: MermaidToolbarBitsProps) {
    const { svgUrl, lightMode } = model.state.use((s) => ({
        svgUrl: s.svgUrl,
        lightMode: s.lightMode,
    }));

    const onOpenDraw = async () => {
        if (!svgUrl) return;
        // svgUrl is data:image/svg+xml,<percent-encoded> — decode to raw SVG,
        // re-encode as base64 for Draw editor.
        const svgText = decodeURIComponent(svgUrl.replace("data:image/svg+xml,", ""));
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgText, "utf-8").toString("base64")}`;
        const dims = await getImageDimensions(dataUrl);
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/svg+xml", dims.width, dims.height);
        const host = model.host;
        const title = (host?.state.get().title ?? "Mermaid").replace(/\.\w+$/, "") + ".excalidraw";
        pagesModel.addEditorPage("draw-view", "json", title, json);
    };

    return (
        <>
            <IconButton
                name="mermaid-theme"
                size="sm"
                title={lightMode ? "Switch to Dark Theme" : "Switch to Light Theme"}
                onClick={model.toggleLightMode}
                icon={lightMode ? <MoonIcon /> : <SunIcon />}
            />
            <IconButton
                name="mermaid-open-draw"
                size="sm"
                title="Open in Drawing Editor"
                disabled={!svgUrl}
                onClick={onOpenDraw}
                icon={<DrawIcon />}
            />
            <IconButton
                name="mermaid-copy"
                size="sm"
                title="Copy Image to Clipboard (Ctrl+C)"
                onClick={() => imageRef.current?.copyToClipboard()}
                disabled={!svgUrl}
                icon={<CopyIcon />}
            />
        </>
    );
}

function MermaidEditorView({ model }: { model: V4EditorModel }) {
    const mermaid = model as MermaidEditor;
    // MR2 — view-local imageRef bridges the BaseImageView imperative handle
    // to the toolbar's copy button (mirrors SV2 from Svg). Held by the view
    // (NOT the editor) because it's a purely view-side imperative concern.
    const imageRef = useRef<BaseImageViewRef | null>(null);
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<MermaidToolbarBits model={mermaid} imageRef={imageRef} />}
        >
            <MermaidBody
                model={mermaid}
                imageRefSetter={(r) => {
                    imageRef.current = r;
                }}
            />
        </TextChrome>
    );
}

export const mermaidModule: EditorModule = {
    createEditor: () =>
        new MermaidEditor(new TComponentState({ ...defaultMermaidEditorState })),
    Component: MermaidEditorView,
};

export { MermaidEditor, defaultMermaidEditorState };
export type { MermaidEditorState, MermaidQueueEvent } from "./MermaidEditor";
```

### Step 4 — DO NOT delete `MermaidView.tsx` / `MermaidViewModel.ts`

Per MR1 — the legacy files stay alive for notebook embedding. Today's `index.ts` (re-exports `MermaidView` / `MermaidViewProps`) is replaced by `index.tsx` (new surface above). The `index.ts` file is DELETED only because `index.tsx` supersedes it.

This means:
- `MermaidView.tsx` continues to exist, continues to import `MermaidViewModel`, continues to use `useContentViewModel`, continues to render the portal + Panel + Spinner + BaseImageView. Page-level open-file flow won't reach it (the v4 path wraps via `wrapLegacyForPage`), but notebook per-note dispatch will via `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor`.
- `MermaidViewModel.ts` continues to exist for `NoteItemEditModel.acquireViewModel("mermaid-view")` calls.
- `render-mermaid.ts` continues to exist — consumed by both the new `MermaidEditor.renderDebounced` AND `markdown/MarkdownBlock.tsx` (inline diagrams) AND `log-view/items/MermaidOutputView.tsx` (log entries) AND the preserved `MermaidViewModel.ts`.

### Step 5 — Update `src/renderer/api/pages/PagesLifecycleModel.ts`

Two changes (mirrors US-561):

**Change 1** — add Mermaid branch in `wrapLegacyForPage` after the Html branch (~line 153):

```typescript
// EPIC-028 / US-562 — Mermaid migrated to native v4 module. Construct
// MermaidEditor over the legacy TextFileModel host. The initial
// renderDebounced() call kicks off inside adoptHost (mirrors today's
// MermaidViewModel.onInit → renderDebounced behavior).
if (isTextFile && targetEditorId === "mermaid-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const mermaid = new MermaidEditor(
        new TComponentState({ ...defaultMermaidEditorState, id }),
    );
    mermaid.adoptHost(legacy as TextFileModel);
    return mermaid;
}
```

**Change 2** — add import after the Html import on line 18:

```typescript
import { MermaidEditor, defaultMermaidEditorState } from "../../editors/mermaid";
```

### Step 6 — Update `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts`

Flip from wrapping `MermaidViewModel` to wrapping `MermaidEditor`.

```typescript
import type { MermaidEditor } from "../../editors/mermaid";

/**
 * Safe facade around MermaidEditor for script access.
 * Implements the IMermaidEditor interface from api/types/mermaid-editor.d.ts.
 *
 * - svgUrl is the rendered SVG as a data URL (recomputed by the editor's
 *   400 ms debounced render pipeline on host content / lightMode change).
 * - loading/error indicate rendering state.
 * - All reads sync.
 */
export class MermaidEditorFacade {
    constructor(private readonly editor: MermaidEditor) {}

    get svgUrl(): string {
        return this.editor.state.get().svgUrl;
    }

    get loading(): boolean {
        return this.editor.state.get().loading;
    }

    get error(): string {
        return this.editor.state.get().error;
    }
}
```

### Step 7 — Update `src/renderer/scripting/api-wrapper/PageWrapper.ts`

Flip `asMermaid(force?: boolean)` to consume `MermaidEditor` directly (lines 17, 268–277).

```typescript
// at the top (~line 17):
// remove: import type { MermaidViewModel } from "../../editors/mermaid/MermaidViewModel";
import { MermaidEditor } from "../../editors/mermaid";

// at line ~268:
async asMermaid(force = false): Promise<MermaidEditorFacade> {
    await this.ensureEditor("mermaid-view", "Mermaid", "asMermaid", force);
    // EPIC-028 / US-562 — Mermaid is v4-native. After ensureEditor, the
    // page's mainEditorV4 IS a MermaidEditor; the facade wraps it directly.
    // No acquireViewModel round-trip.
    const v4 = this.v4;
    if (!(v4 instanceof MermaidEditor)) {
        throw new Error("asMermaid(): page is not a MermaidEditor after switch");
    }
    return new MermaidEditorFacade(v4);
}
```

Removes `model.acquireViewModel("mermaid-view")` + `releaseList.push(() => model.releaseViewModel("mermaid-view"))` — mirrors the `asSvg` / `asHtml` / `asMarkdown` pattern.

### Step 8 — Update `src/renderer/editors/register-editors.ts`

Three changes (mirrors US-561):

**Change 1** — keep the legacy `mermaid-view` `loadModule` AS-IS (eager imports of `MermaidView` + `MermaidViewModel`). Add a comment to document why (parallel to the Html comment block at lines ~333–342):

```typescript
// Mermaid diagram preview (content-view for .mmd files)
editorRegistry.register({
    id: "mermaid-view",
    name: "Mermaid",
    editorType: "textFile",
    category: "content-view",
    validForLanguage: (languageId) => languageId === "mermaid",
    switchOption: (languageId) => {
        if (languageId !== "mermaid") return -1;
        return 10;
    },
    loadModule: async () => {
        // EPIC-028 / US-562 — Mermaid migrated to native v4 module
        // (`mermaidModule` in `./mermaid/index.tsx`). Legacy MermaidView +
        // MermaidViewModel are PRESERVED here because notebook per-note
        // dispatch (`NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`)
        // still consumes them. Page-level pages take the v4 path via
        // `wrapLegacyForPage`. Full retirement in US-557 (Notebook) / US-559.
        const [module, { createMermaidViewModel }] = await Promise.all([
            import("./mermaid/MermaidView"),
            import("./mermaid/MermaidViewModel"),
        ]);
        return {
            Editor: module.MermaidView,
            createViewModel: createMermaidViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});
```

**Change 2** — drop `"mermaid-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 738):

```typescript
const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules.
    // log-view removed — US-553 ships native v4 module.
    // md-view removed — US-554 ships native v4 module.
    // svg-view removed — US-560 ships native v4 module.
    // html-view removed — US-561 ships native v4 module.
    // mermaid-view removed — US-562 ships native v4 module.
    "notebook-view",
    "todo-view",
    "link-view",
    "rest-client",
    "graph-view",
    "draw-view",
]);
```

**Change 3** — append the native v4 registration override after the US-561 block (~line 986):

```typescript
// US-562 — replace the legacy bare-adapter mirror for mermaid-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` to avoid
// duplicating extension/language rules.
v4EditorRegistry.register({
    id: "mermaid-view",
    name: "Mermaid",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("mermaid-view");
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
        const { mermaidModule } = await import("./mermaid");
        return mermaidModule;
    },
});
```

### Step 9 — Delete `src/renderer/editors/mermaid/index.ts`

After step 3 there is `index.tsx` with the new surface. Today's `index.ts` only re-exports `MermaidView` + `MermaidViewProps`; those names are still importable directly from `./MermaidView.tsx` for the notebook embedding path (the legacy `loadModule` uses `import("./mermaid/MermaidView")` directly — verified in step 8 change 1). Delete it cleanly.

Before deleting, confirm with grep that nothing outside the mermaid folder imports from `./mermaid/index`:

```powershell
Grep "from.*editors/mermaid['\"]" src\
Grep "from.*editors/mermaid/index['\"]" src\
```

These should return no hits (or only hits inside the mermaid folder itself — and the new ones added by this task in `MermaidEditor.ts`, `MermaidBody.tsx`, `index.tsx` are all relative imports `./MermaidEditor`, `./MermaidBody`, `./render-mermaid`, not `./index`).

### Step 10 — Files that need NO changes

To save investigation time during implementation, these are confirmed unaffected:

- `src/renderer/editors/mermaid/MermaidView.tsx` — preserved verbatim for notebook embedding (MR1).
- `src/renderer/editors/mermaid/MermaidViewModel.ts` — preserved verbatim for notebook embedding (MR1).
- `src/renderer/editors/mermaid/render-mermaid.ts` — shared by multiple consumers (markdown inline, log-view items, both editor paths). No change.
- `src/renderer/api/types/mermaid-editor.d.ts` — `IMermaidEditor` interface (three sync readonly getters). Facade shape preserved. No change.
- `src/renderer/api/types/common.d.ts` — `EditorView` union still contains `"mermaid-view"`. No change.
- `src/shared/types.ts` — same union, no change.
- `src/renderer/scripting/api-wrapper/Mermaid.ts:38` — `pagesModel.addEditorPage("mermaid-view", ...)` from `ui.show.mermaid().openInEditor()`. Editor id unchanged; flows through new `wrapLegacyForPage` Mermaid branch.
- `src/renderer/editors/markdown/CodeBlock.tsx:117` — inline mermaid code-block "Open in Editor" action. Same path.
- `src/renderer/editors/log-view/items/MermaidOutputView.tsx:76` — log-entry "Open in editor" action. Same path.
- `src/main/mcp-http-server.ts:158, 345` — MCP tool description string literals. Editor id unchanged.
- `src/renderer/api/pages/PagesPersistenceModel.ts` — shape-based discriminator `d.host !== undefined` (US-561 fix) auto-includes Mermaid descriptors. No edit needed.
- `src/renderer/api/pages/PageModel.ts` — already supports v4-native main editors.
- `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` — dispatches via `editorRegistry.getById(editor).loadModule()` for non-monaco editors. The legacy `mermaid-view` `loadModule` stays populated → no change needed.
- `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` — `acquireViewModel("mermaid-view")` reaches the legacy `createMermaidViewModel` via the preserved `loadModule`. No change.
- `src/renderer/editors/base/v4/LegacyEditorAdapter.ts:151` — comment listing example content-view ids. Cosmetic only; leave alone.

## Concerns / open questions

### MR1 — Notebook per-note Mermaid dispatch (the US-554 / US-560 / US-561 lesson, applied upfront)

**Context:** US-554 originally collapsed `md-view`'s legacy `loadModule` to `return textEditorModule`, mirroring the US-552 / US-553 pattern. This crashed the app on session restore when any notebook contained a markdown-typed note, because `NoteItemActiveEditor.tsx` mounts `<EditorModule.Editor model={model} />` from the legacy registry's `loadModule()` result, and the lazy `require()` in `textEditorModule.get Editor()` failed at runtime (Vite/Electron CJS resolver doesn't know about `.tsx`). The fix preserved `MarkdownView.tsx` + `MarkdownViewModel.ts` and reverted the legacy `loadModule` to keep eager `Promise.all([import(view), import(view-model)])`. US-560 (Svg) and US-561 (Html) applied the same lesson up front.

**Same scenario applies to Mermaid.** A user can have a Mermaid-typed note inside a notebook (`note.content.editor = "mermaid-view"`). If we collapse the legacy `loadModule`, the notebook page renderer crashes on first display.

**Resolution:** apply the US-554 / US-560 / US-561 retrospective up front. Keep `MermaidView.tsx` + `MermaidViewModel.ts` alive as parallel implementation; keep the legacy `loadModule` returning the eager Promise.all imports; register the v4 native module separately. Page-level pages take the v4 path; notebook-embedded notes take the legacy path. Both coexist until US-557 migrates Notebook (which will retire the per-note content-view dispatch).

No design decision needed — pattern locked in by US-554's fix and US-560 / US-561's preemptive applications. Step 8 Change 1 documents this in a code comment so future maintainers don't try to collapse the loader.

**Verification during implementation:** after applying the change, manually create a notebook with a Mermaid note (note content: a valid mermaid diagram), save and reload the app — the notebook page should display the rendered diagram without errors.

### MR2 — BaseImageView ref bridge (mirror of SV2 from Svg)

**Context:** today's `MermaidView.tsx:27` holds an `imageRef = useRef<BaseImageViewRef>(null)`; the portal toolbar's copy button reads `imageRef.current?.copyToClipboard()`. Same shape as Svg, just three buttons instead of two.

US-560 / SV2 chose **view-local imageRef bridge** over either (i) editor-owned ref or (ii) queue.execute round-trip. The same reasoning carries: BaseImageView's imperative `copyToClipboard` is a pure DOM concern; no model/facade consumer; no script API exposure.

**Resolution:** mirror SV2 directly. `index.tsx` holds `useRef<BaseImageViewRef | null>(null)`; passes a callback prop to `MermaidBody` (`imageRefSetter`); passes the same ref to `<MermaidToolbarBits>`. Identical shape to Svg.

### MR3 — Initial render kickoff in `adoptHost` — explicit call vs. content-subscribe firing

**Context:** today's `MermaidViewModel.onInit()` calls `this.renderDebounced()` at the end (after setting initial `lightMode` and subscribing to own-state-change). This kicks off the first render against the freshly-loaded host content.

After SF2, the natural triggers are the two slice-subscribes set up in `adoptHost`:
- `host.state.subscribe(renderDebounced, s => s.content)` — fires on host content change.
- `editor.state.subscribe(renderDebounced, s => s.lightMode)` — fires on lightMode change.

Question: does the content-subscribe fire on the **first** subscription, or only on subsequent changes? Three candidates:

(a) **Always include an explicit `this.renderDebounced()` kickoff at the end of `adoptHost`** — defensive; works regardless of TOneState semantics. Mirrors today's `onInit` final call.

(b) **Rely on the content-subscribe firing** — depends on whether `state.subscribe(cb, selector)` invokes `cb` immediately with current value, or only on subsequent value changes.

(c) **Set `loading: true` in default state + initial state read in render** — bypass the issue by having the first render kicked off by React's first mount.

**Resolution (a)** — explicit kickoff. Reasons:
1. **Defensive matches today's behavior.** Today's `MermaidViewModel.onInit` ends with `this.renderDebounced()`; the migration should mirror this so nothing breaks on first-open.
2. **TOneState semantics:** `subscribe(cb, selector)` does NOT fire immediately on subscribe — it fires on subsequent `state.update` calls where the selector value changes. So relying on the subscribe alone would leave the first render dependent on a content change that may not happen if content is already loaded.
3. **Idempotent**: `renderDebounced` clears its prior timer; calling it once explicitly + once via the slice-subscribe on first content arrival would coalesce safely. But option (b)'s subscribe-on-first-fire isn't the contract, so the explicit kickoff is both necessary and idempotent.

Step 1's `adoptHost` ends with `this.renderDebounced();`. Confirmed.

### MR4 — `loading: true` default in `defaultMermaidEditorState`

**Context:** today's `defaultMermaidViewState = { svgUrl: "", error: "", loading: true, lightMode: false }`. `loading: true` is the initial state so the view shows the spinner immediately before the 400 ms timer fires + the async render completes.

For the v4 editor, `defaultMermaidEditorState` is consumed by `createEditor()` (fresh page) AND by `wrapLegacyForPage`'s spread (open-file). Both paths immediately call `adoptHost` which kicks `renderDebounced` (per MR3) — which sets `loading: true` again on its first line. So the default value mostly doesn't matter; setting it to `true` matches today's "render in progress" initial visual.

**Resolution:** default `loading: true`. Trivial. Step 1 confirms.

### MR5 — `lightMode` constructor seed vs. `defaultMermaidEditorState`

**Context:** today's `MermaidViewModel.onInit` sets `state.lightMode = !isCurrentThemeDark()` AFTER super-construction (super sets it to the default `false`). This means the initial state is briefly `false` before being overridden.

For v4, two candidates:

(a) **Default to `false` in `defaultMermaidEditorState`; override in `MermaidEditor` constructor with `this.state.update((s) => { s.lightMode = !isCurrentThemeDark(); })`** — mirrors today's order-of-operations. The state.update fires synchronously on construct (before any subscriber is attached) so there's no flicker.

(b) **Compute the default lazily inside `defaultMermaidEditorState` factory** — turn it into a function `getDefaultMermaidEditorState()` that reads theme at call time. Spread call sites become `{ ...getDefaultMermaidEditorState(), id }`.

(c) **Read theme at field-default time** — `defaultMermaidEditorState = { ..., lightMode: !isCurrentThemeDark() }`. Module-level eval. Captures theme at module-load time (potentially before theme is initialized).

**Resolution (a)** — constructor seed. Reasons:
1. **Mirrors today's exact behavior** — same timing (post-super, pre-subscriber-attach).
2. **`defaultMermaidEditorState` stays a stable JSON-like literal** — symmetric with sibling editors (defaultSvgEditorState, defaultHtmlEditorState).
3. **HS1 override mechanism** — `adoptHost` reads `host.getEditorState("mermaid-view")` and overrides `lightMode` if the slot exists. The constructor seed is the "no slot yet, fall back to theme" default. Clean separation.

Rejected (b) — adds a factory pattern just for one field; sibling editors don't use it. Rejected (c) — module-load timing risk; theme isn't guaranteed ready at editor module load.

Step 1 confirms.

### MR6 — Editor-switch then immediate switch-back: does `lightMode` survive?

**Context:** scenario: user has a `.mmd` file open in MermaidEditor, toggles lightMode to true (override of theme), switches to Monaco to edit the source, then switches back to Mermaid.

**Without HS1:** the MermaidEditor is destroyed on switch-out; on switch-back a fresh MermaidEditor is constructed with `lightMode = !isCurrentThemeDark()` (the theme-derived default). The user's override is lost.

**With HS1 (this task):** `adoptHost` writes `host.setEditorState("mermaid-view", { lightMode: true })` on every toggle (via the `_settingsUnsub` mirror). On switch-back, the new MermaidEditor's `adoptHost` reads `host.getEditorState("mermaid-view")` and applies `lightMode: true` from the slot. User override preserved.

**Verification:** this is the HS1 contract. Already proven for Markdown's `compactMode` in US-554. Same mechanism.

**Resolution:** HS1 mirror set up in `adoptHost` per step 1. No design ambiguity.

**Edge case — switch to Monaco and back twice in rapid succession:** the slot write is sync (`setEditorState` updates host.state in-place); the slot read is sync (`getEditorState` reads from host.state); no race.

### MR7 — Open-draw button title preservation (regression risk)

**Context:** today's `MermaidView.tsx:63`:
```typescript
const title = model.state.get().title.replace(/\.\w+$/, "") + ".excalidraw";
```
where `model` is the `TextFileModel` host. So the title is sourced from the host (where `.mmd` extension lives), stripped, and suffixed with `.excalidraw`.

After migration the toolbar bits live in `index.tsx` and read `model.host.state.get().title` (where `model` is the `MermaidEditor`). Same value. The migration code in step 3 reads from `model.host`:

```typescript
const host = model.host;
const title = (host?.state.get().title ?? "Mermaid").replace(/\.\w+$/, "") + ".excalidraw";
```

Title preserved. The `?? "Mermaid"` fallback handles the case where `host` is null between switches (vanishing edge case but cheap insurance).

**Resolution:** confirmed. Step 3's toolbar bits inline this code with the same shape as today.

### MR8 — No `addEditorPage` callers break — they all use the editor id

**Context:** three external sites call `pagesModel.addEditorPage("mermaid-view", "mermaid", title, content)`:
1. `scripting/api-wrapper/Mermaid.ts:38` — `ui.show.mermaid().openInEditor()`
2. `editors/markdown/CodeBlock.tsx:117` — inline mermaid diagram "Open in Editor"
3. `editors/log-view/items/MermaidOutputView.tsx:76` — log-entry mermaid "Open in editor"

`addEditorPage` ultimately constructs a `TextFileModel` with `state.editor = "mermaid-view"` and routes through `wrapLegacyForPage`. The new Mermaid branch (step 5) handles the promotion → MermaidEditor with the freshly-set host.

**Resolution:** no changes to the callers. The editor id is preserved across the migration. After step 5, all three flows produce native MermaidEditor pages.

**Verification during implementation:**
- From the script API: `ui.show.mermaid({ text: "graph TD; A-->B;" }).openInEditor()` → new MermaidEditor page renders the diagram.
- From inline markdown: open a `.md` file containing ```` ```mermaid ```` block; click the "Open in Editor" button on the inline render; new MermaidEditor page renders the diagram.
- From log-view: drive a script that posts a Mermaid log entry via `ui.show.mermaid(...)`; click the "Open in editor" button on the entry; new MermaidEditor page renders.

### MR9 — Queue event union — `focus` only (same as siblings)

**Context:** PV8 from the walkthrough mandates all four preview editors get `{ type: "focus" }` queue events for `<TextChrome>`'s TC8 200 ms root-focus subscription.

For Mermaid: the `BaseImageView` takes keyboard focus on click via its own tabIndex={0} root; the user's keyboard zoom (+/-/0/Ctrl+C) flows into the image view via its onKeyDown handler.

**Resolution:** mirror the siblings. `type MermaidQueueEvent = { type: "focus" }`; `type MermaidQueueRequest = never`. The body's `model.typedQueue.use(() => {})` is a no-op subscriber for queue lifecycle hygiene (so the event doesn't pile up). Step 1 + step 2 confirm.

### MR10 — Render error path UX: same as today (text in a Panel)

**Context:** today's `MermaidView.tsx:79–82`:
```typescript
{error && (
    <Panel flex align="center" justify="center" padding="xxxl">
        <Text color="warning" preWrap>{error}</Text>
    </Panel>
)}
```

The error block renders **alongside** the spinner / SVG, not exclusively. So a render error from a previous content state remains visible while a new render is in progress (loading spinner appears in the overlay layer). On successful re-render, `error` is reset to `""` in the success path; on failed re-render, `error` is overwritten.

**Migration:** preserve the same layered UX byte-for-byte in `MermaidBody.tsx`. Step 2's body renders error + loading-overlay + (loading-full-bg OR svgUrl) in the same Panel positions.

**Resolution:** no design ambiguity. Step 2 confirms.

## Acceptance criteria

1. **App still opens Mermaid files end-to-end:**
   - Open a `.mmd` file from file explorer → renders in the new `MermaidEditor` (verify via DevTools: page's `mainEditorV4` is `MermaidEditor`, not `LegacyEditorAdapter`).
   - Edit raw mermaid in Monaco → switch to Mermaid Preview via the switch widget → preview reflects updated content after 400 ms debounce (host transfer via `CONTENT_HOST_TRAIT`).
   - Restart app → file reopens via the v4 native path. After restore, the diagram re-renders.

2. **Async render pipeline works as today:**
   - Type new content into the Monaco editor backing a Mermaid page (via switch back to Monaco, edit, switch back to Mermaid) — the diagram re-renders after 400 ms.
   - Toggle the theme button — the diagram re-renders with light/dark colors swapped.
   - Render errors (e.g., invalid mermaid syntax) display the warning text in the body Panel; valid content clears the error.
   - Loading spinner shows during the 400 ms debounce + async render window.

3. **`lightMode` persists across editor switches AND app restarts (HS1):**
   - Open a `.mmd` file → toggle lightMode → switch to Monaco → switch back to Mermaid: lightMode preserved (HS1 host-slot survives switch).
   - Toggle lightMode → restart app → file reopens: lightMode preserved (HS1 slot rides host descriptor in `openFiles0.json`).
   - Fresh `.mmd` file (no prior slot) opens with `lightMode = !isCurrentThemeDark()` (theme-derived default).

4. **Toolbar renders correctly:**
   - Toolbar shows: NavPanel button (when file is on disk), Spacer, theme-toggle, open-draw, copy-image, switch widget.
   - Theme-toggle icon is sun in dark mode / moon in light mode (consistent with today's MermaidView).
   - Open-draw and copy buttons are disabled while loading / on render error (no svgUrl).
   - Switch widget lists `Monaco` + `Mermaid` for a mermaid host.

5. **Scripting facade `page.asMermaid()` works:**
   - From a Mermaid page: `const m = await page.asMermaid(); console.log(m.svgUrl.length > 0)` returns true (after the initial render completes).
   - From a non-Mermaid page: `await page.asMermaid(true)` switches the page if compatible (force flag — SF1).
   - `page.asMermaid(false)` (default) throws on non-Mermaid page.
   - Facade `loading` / `error` / `svgUrl` reflect editor state in real-time.

6. **Persistence round-trip:**
   - Open a `.mmd` file → restart app → file reopens at the same v4-native editor.
   - Pre-US-562 session data (legacy `editor: "mermaid-view"` + `type: "textFile"` descriptor) still loads via `wrapLegacyForPage` (v3 restore path).
   - Pre-US-562 sessions DO NOT have a `lightMode` slot — opening a pre-US-562-saved Mermaid page falls back to theme-derived default. User's next toggle persists.

7. **Notebook embedding still works (MR1 verification):**
   - Create a notebook page with a Mermaid-typed note (in-app: add a note, switch its editor to `mermaid-view`, paste a valid mermaid diagram, save the notebook).
   - Restart app → reload the notebook → the Mermaid note renders without console errors.
   - This is the critical test that bit US-554 retrospectively; running it during US-562 implementation prevents the regression.

8. **`addEditorPage("mermaid-view", ...)` callers all work (MR8):**
   - `ui.show.mermaid({ text: "graph TD; A-->B;" }).openInEditor()` → new MermaidEditor page renders the diagram.
   - Inline mermaid block in a markdown file: click "Open in Editor" on the rendered diagram → new MermaidEditor page renders.
   - Log-view mermaid output: click "Open in editor" on the entry → new MermaidEditor page renders.

9. **No regression in rendering quality:**
   - Dark-mode contrast fix (`fixTextContrast` in `render-mermaid.ts`) still applies when `lightMode = false`.
   - Background color injection (`svgToDataUrl(svg, "white", ...)`) still applies in light mode.
   - Inline diagrams in markdown still render (markdown/MarkdownBlock.tsx path is independent).
   - Log-view mermaid entries still render (log-view/items/MermaidOutputView.tsx path is independent).

10. **Cleanup verified:**
    - `Grep "acquireViewModel.*mermaid-view"` returns hits only in `NoteItemEditModel.ts` and `note-editor` flow (legacy path) — not in `PageWrapper.ts`.
    - `Grep "useContentViewModel.*mermaid-view"` returns hits only in `MermaidView.tsx` (legacy file preserved per MR1).
    - `src/renderer/editors/mermaid/index.ts` is deleted; `src/renderer/editors/mermaid/index.tsx` exists with the new surface.
    - `MermaidView.tsx` + `MermaidViewModel.ts` + `render-mermaid.ts` exist unchanged.
    - TypeScript + ESLint pass with zero new errors in touched files.

## Files changed summary

### New files

| File | Purpose |
|------|---------|
| `src/renderer/editors/mermaid/MermaidEditor.ts` | Native v4 `MermaidEditor` class — state with HS1-mirrored `lightMode` + view-derived `svgUrl/error/loading`; trait wiring; three-phase lifecycle; host adoption with four subscriptions; async `renderDebounced` pipeline; `toggleLightMode` action. ~270 LOC. |
| `src/renderer/editors/mermaid/MermaidBody.tsx` | Body view — reads `state.use({svgUrl, error, loading})` reactively; renders Panel + error + loading overlay + `BaseImageView` with `imageRefSetter` callback. ~55 LOC. |
| `src/renderer/editors/mermaid/index.tsx` | Module shell — `MermaidEditorView` (`<TextChrome>` + `<MermaidToolbarBits>` (3 buttons) + `<MermaidBody>` + view-local `imageRef`), `mermaidModule` export, class re-export. Replaces today's `index.ts`. ~75 LOC. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `if (isTextFile && targetEditorId === "mermaid-view")` branch in `wrapLegacyForPage` after the Html branch; add import of `MermaidEditor` + `defaultMermaidEditorState`. |
| `src/renderer/editors/register-editors.ts` | Keep legacy `mermaid-view` `loadModule` (eager imports preserved for notebook); drop `"mermaid-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; append v4 native registration; add comment documenting MR1 rationale. |
| `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts` | Wrap `MermaidEditor` instead of `MermaidViewModel`; getters read `editor.state.get().X` instead of `vm.state.get().X` (one-symbol rename). |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | `asMermaid` flips to `instanceof MermaidEditor`; drop `acquireViewModel("mermaid-view")` + `releaseList` push; remove the `MermaidViewModel` type-import; add `MermaidEditor` value-import. |

### Deleted files

| File | Reason |
|------|--------|
| `src/renderer/editors/mermaid/index.ts` | Replaced by `index.tsx` (different re-export surface; new `mermaidModule` + class exports). Notebook embedding path imports `./MermaidView` directly via the legacy `loadModule`'s `Promise.all`. |

### Preserved files (intentional — MR1)

| File | Rationale |
|------|-----------|
| `src/renderer/editors/mermaid/MermaidView.tsx` | Consumed by `NoteItemActiveEditor` → `AsyncEditor` → legacy `module.Editor` for Mermaid-typed notebook notes. Removed by US-557 once Notebook migrates. |
| `src/renderer/editors/mermaid/MermaidViewModel.ts` | Consumed by `NoteItemEditModel.acquireViewModel("mermaid-view")` for Mermaid-typed notebook notes. Removed by US-557. |
| `src/renderer/editors/mermaid/render-mermaid.ts` | Shared between the new `MermaidEditor.renderDebounced` AND the preserved `MermaidViewModel` AND `markdown/MarkdownBlock.tsx` (inline diagrams) AND `log-view/items/MermaidOutputView.tsx` (log entries). Never goes away. |

### Unchanged files

| File | Notes |
|------|-------|
| `src/renderer/api/types/mermaid-editor.d.ts` | Facade interface — shape preserved (sync `svgUrl/loading/error` getters). |
| `src/renderer/api/types/common.d.ts` | `EditorView` union — `"mermaid-view"` retained. |
| `src/renderer/api/pages/PageModel.ts` | Already supports v4-native main editors. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Shape-based discriminator `d.host !== undefined` (US-561 fix) auto-includes Mermaid descriptors. |
| `src/shared/types.ts` | `EditorView` union — `"mermaid-view"` retained. |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | Per-note dispatch reaches legacy `module.Editor` via the preserved `loadModule`. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | `acquireViewModel("mermaid-view")` reaches legacy `createMermaidViewModel` via the preserved `loadModule`. |
| `src/renderer/scripting/api-wrapper/Mermaid.ts` | `pagesModel.addEditorPage("mermaid-view", ...)` — editor id unchanged. |
| `src/renderer/editors/markdown/CodeBlock.tsx` | `pagesModel.addEditorPage("mermaid-view", ...)` — editor id unchanged. |
| `src/renderer/editors/log-view/items/MermaidOutputView.tsx` | `pagesModel.addEditorPage("mermaid-view", ...)` — editor id unchanged. |
| `src/main/mcp-http-server.ts` | String literals `"mermaid-view"` in tool descriptions — editor id unchanged. |
| `src/renderer/editors/base/v4/LegacyEditorAdapter.ts` | Comment listing example content-view ids — cosmetic only. |
