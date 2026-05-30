import type React from "react";
import { TDialogModel } from "../../core/state/model";
import type { IState } from "../../core/state/state";
import { TraitSet } from "../../core/traits/traits";
import { Subscription } from "../../core/state/events";
import { ComponentQueue, ComponentQueueEvent } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence-v4";
import type { IContentHost } from "./IContentHost";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { PageModel } from "../../api/pages/PageModel";
import type { IEditorState } from "../../../shared/types";

export interface EditorStateBase extends Omit<Partial<IEditorState>, "id" | "title" | "modified"> {
    /** Editor instance UUID — cache-file prefix. On switchFrom, the new
     *  editor copies this from the old editor so cache files survive. */
    id: string;
    title: string;
    modified: boolean;
    /** Panel contributions for the sidebar (walkthrough 03 / A8). */
    secondaryEditor?: string[];
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

    /** Set when attached to a `PageModel`. Type imported as type-only to
     *  avoid a runtime circular dep. */
    page: PageModel | null = null;

    /** Active content pipe (provider + transformers). For text-bearing
     *  editors the pipe lives on `TextFileModel`; this field stays on the
     *  base for no-host editors that own their pipe directly (e.g. Browser). */
    pipe: IContentPipe | null = null;

    /** Auxiliary in-memory data for scripting; not persisted. */
    scriptData: Record<string, unknown> = {};

    getIcon?: () => React.ReactNode;
    noLanguage = false;
    skipSave = false;

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

    setPage(page: PageModel | null): void {
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

    // ── Lifecycle hooks — secondary editor reactions ──────────────────────

    /** Called before this editor is replaced as `page.mainEditor`. Inspect
     *  `newModel` to decide whether to keep `secondaryEditor` set (survive as
     *  a sidebar panel). Base clears it. */
    beforeNavigateAway(_newModel: EditorModel): void {
        this.secondaryEditor = undefined;
    }

    /** Called on every editor in `page.editors[]` (except the new main)
     *  when the page's mainEditor changes. */
    onMainEditorChanged(_newMainEditor: EditorModel | null): void {
        // Override in subclasses.
    }

    /** Called when `activePanel` changes to one this editor owns. */
    onPanelExpanded(_panelId: string): void {
        // Override in subclasses.
    }

    // ── Panel contribution (walkthrough 01 / A8) ──────────────────────────

    /** Pure state mutation — no side effects on `page`. PageModel observes
     *  the slice via TOneState's selector-subscribe (walkthrough 03 / N1). */
    get secondaryEditor(): string[] | undefined {
        return this.state.get().secondaryEditor;
    }

    set secondaryEditor(value: string[] | undefined) {
        this.state.update((s) => { s.secondaryEditor = value; });
    }

    /** True if this editor currently contributes panels to the PageNavigator. */
    contributesPanels(): boolean {
        return (this.state.get().secondaryEditor?.length ?? 0) > 0;
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

    // ── Navigation-source accessor (sidebar-owning navigation survival) ───

    /** Resolve the navigation `sourceLink.sourceId` set by `navigatePageTo`,
     *  used by sidebar-owning editors (Archive / Link) to decide whether to
     *  survive a main-editor swap. `navigatePageTo` writes `sourceLink` onto
     *  the legacy editor's state BEFORE wrap, so the location depends on the
     *  new main editor's topology:
     *
     *   - v4-native text editors (Monaco, Grid, …) adopt that state as their
     *     content host — `sourceLink` is on `contentHost.state`, NOT the
     *     editor's own state (which is a fresh editor-shaped state).
     *   - no-host editors (PDF, Image, Browser, Archive) and legacy non-text
     *     adapters (Player) keep `sourceLink` on the editor's OWN state, and
     *     have no content host.
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
