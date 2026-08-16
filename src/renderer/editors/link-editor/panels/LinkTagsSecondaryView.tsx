import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../../ui/secondary-views/SideBarPanelHeader";
import type { ILink } from "../../../api/types/io.tree";
import { LinkTagsPanel } from "./LinkTagsPanel";
import { LinksList } from "../LinksList";
import { RenderGridModel } from "../../../uikit/RenderGrid";
import { Panel, Splitter } from "../../../uikit";
import { LinkEditor } from "../LinkEditor";

// =============================================================================
// LinkTagsNavigationPanel — Tags panel with resizable bottom links list
// =============================================================================

interface LinkTagsNavigationPanelProps {
    editor: LinkEditor;
}

function LinkTagsNavigationPanel({ editor }: LinkTagsNavigationPanelProps) {
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
        editor.openLinkFromPanel(item, "link-tag");
    }, [editor]);

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
                            onGridModel={(grid) => { gridRef.current = grid ?? undefined; }}
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


export default function LinkTagsSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; hook-using body lives
    // in an inner component. Same pattern as LinkCategorySecondaryView.
    if (!(model instanceof LinkEditor)) {
        return null;
    }
    return <LinkTagsSecondaryViewBody editor={model} headerRef={headerRef} icon={icon} />;
}

function LinkTagsSecondaryViewBody({
    editor,
    headerRef,
    icon,
}: {
    editor: LinkEditor;
    headerRef: SecondaryViewProps["headerRef"];
    icon: SecondaryViewProps["icon"];
}) {
    // Always the navigation form (tags list + bottom links list). Selecting a
    // tag filters only — it never promotes/navigates the page (Concern 3).
    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Tags" />
            <LinkTagsNavigationPanel editor={editor} />
        </>
    );
}
