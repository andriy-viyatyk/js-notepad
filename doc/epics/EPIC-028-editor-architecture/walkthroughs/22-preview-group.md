# Preview group walkthrough — Markdown / Svg / Html / Mermaid

> **Status:** Done 2026-05-20. Second non-Monaco exercise of the Tier 5 template — confirms the template holds on light editors. All ten concerns (PV1–PV10) RESOLVED. **Zero mockup changes** — four sibling editors (Markdown, Svg, Html, Mermaid) covered in one walkthrough; three of four have near-empty state slices (Svg / Html state literally equals `EditorStateBase`).

Walkthrough 22 finalizes four sibling `EditorModel` subclasses: `MarkdownEditor`, `SvgEditor`, `HtmlEditor`, `MermaidEditor`. All four are content-views over `TextFileModel`: each reads `host.state.content`, renders a preview, and stays mostly stateless. Markdown carries search + compact-mode + scroll machinery; Mermaid carries an async render pipeline with `lightMode` toggle; Svg and Html are near-empty. The group exists to **stress-test the Tier 5 template on light editors** — three of four have an almost-empty editor state slice, and the walkthrough 20 / 21 template still has to read cleanly.

---

## State today

Four sibling folders under `src/renderer/editors/`, each with the same three-file shape:

| Folder | Files | Today's ViewModel state |
|--------|-------|------------------------|
| `markdown/` | `MarkdownViewModel.ts`, `MarkdownView.tsx`, `MarkdownBlock.tsx`, `CodeBlock.tsx`, `rehypeHighlight.ts`, `index.ts` | `{ container, compactMode, searchVisible, searchText, currentMatchIndex, totalMatches }` + plain field `containerScrollTop` |
| `svg/` | `SvgViewModel.ts`, `SvgView.tsx`, `index.ts` | `{}` — empty |
| `html/` | `HtmlViewModel.ts`, `HtmlView.tsx`, `index.ts` | `{}` — empty |
| `mermaid/` | `MermaidViewModel.ts`, `MermaidView.tsx`, `render-mermaid.ts`, `index.ts` | `{ svgUrl, error, loading, lightMode }` + private `_renderTimer` |

### Today's per-editor surface

- **Variant discriminator** — none. Each editor has a single registry id (`md-view` / `svg-view` / `html-view` / `mermaid-view`). No GR1 / GR2-style format multiplexing.
- **Cache files** — none. ViewModels don't write per-editor cache files today (no `<id>-md-view.json` etc.); transient state dies with the view-model on unmount, restoration is implicit (state defaults reset on re-mount).
- **Imperative view refs** — Markdown holds a `MarkdownBlockHandle` (`scrollToMatch(i)`, `totalMatches`); Svg / Mermaid hold a `BaseImageViewRef` (`copyToClipboard()`); Html has none. All view-local — peeked by the view only, not by the model.
- **Portal refs** (`editorToolbarRefLast`) — Markdown contributes compact-toggle; Svg contributes open-draw + copy; Html contributes nothing; Mermaid contributes theme + open-draw + copy. Relocated to React composition per C8 / walkthroughs 09–10.
- **`useContentViewModel(model, editorId)`** — ref-counted acquire/release machinery — retires entirely under SF2.
- **`pagesModel.onFocus` subscription** — only Markdown uses it (scroll restore). Svg / Html / Mermaid don't.
- **Async render pipeline** — only Mermaid. 400ms debounced `renderDebounced` calls `renderMermaid(content, lightMode)` → data URL. Re-fires on host content change or `lightMode` toggle.
- **Light mode init** — Mermaid reads `isCurrentThemeDark()` once at `onInit` to set initial `lightMode`. Not persisted.
- **Search machinery** — only Markdown. ViewModel holds `searchText` / `searchVisible` / `currentMatchIndex` / `totalMatches`; `MarkdownBlock` does the DOM-level match-counting + scroll-to-match via imperative handle. View bridges via `onMatchCountChange` callback.

### Today's ViewModel shape

All four ViewModels extend `ContentViewModel<TViewState>`:
- Constructor: `super(host, defaultState)`.
- `onInit()`: Markdown subscribes `pagesModel.onFocus`; Mermaid initializes lightMode + watches own state for lightMode-changes + starts the initial render; Svg / Html have empty `onInit`.
- `onContentChanged()`: Mermaid re-renders (`renderDebounced`); the other three are no-op (their views read `model.state.use((s) => s.content)` directly).
- `onDispose()`: Mermaid clears `_renderTimer`; the other three inherit the no-op default.

### Facade reads today

| Facade | Reads |
|--------|-------|
| `MarkdownEditorFacade` | `vm.state.get().container?.innerHTML` (DOM peek), `vm.state.get().container !== null` (mount check) |
| `SvgEditorFacade` | `vm.pageModel.state.get().content` (host content passthrough) |
| `HtmlEditorFacade` | `vm.pageModel.state.get().content` (host content passthrough) |
| `MermaidEditorFacade` | `vm.state.get().svgUrl` / `.loading` / `.error` (view-state reads) |

---

## State after refactor

Four sibling classes, each registered separately. `TextFileModel` stays the host across all four. Each class lands the eight-piece Tier 5 template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT).

