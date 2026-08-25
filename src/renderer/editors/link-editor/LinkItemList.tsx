import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { GridModelCapability } from "../../uikit/VirtualGrid";
import { ContextMenuEvent } from "../../api/events/events";
import { app } from "../../api/app";
import type { ILink } from "../../api/types/io.tree";
import { LinkItem, LinkSource } from "./linkTypes";
import { LinksList } from "./LinksList";
import { getHostname, requestFaviconSave } from "../../components/icons/favicon-cache";

const { clipboard } = require("electron");

// =============================================================================
// Component
// =============================================================================

interface LinkItemListProps {
    links: LinkItem[];
    model: LinkSource;
    selectedLinkId: string;
    pinnedLinkIds: Set<string>;
    searchText?: string;
}

export function LinkItemList({ links, model, selectedLinkId, pinnedLinkIds, searchText }: LinkItemListProps) {
    const gridModelRef = useRef<GridModelCapability | null>(null);

    const allTags = useSyncExternalStore(
        (cb) => model.state.subscribe(cb),
        () => model.state.get().tags,
    );

    const handleToggleTag = useCallback((link: ILink, tag: string) => {
        if (!link.id) return;
        const current = link.tags ?? [];
        const tags = current.includes(tag)
            ? current.filter((t) => t !== tag)
            : [...current, tag];
        model.updateLink(link.id, { tags });
    }, [model]);

    useEffect(() => {
        model.setGridModel(gridModelRef.current);
        return () => model.setGridModel(null);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [links, selectedLinkId]);

    const handleGridModel = useCallback((gm: GridModelCapability | null) => {
        gridModelRef.current = gm;
    }, []);

    const handleSelect = useCallback((link: ILink) => {
        model.selectLink(link.id);
    }, [model]);

    const handleOpen = useCallback((link: ILink) => {
        if (link.href) {
            // US-896 — never arm a favicon save from a Tor page (see LinkItemTiles).
            if (!model.isTorPage) requestFaviconSave(getHostname(link.href));
            model.openLink(link);
        }
    }, [model]);

    const handleEdit = useCallback((link: ILink) => {
        model.showLinkDialog(link.id);
    }, [model]);

    const handleDelete = useCallback((link: ILink, skipConfirm: boolean) => {
        model.deleteLink(link.id, skipConfirm);
    }, [model]);

    const handleContextMenu = useCallback((e: React.MouseEvent, link: ILink) => {
        model.selectLink(link.id);
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "link-item");
        ctxEvent.target = link;

        // Layer 1: Link-specific items
        const customItems = model.onGetLinkMenuItems?.(link as LinkItem);
        if (customItems?.length) {
            ctxEvent.items.push(...customItems);
        }
        ctxEvent.items.push(
            {
                label: "Edit",
                icon: "rename",
                onClick: () => model.showLinkDialog(link.id),
                startGroup: customItems?.length ? true : undefined,
            },
        );
        ctxEvent.items.push(
            {
                label: "Copy URL",
                icon: "copy",
                onClick: () => { if (link.href) clipboard.writeText(link.href); },
                disabled: !link.href,
            },
        );
        if (link.imgSrc) {
            const imgUrl = link.imgSrc;
            ctxEvent.items.push(
                {
                    label: "Copy Image URL",
                    icon: "copy",
                    onClick: () => clipboard.writeText(imgUrl),
                    startGroup: true,
                },
                {
                    label: "Open Image in New Tab",
                    icon: "open-file",
                    onClick: async () => {
                        const { pagesModel } = await import("../../api/pages");
                        pagesModel.openImageInNewTab(imgUrl);
                    },
                },
            );
        }
        const isPinned = model.isLinkPinned(link.id);
        ctxEvent.items.push(
            {
                label: isPinned ? "Unpin" : "Pin",
                icon: isPinned ? "pin-filled" : "pin",
                onClick: () => model.togglePinLink(link.id),
                startGroup: true,
            },
            {
                label: "Delete",
                icon: "delete",
                onClick: () => model.deleteLink(link.id),
            },
        );

        // Layer 2: Event channel — type-aware items (browser open for HTTP, file open for local)
        e.nativeEvent.contextMenuPromise = app.events.linkContextMenu.sendAsync(
            ctxEvent as ContextMenuEvent<ILink>,
        );
    }, [model]);

    const getAdditionalIcon = useCallback((link: ILink) => {
        return pinnedLinkIds.has(link.id) ? "pin-filled" : undefined;
    }, [pinnedLinkIds]);

    return (
        <LinksList
            links={links}
            selectedId={selectedLinkId}
            searchText={searchText}
            onSelect={handleSelect}
            onDoubleClick={handleOpen}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onContextMenu={handleContextMenu}
            getAdditionalIcon={getAdditionalIcon}
            dragSourceId={model.treeProvider.sourceUrl}
            allTags={allTags}
            imageProxy={model.imageProxy}
            onToggleTag={handleToggleTag}
            onGridModel={handleGridModel}
        />
    );
}
