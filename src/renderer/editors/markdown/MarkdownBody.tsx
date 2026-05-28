import { useCallback, useEffect, useRef, useState } from "react";
import type { MarkdownEditor } from "./MarkdownEditor";
import { pagesModel } from "../../api/pages";
import { useEditorConfig } from "../base";
import { FindBar } from "../shared/FindBar";
import { MarkdownBlock, MarkdownBlockHandle } from "./MarkdownBlock";
import { Minimap, Panel } from "../../uikit";

const noopState = {
    content: "",
    filePath: undefined as string | undefined,
};

export function MarkdownBody({ model }: { model: MarkdownEditor }) {
    const host = model.host;
    const blockRef = useRef<MarkdownBlockHandle>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    // PV4 — view-local scroll-restore state. Not persisted across restart.
    const scrollTopRef = useRef(0);
    // MK1 — Minimap needs the scroll-container DOM node reactively (today's
    // pageState.container behavior). Local React state mirrors the callback
    // ref so Minimap re-renders when the element attaches.
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const editorConfig = useEditorConfig();
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

    // PV8 — focus queue drain. Routes <TextChrome>'s root-focus into the
    // scroll panel so Tab / arrow keys work from the page.
    model.typedQueue.use((ev) => {
        if (ev.type === "focus") scrollRef.current?.focus();
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
                blockRef.current?.scrollToMatch(newIndex);
            }
        }
    }, [model]);

    // Navigate to match when currentMatchIndex changes (next/prev).
    useEffect(() => {
        if (pageState.totalMatches > 0) {
            blockRef.current?.scrollToMatch(pageState.currentMatchIndex);
        }
    }, [pageState.currentMatchIndex, pageState.totalMatches]);

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
