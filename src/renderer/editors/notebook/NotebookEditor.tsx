import styled from "@emotion/styled";
import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Breadcrumb } from "../../components/basic/Breadcrumb";
import { Button } from "../../components/basic/Button";
import { TagsList } from "../../components/basic/TagsList";
import { TextField } from "../../components/basic/TextField";
import { HighlightedTextProvider } from "../../components/basic/useHighlightedText";
import { CollapsiblePanel, CollapsiblePanelStack } from "../../components/layout/CollapsiblePanelStack";
import { Splitter } from "../../components/layout/Splitter";
import { CategoryTree, CategoryTreeItem } from "../../components/TreeView";
import {
    RenderFlexCellParams,
    RenderFlexGrid,
} from "../../components/virtualization/RenderGrid/RenderFlexGrid";
import { Percent } from "../../components/virtualization/RenderGrid/types";
import { useComponentModel } from "../../core/state/model";
import { splitWithSeparators } from "../../core/utils/utils";
import color from "../../theme/color";
import { CloseIcon, PlusIcon } from "../../theme/icons";
import {
    defaultNotebookEditorState,
    NotebookEditorModel,
} from "./NotebookEditorModel";
import { NoteItemView } from "./NoteItemView";
import { ExpandedNoteView } from "./ExpandedNoteView";
import { NotebookEditorProps, NOTE_DRAG, CATEGORY_DRAG } from "./notebookTypes";

// =============================================================================
// Styles
// =============================================================================

const NotebookEditorRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
    "& .left-panel": {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: color.background.dark,
        minWidth: 100,
        maxWidth: "80%",
    },
    "& .left-panel-content": {
        padding: 8,
        color: color.text.light,
        fontSize: 13,
    },
    "& .category-tree-container": {
        flex: 1,
        display: "flex",
        overflow: "hidden",
        fontSize: 13,
    },
    "& .tags-list-container": {
        flex: 1,
        display: "flex",
        overflow: "hidden",
        width: "100%",
    },
    "& .category-label-name": {
        flex: "1 1 auto",
    },
    "& .category-label-size": {
        margin: "0 4px",
        fontSize: 12,
    },
    "& .tree-cell": {
        color: color.text.light,
        "&.selected": {
            color: color.misc.blue,
        },
    },
    "& .center-panel": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
    },
    "& .empty-state": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 16,
        color: color.text.light,
        fontSize: 14,
    },
    "& .notes-grid": {
        flex: 1,
    },
    "& .title": {
        fontSize: 24,
        color: color.text.default,
    },
    "& .subtitle": {
        color: color.text.light,
    },
    "& .error": {
        whiteSpace: "pre-wrap",
        margin: "auto",
        padding: 24,
        color: color.misc.yellow,
    },
});

const SearchField = styled(TextField)({
    "& input": {
        color: color.misc.blue,
    },
});

// =============================================================================
// Component
// =============================================================================

const getColumnWidth = () => "100%" as Percent;

