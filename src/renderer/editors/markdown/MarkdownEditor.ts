import { TComponentState } from "../../core/state/state";
import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";

export type MarkdownQueueEvent =
    | { type: "focus" }
    | { type: "anchor"; fragment: string };

export type MarkdownQueueRequest = never;

/**
 * HS1 host-slot shape — `compactMode` rides `host.editorSettings["md-view"]`
 * so it survives Markdown↔Monaco switches AND app restarts (PV2/PV6 HS1
 * amendment 2026-05-21).
 */
interface MarkdownViewSettings {
    compactMode?: boolean;
}

export interface MarkdownEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["md-view"]. Bounded boolean.
    compactMode: boolean;
    // View-derived — present on state for in-session reactivity, stripped
    // from getRestoreData per PV2 / MO5 / GR8 pattern. Search is a transient
    // gesture; persisting it surprises the user on next open.
    searchVisible: boolean;
    searchText: string;
    currentMatchIndex: number;
    totalMatches: number;
}

export const defaultMarkdownEditorState: MarkdownEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    compactMode: false,
    searchVisible: false,
    searchText: "",
    currentMatchIndex: 0,
    totalMatches: 0,
};

export class MarkdownEditor extends TextHostEditorModel<
    MarkdownEditorState,
    void,
    MarkdownQueueEvent
> {
    readonly editorId = "md-view";
    protected readonly displayName = "Markdown";

    /** PV9 — non-state DOM ref set by the body via `setContainer(el)` callback.
     *  Facade reads through `containerInnerHtml` / `viewMounted` getters. NOT
     *  on `state` (no subscribers; ride-state-for-reactivity doesn't apply
     *  — see PV9 resolution). */
    private _containerRef: HTMLDivElement | null = null;

    readonly typedQueue: ComponentQueue<MarkdownQueueEvent, MarkdownQueueRequest>;

    constructor(state: TComponentState<MarkdownEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            MarkdownQueueEvent,
            MarkdownQueueRequest
        >;
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    /** US-901 — scroll to a heading anchor from a `#fragment` link. The body may
     *  not be mounted yet (this runs right after the editor is attached to the
     *  page); `ComponentQueue` buffers the event and drains it on subscribe. */
    revealFragment(fragment: string): void {
        if (fragment) this.typedQueue.send({ type: "anchor", fragment });
    }

    /** Back-navigate the page to the previous Markdown document (US-784). Pops
     *  the page's back stack and re-opens that entry in place. Goes straight
     *  through `openRawLink` (not the link interceptor), so it does not push a
     *  new history entry. No-op when there's no page or no history. */
    navigateBack = async (): Promise<void> => {
        const page = this.page;
        const pageId = page?.id;
        if (!page || !pageId) return;
        const entry = page.popNavBack();
        if (!entry) return;
        const { app } = await import("../../api/app");
        const { createLinkData } = await import("../../../shared/link-data");
        await app.events.openRawLink.sendAsync(
            createLinkData(entry.href, { pageId, target: "md-view" }),
        );
    };

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // No host-content subscription needed — the body reads
        // `host.state.use((s) => s.content)` directly; MarkdownBlock re-renders
        // on every content change via React props.

        // HS1 — seed `compactMode` from host slot (sync, no flicker) and mirror
        // changes back. Slice-bound so search-state mutations (the dominant
        // write source) never trigger a host-slot write.
        this.mirrorHostSettings<MarkdownViewSettings>(
            (saved) => {
                if (saved.compactMode !== undefined) {
                    this.state.update((s) => {
                        s.compactMode = saved.compactMode;
                    });
                }
            },
            (s) => ({ compactMode: s.compactMode }),
            (s) => s.compactMode,
        );
    }

    // ── View-driven setters / state mutators ────────────────────────────

    /** PV9 — view callback ref: scroll panel sets its DOM node here.
     *  Facade reads via `containerInnerHtml` / `viewMounted` getters. */
    setContainer = (el: HTMLDivElement | null): void => {
        this._containerRef = el;
    };

    toggleCompact = (): void => {
        this.state.update((s) => {
            s.compactMode = !s.compactMode;
        });
    };

    openSearch = (): void => {
        this.state.update((s) => {
            s.searchVisible = true;
        });
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

    // ── Facade-only accessors ─────────────────────────────────────

    get containerInnerHtml(): string {
        return this._containerRef?.innerHTML ?? "";
    }

    get viewMounted(): boolean {
        return this._containerRef !== null;
    }
}
