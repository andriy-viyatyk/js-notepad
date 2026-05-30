import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { CollapsiblePanel, CollapsiblePanelStack } from "../../uikit/CollapsiblePanelStack";
import { Panel } from "../../uikit/Panel";
import { Splitter } from "../../uikit/Splitter";
import { Text } from "../../uikit/Text";
import { Tree } from "../../uikit/Tree";
import { HighlightedTextProvider } from "../../uikit/shared/highlight";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderFlexCellParams, Percent } from "../../uikit/RenderGrid";
import { NoteItemView } from "./NoteItemView";
import { ExpandedNoteView } from "./ExpandedNoteView";
import { TagsListView } from "./TagsListView";
import { buildCategoryTreeItems, type CategoryItem } from "./category-tree";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../core/traits";
import { LINK } from "../link-editor/linkTraits";
import { EditorError } from "../base/EditorError";
import { NotebookEditor } from "./NotebookEditor";

interface NotebookBodyProps {
    model: NotebookEditor;
}

const getColumnWidth = () => "100%" as Percent;

export function NotebookBody({ model: editor }: NotebookBodyProps) {
    const state = editor.state.use((s) => ({
        data: s.data,
        error: s.error,
        leftPanelWidth: s.leftPanelWidth,
        expandedPanel: s.expandedPanel,
        categories: s.categories,
        categoriesSize: s.categoriesSize,
        tags: s.tags,
        selectedCategory: s.selectedCategory,
        selectedTag: s.selectedTag,
        searchText: s.searchText,
        filteredNotes: s.filteredNotes,
        expandedNoteId: s.expandedNoteId,
    }));

    // Queue focus handler — kept for Tier-5 symmetry; harmless no-op.
    editor.queue.use((ev) => {
        if (ev.type === "focus") {
            // No explicit refocus today; intentional no-op.
        }
    });

    // Grid model ref for virtualized list updates (React rendering concern)
    const gridModelRef = useRef<RenderGridModel | null>(null);
    const setGridModel = useCallback((m: RenderGridModel | null) => {
        gridModelRef.current = m;
    }, []);

    // Body row ref — used to compute the 80%-of-container cap dynamically on
    // each splitter drag so the state value can never exceed the visible cap
    // (avoids the state↔visual divergence bug where dragging right increases
    // state past the visible maxWidth and subsequent drags appear frozen).
    const bodyRef = useRef<HTMLDivElement>(null);
    const handleSplitterChange = useCallback(
        (width: number) => {
            const bodyWidth = bodyRef.current?.clientWidth ?? Infinity;
            const max = Math.floor(bodyWidth * 0.8);
            const clamped = Math.max(100, Math.min(max, width));
            editor.setLeftPanelWidth(clamped);
        },
        [editor],
    );

    const allNotes = state.data.notes;
    const notes = state.filteredNotes;

    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [notes]);

    const renderNoteCell = useCallback(
        (p: RenderFlexCellParams) => {
            const note = notes[p.row];
            if (!note) return null;
            return (
                <NoteItemView
                    key={note.id}
                    note={note}
                    notebookModel={editor}
                    categories={state.categories}
                    tags={state.tags}
                    onDelete={editor.deleteNote}
                    onExpand={editor.expandNote}
                    onAddComment={editor.addComment}
                    onCommentChange={editor.updateNoteComment}
                    onTitleChange={editor.updateNoteTitle}
                    onCategoryChange={editor.updateNoteCategory}
                    onTagAdd={editor.addNoteTag}
                    onTagRemove={editor.removeNoteTag}
                    onTagUpdate={editor.updateNoteTag}
                    cellRef={p.ref}
                />
            );
        },
        [notes, editor, state.categories, state.tags],
    );

    const getInitialRowHeight = useCallback(
        (row: number) => {
            const note = notes[row];
            if (!note) return undefined;
            return editor.getNoteHeight(note.id);
        },
        [notes, editor],
    );

    const categoryTreeItems = useMemo<CategoryItem[]>(() => {
        return buildCategoryTreeItems(state.categories, editor.getCategorySize);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- state.categoriesSize is read indirectly via editor.getCategorySize; needed to rebuild tree when sizes change
    }, [state.categories, state.categoriesSize, editor]);

    const isCategorySelected = useCallback(
        (item: CategoryItem) => item.category === state.selectedCategory,
        [state.selectedCategory],
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

    if (state.error) {
        return (
            <Panel direction="row" flex={1} overflow="hidden">
                <EditorError>{state.error}</EditorError>
            </Panel>
        );
    }

    // ExpandedNoteView portals into the TextFileModel's editor-overlay div
    // (set by TextChrome via `textHost.setEditorOverlayRef`).
    const expandedNote =
        state.expandedNoteId && allNotes.find((n) => n.id === state.expandedNoteId);
    const overlayRef = editor.host?.editorOverlayRef ?? null;

    return (
        <>
            <Panel name="notebook-body" ref={bodyRef} direction="row" flex={1} overflow="hidden">
                <Panel
                    name="notebook-left-panel"
                    direction="column"
                    overflow="hidden"
                    width={state.leftPanelWidth}
                    minWidth={100}
                    maxWidth="80%"
                    shrink={false}
                >
                    <CollapsiblePanelStack
                        name="notebook-left-stack"
                        activePanel={state.expandedPanel}
                        setActivePanel={editor.setExpandedPanel}
                        height="100%"
                    >
                        <CollapsiblePanel id="tags" title="Tags">
                            <TagsListView
                                tags={state.tags}
                                value={state.selectedTag}
                                onChange={editor.setSelectedTag}
                                getCount={editor.getTagSize}
                            />
                        </CollapsiblePanel>
                        <CollapsiblePanel id="categories" title="Categories">
                            <Panel
                                name="notebook-categories-pane"
                                direction="column"
                                flex={1}
                                overflow="hidden"
                                paddingLeft="sm"
                            >
                                <Tree<CategoryItem>
                                    name="notebook-categories-tree"
                                    items={categoryTreeItems}
                                    isSelected={isCategorySelected}
                                    onChange={(item) => editor.categoryItemClick(item)}
                                    traitTypeId={TraitTypeId.NotebookCategory}
                                    getDragData={(item) => editor.getCategoryDragData(item)}
                                    acceptsDrop
                                    canTraitDrop={(target, payload) =>
                                        canCategoryTraitDrop(target, payload)
                                    }
                                    onTraitDrop={(target, payload) =>
                                        editor.categoryTraitDrop(target, payload)
                                    }
                                    defaultExpandAll
                                />
                            </Panel>
                        </CollapsiblePanel>
                    </CollapsiblePanelStack>
                </Panel>
                <Splitter
                    name="notebook-splitter"
                    orientation="vertical"
                    value={state.leftPanelWidth}
                    onChange={handleSplitterChange}
                    border="after"
                    min={100}
                />
                <HighlightedTextProvider value={state.searchText}>
                    <Panel
                        name="notebook-notes-list"
                        direction="column"
                        flex={1}
                        width={0}
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
                                <Text color="light">No notes match the current filter</Text>
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
            {Boolean(overlayRef) && expandedNote && createPortal(
                <ExpandedNoteView
                    note={expandedNote}
                    notebookModel={editor}
                    categories={state.categories}
                    tags={state.tags}
                    onCollapse={editor.collapseNote}
                />,
                overlayRef!,
            )}
        </>
    );
}