The template body is mechanical enough at this point that the four classes share a near-identical skeleton — only the editor-specific state slice + view + (in Mermaid's case) async render plumbing differ. **PV1 considers whether to formalize that skeleton into a `PreviewEditorBase` or repeat it four times.**

### `MarkdownEditor` (richest of the four)

```typescript
class MarkdownEditor extends EditorModel<MarkdownEditorState, void, MarkdownQueueEvent> {
    readonly editorId = "md-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _containerRef: HTMLDivElement | null = null;  // PV9 — view setContainer

    constructor(state: TComponentState<MarkdownEditorState>) {
        super(state);
        this.traits.set(CONTENT_HOST_TRAIT, {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from MarkdownEditor");
                this._hostStateUnsub?.();
                this._hostStateUnsub = null;
                this._host = null;
                return host;
            },
        });
    }

    // ── Required base overrides ─────────────────────────────────────────

    get contentHost(): IContentHost | null { return this._host; }

    findCompatibleEditors(): string[] {
        return this._host ? editorRegistry.findEditorsAccepting(this._host) : [];
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        if (!this.page?.canOpenNavigator(this._host.pipe, filePath) && !filePath) return null;
        return { pipe: this._host.pipe, filePath };
    }

    // ── Persistence (PV2) ───────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            ...super.getRestoreData(),
            state: {
                id: s.id,
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
                compactMode: s.compactMode,
                // Search transient — view-derived (PV2). Stripped per MO5 pattern.
            },
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<MarkdownEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
            if (data.compactMode !== undefined) cur.compactMode = data.compactMode;
        });
        if (data.host) {
            this._pendingHost = data.host;
        }
    }

    // ── Three-phase lifecycle ───────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) throw new Error(`Cannot switchFrom ${oldEditor.editorId}: no CONTENT_HOST_TRAIT`);
        const host = trait.extractContentHost();
        if (!(host instanceof TextFileModel)) {
            throw new Error(`Cannot switchFrom: host is not a TextFileModel`);
        }
        this.state.update((s) => { s.id = oldEditor.id; });
        host.setStorage(this.stateStorage);
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : new TextFileModel();
                this._host.setStorage(this.stateStorage);
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Markdown editor.", "error");
            this._host = new TextFileModel();
            this._host.setStorage(this.stateStorage);
            this.adoptHost(this._host);
        }
    }

    private adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send());
        const { filePath, title } = host.state.get() as any;
        if (title || filePath) {
            this.state.update((s) => {
                s.title = title ?? (filePath ? fpBasename(filePath) : "");
            });
        }
    }

    // ── View-driven setters ─────────────────────────────────────────────

    setContainer = (el: HTMLDivElement | null): void => {
        this._containerRef = el;  // PV9 — non-state DOM ref for facade peek
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

    // ── Facade-only accessor ────────────────────────────────────────────

    get containerInnerHtml(): string {
        return this._containerRef?.innerHTML ?? "";
    }

    get viewMounted(): boolean {
        return this._containerRef !== null;
    }

    // ── Optional overrides ──────────────────────────────────────────────

    focus(): void { this.queue.send({ type: "focus" }); }

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

### `MermaidEditor` (async render pipeline)

```typescript
class MermaidEditor extends EditorModel<MermaidEditorState, void, MermaidQueueEvent> {
    readonly editorId = "mermaid-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _lightModeUnsub: (() => void) | null = null;
    private _renderTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(state: TComponentState<MermaidEditorState>) {
        super(state);
        this.traits.set(CONTENT_HOST_TRAIT, { /* same shape as MarkdownEditor */ });
    }

    get contentHost(): IContentHost | null { return this._host; }
    findCompatibleEditors(): string[] { /* same */ }
    getNavigatorTarget() { /* same */ }
    focus(): void { this.queue.send({ type: "focus" }); }

    // PV2 / PV5 — lightMode persists (PV5 / b); svgUrl/error/loading stripped (view-derived)

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            ...super.getRestoreData(),
            state: {
                id: s.id,
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
                lightMode: s.lightMode,
                // svgUrl / error / loading stripped — view-derived (MO5 pattern)
            },
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<MermaidEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
            if (data.lightMode !== undefined) cur.lightMode = data.lightMode;
        });
        if (data.host) this._pendingHost = data.host;
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : new TextFileModel();
                this._host.setStorage(this.stateStorage);
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
            this.renderDebounced();  // PV4 — initial render after host loads
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Mermaid editor.", "error");
            // ... fallback empty-host
        }
    }

    private adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._lightModeUnsub?.();
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send());
        // Content changes re-trigger the render.
        this._hostContentUnsub = host.state.subscribe(
            () => this.renderDebounced(),
            (s) => s.content,
        );
        // lightMode changes also re-trigger.
        this._lightModeUnsub = this.state.subscribe(
            () => this.renderDebounced(),
            (s) => s.lightMode,
        );
    }

    // ── Render pipeline (PV4 — moves from VM to editor) ─────────────────

    private renderDebounced(): void {
        clearTimeout(this._renderTimer);
        this.state.update((s) => { s.loading = true; });
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

    toggleLightMode = (): void => {
        this.state.update((s) => { s.lightMode = !s.lightMode; });
    };

    async dispose(): Promise<void> {
        clearTimeout(this._renderTimer);
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._lightModeUnsub?.();
        this._hostStateUnsub = this._hostContentUnsub = this._lightModeUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

### `SvgEditor` and `HtmlEditor` (near-empty)

```typescript
class SvgEditor extends EditorModel<SvgEditorState, void, SvgQueueEvent> {
    readonly editorId = "svg-view";
    // Identical skeleton: _host + _hostStateUnsub + trait + contentHost + findCompatible +
    // getNavigatorTarget + focus + switchFrom + restore + adoptHost + dispose +
    // getRestoreData (no extra state slice) + applyRestoreData (no extra state slice).
}

class HtmlEditor extends EditorModel<HtmlEditorState, void, HtmlQueueEvent> {
    readonly editorId = "html-view";
    // Same skeleton; no toolbar contributions (Html has no portal buttons today either).
}
```

### State slice shapes

```typescript
// Markdown — view-state-rich (PV2)
interface MarkdownEditorState extends EditorStateBase {
    compactMode: boolean;          // persisted
    // View-derived — ride state for reactivity, stripped from getRestoreData (PV3):
    searchVisible: boolean;
    searchText: string;
    currentMatchIndex: number;
    totalMatches: number;
}

// Mermaid — render-pipeline state (PV4 / PV5)
interface MermaidEditorState extends EditorStateBase {
    lightMode: boolean;            // persisted (PV5)
    // View-derived — stripped:
    svgUrl: string;
    error: string;
    loading: boolean;
}

// Svg / Html — identity only (PV6)
type SvgEditorState  = EditorStateBase;
type HtmlEditorState = EditorStateBase;
```

### Queue event unions (PV7)

```typescript
type MarkdownQueueEvent = { type: "focus" };
type MermaidQueueEvent  = { type: "focus" };
type SvgQueueEvent      = { type: "focus" };
type HtmlQueueEvent     = { type: "focus" };

// All four: queue request = never (no script-API view-context queries).
```

All four override the base `focus(): void` no-op (MO7) to send `{ type: "focus" }` onto the queue. Views' `model.queue.use((ev) => …)` handler grabs DOM focus on the root container (Markdown: scroll panel; Svg/Mermaid: BaseImageView root; Html: iframe).

---

## UI shape

Each preview editor's view composes `<TextChrome>` around its body — same shape as Grid (walkthrough 21):

```typescript
function MarkdownEditorView({ model }: { model: MarkdownEditor }) {
    return (
        <TextChrome
            model={model}
            toolbarContributions={<MarkdownToolbarBits model={model} />}
        >
            <MarkdownBody model={model} />
        </TextChrome>
    );
}

function MarkdownBody({ model }: { model: MarkdownEditor }) {
    const host = model.contentHost as TextFileModel | null;
    const blockRef = useRef<MarkdownBlockHandle>(null);
    const editorConfig = useEditorConfig();
    const pageState = model.state.use((s) => ({
        compactMode: s.compactMode,
        searchVisible: s.searchVisible,
        searchText: s.searchText,
        currentMatchIndex: s.currentMatchIndex,
        totalMatches: s.totalMatches,
    }));

    // PV8: focus event drain (chrome's MO7 root-focus → scroll panel)
    model.queue.use((ev) => {
        if (ev.type === "focus") scrollRef.current?.focus();
    });

    // PV3: scroll restore via pagesModel.onFocus — view-local
    const scrollTopRef = useRef(0);
    useEffect(() => {
        const sub = pagesModel.onFocus.subscribe((page) => {
            if (page === host?.page) {
                Promise.resolve().then(() => {
                    if (scrollRef.current) scrollRef.current.scrollTop = scrollTopRef.current;
                });
            }
        });
        return () => sub.unsubscribe();
    }, [host]);

    // ... search bridge, key handler, render
}
```

`SvgBody`, `HtmlBody`, `MermaidBody` follow the same skeleton — `host` peek + queue.use for focus, no scroll-restore (none of the three carry it today).

### `accepts()` (registry)

```typescript
// md-view:
accepts({ host, fileName, language, mode }): number {
    const peeked = host
        ? host.state.get().content
        : undefined;
    if ((language === "markdown") || (fileName && /\.(md|markdown)$/i.test(fileName))) {
        return 60;
    }
    return -1;
}

// svg-view:
accepts({ host, fileName, language, mode }): number {
    if (fileName && /\.svg$/i.test(fileName)) return 70;
    return -1;
}

// html-view:
accepts({ host, fileName, language, mode }): number {
    if (language === "html" || (fileName && /\.html?$/i.test(fileName))) return 60;
    return -1;
}

// mermaid-view:
accepts({ host, fileName, language, mode }): number {
    if (language === "mermaid" || (fileName && /\.mmd$/i.test(fileName))) return 70;
    return -1;
}
```

Mode-agnostic — preview editors stay accessible from both edit and view modes (PV8). Registry's `resolveForFile(_, _, mode)` applies the mode multiplier centrally per S5; per-editor `accepts` stays simple.

---

## Switch in / out

Identical mechanics to Grid (walkthrough 21):

- **Switch in via `switchFrom(oldEditor)`** — trait closure extracts host; id copied; storage rebound; `adoptHost` subscribes content + descriptorChanged forwarders. Mermaid additionally calls `renderDebounced()` after `adoptHost` to kick off the first render against the inherited content.
- **Switch out** — trait closure unsubscribes forwarders, returns host. Editor disposes; queue drains; host transfers intact.
- **No special re-detect on switch-in** — unlike Grid's CSV delimiter detection (GR7), preview editors have no variant bootstrap.

---

## Lifecycle hooks

| Hook | Markdown | Mermaid | Svg | Html |
|------|----------|---------|-----|------|
| `applyRestoreData` | ✅ — `compactMode` | ✅ — `lightMode` | ❌ inherit | ❌ inherit |
| `switchFrom` | ✅ same shape | ✅ same shape | ✅ same shape | ✅ same shape |
| `restore` | ✅ host load | ✅ host load + initial render | ✅ host load | ✅ host load |
| `saveState` | ✅ delegate host.io | same | same | same |
| `beforeNavigateAway` | ❌ inherit | ❌ inherit | ❌ inherit | ❌ inherit |
| `onMainEditorChanged` | ❌ inherit | ❌ inherit | ❌ inherit | ❌ inherit |
| `confirmRelease` | ✅ delegate host | same | same | same |
| `isFreshEmpty` | ❌ inherit (false) | same | same | same |
| `getNavigatorTarget` | ✅ — host's `{pipe, filePath}` | same | same | same |
| `hasTextSelection?` | ❌ inherit (undefined) | same | same | same |
| `findCompatibleEditors` | ✅ — `findEditorsAccepting(host)` | same | same | same |
| `getRestoreData` | ✅ — strip view-derived search fields | ✅ — strip svgUrl/error/loading | ❌ inherit | ❌ inherit |
| `getIcon` / `noLanguage` | ❌ inherit | ❌ inherit | ❌ inherit | ❌ inherit |
| `focus` | ✅ — send focus event | same | same | same |
| `dispose` | ✅ — unsubscribe + host dispose | ✅ — + clearTimeout(renderTimer) | same as Markdown | same as Markdown |

The pattern compresses to: every preview editor overrides `switchFrom` / `restore` / `saveState` / `findCompatibleEditors` / `getNavigatorTarget` / `focus` / `contentHost` / `dispose` identically; differences live in `getRestoreData` / `applyRestoreData` / extra editor-state slice. **PV1 considers whether this compression deserves a `PreviewEditorBase` abstraction.**

---

## Persistence

### `getRestoreData()` output (Markdown)

```typescript
{
    editorId: "md-view",
    id: "<uuid>",
    state: { title, modified, secondaryEditor, compactMode },
    host: {
        kind: "textFile",
        state: { id, content: "", language, filePath, modified, encoding, encrypted, temp },
        pipe: { provider, transformers, encoding },
    },
}
```

Payload: well under 1KB (a single `compactMode` boolean). Search state stripped per MO5.

### `getRestoreData()` output (Mermaid)

```typescript
{
    editorId: "mermaid-view",
    id: "<uuid>",
    state: { title, modified, secondaryEditor, lightMode },
    host: { kind: "textFile", state: ..., pipe: ... },
}
```

`svgUrl` (data URL, potentially large) / `loading` / `error` all stripped — `svgUrl` is re-derived on restore by `renderDebounced` after host content loads.

### `getRestoreData()` output (Svg / Html)

```typescript
{
    editorId: "svg-view",   // or "html-view"
    id: "<uuid>",
    state: { title, modified, secondaryEditor },
    host: { kind: "textFile", state: ..., pipe: ... },
}
```

Pure identity blob. No editor-specific state to persist.

### Migration from today's format

Per C2: no migration shim. Today's session data with `type: "textFile"` + `editor: "md-view"` (etc.) hits walkthrough 04 / P2's detect-and-start-empty path on first boot post-upgrade. No per-editor cache files to clean up — preview editors never wrote any.

---

## Scripting

### Facade shapes after refactor (PV10)

```typescript
class MarkdownEditorFacade {
    constructor(private readonly editor: MarkdownEditor) {}
    get viewMounted(): boolean { return this.editor.viewMounted; }
    get html(): string         { return this.editor.containerInnerHtml; }
}

class SvgEditorFacade {
    constructor(private readonly editor: SvgEditor) {}
    get svg(): string {
        return (this.editor.contentHost as TextFileModel | null)?.state.get().content ?? "";
    }
}

class HtmlEditorFacade {
    constructor(private readonly editor: HtmlEditor) {}
    get html(): string {
        return (this.editor.contentHost as TextFileModel | null)?.state.get().content ?? "";
    }
}

class MermaidEditorFacade {
    constructor(private readonly editor: MermaidEditor) {}
    get svgUrl(): string  { return this.editor.state.get().svgUrl; }
    get loading(): boolean { return this.editor.state.get().loading; }
    get error(): string    { return this.editor.state.get().error; }
}
```

All sync (no `queue.execute` requests — Markdown's `containerInnerHtml` reads via the private `_containerRef` set by view's `setContainer` callback per PV9; the four queue request unions are all `never`).

### `page.asMarkdown(force?: boolean)` / `asSvg(...)` / `asHtml(...)` / `asMermaid(...)`

Per SF1 — `force=true` triggers `page.switchMainEditor(editorId)` against `findCompatibleEditors()`. Heuristic: each preview editor's id is the only candidate when its accepts predicate fires (no GR1-style multi-variant pick). Real-code-side, the facade getter calls `this.editor.findCompatibleEditors()` directly.

---

## Concerns

### PV1 — Group structure: shared `PreviewEditorBase` or four separate classes?

The four editors share a near-identical class skeleton: trait closure with `extractContentHost`, `contentHost` getter, `findCompatibleEditors`, `getNavigatorTarget`, `switchFrom`, `restore` body, `adoptHost`, `dispose` shape, default `focus(): void { this.queue.send({type:"focus"}) }`. About 80 lines of mechanical reuse per class.

Three candidates:

(a) **Four separate classes, no shared base** — each editor copies the skeleton. ~80 LOC duplication × 4 = ~320 LOC. Clear ownership; trivial to read; matches Monaco's standalone shape (no `TextBearingEditorBase` either).

(b) **`PreviewEditorBase` (or `TextBearingEditorBase`) extends `EditorModel`** — captures the common host-adoption + lifecycle shape. Subclasses override `getRestoreData` / `applyRestoreData` + add editor-specific state mutators / queue events. Saves ~240 LOC; the four subclasses become small files.

(c) **Same as (b) but generalized to all text-bearing editors** — Monaco, Grid, Notebook, Link, Todo, Rest Client, Graph, Draw also inherit. Pulls every text-bearing editor under one base.

**RESOLVED 2026-05-20** — Option (a) confirmed. Four separate classes; no shared `PreviewEditorBase` extraction. Two reasons:
1. **Monaco and Grid already broke ground without a base class** — walkthroughs 20 and 21 deliberately repeated the skeleton inline. Each editor's `switchFrom` / `restore` / `adoptHost` are mechanical, but their concrete bodies differ in small ways (Grid does CSV delimiter detection in restore; Mermaid kicks off the initial render; Monaco does ITextModel creation). A common base would either (i) become a customization-point soup (template-method overrides for every variation), or (ii) keep boilerplate in the subclass anyway. Either kills the saving.
2. **YAGNI** — we have two walkthroughs' worth of evidence so far (Monaco + Grid). Re-evaluating after walkthroughs 23–29 land (every text-bearing editor migrated) is the right moment to consider extraction — by then the actual common surface is provable, not speculative.

Rejected (b) premature abstraction — the "common" parts aren't quite common enough to deserve a base class without distorting the few real differences. Rejected (c) — even more speculative; same reasoning amplified. No mockup change required.

### PV2 — Markdown editor state: which fields persist via `getRestoreData`?

Today's `MarkdownViewState`:
- `container: HTMLDivElement | null` — DOM ref, transient.
- `compactMode: boolean` — user toggle.
- `searchVisible: boolean` — search bar open?
- `searchText: string` — current query.
- `currentMatchIndex: number` — Nth match focused.
- `totalMatches: number` — view-derived count.

After EPIC-028 the editor state replaces the VM state. Three candidates for what rides `getRestoreData`:

(a) **Persist `compactMode` only** — `compactMode` is user preference (toggles on/off, sticky across sessions makes sense). Search state (visible / text / index / total) is ephemeral. Match index/total are view-derived (recomputed by `MarkdownBlock` on every render). Strip the search fields from descriptor like MO5's `hasSelection` / GR8's `error`.

(b) **Persist `compactMode` + last `searchText`** — remember the last search the user typed; restore the search bar with that text but closed (`searchVisible: false`).

(c) **Persist nothing — drop `compactMode` to `editorConfig.compact` only** — let the global setting carry it; no per-editor persistence.

**RESOLVED 2026-05-20** — Option (a) confirmed. Persist `compactMode` only. `compactMode` is the only field with a clear "user-set, sticky" character. Search state is conceptually open-find / type / close-find — a transient gesture; persisting it surprises the user on next open (search bar pops open with a stale query). View-derived (`currentMatchIndex`, `totalMatches`) are recomputed by `MarkdownBlock`'s match-counting on every render, so they're view-derived state in the MO5 sense (ride `editor.state` for reactivity, strip from descriptor). Rejected (b) sticky search text — feature not requested; YAGNI. Rejected (c) drop user toggle — `editorConfig.compact` is the embedded-in-notebook context override (today read in `MarkdownView.tsx:83`); the user-toggleable `compactMode` is a *separate, additive* override (today line 83 ORs them). Both still need to exist. No mockup change required.

**Amended 2026-05-21 by HS1.** `compactMode` rides `host.editorSettings["md-view"]`, not the editor descriptor. Same persistence story but it ALSO survives Markdown↔Monaco switches (the user toggles compact, switches to Monaco to verify raw markdown, switches back — compact stays). Implementation pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

### PV3 — Markdown search state location after VM dissolves: editor.state, view-local React state, or hybrid?

Today: ViewModel holds `searchVisible` / `searchText` / `currentMatchIndex` / `totalMatches`. View bridges via `onMatchCountChange` callback + reads `vm.state.use`. `MarkdownBlock` (the renderer) owns the DOM-level match-counting + scroll-to-match.

After SF2:

(a) **On editor.state (model-side)** — same shape as today's VM, just moved up. View subscribes via `state.use`. Script API can someday `await page.asMarkdown().openSearch("query")` cheaply (the method exists on the model).

(b) **Local React state inside `MarkdownView` component** — `useState<{searchText, …}>`. No script-API exposure; pure view concern.

(c) **Hybrid: search visibility + text on editor.state; match index/total view-local** — split between model and view based on origin (model gets "what the user asked for"; view gets "what we found").

**RESOLVED 2026-05-20** — Option (a) confirmed. Search state lives on `MarkdownEditor.state`. Three reasons:
1. **Mirrors today's VM-on-model shape** — least change. The VM held the state because the VM was the model-side surface; under EPIC-028 the editor IS the model-side surface.
2. **Script-API option preserved** — even if we don't add `page.asMarkdown().openSearch("foo")` today, keeping the state on the editor admits it cheaply later. Putting it in view-local React state forecloses that path.
3. **Same MO5 / GR8 pattern** — view-derived `currentMatchIndex` / `totalMatches` ride state for reactivity, get stripped from getRestoreData per PV2. Identical mechanism as Monaco's `hasSelection`.

Rejected (b) view-local React state — closes the future script-API door for no compensating benefit. Rejected (c) hybrid — adds a split-state model where one part is reactive-via-state and the other reactive-via-React; the view has to bridge both, harder to reason about. No mockup change required.

### PV4 — Markdown scroll position restoration: persist, transient, or on-state?

Today: `MarkdownViewModel.containerScrollTop` is a plain number field (NOT on `state`); `pageFocused` reads it and sets `container.scrollTop`. Subscribes to `pagesModel.onFocus` in `onInit`.

Three candidates:

(a) **View-local — `scrollTopRef = useRef(0)` inside MarkdownBody + `pagesModel.onFocus` subscription in useEffect** — exact equivalent to today, just relocated. Not persisted across restart; restored on tab-focus only.

(b) **Persist on editor.state across restart** — `scrollTop` field rides editor state, persisted in `getRestoreData`. View reads and writes via setters.

(c) **Don't restore at all** — drop the scroll restoration. The user re-scrolls.

**RESOLVED 2026-05-20** — Option (a) confirmed. View-local `scrollTopRef = useRef(0)` inside MarkdownBody + `pagesModel.onFocus` subscription in useEffect. Persisting scroll position across restart is brittle (rendered markdown layout can shift between sessions if fonts / window size change), and the today-feature is genuinely useful for *tab switching* not *app restart*. View-local useRef + useEffect-bound subscription is the minimal equivalent; falls out of the SF2 dissolution cleanly. Rejected (b) persist across restart — adds persisted state for a feature that doesn't survive the persistence boundary well. Rejected (c) drop entirely — degrades the existing UX without reason. No mockup change required.

### PV5 — Mermaid render pipeline relocation: editor-side, view-side, or hybrid?

Today: `MermaidViewModel.renderDebounced` runs a 400ms timer, calls `renderMermaid(content, lightMode)`, writes the result to `vm.state.svgUrl` / `error` / `loading`. Watches own state for `lightMode` changes + receives `onContentChanged(content)` from the host content forwarder.

After SF2 + ContentViewModelHost retirement, three candidates:

(a) **Editor-side (model)** — `MermaidEditor.renderDebounced` (private method); `_renderTimer` is a private field; `_hostContentUnsub` + `_lightModeUnsub` trigger re-render. State holds `svgUrl` / `error` / `loading`; view subscribes via `state.use((s) => ({svgUrl, …}))`. Identical to today's VM pattern, just moved up.

(b) **View-side useEffect** — view watches `host.state.use((s) => s.content)` + `model.state.use((s) => s.lightMode)`; useEffect debounces 400ms; `useState` holds svgUrl/loading/error. No editor.state involvement.

(c) **Hybrid: inputs on editor (lightMode), output on view (svgUrl)** — `lightMode` rides editor.state (persisted per PV5 — see below); `svgUrl` lives in view-local useState (transient).

**RESOLVED 2026-05-20** — Option (a) confirmed. Editor-side render pipeline. Three reasons:
1. **Async output IS model-side** — `renderMermaid(content, lightMode)` returns a data URL; the output is conceptually editor-derived state, not view-presentation state. The MermaidEditorFacade already reads svgUrl/loading/error from VM state today; moving them to editor state preserves the facade contract trivially.
2. **Debounce timer lifecycle ties to editor lifecycle** — `clearTimeout(this._renderTimer)` in `dispose()` is the right place. View-side useEffect cleanup also works but invites bugs when the editor switches but the view persists (the timer fires after the editor disposed, view tries to update React state in an unmounted ref).
3. **Mirrors today's shape** — minimal cognitive load when reading the migration diff.

Rejected (b) view-side useEffect — pushes async I/O into the view, breaks the editor / view separation that Tier 5 is establishing. Rejected (c) hybrid — split-state for no benefit; the `svgUrl` is read by the script API (`page.asMermaid().svgUrl`), so it must live somewhere reachable from the model — view-local React state isn't. No mockup change required.

### PV6 — Mermaid lightMode persistence: persist user override or re-init from theme?

Today: `MermaidViewModel.onInit` reads `isCurrentThemeDark()` ONCE and sets `state.lightMode = !isDark`. The user's toggle (`toggleLightMode`) updates VM state. On VM dispose (page close or editor switch) the override dies. Restart re-initializes from theme.

Three candidates:

(a) **Initialize from theme every restore; don't persist** — same as today. User re-toggles each session.

(b) **Persist `lightMode` per-editor; default from theme on first construct** — initial value from `isCurrentThemeDark()` set in `defaultMermaidEditorState`; `applyRestoreData` overrides with saved value if present. Per-editor user choice persists.

(c) **Promote to a global setting** — `settings.mermaidLightMode: "auto" | "light" | "dark"`. All Mermaid pages share. Per-page override not possible.

**RESOLVED 2026-05-20** — Option (b) confirmed. Per-editor `lightMode` PERSISTS. Light/dark for a diagram is a meaningful per-diagram preference (a user might want a dark-themed app but a printable light-mode diagram for sharing). Initial value defaults from theme (preserves today's behavior on first-open); `applyRestoreData` overrides with saved value if present. Rejected (a) re-init from theme — surprises users who deliberately set light mode on a specific diagram. Rejected (c) global setting — over-globalizes; no evidence per-page is wrong; can be added later if a user asks.

This decision adds `lightMode: boolean` to `MermaidEditorState`'s persisted slice (PV2 / Mermaid row). No mockup change required.

**Amended 2026-05-21 by HS1.** `lightMode` rides `host.editorSettings["mermaid-view"]`, not the editor descriptor. Same first-construct default behavior (`isCurrentThemeDark()`); same per-diagram user-choice preservation; ALSO survives Mermaid↔Monaco switches (toggle lightMode, switch to Monaco to copy the source, switch back — lightMode preserved). Implementation pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

### PV7 — SVG / HTML editor state shape: extend `EditorStateBase` with zero fields, or use it directly?

Today's `SvgViewState = {}` and `HtmlViewState = {}`. Pure identity, no fields. After SF2, the editor state replaces VM state. Should `SvgEditorState` / `HtmlEditorState` add any fields?

Candidate fields considered + rejected:
- `zoomLevel` (Svg) — BaseImageView's zoom is genuinely view-local imperative state (mouse wheel + drag pan). Persisting it would mean fingerprinting the BaseImageView ref state into editor state on every wheel event. Today's BaseImageView keeps zoom internal; that's correct.
- `scrollPosition` (Html iframe) — iframe content is sandboxed; can't read scroll position cross-origin.

Three candidates:

(a) **`type SvgEditorState = EditorStateBase` and `type HtmlEditorState = EditorStateBase` (typedefs)** — symmetry: each editor has a named state-slice type even if it's currently equal to the base.

(b) **Use `EditorStateBase` directly in the generic param** — `class SvgEditor extends EditorModel<EditorStateBase, ...>`. No alias.

(c) **Add forward-looking fields now** — `zoomLevel?: number` (Svg), `viewMode?: "preview" | "raw"` (Html). Just-in-case scaffolding.

**RESOLVED 2026-05-20** — Option (a) confirmed. `type SvgEditorState = EditorStateBase` and `type HtmlEditorState = EditorStateBase` typedefs. Tiny stylistic-symmetry win. Future-additive fields land on the named type without rippling through the class generic. Rejected (b) use base directly — saves three LOC at the cost of making future field additions a class-generic change. Rejected (c) add forward-looking fields — YAGNI; we don't even know if zoom-persistence is desired (today it isn't). No mockup change required.

### PV8 — Queue event unions: do any need anything besides `focus`?

Per MO7 / GR10 — each text-bearing editor's `focus()` override sends `{type:"focus"}` so `<TextChrome>`'s 200ms root-focus subscription (TC8) reaches the inner editor view.

For each preview editor, is there anything beyond `focus`?

- **Markdown** — `scrollToMatch(index)` is currently a view-internal call from the search-navigation effect (`useEffect(() => blockRef.current?.scrollToMatch(...))`). Could become a queue event if model-side wants to drive it. Currently the index lives on editor.state and view's useEffect handles the dispatch — model needs no queue command.
- **Mermaid** — no model-side commands today; svgUrl read flows naturally through state subscription.
- **Svg / Html** — no model-side commands.

Three candidates:

(a) **All four: `{ type: "focus" }` only; queue request = never** — minimal symmetric unions.

(b) **Markdown: add `{ type: "scrollToMatch", index: number }` proactively** — model-driven match navigation possible.

(c) **Skip queue entirely; override `focus(): void {}` no-op (don't fire anything)** — preview editors don't need view-side imperative focus.

**RESOLVED 2026-05-20** — Option (a) confirmed. All four queue events: `{ type: "focus" }`; queue request `never`. Two reasons:
1. **`focus` IS needed** — `<TextChrome>`'s TC8 root-focus subscription calls `editor.focus()`; if preview editors no-op it, keyboard navigation breaks (page-focus → no inner focus → tab key doesn't reach the iframe / scroll panel). The base class's no-op MO7 default exists for editors WITHOUT a view-side focus surface (PDF, Image, Browser handle it internally); previews DO have one.
2. **`scrollToMatch` is view-internal** — the match index lives on editor.state per PV3; the view's `useEffect(() => blockRef.current?.scrollToMatch(...), [currentMatchIndex])` naturally dispatches when the state changes. No queue event needed.

Rejected (b) add scrollToMatch proactively — speculative; the existing useEffect-on-state-change is the right pattern. Rejected (c) skip queue entirely — breaks keyboard navigation. No mockup change required.

### PV9 — MarkdownEditorFacade DOM peek (`container.innerHTML`): editor-state, private field, or queue request?

Today: `MarkdownEditorFacade.html` reads `vm.state.container?.innerHTML`. The container ref is a DOM node, kept on VM state. View calls `vm.setContainer(el)` from a `ref={vm.setContainer}` prop.

Putting a DOM node on `state` is mildly ugly (state is supposed to be JSON-safe-ish, observable; DOM refs are neither). Three candidates:

(a) **Private non-state field on MarkdownEditor** — `private _containerRef: HTMLDivElement | null = null`. View calls `model.setContainer(el)`. Facade reads `editor.containerInnerHtml` getter. Not reactive; no state subscribers; facade reads are sync.

(b) **Keep container ref on editor.state (today's pattern)** — symmetric with the rest of editor state.

(c) **`queue.execute({type: "getHtml"})` request/reply** — view-context query (SF6 pattern). Facade is async: `await editor.queue.execute({type: "getHtml"})`. View's `register` handler returns `containerRef.current?.innerHTML ?? ""`.

**RESOLVED 2026-05-20** — Option (a) confirmed. Private `_containerRef` field on MarkdownEditor (NOT on state). Three reasons:
1. **DOM refs aren't observable** — putting `container` on `state` means every container set/unset triggers a state.subscribe fire, but no consumer subscribes to "container changed" — it's a write-only-from-view, read-from-facade peek. The MO5-derived "ride state for reactivity, strip from persistence" pattern doesn't apply because there's no reactivity.
2. **Facade stays sync** — Markdown facade has zero queue-request reads today; introducing async for `html` getter forces `await page.asMarkdown().html` in user scripts, a script-API churn for no observable benefit.
3. **Pure DOM read is sync by nature** — `containerRef.current?.innerHTML` is a synchronous DOM access; wrapping it in queue.execute (which is necessarily async — registers a view-handler) introduces artificial latency.

Rejected (b) keep container on state — DOM ref on state is the wrong shape (no subscribers; bypasses immutability assumption). Rejected (c) queue.execute — over-engineered for a sync DOM peek. The `_containerRef` private field is the right shape for "view writes once on mount, model reads once on facade query."

`viewMounted` getter reads `this._containerRef !== null` from the same field. No mockup change required.

### PV10 — Toolbar contributions + facade collapse confirmation

Walkthroughs 09 (PT1–PT10) + 10 (TC1–TC11) already pinned the toolbar / footer / chrome composition:
- Portal refs (`editorToolbarRefLast`) deleted; editor views inline-compose `<PageToolbar model>{contributions}</PageToolbar>`.
- `<TextChrome>` owns `toolbarContributions` + `footerContributions` props (TC1 / TC10).
- NavPanel button auto-rendered by `<PageToolbar>` via `editor.getNavigatorTarget()` (PT5 / B3).
- Switch widget auto-rendered when `findCompatibleEditors().length >= 2` (PT2 / PT10).

For the four preview editors specifically:

- **Markdown's `<MarkdownToolbarBits>`** — compact toggle (`vm.toggleCompact` → `model.toggleCompact`). Inline child of `<PageToolbar>`. One IconButton, no portal.
- **Svg's `<SvgToolbarBits>`** — open-draw + copy buttons. Inline children. Both buttons read `host.state.get().content` instead of `vm.pageModel.state.get().content` (one-symbol rename).
- **Html's toolbar** — empty today; no `<HtmlToolbarBits>` needed; pass `toolbarContributions={null}` or omit.
- **Mermaid's `<MermaidToolbarBits>`** — theme toggle (`vm.toggleLightMode` → `model.toggleLightMode`) + open-draw + copy. Inline children. Reads `pageState.svgUrl` from `editor.state.use((s) => s.svgUrl)`.

For facades (SF1 + SF2 + SF6 confirmation):
- All four facades flip from wrapping `ViewModel` to wrapping `EditorModel` subclass directly.
- All four stay **sync** — no `queue.execute` requests (PV7 / PV9).
- All four gain `force?: boolean` parameter on the `page.asX()` PageWrapper method per SF1 — triggers `page.switchMainEditor(target)` against `findCompatibleEditors()`.
- Markdown's DOM peek migrates per PV9 (`_containerRef` private field).

**RESOLVED 2026-05-20** — Confirmation. Walkthroughs 09 / 10 / SF1 / SF2 / SF6 cover the migration; the per-editor real-code surface lands in implementation. No new design decisions. No mockup change required.

---

## Mockup adjustments

**Zero mockup changes proposed.** All ten concerns resolve at the real-code layer:

- PV1 (a), PV2 (a), PV3 (a), PV4 (a), PV5 (a), PV6 (b), PV7 (a), PV8 (a), PV9 (a), PV10 confirmation — all editor-internal-state, per-editor view shape, or confirmation of upstream resolutions. Nothing changes the base `EditorModel` shape, the `IContentHost` contract, `editorRegistry`, `ComponentQueue`, `TextChrome`, or `PageToolbar`.

The walkthrough 20 / 21 template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT) carries all four preview editors end-to-end. Tier 5 mockup stability holds across a second non-Monaco group — and this group is the lightest yet (three of four have near-empty state slices; Svg / Html state literally equals `EditorStateBase`).

---

## Migration scope

Real-code only (carried to implementation):

- **New files** (eight, two per editor):
  - `src/renderer/editors/markdown/MarkdownEditor.ts` — `MarkdownEditor` class + `MarkdownEditorState` + `MarkdownQueueEvent`.
  - `src/renderer/editors/markdown/MarkdownEditorView.tsx` — view shell: `<TextChrome>` + `<MarkdownBody>` + `<MarkdownToolbarBits>`.
  - Same shape for `svg/SvgEditor.ts` + `SvgEditorView.tsx`; `html/HtmlEditor.ts` + `HtmlEditorView.tsx`; `mermaid/MermaidEditor.ts` + `MermaidEditorView.tsx`.

- **Renamed / refactored files**:
  - Each editor folder: today's `XxxViewModel.ts` deletes — state + setters absorb into `XxxEditor.ts`; today's `XxxView.tsx` body splits between `XxxEditorView.tsx` (composition + toolbar contributions) and `XxxBody.tsx` (the actual preview surface — `MarkdownBlock` host, `BaseImageView` host, iframe host).
  - `markdown/MarkdownBody.tsx` — new; absorbs today's `MarkdownView.tsx` scroll-restore / search-bridge / key-handler / render-block-wrap.
  - `svg/SvgBody.tsx`, `html/HtmlBody.tsx`, `mermaid/MermaidBody.tsx` — each ~30–40 LOC; pure host + queue.use(focus) + render.
  - `markdown/MarkdownBlock.tsx`, `markdown/CodeBlock.tsx`, `markdown/rehypeHighlight.ts` — carry over verbatim. `MarkdownBlockHandle` imperative ref interface unchanged.
  - `mermaid/render-mermaid.ts` — carries over verbatim. Lazy-import semantics preserved (`renderMermaid` is invoked from `MermaidEditor` private method which lives in the lazy-loaded editor module).
  - `shared/BaseImageView.tsx` — unchanged (consumed by Svg + Mermaid views).
  - `shared/FindBar.tsx` — unchanged (consumed by Markdown view).

- **Deleted files**:
  - All four `XxxViewModel.ts` files.
  - `editors/base/ContentViewModel.ts`, `ContentViewModelHost.ts`, `useContentViewModel.ts` already retired by walkthrough 20.

- **Edited files**:
  - `src/renderer/editors/register-editors.ts` — four registrations swap factory calls from VM-based to EditorModel-based: `() => new MarkdownEditor(state)`, `() => new SvgEditor(state)`, etc.
  - `src/renderer/editors/registry.ts` — already covered by S5; each editor's `accepts` predicate lands per the sketches above (mode-agnostic).
  - `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts` — flips from wrapping `MarkdownViewModel` to wrapping `MarkdownEditor`; `viewMounted` + `html` getters read editor's `_containerRef` field via the public getters (PV9). Stays sync.
  - `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts` — `vm.pageModel.state.get().content` → `(editor.contentHost as TextFileModel).state.get().content`. Stays sync.
  - `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` — same as Svg. Stays sync.
  - `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts` — `vm.state.get().X` → `editor.state.get().X`. Stays sync.
  - `src/renderer/scripting/api-wrapper/PageWrapper.ts` — `asMarkdown(force?)` / `asSvg(force?)` / `asHtml(force?)` / `asMermaid(force?)` per SF1.
  - `api/types/markdown-editor.d.ts` / `svg-editor.d.ts` / `html-editor.d.ts` / `mermaid-editor.d.ts` — `force?: boolean` parameter added to each `page.asX()` signature; no other shape changes (all reads stay sync).

- **Persistence migration**: zero per C2 + P2. No old cache files to clean (preview ViewModels never wrote any).

- **Touch on shared components**: none. `BaseImageView` carries over; `FindBar` carries over; `MarkdownBlock` + `CodeBlock` carry over.

---

## Closure

All ten concerns RESOLVED 2026-05-20. **Zero mockup changes.**

Final outcomes by concern:

| # | Resolution | Mockup change |
|---|------------|---------------|
| PV1 | (a) — four separate classes; no shared `PreviewEditorBase` (YAGNI; re-evaluate after walkthroughs 23–29) | none |
| PV2 | (a) — `compactMode` persisted; search fields stripped (MO5 pattern) | none |
| PV3 | (a) — search state on `editor.state`; preserves future script-API path | none |
| PV4 | (a) — view-local `useRef` + `pagesModel.onFocus` useEffect; not persisted across restart | none |
| PV5 | (a) — render pipeline on editor: `_renderTimer` + `renderDebounced` + `svgUrl/error/loading` on state | none |
| PV6 | (b) — persist `lightMode`; default from `isCurrentThemeDark()` on first construct | none |
| PV7 | (a) — `SvgEditorState = HtmlEditorState = EditorStateBase` (typedefs) | none |
| PV8 | (a) — all four queue events: `{ type: "focus" }`; queue request `never` | none |
| PV9 | (a) — private `_containerRef` field; view `setContainer(el)` callback; facade stays sync | none |
| PV10 | confirmation — toolbar inline children; facades wrap editor; all stay sync; `force?` per SF1 | none |

**Tier 5 template confirmed on light editors.** Walkthroughs 20 / 21 set the template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT) on a complex (Monaco) and a medium (Grid) editor; this walkthrough confirms it carries cleanly on **near-empty** editors — Svg / Html state literally equals `EditorStateBase`, and the four classes still slot into the same eight-piece template without strain. The pattern is stable across the complexity axis.

**Implementation notes carried forward:**
- The four classes share ~80 LOC of mechanical skeleton (trait closure / `switchFrom` body / `restore` shape / `dispose` shape / `findCompatibleEditors` / `getNavigatorTarget` / `focus`). PV1 explicitly chooses NOT to extract a base class yet — re-evaluate after walkthroughs 23–29 land when every text-bearing editor is migrated and the actual common surface is provable.
- `MarkdownBlockHandle` imperative ref pattern carries verbatim (view holds the ref; calls `scrollToMatch(index)` via useEffect-on-state-change).
- `MermaidEditor.restore()` includes an initial `renderDebounced()` call after `adoptHost()` — kicks off the first render against newly-loaded host content. Same pattern fires on switch-in (switchFrom → adoptHost → renderDebounced via the lightMode-or-content-change subscriptions).
- `svgUrl` in Mermaid descriptor is **stripped** (re-derived on restore by the initial `renderDebounced` call). Persisting it would waste payload bytes on a recomputable data URL.
- `MarkdownEditor._containerRef` is a non-state private field set by view's `setContainer(el)` callback — the facade's `containerInnerHtml` / `viewMounted` getters read it directly. First example in EPIC-028 of an editor holding a DOM ref outside `state`; sets the pattern for any future "facade needs sync DOM peek" need.

Walkthrough 23 (Log View) is next — append-only render path; uniform editor (no Category-A/B carve-out); resolves `acquireViewModelSync("log-view")` retirement at three MCP-handler sites.

**Implementation notes carried forward:**
- The four classes share ~80 LOC of mechanical skeleton (trait closure / `switchFrom` body / `restore` shape / `dispose` shape / `findCompatibleEditors` / `getNavigatorTarget` / `focus`). PV1 explicitly chooses NOT to extract a base class yet — re-evaluate after every text-bearing editor is migrated. The honest question is "how much of this is actually identical vs. just structurally-similar?"; only the full migration answers it.
- `MarkdownBlockHandle` imperative ref pattern carries verbatim (view holds the ref; calls `scrollToMatch(index)` via useEffect-on-state-change).
- `MermaidEditor.restore()` includes an initial `renderDebounced()` call after `adoptHost()` — kicks off the first render against newly-loaded host content. Same pattern fires on switch-in (switchFrom → adoptHost → renderDebounced via the lightMode-or-content-change subscriptions).
- `svgUrl` in Mermaid descriptor is **stripped** (re-derived on restore by the initial `renderDebounced` call). Persisting it would waste payload bytes on a recomputable data URL.

Walkthrough 23 (Log View) is next — append-only render path; uniform editor (no Category-A/B carve-out); resolves `acquireViewModelSync("log-view")` retirement at three MCP-handler sites.
