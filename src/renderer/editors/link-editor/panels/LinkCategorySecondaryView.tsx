import React, { useCallback, useSyncExternalStore } from "react";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../../ui/secondary-views/SideBarPanelHeader";
import { useOptionalState } from "../../../core/state/state";
import { LinkCategoryPanel } from "./LinkCategoryPanel";
import { IconButton } from "../../../uikit";
import { SaveIcon, ChevronRightIcon } from "../../../theme/icons";
import { LinkEditor } from "../LinkEditor";

export default function LinkCategorySecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks. The hook-using body
    // lives in an inner component so the React function called from render
    // always calls the same hooks in the same order.
    if (!(model instanceof LinkEditor)) {
        return null;
    }
    return <LinkCategorySecondaryViewBody editor={model} headerRef={headerRef} icon={icon} />;
}

function LinkCategorySecondaryViewBody({
    editor,
    headerRef,
    icon,
}: {
    editor: LinkEditor;
    headerRef: SecondaryViewProps["headerRef"];
    icon: SecondaryViewProps["icon"];
}) {
    // Subscribe to page.state for the re-render signal; read the canonical value
    // from editor.isMain (US-600 / EPIC-029 Concern 2b).
    const isMainEditor = useOptionalState(editor.page?.state, () => editor.isMain, false);

    // Track host modified flag for the Save button (only visible in
    // standalone-secondary mode when modifications are pending).
    const host = editor.host;
    const modified = useSyncExternalStore(
        host ? (cb) => host.state.subscribe(cb) : () => () => undefined,
        host ? () => host.state.get().modified : () => false,
    );

    const handleSave = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        editor.host?.saveFile();
    }, [editor]);

    // Promote the Link editor back to the page's main view. Clicking a link in
    // the Collections panel opens its target as the main editor while this
    // editor survives as the secondary panel — this brings the links list back
    // into view. Hidden when the editor is already the main view (nothing to
    // return to); mirrors the directory-click promote in LinkCategoryPanel.
    const handleShowMain = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        editor.page?.promoteSecondaryToMain?.(editor);
    }, [editor]);

    const actions = !isMainEditor && (
        <>
            {modified && (
                <IconButton
                    name="link-category-secondary-save"
                    size="sm"
                    title="Save"
                    icon={<SaveIcon width={14} height={14} />}
                    onClick={handleSave}
                />
            )}
            <IconButton
                name="link-category-secondary-show-main"
                size="sm"
                title="Show links"
                icon={<ChevronRightIcon width={14} height={14} />}
                onClick={handleShowMain}
            />
        </>
    );

    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Collections" actions={actions} />
            <LinkCategoryPanel vm={editor} />
        </>
    );
}
