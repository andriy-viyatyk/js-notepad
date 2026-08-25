import React, { useCallback, useEffect, useMemo } from "react";
import { ui } from "../../api/ui";
import { toolsTrust } from "../../api/tools/tools-trust";
import { registeredTools } from "../../api/tools/registered-tools";
import { openToolset } from "../../content/persephone-toolset-link";
import type { MenuItem } from "../../uikit";
import { createTextElement } from "../../uikit/Text/text-style";
import { ToolsTree } from "../../editors/tools/ToolsTree";
import { fillSlot } from "../../uikit/shared/fill-slot";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";

export interface TrustedToolsListProps {
    onClose?: () => void;
}

function TrustedToolsTreeSlot({ onClose }: TrustedToolsListProps) {
    useEffect(() => {
        void registeredTools.ensureInitialized();
    }, []);

    const allToolsets = registeredTools.useToolsets();
    const toolsets = useMemo(
        () => allToolsets.map((toolset) => ({ root: toolset.root, name: toolset.name })),
        [allToolsets],
    );

    const handleOpen = useCallback((root: string) => {
        openToolset(root);
        onClose?.();
    }, [onClose]);

    const handleRemove = useCallback(async (root: string) => {
        await toolsTrust.untrust(root);
        ui.notify("Removed from tools", "info");
    }, []);

    const getContextMenu = useCallback((root: string): MenuItem[] => [
        {
            label: "Remove",
            icon: createIconElement("remove", { width: 14, height: 14 }),
            onClick: () => { void handleRemove(root); },
        },
    ], [handleRemove]);

    return (
        <ToolsTree
            name="sidebar-trusted-tools-list"
            toolsets={toolsets}
            onOpenToolset={handleOpen}
            getContextMenu={getContextMenu}
            emptyMessage={createTextElement("No registered tools yet", { size: "sm", color: "light" })}
        />
    );
}

export class TrustedToolsListView extends VanillaView<TrustedToolsListProps> {
    private slotCleanup: (() => void) | undefined;

    public constructor(props: TrustedToolsListProps) {
        super(props);
        this.root.dataset.type = "trusted-tools-list";
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.renderSlot();
    }

    protected onUpdate(): void {
        this.renderSlot();
    }

    protected onDispose(): void {
        this.slotCleanup?.();
        this.slotCleanup = undefined;
    }

    private renderSlot(): void {
        this.slotCleanup = fillSlot(
            this.root,
            React.createElement(TrustedToolsTreeSlot, { onClose: this.props.onClose }),
        );
    }
}
