import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderFlexCellParams, Percent } from "../../uikit/RenderGrid";
import { panelExpanded } from "../../core/state/events";
import { NoteItemView } from "./NoteItemView";
import { ExpandedNoteView } from "./ExpandedNoteView";
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
        categories: s.categories,
        tags: s.tags,
        searchText: s.searchText,
        filteredNotes: s.filteredNotes,
        expandedNoteId: s.expandedNoteId,
    }));

    const pageId = editor.page?.id;

    // panelExpanded global event → maps sidebar panel IDs to expandedPanel state
    // (drives the breadcrumb + the active-panel-scoped filter when the user
    // switches the active sidebar panel). Mirrors LinkBody.
    useEffect(() => {
        if (!pageId) return;
        const sub = panelExpanded.subscribe((event) => {
            if (event?.pageId !== pageId) return;
            const map: Record<string, string> = {
                "notebook-categories": "categories",
                "notebook-tags": "tags",
            };
            const expanded = map[event.panelId];
            if (expanded) editor.setExpandedPanel(expanded);
        });
        return () => sub.unsubscribe();
    }, [pageId, editor]);

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
                    searchText={state.searchText}
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
        [notes, editor, state.categories, state.tags, state.searchText],
    );

    const getInitialRowHeight = useCallback(
        (row: number) => {
            const note = notes[row];
            if (!note) return undefined;
            return editor.getNoteHeight(note.id);
        },
        [notes, editor],
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
            <Panel name="notebook-body" direction="column" flex={1} overflow="hidden">
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
                                <Text color="light">No notes match the current filter</Text>
                            </Panel>
                        ) : (
                            <RenderFlexGrid
                                onModel={setGridModel}
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
            </Panel>
            {Boolean(overlayRef) && expandedNote && createPortal(
                <ExpandedNoteView
                    note={expandedNote}
                    notebookModel={editor}
                    categories={state.categories}
                    tags={state.tags}
                    searchText={state.searchText}
                    onCollapse={editor.collapseNote}
                />,
                overlayRef,
            )}
        </>
    );
}
