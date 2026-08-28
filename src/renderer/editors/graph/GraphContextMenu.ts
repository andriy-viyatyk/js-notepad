import type { MenuItem } from "../../uikit";
import type { NodePropertyLink } from "./types";

/** Open-link icon (matches the Links editor OpenLinkIcon). */
function createOpenLinkIconElement(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M14 4l6 5-6 5V10c-5 0-9 2-11 7 1-7 5-11 11-12V4z");
    path.setAttribute("fill", "currentColor");
    svg.append(path);
    return svg;
}

// =============================================================================
// Context menu action interface
// =============================================================================

export interface ContextMenuActions {
    addNode: (worldX: number, worldY: number) => void;
    addChild: (parentId: string) => void;
    deleteNode: (nodeId: string) => void;
    deleteSelected: () => void;
    deleteLink: (sourceId: string, targetId: string) => void;
    setRootNode: (nodeId: string) => void;
    collapseNode: (nodeId: string) => void;
    selectChildren: () => void;
    selectMembers: () => void;
    selectMembersDeep: () => void;
    editGroupTitle: (groupId: string) => void;
    ungroupNode: (groupId: string) => void;
    deleteGroup: (groupId: string) => void;
    groupSelected: () => void;
    removeFromGroup: (nodeId: string) => void;
}

// =============================================================================
// Menu builders
// =============================================================================

/** Build context menu for right-click on a node. */
export function buildNodeContextMenu(
    nodeId: string,
    neighborIds: string[],
    getNodeLabel: (id: string) => string,
    isRoot: boolean,
    hasVisibilityFilter: boolean,
    actions: ContextMenuActions,
    isInGroup?: string,
    multiSelectedCount?: number,
    groupingEnabled?: boolean,
    nodeLinks?: { links: NodePropertyLink[]; onOpen: (href: string) => void },
): MenuItem[] {
    const items: MenuItem[] = [];

    // Open link items (placed at top for quick access)
    if (nodeLinks && nodeLinks.links.length > 0) {
        const { links, onOpen } = nodeLinks;
        if (links.length === 1) {
            items.push({ label: `Open ${links[0].propertyKey}`, icon: createOpenLinkIconElement(), onClick: () => onOpen(links[0].href) });
        } else {
            items.push({
                label: "Open link...",
                icon: createOpenLinkIconElement(),
                items: links.map((link) => ({
                    label: `Open ${link.propertyKey}`,
                    icon: createOpenLinkIconElement(),
                    onClick: () => onOpen(link.href),
                })),
            });
        }
    }

    const hasLinks = nodeLinks && nodeLinks.links.length > 0;
    items.push(
        { label: "Add Child", onClick: () => actions.addChild(nodeId), startGroup: hasLinks || undefined },
        { label: "Set as Root", onClick: () => actions.setRootNode(nodeId), disabled: isRoot },
        { label: "Collapse", onClick: () => actions.collapseNode(nodeId), disabled: !hasVisibilityFilter },
        { label: "Select children", onClick: () => actions.selectChildren(), startGroup: true },
    );

    // Selection-aware delete: when the right-clicked node is part of a multi-selection,
    // delete ALL selected nodes (with confirmation); otherwise delete just this node.
    const isMultiSelected = multiSelectedCount !== undefined && multiSelectedCount > 1;
    items.push({
        label: isMultiSelected ? `Delete ${multiSelectedCount} Nodes` : "Delete Node",
        onClick: () => isMultiSelected ? actions.deleteSelected() : actions.deleteNode(nodeId),
        startGroup: true,
    });

    // Build "Delete Link" submenu for connected nodes
    if (neighborIds.length > 0) {
        items.push({
            label: "Delete Link to...",
            startGroup: true,
            items: neighborIds.map((nId) => ({
                label: getNodeLabel(nId),
                onClick: () => actions.deleteLink(nodeId, nId),
            })),
        });
    }

    const hideGroup = groupingEnabled === false;
    if (multiSelectedCount !== undefined && multiSelectedCount >= 2) {
        items.push({ label: "Group Selected", onClick: () => actions.groupSelected(), startGroup: true, invisible: hideGroup });
    }
    if (isInGroup) {
        items.push({ label: "Remove from Group", onClick: () => actions.removeFromGroup(nodeId), invisible: hideGroup });
    }

    return items;
}

