import type React from "react";
import { TDialogModel } from "../../core/state/model";
import type { IState } from "../../core/state/state";
import { TraitSet } from "../../core/traits/traits";
import { Subscription } from "../../core/state/events";
import { ComponentQueue, ComponentQueueEvent } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import type { IContentHost } from "./IContentHost";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { IPageHost } from "../../api/pages/IPageHost";
import type { IEditorState } from "../../../shared/types";
import type { ILinkData } from "../../../shared/link-data";
import type { MenuItem } from "../../uikit";

export interface EditorStateBase extends Omit<Partial<IEditorState>, "id" | "title" | "modified"> {
    /** Editor instance UUID — cache-file prefix. On switchFrom, the new
     *  editor copies this from the old editor so cache files survive. */
    id: string;
    title: string;
    modified: boolean;
    /** Panel contributions for the sidebar (walkthrough 03 / A8). */
    secondaryView?: string[];
    /** Optional cache-buster for `noLanguage` editors whose tab icon depends on
     *  internal state (not on `title`/`language`/`favicon`). The tab subscribes
     *  to this, so mutating it re-invokes `getIcon()`. E.g. the Board editor sets
     *  it to the selected board name so the tab shows that board's icon. */
    iconKey?: string;
}

/** Partial state used by `applyRestoreData`. Subclasses widen S with their own
 *  fields; text-bearing editors also accept a `host?: HostDescriptor` and
 *  optional ComponentQueue passthroughs (walkthrough 04 / P6 / C3). */
export type RestoreData<S extends EditorStateBase = EditorStateBase> = Partial<S> & {
    host?: HostDescriptor;
    revealLine?: number;
    highlightText?: string;
};

export abstract class EditorModel<
    T extends EditorStateBase = EditorStateBase,
    R = unknown,
    E extends ComponentQueueEvent = ComponentQueueEvent,
