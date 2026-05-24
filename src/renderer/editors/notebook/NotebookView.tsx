import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Breadcrumb } from "../../uikit/Breadcrumb";
import { Button } from "../../uikit/Button";
import { CollapsiblePanel, CollapsiblePanelStack } from "../../uikit/CollapsiblePanelStack";
import { IconButton } from "../../uikit/IconButton";
import { Input } from "../../uikit/Input";
import { Panel } from "../../uikit/Panel";
import { Splitter } from "../../uikit/Splitter";
import { Text } from "../../uikit/Text";
import { Tree } from "../../uikit/Tree";
import { HighlightedTextProvider } from "../../uikit/shared/highlight";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderFlexCellParams, Percent } from "../../uikit/RenderGrid";
import { CloseIcon, PlusIcon } from "../../theme/icons";
import { NotebookViewModel, defaultNotebookViewState, NotebookViewState } from "./NotebookViewModel";
import { NoteItemView } from "./NoteItemView";
import { ExpandedNoteView } from "./ExpandedNoteView";
import { NotebookEditorProps } from "./notebookTypes";
import { TagsListView } from "./TagsListView";
import { buildCategoryTreeItems, type CategoryItem } from "./category-tree";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../core/traits";
import { LINK } from "../link-editor/linkTraits";
import { EditorError } from "../base/EditorError";
import { useContentViewModel } from "../base/useContentViewModel";

// =============================================================================
// Component
// =============================================================================

const noopUnsubscribe = () => () => {};
const getDefaultState = () => defaultNotebookViewState;
const getColumnWidth = () => "100%" as Percent;