/** Build context menu for right-click on a group node. */
export function buildGroupNodeContextMenu(
    groupId: string,
    hasVisibilityFilter: boolean,
    actions: ContextMenuActions,
    multiSelectedCount?: number,
    groupingEnabled?: boolean,
): MenuItem[] {
    const items: MenuItem[] = [
        { label: "Edit Title", onClick: () => actions.editGroupTitle(groupId) },
        { label: "Collapse", onClick: () => actions.collapseNode(groupId), disabled: !hasVisibilityFilter },
        { label: "Select members", onClick: () => actions.selectMembers(), startGroup: true },
        { label: "Select members deep", onClick: () => actions.selectMembersDeep() },
        { label: "Delete (Ungroup)", onClick: () => actions.ungroupNode(groupId), startGroup: true },
        { label: "Delete with Children", onClick: () => actions.deleteGroup(groupId) },
    ];
    if (multiSelectedCount !== undefined && multiSelectedCount >= 2) {
        items.push({ label: "Group Selected", onClick: () => actions.groupSelected(), startGroup: true, invisible: groupingEnabled === false });
    }
    return items;
}

// =============================================================================
// Selection menu
// =============================================================================

export interface SelectionMenuActions {
    copyMarkdown: () => void;
    openMarkdown: () => void;
    openGrid: () => void;
    selectChildren: () => void;
    selectMembers: () => void;
    selectMembersDeep: () => void;
    highlight: () => void;
    extract: () => void;
    extractWithChildren: () => void;
    deleteNodes: () => void;
    groupSelected: () => void;
}

export interface SelectionMenuInfo {
    count: number;
    hasGroups: boolean;
    hasNonGroups: boolean;
}

/** Build popup menu for the "N selected" toolbar button. */
export function buildSelectionMenu(info: SelectionMenuInfo, actions: SelectionMenuActions, groupingEnabled?: boolean): MenuItem[] {
    const { count, hasGroups, hasNonGroups } = info;
    const items: MenuItem[] = [
        { label: "Select children", onClick: actions.selectChildren, disabled: !hasNonGroups },
        { label: "Select members", onClick: actions.selectMembers, disabled: !hasGroups, invisible: groupingEnabled === false },
        { label: "Select members deep", onClick: actions.selectMembersDeep, disabled: !hasGroups, invisible: groupingEnabled === false },
        { label: "Highlight", onClick: actions.highlight },
        { label: "Copy (markdown)", onClick: actions.copyMarkdown, startGroup: true },
        { label: "Open (markdown)", onClick: actions.openMarkdown },
        { label: "Open in grid", onClick: actions.openGrid },
    ];
    if (count >= 2) {
        items.push({ label: "Group Selected", onClick: actions.groupSelected, startGroup: true, invisible: groupingEnabled === false });
    }
    items.push(
        { label: "Extract", onClick: actions.extract, startGroup: true },
        { label: "Extract with children", onClick: actions.extractWithChildren },
        { label: `Delete ${count} Node${count > 1 ? "s" : ""}`, onClick: actions.deleteNodes, startGroup: true },
    );
    return items;
}

// =============================================================================
// Empty area menu
// =============================================================================

/** Build context menu for right-click on empty area. */
export function buildEmptyAreaContextMenu(
    worldX: number,
    worldY: number,
    actions: ContextMenuActions,
): MenuItem[] {
    return [
        { label: "Add Node", onClick: () => actions.addNode(worldX, worldY) },
    ];
}
