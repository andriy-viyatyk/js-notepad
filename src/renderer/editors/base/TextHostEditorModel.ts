import { EditorModel, type EditorStateBase, type RestoreData } from "./EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "./editor-traits";
import type { IContentHost } from "./IContentHost";
import type { ComponentQueueEvent } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { IPageHost } from "../../api/pages/IPageHost";
import type { IState } from "../../core/state/state";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry } from "./editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { createEchoGuard } from "../../core/utils/echo-guard";
import { ui } from "../../api/ui";
import { errMessage } from "../../../shared/utils";

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

/**
 * Base class for every editor that wraps a `TextFileModel` content host.
 *
 * Owns the host-adoption lifecycle that text-bearing editors would otherwise
 * copy-paste: `CONTENT_HOST_TRAIT` registration (host transfer on editor
 * switch), `switchFrom` / `restore` / `adoptHost`, identity persistence
 * (`getRestoreData` / `applyRestoreData`), `confirmRelease` / `saveState` /
 * `setPage` / `dispose`, and the host accessors consumed by the tab strip,
 * toolbar and switch widget.
 *
 * Subclass surface:
 *  - `displayName` — human name used in error/notify strings.
 *  - override `adoptHost` (call `super.adoptHost(host)` first) to attach
 *    domain subscriptions via `registerHostSubscription` /
 *    `subscribeHostContent` / `mirrorHostSettings` and to kick the initial
 *    parse when the editor parses inside adoption (Graph, Draw, Mermaid,
 *    EnvVars pattern).
 *  - override `onHostAttached` when the initial load must not run inside
 *    `adoptHost` itself (Grid, Link, Notebook, Rest, LogView pattern) — the
 *    hook runs on the switch, session-restore, and open-file
 *    (`attachEditorToPage` → `bootstrapFromHost`) paths.
 *  - `writeToHost` for every host content write, so the editor's own
 *    `subscribeHostContent` handler skips the echo.
 *
 * All host-lifetime subscriptions live in one registry torn down together on
 * re-adopt, trait extraction and dispose — a subclass cannot leak one by
 * forgetting an unsubscribe field.
 */
export abstract class TextHostEditorModel<
    T extends EditorStateBase = EditorStateBase,
    R = unknown,
    E extends ComponentQueueEvent = ComponentQueueEvent,
