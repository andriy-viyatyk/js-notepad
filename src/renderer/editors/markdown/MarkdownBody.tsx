import { useCallback, useEffect, useRef, useState } from "react";
import type { MarkdownEditor } from "./MarkdownEditor";
import { pagesModel } from "../../api/pages";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { EditorConfig } from "../base/EditorConfig";
import { FindBar } from "../shared/FindBar";
import { MarkdownBlock } from "./MarkdownBlock";
import { isLocalMarkdownHref } from "./markdown-nav";
import { Minimap, Panel } from "../../uikit";

const noopState = {
    content: "",
    filePath: undefined as string | undefined,
};

export function MarkdownBody({ model, editorConfig = {} }: { model: MarkdownEditor; editorConfig?: EditorConfig }) {
    const host = model.host;
    const commandQueue = model.typedQueue;
    const scrollRef = useRef<HTMLDivElement | null>(null);
    // PV4 — view-local scroll-restore state. Not persisted across restart.
    const scrollTopRef = useRef(0);
    // MK1 — Minimap needs the scroll-container DOM node reactively (today's
    // pageState.container behavior). Local React state mirrors the callback
    // ref so Minimap re-renders when the element attaches.
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const pageState = model.state.use((s) => ({
        compactMode: s.compactMode,
        searchVisible: s.searchVisible,
        searchText: s.searchText,
        currentMatchIndex: s.currentMatchIndex,
        totalMatches: s.totalMatches,
    }));
    // Read content + filePath directly off the host. MarkdownBlock re-renders
    // on every content change via its React props — no editor-side
    // onContentChanged needed (Markdown is stateless w.r.t. content).
    const { content, filePath } = host
        ? host.state.use((s) => ({ content: s.content, filePath: s.filePath }))
        : noopState;

    // US-901 — anchor scrolling. The `anchor` queue event can be delivered on the
    // very first mount (the editor queues it before the view exists) or while a
    // large document is still committing, so retry across a few frames before
    // giving up. Giving up is silent: the reader simply lands at the top.
    const anchorRetryRef = useRef<number | null>(null);
    const cancelAnchorRetry = useCallback(() => {
        if (anchorRetryRef.current !== null) {
            cancelAnimationFrame(anchorRetryRef.current);
            anchorRetryRef.current = null;
        }
    }, []);
    const scrollToAnchor = useCallback((fragment: string) => {
        cancelAnchorRetry();
        let attempts = 0;
        const attempt = () => {
            anchorRetryRef.current = null;
            if (commandQueue.pendingRequestCount > 0) return;
            void commandQueue.execute({ type: "scrollToAnchor", fragment }).then((found) => {
                if (found) {
                // The anchor position IS this view's position now. Without this, the PV4
                // restore below — which fires on the `onFocus` that every navigation
                // sends right after `revealFragment` — would snap the reader back to 0.
                if (scrollRef.current) scrollTopRef.current = scrollRef.current.scrollTop;
                    return;
                }
                if (++attempts <= 10) anchorRetryRef.current = requestAnimationFrame(attempt);
            });
        };
        attempt();
    }, [cancelAnchorRetry, commandQueue]);
    useEffect(() => cancelAnchorRetry, [cancelAnchorRetry]);

    // PV8 — focus queue drain. Routes <TextChrome>'s root-focus into the
    // scroll panel so Tab / arrow keys work from the page.
    commandQueue.use((ev) => {
        if (ev.type === "focus") scrollRef.current?.focus();
        else if (ev.type === "anchor") scrollToAnchor(ev.fragment);
    });

    // PV4 — scroll-restore on page focus. View-local; not persisted across restart.
    useEffect(() => {
        const sub = pagesModel.onFocus.subscribe((page) => {
            if (page !== model.page) return;
            Promise.resolve().then(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollTopRef.current;
                }
            });
        });
        return () => sub.unsubscribe();
    }, [model]);

    // Track scroll position for PV4 restore.
    const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        scrollTopRef.current = e.currentTarget?.scrollTop ?? 0;
    }, []);

    // US-784 — in-page navigation for local markdown links. Intercept a plain
    // left-click on a link that resolves to a local `.md`/`.markdown` file:
    // push the current doc onto the page back-stack and navigate THIS page in
    // place (pageId set) instead of letting it fall through to the main-process
    // will-navigate handler that opens a new tab. Every other link (other files,
    // http, images, mailto, #anchor) is left untouched and keeps its behavior.
    const onLinkClickCapture = useCallback((e: React.MouseEvent) => {
        // Modified clicks (open-in-new-tab intent) fall through unchanged.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        const anchor = (e.target as HTMLElement).closest("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";
        // US-901 — same-document anchor: scroll in place. Not a document change, so
        // no openRawLink and nothing pushed onto the back-stack.
        if (href.startsWith("#")) {
            e.preventDefault();
            e.stopPropagation();
            let fragment = href.slice(1);
            try { fragment = decodeURIComponent(fragment); } catch { /* keep raw */ }
            scrollToAnchor(fragment);
            return;
        }
        if (!isLocalMarkdownHref(href)) return;
        const page = model.page;
        const pageId = page?.id;
        if (!pageId) return;
        e.preventDefault();
        e.stopPropagation();
        // Push the document we're leaving so Back can return to it. Skip when the
        // current doc has no file path (untitled) — there's nothing to reopen.
        const cur = model.host?.state.get();
        if (cur?.filePath) {
            page.pushNavBack({ href: cur.filePath, title: cur.title });
        }
        void app.events.openRawLink.sendAsync(
            createLinkData(href, { pageId, target: "md-view", sourceId: "markdown-link" }),
        );
    }, [model, scrollToAnchor]);

    // Effective highlight text: own search takes priority over external
    // (notebook embedded highlight via editorConfig.highlightText).
    const highlightText = pageState.searchVisible && pageState.searchText
        ? pageState.searchText
        : editorConfig.highlightText || "";

    // Sync MarkdownBlock's DOM-level match count back to editor state.
    const onMatchCountChange = useCallback((count: number) => {
        const { totalMatches, currentMatchIndex } = model.state.get();
        if (count !== totalMatches) {
            model.setMatchCount(count);
            if (count > 0) {
                const newIndex = currentMatchIndex >= count ? 0 : currentMatchIndex;
                void commandQueue.execute({ type: "scrollToMatch", index: newIndex });
            }
        }
    }, [model, commandQueue]);

    // Navigate to match when currentMatchIndex changes (next/prev).
    useEffect(() => {
        if (pageState.totalMatches > 0) {
            void commandQueue.execute({ type: "scrollToMatch", index: pageState.currentMatchIndex });
        }
    }, [pageState.currentMatchIndex, pageState.totalMatches, commandQueue]);

    // Keyboard handler — same shortcuts as today's MarkdownView.
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

    const embedded = editorConfig.maxEditorHeight !== undefined;
    const showMinimap = !editorConfig.hideMinimap;
    // PV2 — editorConfig.compact (notebook-embedded context override) OR
    // pageState.compactMode (per-page user toggle). Both still exist.
    const compact = editorConfig.compact || pageState.compactMode;
    // Only show own search bar when not embedded with external highlight (notebook).
    const showSearchBar = pageState.searchVisible && !editorConfig.highlightText;

    // Callback ref: fan out to model (PV9 facade peek), local ref (focus +
    // scroll-restore reads), and React state (MK1 Minimap reactivity).
    const setScrollContainer = useCallback((el: HTMLDivElement | null) => {
        scrollRef.current = el;
        model.setContainer(el);
        setScrollEl(el);
    }, [model]);

    return (
        <Panel
            name="markdown-view-root"
            direction="row"
            flex={embedded ? undefined : 1}
            height={embedded ? undefined : 0}
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
                    flex={embedded ? undefined : 1}
                    height={embedded ? undefined : 0}
                    maxHeight={embedded ? editorConfig.maxEditorHeight : undefined}
                    overflowY="auto"
                    overflowX="hidden"
                    scrollbar={showMinimap ? "hidden" : "auto"}
                    paddingX={compact ? "md" : "xxl"}
                    ref={setScrollContainer}
                    onScroll={onScroll}
                    onClickCapture={embedded ? undefined : onLinkClickCapture}
                >
                    <MarkdownBlock
                        commandQueue={commandQueue}
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
