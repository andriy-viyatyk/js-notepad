import { useCallback, useEffect, useMemo } from "react";
import { ui } from "../../api/ui";
import { toolsTrust } from "../../api/tools/tools-trust";
import { registeredTools } from "../../api/tools/registered-tools";
import { openToolset } from "../../content/persephone-toolset-link";
import type { MenuItem } from "../../uikit";
import { Text } from "../../uikit/Text";
import { RemoveIcon } from "../../theme/icons";
import { ToolsTree } from "../../editors/tools/ToolsTree";

// =============================================================================
// Global "Tools" segment list (EPIC-038 / US-805). Renders the machine-wide
// registered-tools registry via the shared `ToolsTree` in multi-root mode — the
// tools analog of `TrustedBoardsList`. Clicking a toolset opens its editor in a
// new page; the context-menu "Remove" untrusts (forgets) the toolset.
// =============================================================================

interface TrustedToolsListProps {
    onClose?: () => void;
}

export function TrustedToolsList({ onClose }: TrustedToolsListProps) {
    // registered-tools is a global reactive model; ensureInitialized() loads the registry then
    // enumerates (idempotent — a re-mount or concurrent load is safe).
    useEffect(() => {
        void registeredTools.ensureInitialized();
    }, []);

    const allToolsets = registeredTools.useToolsets();

    const toolsets = useMemo(
        () => allToolsets.map((t) => ({ root: t.root, name: t.name })),
        [allToolsets],
    );

    // The global list is not page-scoped → open in a NEW page (no pageId).
    const handleOpen = useCallback((root: string) => {
        openToolset(root);
        onClose?.();
    }, [onClose]);

    // "Remove" untrusts only — it forgets the toolset, never deleting the folder on disk.
    const handleRemove = useCallback(async (root: string) => {
        await toolsTrust.untrust(root);
        ui.notify("Removed from tools", "info");
    }, []);

    const getContextMenu = useCallback((root: string): MenuItem[] => [
        {
            label: "Remove",
            icon: <RemoveIcon width={14} height={14} />,
            onClick: () => { void handleRemove(root); },
        },
    ], [handleRemove]);

    return (
        <ToolsTree
            name="sidebar-trusted-tools-list"
            toolsets={toolsets}
            onOpenToolset={handleOpen}
            getContextMenu={getContextMenu}
            emptyMessage={<Text size="sm" color="light">No registered tools yet</Text>}
        />
    );
}