> extends EditorModel<T, R, E> {
    /** Human-readable editor name for error/notify strings ("Mermaid",
     *  "Rest Client", "Environment Variables"). */
    protected abstract readonly displayName: string;

    protected _host: TextFileModel | null = null;
    protected _pendingHost: HostDescriptor | undefined = undefined;

    private _hostUnsubs: Array<() => void> = [];

    /** Exact-content echo guard armed by `writeToHost`, consumed by the `subscribeHostContent`
     *  wrapper. Bounded rather than one-shot: a non-matching update disarms every pending token,
     *  so a write that never produces a content dispatch cannot swallow the next genuine change. */
    private readonly echoGuard = createEchoGuard<string>();

    constructor(
        modelState: IState<T> | (new (defaultState: T) => IState<T>),
        defaultState?: T,
    ) {
        super(modelState, defaultState);
        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) {
                    throw new Error(
                        `Host already extracted from ${this.displayName} editor`,
                    );
                }
                this.teardownHostSubscriptions();
                this.onHostExtracted();
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host-subscription registry ────────────────────────────────────────

    /** Track a host-lifetime unsubscribe. Everything registered here is torn
     *  down as one set on re-adopt, trait extraction and dispose. */
    protected registerHostSubscription(unsub: () => void): void {
        this._hostUnsubs.push(unsub);
    }

    protected teardownHostSubscriptions(): void {
        for (const unsub of this._hostUnsubs) unsub();
        this._hostUnsubs = [];
    }

    // ── Subclass hooks ────────────────────────────────────────────────────

    /** The host is being extracted by a successor editor (switch away).
     *  Subscriptions are already torn down; clear domain refs that pointed
     *  into the host (timers, cached models). */
    protected onHostExtracted(): void {
        // Override in subclasses.
    }

    /** Called after `adoptHost` on the switch (`switchFrom`), session-restore
     *  (`restore` success), and open-file (`attachEditorToPage` via
     *  `bootstrapFromHost`) paths — never by a bare `adoptHost` and never on
     *  `restore`'s error-fallback path. Put the initial content parse/load
     *  here when it must not run inside `adoptHost`. */
    protected onHostAttached(_host: TextFileModel): void {
        // Override in subclasses.
    }

    /** Title fallback when neither host nor editor state carries one.
     *  Data-file editors override (e.g. "untitled.link.json"). */
    protected untitledName(): string {
        return "untitled";
    }

    // ── Host accessors ────────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + toolbar + facade consumption (avoids
     *  the `IContentHost`→`TextFileModel` cast at every read site). */
    get host(): TextFileModel | null {
        return this._host;
    }

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return editorRegistry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    // ── Persistence ───────────────────────────────────────────────────────

    /** Identity-only descriptor: durable editor-specific state rides the
     *  host's `editorSettings` slot (see `mirrorHostSettings`); view-derived
     *  state is recomputed on restore. Subclasses with extra durable fields
     *  extend the returned `state`. */
    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryView: s.secondaryView,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<T>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ─────────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `${this.displayName} editor switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error(
                `${this.displayName} editor switchFrom: extracted host is not a TextFileModel`,
            );
        }
        // Preserve cache-file id across the swap.
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        // Tag the host with the target editor id so submodels keep their assumptions.
        host.state.update((s) => {
            s.editor = this.editorId as typeof s.editor;
        });
        this.adoptHost(host);
        this.onHostAttached(host);
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
            this.onHostAttached(this._host);
        } catch (err) {
            ui.notify(
                errMessage(err, `Failed to restore ${this.displayName} editor.`),
                "error",
            );
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Public bridge for the open-file construction path
     *  (`attachEditorToPage`): run the initial-load hook against the
     *  already-adopted host. Keeps `onHostAttached` protected while letting
     *  the generic constructor site trigger the same bootstrap the
     *  switch/session-restore paths get. */
    bootstrapFromHost(): void {
        if (this._host) this.onHostAttached(this._host);
    }

    /** Adopt a host without going through `switchFrom`. Public API — called
     *  directly by `attachEditorToPage` when constructing a fresh editor over
     *  a freshly-restored legacy TextFileModel. Subclasses override, calling
     *  `super.adoptHost(host)` first, to attach domain subscriptions. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this.teardownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (save-state debounce).
        this.registerHostSubscription(
            host.state.subscribe(() => this.descriptorChanged.send(undefined)),
        );

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || this.untitledName());
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId as typeof s.editor;
        });
        if (this.page) host.setPage(this.page);
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Host content write/read helpers ───────────────────────────────────

    /** Write content into the host without re-triggering this editor's own
     *  `subscribeHostContent` handler (one-shot echo guard). Use for EVERY
     *  editor-originated host content write. `byUser` is forwarded to
     *  `TextFileModel.changeContent`. */
    protected writeToHost(content: string, byUser?: boolean): void {
        if (!this._host) return;
        this.echoGuard.arm(content);
        this._host.changeContent(content, byUser);
    }

    /** Subscribe to host content changes, skipping the echo of this editor's
     *  own `writeToHost` calls. Registered in the host-subscription set. */
    protected subscribeHostContent(handler: (content: string) => void): void {
        const host = this._host;
        if (!host) return;
        this.registerHostSubscription(
            host.state.subscribe(
                (content) => {
                    const nextContent = (content as string) ?? "";
                    if (this.echoGuard.consume(nextContent)) return;
                    handler(nextContent);
                },
                (s) => s.content,
            ),
        );
    }

    /** Seed editor state from the host's per-editor settings slot
     *  (`host.getEditorState(this.editorId)`) and mirror later changes back
     *  (`host.setEditorState`), so the setting survives editor switches AND
     *  app restarts. `apply` receives the saved slot — guard each field with
     *  `!== undefined`; `snapshot` builds the slot from current editor state;
     *  `selector` bounds which state changes trigger a mirror write (omit to
     *  mirror on every state change). Call from `adoptHost` after `super`. */
    protected mirrorHostSettings<S>(
        apply: (saved: S) => void,
        snapshot: (state: T) => S,
        selector?: (state: T) => unknown,
        shouldMirror?: () => boolean,
    ): void {
        const host = this._host;
        if (!host) return;
        const saved = host.getEditorState<S>(this.editorId);
        if (saved !== undefined) apply(saved);
        const mirror = () => {
            if (shouldMirror && !shouldMirror()) return;
            this._host?.setEditorState<S>(this.editorId, snapshot(this.state.get()));
        };
        this.registerHostSubscription(
            selector
                ? this.state.subscribe(mirror, selector)
                : this.state.subscribe(mirror),
        );
    }

    // ── Save / release / dispose ──────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    /** Subclasses with extra teardown (timers, flushes, DOM refs) override
     *  and call `await super.dispose()` — the base tears down the whole
     *  host-subscription set and disposes the host. */
    async dispose(): Promise<void> {
        this.teardownHostSubscriptions();
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
