import { useCallback } from "react";
import { TComponentState } from "../../core/state/state";
import {
    Breadcrumb,
    Button,
    IconButton,
    Input,
} from "../../uikit";
import { showAppPopupMenu } from "../../ui/dialogs";
import {
    CloseIcon,
    PlusIcon,
    ViewLandscapeBigIcon,
    ViewLandscapeIcon,
    ViewListIcon,
    ViewPortraitBigIcon,
    ViewPortraitIcon,
} from "../../theme/icons";
import { TextChrome } from "../base/TextChrome";
import { LinkEditor, defaultLinkEditorState } from "./LinkEditor";
import { LinkBody } from "./LinkBody";
import type { LinkViewMode } from "./linkTypes";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-555 — native Link editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorInstance` is a v4-native LinkEditor instance.
 *
 * Toolbar composition (replaces today's three portals):
 *   - `toolbarContributions` (left of spacer): Breadcrumb (categories / tags /
 *     hostnames depending on expandedPanel).
 *   - `rightToolbarContributions` (right of spacer): Add Link button +
 *     view-mode menu + search input.
 *   - `footerContributions` (footer): filtered/total link count.
 */

// =============================================================================
// View mode labels / icons
// =============================================================================

const VIEW_MODE_LABELS: Record<LinkViewMode, string> = {
    "list": "List",
    "tiles-landscape": "Landscape",
    "tiles-landscape-big": "Landscape (Large)",
    "tiles-portrait": "Portrait",
    "tiles-portrait-big": "Portrait (Large)",
};

const VIEW_MODE_ICONS: Record<LinkViewMode, React.ReactNode> = {
    "list": <ViewListIcon />,
    "tiles-landscape": <ViewLandscapeIcon />,
    "tiles-landscape-big": <ViewLandscapeBigIcon />,
    "tiles-portrait": <ViewPortraitIcon />,
    "tiles-portrait-big": <ViewPortraitBigIcon />,
};

const VIEW_MODE_ORDER: LinkViewMode[] = [
    "list",
    "tiles-landscape",
    "tiles-landscape-big",
    "tiles-portrait",
    "tiles-portrait-big",
];

// =============================================================================
// Toolbar bits — left (breadcrumb)
// =============================================================================

export function LinkBreadcrumbBits({ model: editor }: { model: LinkEditor }) {
    const { expandedPanel, selectedCategory, selectedTag, selectedHostname } =
        editor.state.use((s) => ({
            expandedPanel: s.expandedPanel,
            selectedCategory: s.selectedCategory,
            selectedTag: s.selectedTag,
            selectedHostname: s.selectedHostname,
        }));

    if (expandedPanel === "tags") {
        return (
            <Breadcrumb
                name="link-editor-breadcrumb-tags"
                rootLabel="Tags"
                value={selectedTag}
                onChange={editor.setSelectedTag}
                separators=":"
                trailingParentSeparator
            />
        );
    }
    if (expandedPanel === "hostnames") {
        return (
            <Breadcrumb
                name="link-editor-breadcrumb-hostnames"
                rootLabel="Hostnames"
                value={selectedHostname}
                onChange={editor.setSelectedHostname}
            />
        );
    }
    return (
        <Breadcrumb
            name="link-editor-breadcrumb-categories"
            rootLabel="Categories"
            value={selectedCategory}
            onChange={editor.setSelectedCategory}
        />
    );
}

// =============================================================================
// Toolbar bits — right (actions + search)
// =============================================================================

export function LinkActionBits({ model: editor }: { model: LinkEditor }) {
    const { searchText } = editor.state.use((s) => ({ searchText: s.searchText }));
    const viewMode = editor.getViewMode();

    const showViewModeMenu = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        showAppPopupMenu(
            rect.left,
            rect.bottom + 2,
            VIEW_MODE_ORDER.map((mode) => ({
                label: VIEW_MODE_LABELS[mode],
                icon: VIEW_MODE_ICONS[mode],
                selected: mode === viewMode,
                onClick: () => editor.setViewMode(mode),
            })),
        );
    }, [editor, viewMode]);

    return (
        <>
            <Button
                name="link-editor-add"
                size="sm"
                variant="link"
                title="Add Link"
                icon={<PlusIcon />}
                onClick={() => editor.showLinkDialog()}
            >
                Add Link
            </Button>
            <Button
                name="link-editor-view-mode"
                size="sm"
                variant="ghost"
                title="View Mode"
                icon={VIEW_MODE_ICONS[viewMode]}
                onClick={showViewModeMenu}
            >
                {VIEW_MODE_LABELS[viewMode]}
            </Button>
            <Input
                name="link-editor-search"
                tone="accent"
                width={180}
                value={searchText}
                onChange={editor.setSearchText}
                placeholder="Search..."
                endSlot={
                    searchText ? (
                        <IconButton
                            name="link-editor-search-clear"
                            size="sm"
                            title="Clear search"
                            icon={<CloseIcon />}
                            onClick={editor.clearSearch}
                        />
                    ) : undefined
                }
            />
        </>
    );
}

// =============================================================================
// Footer bits — link count
// =============================================================================

export function LinkFooterBits({ model: editor }: { model: LinkEditor }) {
    const { filteredCount, totalCount } = editor.state.use((s) => ({
        filteredCount: s.filteredLinks.length,
        totalCount: s.data.links.length,
    }));
    return (
        <span>
            {filteredCount === totalCount
                ? `${totalCount} links`
                : `${filteredCount} of ${totalCount} links`}
        </span>
    );
}

// =============================================================================
// Module
// =============================================================================

function LinkEditorView({ model }: { model: EditorModel }) {
    const linkEditor = model as LinkEditor;
    return (
        <TextChrome
            model={model}
            toolbarContributions={<LinkBreadcrumbBits model={linkEditor} />}
            rightToolbarContributions={<LinkActionBits model={linkEditor} />}
            footerContributions={<LinkFooterBits model={linkEditor} />}
        >
            <LinkBody model={linkEditor} />
        </TextChrome>
    );
}

export const linkModule: EditorModule = {
    createEditor: () =>
        new LinkEditor(new TComponentState({ ...defaultLinkEditorState })),
    Component: LinkEditorView,
};

export { LinkEditor, defaultLinkEditorState };
export type { LinkEditorState, LinkQueueEvent, ExpandedPanel } from "./LinkEditor";
