import React, { useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { SecondaryEditorProps } from "../../../ui/navigation/secondary-editor-registry";
import { useOptionalState } from "../../../core/state/state";
import { LinkCategoryPanel } from "./LinkCategoryPanel";
import { IconButton, Spacer } from "../../../uikit";
import { SaveIcon, SwapIcon } from "../../../theme/icons";
import { LinkEditor } from "../LinkEditor";

/**
 * EPIC-028 / US-555 — secondary-editor wrapper for the Categories sidebar
 * panel. `model` is always a v4 LinkEditor instance (legacy adapter path
 * retired by `attachEditorToPage` link-view branch).
 *
 * Today's duck-typed `(m as any).treeProvider = …` block retires — v4
 * LinkEditor exposes `treeProvider` / `selectByHref` / `selectionState` as
 * typed class members (LK9).
 *
 * Today's `updatePanels` useEffect (watching tags.length to add/drop
 * `link-tags` from the panel list) retires — v4 LinkEditor handles this
 * via `onMainEditorChanged` (LK8) + a tags-slice subscription inside
 * `adoptHost`.
 */
export default function LinkCategorySecondaryEditor({ model, headerRef }: SecondaryEditorProps) {
    if (!(model instanceof LinkEditor)) {
        return null;
    }
    const editor = model;

    // Subscribe to mainEditorId so we re-render on promote/demote toggle.
    const mainEditorId = useOptionalState(editor.page?.state, (s) => s.mainEditorId, null);
    const isMainEditor = mainEditorId === editor.id;

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
        editor.page?.promoteSecondaryToMain(editor);
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