export function NotebookEditor(props: NotebookEditorProps) {
    const { model } = props;
    const pageModel = useComponentModel(
        props,
        NotebookEditorModel,
        defaultNotebookEditorState
    );
    const state = model.state.use();
    const pageState = pageModel.state.use();
    const allNotes = pageState.data.notes;
    const notes = pageState.filteredNotes;

    useEffect(() => {
        pageModel.init();
        return () => pageModel.dispose();
    }, []);

    useEffect(() => {
        pageModel.updateContent(state.content || "");
    }, [state.content]);

    // Re-render all grid cells when notes array changes
    // (handles add, delete, reorder, external data reload)
    useEffect(() => {
        pageModel.gridModel?.update({ all: true });
    }, [notes]);

    const renderNoteCell = useCallback(
        (p: RenderFlexCellParams) => {
            const note = notes[p.row];
            if (!note) return null;
            return (
                <NoteItemView
                    key={note.id}
                    note={note}
                    notebookModel={pageModel}
                    categories={pageState.categories}
                    tags={pageState.tags}
                    onDelete={pageModel.deleteNote}
                    onExpand={pageModel.expandNote}
                    onAddComment={pageModel.addComment}
                    onCommentChange={pageModel.updateNoteComment}
                    onTitleChange={pageModel.updateNoteTitle}
                    onCategoryChange={pageModel.updateNoteCategory}
                    onTagAdd={pageModel.addNoteTag}
                    onTagRemove={pageModel.removeNoteTag}
                    onTagUpdate={pageModel.updateNoteTag}
                    cellRef={p.ref}
                />
            );
        },
        [notes, pageModel, pageState.categories, pageState.tags]
    );

    // Provide stored heights to RenderFlexGrid for initial row sizing
    const getInitialRowHeight = useCallback(
        (row: number) => {
            const note = notes[row];
            if (!note) return undefined;
            return pageModel.getNoteHeight(note.id);
        },
        [notes, pageModel]
    );

    // Category tree label with note count
    const getTreeItemLabel = useCallback(
        (item: CategoryTreeItem) => {
            const name = splitWithSeparators(item.category, "/\\").pop() || "";
            const size = pageModel.getCategorySize(item.category);
            return (
                <>
                    <span className="category-label-name">{name || "All"}</span>
                    {size !== undefined && (
                        <span className="category-label-size">{size}</span>
                    )}
                </>
            );
        },
        [pageModel, pageState.categoriesSize]
    );

    if (pageState.error) {
        return (
            <NotebookEditorRoot>
                <div className="error">{pageState.error}</div>
            </NotebookEditorRoot>
        );
    }

    return (
        <>
            {Boolean(model.editorToolbarRefFirst) &&
                createPortal(
                    pageState.expandedPanel === "tags" ? (
                        <Breadcrumb
                            rootLabel="Tags"
                            value={pageState.selectedTag}
                            onChange={pageModel.setSelectedTag}
                            separators=":"
                            trailingParentSeparator
                        />
                    ) : (
                        <Breadcrumb
                            rootLabel="Categories"
                            value={pageState.selectedCategory}
                            onChange={pageModel.setSelectedCategory}
                        />
                    ),
                    model.editorToolbarRefFirst
                )}
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <>
                        <Button
                            size="small"
                            type="flat"
                            title="Add Note"
                            onClick={pageModel.addNote}
                        >
                            <PlusIcon /> Add Note&nbsp;
                        </Button>
                        <SearchField
                            value={pageState.searchText}
                            onChange={pageModel.setSearchText}
                            placeholder="Search..."
                            endButtons={
                                pageState.searchText ? [
                                    <Button
                                        key="clear"
                                        size="small"
                                        type="icon"
                                        title="Clear search"
                                        onClick={pageModel.clearSearch}
                                    >
                                        <CloseIcon />
                                    </Button>,
                                ] : undefined
                            }
                        />
                    </>,
                    model.editorToolbarRefLast
                )}
            <NotebookEditorRoot>
                <CollapsiblePanelStack
                    className="left-panel"
                    style={{ width: pageState.leftPanelWidth }}
                    activePanel={pageState.expandedPanel}
                    setActivePanel={pageModel.setExpandedPanel}
                >
                    <CollapsiblePanel id="tags" title="Tags">
                        <div className="tags-list-container">
                            <TagsList
                                tags={pageState.tags}
                                value={pageState.selectedTag}
                                onChange={pageModel.setSelectedTag}
                                getCount={pageModel.getTagSize}
                            />
                        </div>
                    </CollapsiblePanel>
                    <CollapsiblePanel id="categories" title="Categories">
                        <div className="category-tree-container">
                            <CategoryTree
                                categories={pageState.categories}
                                separators="/\"
                                rootLabel="All"
                                rootCollapsible={false}
                                onItemClick={pageModel.categoryItemClick}
                                getSelected={pageModel.getCategoryItemSelected}
                                getLabel={getTreeItemLabel}
                                refreshKey={pageState.selectedCategory}
                                dropTypes={[NOTE_DRAG, CATEGORY_DRAG]}
                                onDrop={pageModel.categoryDrop}
                                dragType={CATEGORY_DRAG}
                                getDragItem={pageModel.getCategoryDragItem}
                            />
                        </div>
                    </CollapsiblePanel>
                </CollapsiblePanelStack>
                <Splitter
                    type="vertical"
                    initialWidth={pageState.leftPanelWidth}
                    onChangeWidth={pageModel.setLeftPanelWidth}
                    borderSized="right"
                />
                <HighlightedTextProvider value={pageState.searchText}>
                    <div className="center-panel">
                        {allNotes.length === 0 ? (
                            <div className="empty-state">
                                <div className="title">Notes</div>
                                <div className="subtitle">No notes yet</div>
                                <div className="subtitle">
                                    Click "Add Note" to create your first note
                                </div>
                            </div>
                        ) : notes.length === 0 ? (
                            <div className="empty-state">
                                <div className="subtitle">No notes match the current filter</div>
                            </div>
                        ) : (
                            <RenderFlexGrid
                                ref={pageModel.setGridModel}
                                className="notes-grid"
                                columnCount={1}
                                rowCount={notes.length}
                                columnWidth={getColumnWidth}
                                renderCell={renderNoteCell}
                                fitToWidth
                                minRowHeight={100}
                                maxRowHeight={800}
                                getInitialRowHeight={getInitialRowHeight}
                            />
                        )}
                    </div>
                </HighlightedTextProvider>
            </NotebookEditorRoot>
            {Boolean(model.editorFooterRefLast) &&
                createPortal(
                    <span>
                        {notes.length === allNotes.length
                            ? `${allNotes.length} notes`
                            : `${notes.length} of ${allNotes.length} notes`}
                    </span>,
                    model.editorFooterRefLast
                )}
            {Boolean(model.editorOverlayRef) && pageState.expandedNoteId && (() => {
                const expandedNote = allNotes.find(n => n.id === pageState.expandedNoteId);
                if (!expandedNote) return null;
                return createPortal(
                    <ExpandedNoteView
                        note={expandedNote}
                        notebookModel={pageModel}
                        categories={pageState.categories}
                        tags={pageState.tags}
                        onCollapse={pageModel.collapseNote}
                    />,
                    model.editorOverlayRef!
                );
            })()}
        </>
    );
}
