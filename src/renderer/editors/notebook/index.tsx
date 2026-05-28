import { TComponentState } from "../../core/state/state";
import { NotebookEditor, defaultNotebookEditorState } from "./NotebookEditor";
import { NotebookBody } from "./NotebookBody";
import { TextChrome } from "../base/v4/TextChrome";
import { Breadcrumb } from "../../uikit/Breadcrumb";
import { Button } from "../../uikit/Button";
import { IconButton } from "../../uikit/IconButton";
import { Input } from "../../uikit/Input";
import { CloseIcon, PlusIcon } from "../../theme/icons";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-557 — native Notebook editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native NotebookEditor instance.
 *
 * Contribution slots (NB-IMPL8 — replaces today's four portal targets):
 *   - `toolbarContributions` (left)  — Breadcrumb (tags or categories)
 *   - `rightToolbarContributions`    — Add Note button + Search input (+ clear)
 *   - `footerContributions`          — notes count: "<filtered> of <total>"
 *
 * NotebookBody composes NoteItemView + ExpandedNoteView. The per-note dispatch
 * (US-579) embeds v4 editors per note via `NoteItemActiveEditor` → the module's
 * `Body` slot (monaco notes keep `MiniTextEditor`); the legacy `acquireViewModel`
 * machinery is no longer used for notes.
 */

interface NotebookContributionProps {
    model: NotebookEditor;
}

function NotebookBreadcrumb({ model: editor }: NotebookContributionProps) {
    const { expandedPanel, selectedCategory, selectedTag } = editor.state.use((s) => ({
        expandedPanel: s.expandedPanel,
        selectedCategory: s.selectedCategory,
        selectedTag: s.selectedTag,
    }));
    return expandedPanel === "tags" ? (
        <Breadcrumb
            name="notebook-breadcrumb"
            rootLabel="Tags"
            value={selectedTag}
            onChange={editor.setSelectedTag}
            separators=":"
            trailingParentSeparator
            size="sm"
        />
    ) : (
        <Breadcrumb
            name="notebook-breadcrumb"
            rootLabel="Categories"
            value={selectedCategory}
            onChange={editor.setSelectedCategory}
            size="sm"
        />
    );
}

function NotebookToolbarBits({ model: editor }: NotebookContributionProps) {
    const searchText = editor.state.use((s) => s.searchText);
    return (
        <>
            <Button
                name="notebook-add-note"
                variant="primary"
                size="sm"
                icon={<PlusIcon />}
                title="Add Note"
                onClick={editor.addNote}
            >
                Add Note
            </Button>
            <Input
                name="notebook-search"
                size="sm"
                width={200}
                value={searchText}
                onChange={editor.setSearchText}
                placeholder="Search..."
                endSlot={
                    searchText ? (
                        <IconButton
                            name="notebook-search-clear"
                            size="sm"
                            icon={<CloseIcon />}
                            title="Clear search"
                            onClick={editor.clearSearch}
                        />
                    ) : null
                }
            />
        </>
    );
}

function NotebookFooterBits({ model: editor }: NotebookContributionProps) {
    const { filteredCount, totalCount } = editor.state.use((s) => ({
        filteredCount: s.filteredNotes.length,
        totalCount: s.data.notes.length,
    }));
    return (
        <span>
            {filteredCount === totalCount
                ? `${totalCount} notes`
                : `${filteredCount} of ${totalCount} notes`}
        </span>
    );
}

function NotebookEditorView({ model }: { model: V4EditorModel }) {
    const notebook = model as NotebookEditor;
    return (
        <TextChrome
            model={model}
            toolbarContributions={<NotebookBreadcrumb model={notebook} />}
            rightToolbarContributions={<NotebookToolbarBits model={notebook} />}
            footerContributions={<NotebookFooterBits model={notebook} />}
        >
            <NotebookBody model={notebook} />
        </TextChrome>
    );
}

export const notebookModule: EditorModule = {
    createEditor: () =>
        new NotebookEditor(new TComponentState({ ...defaultNotebookEditorState })),
    Component: NotebookEditorView,
};

// Barrel re-exports for consumers that import from "./notebook".
export { NotebookEditor, defaultNotebookEditorState };
export type { NotebookEditorState, NotebookQueueEvent } from "./NotebookEditor";
export type {
    NoteContent,
    NoteItem,
    NoteItemState,
    NotebookData,
    NotebookEditorProps,
    NotebookSource,
} from "./notebookTypes";