> extends TDialogModel<T, R> {
    /** Registry key — set by each subclass to its registry id ("monaco",
     *  "grid-json", "pdf-view", …). Used by `editorRegistry.createEditor` to
     *  pick the class, by `PageModel.switchMainEditor` short-circuit, by
     *  the switch widget's "current" highlight, and by persistence
     *  (`EditorDescriptor.editorId`). Replaces today's `state.type` discriminator. */
    abstract readonly editorId: string;

    /** Mailbox for model → view commands and view-context queries. Subclasses
     *  narrow E to their own event union. Disposed by `dispose()`. */
    readonly queue: ComponentQueue<E> = new ComponentQueue<E>();

    /** Editor-capability bag. Subclass constructors populate with trait
     *  implementations (e.g. `CONTENT_HOST_TRAIT`). */
    readonly traits = new TraitSet();

    /** Fired when this editor's persisted shape changes. PagesModel will
     *  subscribe to drive `saveStateDebounced`. Base auto-forwards from
     *  `state` mutations; subclasses with extra reactive surfaces (host,
     *  pipe) forward those onto this Subscription too. */
    readonly descriptorChanged = new Subscription<void>();

    /** Set when attached to an owner host (`PageModel` today, a Browser host
     *  later). Typed as the `IPageHost` contract; imported type-only to avoid
     *  a runtime circular dep. */
    page: IPageHost | null = null;

    /** Active content pipe (provider + transformers). For text-bearing
     *  editors the pipe lives on `TextFileModel`; this field stays on the
     *  base for no-host editors that own their pipe directly (e.g. Browser). */
    pipe: IContentPipe | null = null;

    /** Auxiliary in-memory data for scripting; not persisted. */
    scriptData: Record<string, unknown> = {};

    getIcon?: () => React.ReactNode;
    noLanguage = false;
    skipSave = false;

    /** When true, the page area renders the decorative Ornament pinned to the
     *  bottom-right corner, behind the editor content (matching the empty page).
     *  For editors whose content leaves empty space around it (Settings, About). */
    showBackgroundOrnament = false;

    /** Captures the auto-sub set up in the constructor so subclasses that
     *  swap `this.state` can unsubscribe and re-attach on the new state. */
    protected _stateAutoUnsub: (() => void) | null = null;

    constructor(
        modelState: IState<T> | (new (defaultState: T) => IState<T>),
        defaultState?: T,
    ) {
        super(modelState, defaultState);
        // Any state mutation is a persistence-worthy change by default.
        this._stateAutoUnsub = this.state.subscribe(() => this.descriptorChanged.send(undefined));
    }

    setPage(page: IPageHost | null): void {
        this.page = page;
    }

    // ── Lifecycle hooks — Phase 2 (walkthrough 01 / A7) ───────────────────

    /** Remember persisted / file-open setup data for use in `restore()`. Sync.
     *  Does NOT do I/O. Base behavior is a stash; subclasses may parse minimal
     *  fields they need before `restore()`. */
    applyRestoreData(_data: RestoreData<T>): void {
        // Override in subclasses.
    }

    /** Pull whatever is transferable from `oldEditor` (host, id for cache-file
     *  continuity, pending queue passthroughs). Throws if the old editor
     *  cannot give up what this editor needs. */
    switchFrom(_oldEditor: EditorModel): void {
        throw new Error(`${this.constructor.name} does not implement switchFrom`);
    }

    // ── Lifecycle hook — Phase 3 (walkthrough 01 / A7) ────────────────────

    /** Realize the editor. Creates host (if not adopted via switchFrom),
     *  restores from cache/disk, subscribes to host state for
     *  descriptorChanged forwarding. After this resolves, the editor is
     *  fully usable. */
    async restore(): Promise<void> {
        // Override in subclasses.
    }

    // ── Lifecycle hooks — secondary view reactions ──────────────────────

    /** Called before this editor is replaced as `page.mainEditor`. Inspect
     *  `newModel` to decide whether to keep `secondaryView` set (survive as
     *  a sidebar panel). Base clears it. */
    beforeNavigateAway(_newModel: EditorModel): void {
        this.secondaryView = undefined;
    }

    /** Called on every editor in `page.editors[]` (except the new main)
     *  when the page's mainEditor changes. */
    onMainEditorChanged(_newMainEditor: EditorModel | null): void {
        // Override in subclasses.
    }

    /** Will this editor remain on the page across the incoming navigation
     *  (e.g. demote to a sidebar panel) rather than be released? When true,
     *  `navigatePageTo` skips the "save changes?" prompt — nothing is being
     *  lost. `sourceLink` is the link being navigated to (its `sourceId`
     *  identifies the navigation origin). Base: false. */
    survivesNavigation(_sourceLink?: ILinkData): boolean {
        return false;
    }

    /** Must this editor stay attached to the page when it is replaced as the
     *  main editor, even though it contributes NO panels? An invisible
     *  ownership handle — e.g. a busy Board whose spawned processes must
     *  outlive its view (US-799). `setMainEditor` skips detach+dispose while
     *  true; the editor is disposed on page close or when the flag clears.
     *  Base: false. */
    keepAliveOnNavigation(): boolean {
        return false;
    }

    /** Called when `activePanel` changes to one this editor owns. */
    onPanelExpanded(_panelId: string): void {
        // Override in subclasses.
    }

    // ── Panel contribution (walkthrough 01 / A8) ──────────────────────────

    /** Pure state mutation — no side effects on `page`. PageModel observes
     *  the slice via TOneState's selector-subscribe (walkthrough 03 / N1). */
    get secondaryView(): string[] | undefined {
        return this.state.get().secondaryView;
    }

    set secondaryView(value: string[] | undefined) {
        this.state.update((s) => { s.secondaryView = value; });
    }

    /** True if this editor currently contributes panels to the SecondaryViews. */
    contributesPanels(): boolean {
        return (this.state.get().secondaryView?.length ?? 0) > 0;
    }

    // ── Switch widget support (walkthrough 01 / A7) ───────────────────────

    /** Editor ids the user can switch to from this editor. Default: empty
     *  (no switching). Text-bearing editors return
     *  `editorRegistry.findEditorsAccepting(this._host)`. */
    findCompatibleEditors(): string[] {
        return [];
    }

    // ── Fresh-empty detection (walkthrough 01 / A3) ───────────────────────

    /** True if this editor wraps a never-touched, never-saved empty document.
     *  Used to silently replace the auto-created empty page when the user
     *  opens their first real file. Default: false; Monaco overrides. */
    isFreshEmpty(): boolean {
        return false;
    }

    // ── Standard getters ──────────────────────────────────────────────────

    get id(): string { return this.state.get().id; }
    get title(): string { return this.state.get().title; }
    get modified(): boolean { return this.state.get().modified; }

    /** True if this editor is its host's main (content-area) editor. Default
     *  derivation; a Browser host's embedded Link editor will hardcode this in
     *  US-601. NOT reactive on its own — a view that must re-render on
     *  promote/demote subscribes to `editor.page?.state` (US-600). */
    get isMain(): boolean {
        return this.page?.mainEditorInstance === this;
    }


    get filePath(): string | undefined {
        return (this.state.get() as { filePath?: string }).filePath;
    }

    get language(): string | undefined {
        return (this.state.get() as { language?: string }).language;
    }

    get type(): string | undefined {
        return (this.state.get() as { type?: string }).type;
    }

    /** Optional language change — base no-op; per-editor subclasses override
     *  when the editor reacts to language changes. */
    changeLanguage(_language: string | undefined): void {
        // Override in subclasses.
    }

    // ── Content-host accessor (walkthrough 08 / T2 / B2) ──────────────────

    /** Returns the `IContentHost` this editor wraps, or null. Text-bearing
     *  editors override to return their `_host`. Cross-cutting primitive
     *  consumed by tab strip, toolbar, switch widget, and `<TextChrome>`. */
    get contentHost(): IContentHost | null {
        return null;
    }

    // ── Page-tab context-menu contributions ──────────────────────────────

    /** Editor/model-specific context-menu items for the page tab. The default
     *  routes to the content host, so every text-bearing editor surfaces the
     *  text-file menu (Save / Rename / encryption) for free. Non-text editors
     *  override to contribute their own items; an editor with nothing to add
     *  returns `[]`. The tab keeps only tab-level items (Close / Pin / …) and
     *  appends these below a separator. */
    onGetMenuItems(): MenuItem[] {
        return this.contentHost?.onGetMenuItems?.() ?? [];
    }

    // ── Navigation-source accessor (sidebar-owning navigation survival) ───

    /** Resolve the navigation `sourceLink.sourceId` set by `navigatePageTo`,
     *  used by sidebar-owning editors (Archive / Link) to decide whether to
     *  survive a main-editor swap. `navigatePageTo` writes `sourceLink` onto
     *  the legacy editor's state BEFORE wrap, so the location depends on the
     *  new main editor's topology:
     *
     *   - text editors (Monaco, Grid, …) adopt that state as their content
     *     host — `sourceLink` is on `contentHost.state`, NOT the editor's
     *     own state (which is a fresh editor-shaped state).
     *   - no-host editors (PDF, Image, Browser, Archive) keep `sourceLink`
     *     on the editor's OWN state, and have no content host.
     *
     *  Check own state first, then fall back to the content host, so neither
     *  topology is missed. (Reading only one location was the cause of the
     *  panel-disappears-on-navigate bug for Archive→text and Link→player.) */
    getNavigationSourceId(): string | undefined {
        const own = (this.state.get() as { sourceLink?: { sourceId?: string } })
            .sourceLink?.sourceId;
        if (own) return own;
        return (this.contentHost?.state.get() as { sourceLink?: { sourceId?: string } } | undefined)
            ?.sourceLink?.sourceId;
    }

    // ── Navigator-target accessor (walkthrough 09 / PT5 / B3) ─────────────

    /** What the page-level NavPanel button should toggle when clicked.
     *
     *  - `null` (default): no NavPanel button.
     *  - `{}` (empty target): always render, just toggle visibility.
     *  - `{ pipe?, filePath? }`: gate via `page.canOpenNavigator(pipe, filePath)`,
     *     initialize an Explorer panel from the file's folder if none exists.
     *
     *  Replaces six inline per-editor IconButton blocks with a single
     *  declarative read at the toolbar. */
    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        return null;
    }

    // ── View-side selection probe (walkthrough 09 / PT7 / B2) ─────────────

    /** Optional. Returns true when the editor surfaces a non-empty text
     *  selection. Consumed by Run-all-script button visibility (only
     *  renders when host language is a script language AND a selection
     *  exists). Default: undefined — Monaco overrides. */
    hasTextSelection?(): boolean;

    // ── Navigation reuse — per-page singleton (US-617) ────────────────────

    /** Optional. A Pattern B editor that survives navigation (e.g. Git Tree)
     *  returns true when a navigation request targets the same logical resource
     *  this instance already represents. `navigatePageTo` then reuses this
     *  instance — promoting it back to main — instead of building a duplicate
     *  that would accumulate as a redundant surviving secondary panel. Default:
     *  undefined — the editor is not a navigation singleton. */
    matchesNavigationTarget?(target: string | undefined, filePath: string): boolean;

    /** Optional. Called by `navigatePageTo` when this instance is reused for a
     *  navigation (see `matchesNavigationTarget`), so it can refresh data that
     *  may have gone stale since it was last the main editor. */
    onNavigationReuse?(): void;

    // ── In-document anchor navigation (US-901) ────────────────────────────

    /** Optional. Scroll to a document fragment (anchor / heading slug) after this
     *  editor is attached to a page. Called once by the pages lifecycle when the
     *  opening `ILinkData` carried a `fragment` — including when an already-open
     *  editor instance is reused for the navigation. Default: undefined — editors
     *  without in-document anchors simply don't implement it. */
    revealFragment?(fragment: string): void;

    // ── View focus signal (walkthrough 20 / MO7) ──────────────────────────

    /** Called by `<TextChrome>` after its 200ms root-focus subscription fires
     * so the inner editor view can grab focus too. Text-bearing
     *  editors override:
     *
     *      focus(): void { this.queue.send({ type: "focus" }); } */
    focus(): void {
        // Override in subclasses.
    }

    // ── Persistence (walkthrough 04 / P1 / C3) ────────────────────────────

    async saveState(): Promise<void> {
        // Override in subclasses.
    }

    /** Persisted shape for this editor. Returned during `saveState` and
     *  re-fed at restore time. Text-bearing subclasses extend with
     *  `host: this._host?.getDescriptor()`. */
    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: s as unknown as Record<string, unknown>,
        };
    }

    // ── Release & dispose ─────────────────────────────────────────────────

    async confirmRelease(_closing?: boolean): Promise<boolean> {
        return true;
    }

    /** Subclasses MUST call `super.dispose()` so the component queue drops
     *  any pending events. Text-bearing editors ALSO dispose their
     *  `IContentHost` IFF it was not extracted via `CONTENT_HOST_TRAIT`.
     *
     *  Cache cleanup is NOT done here — the page tracks "id release" and
     *  calls `fs.deleteCacheFiles(editor.id)` when the id is not transferred
     *  to a successor. */
    async dispose(): Promise<void> {
        this.queue.dispose();
    }
}
