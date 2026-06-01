import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { useOptionalState } from "../../../core/state/state";
import type { ILink } from "../../../api/types/io.tree";
import { LinkTagsPanel } from "./LinkTagsPanel";
import { LinksList } from "../LinksList";
import { RenderGridModel } from "../../../uikit/RenderGrid";
import { Panel, Splitter } from "../../../uikit";
import { app } from "../../../api/app";
import { createLinkData } from "../../../../shared/link-data";
import { LinkEditor } from "../LinkEditor";

// =============================================================================
// LinkTagsNavigationPanel — Tags panel with resizable bottom links list
// =============================================================================

interface LinkTagsNavigationPanelProps {
    editor: LinkEditor;
    pageId?: string;
}

function LinkTagsNavigationPanel({ editor, pageId }: LinkTagsNavigationPanelProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<RenderGridModel>(null);
    const [bottomHeight, setBottomHeight] = useState<number | undefined>(undefined);

    const selectedTag = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().selectedTag,
    );

    const links = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().data.links,
    );

    const selectedLinkId = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().selectedLinkId,
    );

    const allTags = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().tags,
    );

    const handleToggleTag = useCallback((item: ILink, tag: string) => {
        if (!item.id) return;
        const current = item.tags ?? [];
        const tags = current.includes(tag)
            ? current.filter((t) => t !== tag)
            : [...current, tag];
        editor.updateLink(item.id, { tags });
    }, [editor]);

    const tagItems = useMemo(() => {
        if (selectedTag) {
            return editor.treeProvider?.getTagItems(selectedTag)
                .filter((item) => !item.isDirectory) ?? [];
        }
        return links.filter((item) => !item.isDirectory);
    }, [editor, selectedTag, links]);

    const handleSelect = useCallback((item: ILink) => {
        if (item.id) editor.selectLink(item.id);
        const navUrl = editor.treeProvider?.getNavigationUrl(item) ?? item.href;
        app.events.openRawLink.sendAsync(
            createLinkData(navUrl, {
                target: item.target || undefined,
                sourceId: "link-tag",
                selectedTag,
                ...(pageId ? { pageId, fallbackTarget: "monaco", title: item.title } : undefined),
            }),
        );
    }, [editor, selectedTag, pageId]);

    const handleChangeHeight = useCallback((h: number) => {
        const container = rootRef.current;
        if (container) {
            const maxH = container.clientHeight * 0.8;
            setBottomHeight(Math.max(40, Math.min(h, maxH)));
        } else {
            setBottomHeight(Math.max(40, h));
        }
    }, []);

    useEffect(() => {
        if (bottomHeight !== undefined || !rootRef.current) return;
        const el = rootRef.current;
        let timer: ReturnType<typeof setTimeout>;
        const observer = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const h = el.clientHeight;
                if (h > 0) {
                    setBottomHeight(Math.max(40, h * 0.5));
                    observer.disconnect();
                }
            }, 200);
        });
        observer.observe(el);
        return () => { clearTimeout(timer); observer.disconnect(); };
    }, [bottomHeight]);

    useEffect(() => {
        if (!selectedLinkId || !gridRef.current) return;
        const row = tagItems.findIndex((item) => (item.id ?? item.href) === selectedLinkId);
        if (row >= 0) gridRef.current.scrollToRow(row, "nearest");
    }, [selectedLinkId, tagItems]);

    return (
        <Panel
            name="link-tags-navigation"
            ref={rootRef}
            direction="column"
            flex={1}
            overflow="hidden"
            width="100%"
        >
            <Panel
                name="link-tags-navigation-top"
                direction="column"
                flex={1}
                overflow="hidden"
                minHeight={40}
            >
                <LinkTagsPanel vm={editor} />
            </Panel>
            {tagItems.length > 0 && (
                <>
                    <Splitter
                        name="link-tags-bottom-splitter"
                        orientation="horizontal"
                        value={bottomHeight ?? 150}
                        onChange={handleChangeHeight}
                        side="after"
                        border="before"
                    />
                    <Panel
                        name="link-tags-navigation-bottom"
                        direction="column"
                        overflow="hidden"
                        shrink={false}
                        height={bottomHeight ?? 150}
                    >
                        <LinksList
                            ref={gridRef}
                            links={tagItems}
                            selectedId={selectedLinkId || undefined}
                            onSelect={handleSelect}
                            onDoubleClick={handleSelect}
                            allTags={allTags}
                            onToggleTag={handleToggleTag}
                        />
                    </Panel>
                </>
            )}
        </Panel>
    );
}


export default function LinkTagsSecondaryView({ model, headerRef }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; hook-using body lives
    // in an inner component. Same pattern as LinkCategorySecondaryView.
    if (!(model instanceof LinkEditor)) {
        return null;
    }
    return <LinkTagsSecondaryViewBody editor={model} headerRef={headerRef} />;
}

function LinkTagsSecondaryViewBody({
    editor,
    headerRef,
}: {
    editor: LinkEditor;
    headerRef: SecondaryViewProps["headerRef"];
}) {
    const mainEditorId = useOptionalState(editor.page?.state, (s) => s.mainEditorId, null);
    const isMainEditor = mainEditorId === editor.id;

    return (
        <>
            {headerRef && createPortal(<>Tags</>, headerRef)}
            {isMainEditor
                ? <LinkTagsPanel vm={editor} />
                : <LinkTagsNavigationPanel editor={editor} pageId={editor.page?.id} />
            }
        </>
    );
}
