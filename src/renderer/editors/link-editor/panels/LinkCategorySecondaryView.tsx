import React, { useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { useOptionalState } from "../../../core/state/state";
import { LinkCategoryPanel } from "./LinkCategoryPanel";
import { IconButton, Spacer } from "../../../uikit";
import { SaveIcon, SwapIcon } from "../../../theme/icons";
import { LinkEditor } from "../LinkEditor";

export default function LinkCategorySecondaryView({ model, headerRef }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks. The hook-using body
    // lives in an inner component so the React function called from render
    // always calls the same hooks in the same order.
    if (!(model instanceof LinkEditor)) {
        return null;
    }
    return <LinkCategorySecondaryViewBody editor={model} headerRef={headerRef} />;
}

function LinkCategorySecondaryViewBody({
    editor,
    headerRef,
}: {
    editor: LinkEditor;
    headerRef: SecondaryViewProps["headerRef"];
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

    const handleToggleMainEditor = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        editor.page?.promoteSecondaryToMain?.(editor);
    }, [editor]);

    const headerContent = (
        <>
            {isMainEditor ? "Categories" : "Links"}
            <Spacer />
            {!isMainEditor && modified && (
                <IconButton
                    name="link-category-secondary-save"
                    size="sm"
                    title="Save"
                    icon={<SaveIcon width={14} height={14} />}
                    onClick={handleSave}
                />
            )}
            <IconButton
                name="link-category-secondary-toggle-main"
                size="sm"
                title={isMainEditor ? "Demote to sidebar only" : "Open as main editor"}
                icon={<SwapIcon width={14} height={14} />}
                onClick={handleToggleMainEditor}
            />
        </>
    );

    return (
        <>
            {headerRef && createPortal(headerContent, headerRef)}
            <LinkCategoryPanel
                vm={editor}
                useOpenRawLink={!isMainEditor}
                categoriesOnly={isMainEditor}
                pageId={isMainEditor ? undefined : editor.page?.id}
            />
        </>
    );
}