export function NotebookEditor({ model }: NotebookEditorProps) {
    const vm = useContentViewModel<NotebookViewModel>(model, "notebook-view");

    // Grid model ref for virtualized list updates (React rendering concern)
    const gridModelRef = useRef<RenderGridModel | null>(null);
    const setGridModel = useCallback((m: RenderGridModel | null) => {
        gridModelRef.current = m;
    }, []);

    // Always call hooks unconditionally (Rules of Hooks).
    // When vm is null (loading), subscribe to a no-op and return defaults.
    const pageState: NotebookViewState = useSyncExternalStore(
        vm ? (cb) => vm.state.subscribe(cb) : noopUnsubscribe,
        vm ? () => vm.state.get() : getDefaultState,
    );

    const allNotes = pageState.data.notes;
    const notes = pageState.filteredNotes;

    // Update virtualized grid when filteredNotes change (React rendering concern)
    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [notes]);

    const renderNoteCell = useCallback(
        (p: RenderFlexCellParams) => {
            const note = notes[p.row];
            if (!note || !vm) return null;
            return (
                <NoteItemView
                    key={note.id}
                    note={note}
                    notebookModel={vm}
                    categories={pageState.categories}
                    tags={pageState.tags}
                    onDelete={vm.deleteNote}
                    onExpand={vm.expandNote}
                    onAddComment={vm.addComment}
                    onCommentChange={vm.updateNoteComment}
                    onTitleChange={vm.updateNoteTitle}
                    onCategoryChange={vm.updateNoteCategory}
                    onTagAdd={vm.addNoteTag}
                    onTagRemove={vm.removeNoteTag}
                    onTagUpdate={vm.updateNoteTag}
                    cellRef={p.ref}
                />
            );
        },
        [notes, vm, pageState.categories, pageState.tags]
    );

    // Provide stored heights to RenderFlexGrid for initial row sizing
    const getInitialRowHeight = useCallback(
        (row: number) => {
            const note = notes[row];
            if (!note || !vm) return undefined;
            return vm.getNoteHeight(note.id);
        },
        [notes, vm]
    );

    // Build category tree items (label includes size badge per category).
    // pageState.categoriesSize is in the dep list so labels refresh when counts change.
    const categoryTreeItems = useMemo<CategoryItem[]>(() => {
        if (!vm) return [];
        return buildCategoryTreeItems(pageState.categories, vm.getCategorySize);
    }, [pageState.categories, pageState.categoriesSize, vm]);

    const isCategorySelected = useCallback(
        (item: CategoryItem) => item.category === pageState.selectedCategory,
        [pageState.selectedCategory],
    );

    const canCategoryTraitDrop = useCallback(
        (_dropItem: CategoryItem, payload: TraitDragPayload) => {
            if (payload.typeId === TraitTypeId.Note) return true;
            if (payload.typeId === TraitTypeId.NotebookCategory) return true;
            const traits = resolveTraits(payload.typeId);
            return !!traits?.get(LINK);
        },
        [],
    );

    if (!vm) return null;

    if (pageState.error) {
        return (
            <Panel direction="row" flex={1} overflow="hidden">
                <EditorError>{pageState.error}</EditorError>
            </Panel>
        );
    }

    return (
        <>
            {Boolean(model.editorToolbarRefFirst) &&
                createPortal(
                    pageState.expandedPanel === "tags" ? (
                        <Breadcrumb
                            name="notebook-breadcrumb"
                            rootLabel="Tags"
                            value={pageState.selectedTag}
                            onChange={vm.setSelectedTag}
                            separators=":"
                            trailingParentSeparator
                            size="sm"
                        />
                    ) : (
                        <Breadcrumb
                            name="notebook-breadcrumb"
                            rootLabel="Categories"
                            value={pageState.selectedCategory}
                            onChange={vm.setSelectedCategory}
                            size="sm"
                        />
                    ),
                    model.editorToolbarRefFirst
                )}
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <>
                        <Button
                            name="notebook-add-note"
                            variant="primary"
                            size="sm"
                            icon={<PlusIcon />}
                            title="Add Note"
                            onClick={vm.addNote}
                        >
                            Add Note
                        </Button>
                        <Input
                            name="notebook-search"
                            size="sm"
                            value={pageState.searchText}
                            onChange={vm.setSearchText}
                            placeholder="Search..."
                            endSlot={
                                pageState.searchText ? (
                                    <IconButton
                                        name="notebook-search-clear"
                                        size="sm"
                                        icon={<CloseIcon />}
                                        title="Clear search"
                                        onClick={vm.clearSearch}
                                    />
                                ) : null
                            }
                        />
                    </>,
                    model.editorToolbarRefLast
                )}
            <Panel name="notebook-body" direction="row" flex={1} overflow="hidden">
                <CollapsiblePanelStack
                    name="notebook-left-panel"
                    activePanel={pageState.expandedPanel}
                    setActivePanel={vm.setExpandedPanel}
                    width={pageState.leftPanelWidth}
                    minWidth={100}
                    maxWidth="80%"
                >
                    <CollapsiblePanel id="tags" title="Tags">
                        <TagsListView
                            tags={pageState.tags}
                            value={pageState.selectedTag}
                            onChange={vm.setSelectedTag}
                            getCount={vm.getTagSize}
                        />
                    </CollapsiblePanel>
                    <CollapsiblePanel id="categories" title="Categories">
                        <Panel name="notebook-categories-pane" direction="column" flex={1} overflow="hidden" paddingLeft="sm">
                            <Tree<CategoryItem>
                                name="notebook-categories-tree"
                                items={categoryTreeItems}
                                isSelected={isCategorySelected}
                                onChange={(item) => vm.categoryItemClick(item)}
                                traitTypeId={TraitTypeId.NotebookCategory}
                                getDragData={(item) => vm.getCategoryDragData(item)}
                                acceptsDrop
                                canTraitDrop={(target, payload) =>
                                    canCategoryTraitDrop(target, payload)
                                }
                                onTraitDrop={(target, payload) =>
                                    vm.categoryTraitDrop(target, payload)
                                }
                                defaultExpandAll
                            />
                        </Panel>
                    </CollapsiblePanel>
                </CollapsiblePanelStack>
                <Splitter
                    name="notebook-splitter"
                    orientation="vertical"
                    value={pageState.leftPanelWidth}
                    onChange={vm.setLeftPanelWidth}
                    border="after"
                    min={100}
                />
                <HighlightedTextProvider value={pageState.searchText}>
                    <Panel
                        name="notebook-notes-list"
                        direction="column"
                        flex={1}
                        overflow="hidden"
                        position="relative"
                    >
                        {allNotes.length === 0 ? (
                            <Panel
                                direction="column"
                                flex={1}
                                align="center"
                                justify="center"
                                gap="xl"
                                padding="xl"
                            >
                                <Text size="xxl">Notes</Text>
                                <Text color="light">No notes yet</Text>
                                <Text color="light">
                                    Click "Add Note" to create your first note
                                </Text>
                            </Panel>
                        ) : notes.length === 0 ? (
                            <Panel
                                direction="column"
                                flex={1}
                                align="center"
                                justify="center"
                                padding="xl"
                            >
                                <Text color="light">
                                    No notes match the current filter
                                </Text>
                            </Panel>
                        ) : (
                            <RenderFlexGrid
                                ref={setGridModel}
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
                    </Panel>
                </HighlightedTextProvider>
            </Panel>
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
                        notebookModel={vm}
                        categories={pageState.categories}
                        tags={pageState.tags}
                        onCollapse={vm.collapseNote}
                    />,
                    model.editorOverlayRef!
                );
            })()}
        </>
    );
}

const moduleExport = {
    Editor: NotebookEditor,
};

export default moduleExport;
