import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ILink } from "../../../api/types/io.tree";
import { LinkHostnamesPanel } from "./LinkHostnamesPanel";
import { LinksList } from "../LinksList";
import { RenderGridModel } from "../../../uikit/RenderGrid";
import { Panel, Splitter } from "../../../uikit";
import { LinkEditor } from "../LinkEditor";

// =============================================================================
// LinkHostnamesNavigationPanel — Hostnames panel with resizable bottom links
// list. Mirrors LinkTagsNavigationPanel. Selecting a hostname filters only
// (no promote/navigate); a bottom-list link click opens the file.
// =============================================================================

interface LinkHostnamesNavigationPanelProps {
    editor: LinkEditor;
}

export function LinkHostnamesNavigationPanel({ editor }: LinkHostnamesNavigationPanelProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<RenderGridModel>(null);
    const [bottomHeight, setBottomHeight] = useState<number | undefined>(undefined);

    const selectedHostname = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().selectedHostname,
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

    const hostnameItems = useMemo(() => {
        if (selectedHostname) {
            return editor.treeProvider?.getHostnameItems(selectedHostname)
                .filter((item) => !item.isDirectory) ?? [];
        }
        return links.filter((item) => !item.isDirectory);
    }, [editor, selectedHostname, links]);

    const handleSelect = useCallback((item: ILink) => {
        editor.openLinkFromPanel(item, "link-hostname");
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
        const row = hostnameItems.findIndex((item) => (item.id ?? item.href) === selectedLinkId);
        if (row >= 0) gridRef.current.scrollToRow(row, "nearest");
    }, [selectedLinkId, hostnameItems]);

    return (
        <Panel
            name="link-hostnames-navigation"
            ref={rootRef}
            direction="column"
            flex={1}
            overflow="hidden"
            width="100%"
        >
            <Panel
                name="link-hostnames-navigation-top"
                direction="column"
                flex={1}
                overflow="hidden"
                minHeight={40}
            >
                <LinkHostnamesPanel vm={editor} />
            </Panel>
            {hostnameItems.length > 0 && (
                <>
                    <Splitter
                        name="link-hostnames-bottom-splitter"
                        orientation="horizontal"
                        value={bottomHeight ?? 150}
                        onChange={handleChangeHeight}
                        side="after"
                        border="before"
                    />
                    <Panel
                        name="link-hostnames-navigation-bottom"
                        direction="column"
                        overflow="hidden"
                        shrink={false}
                        height={bottomHeight ?? 150}
                    >
                        <LinksList
                            ref={gridRef}
                            links={hostnameItems}
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
