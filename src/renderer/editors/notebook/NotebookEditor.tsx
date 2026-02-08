import styled from "@emotion/styled";
import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/basic/Button";
import { Splitter } from "../../components/layout/Splitter";
import {
    RenderFlexCellParams,
    RenderFlexGrid,
} from "../../components/virtualization/RenderGrid/RenderFlexGrid";
import { Percent } from "../../components/virtualization/RenderGrid/types";
import { useComponentModel } from "../../core/state/model";
import color from "../../theme/color";
import { PlusIcon } from "../../theme/icons";
import {
    defaultNotebookEditorState,
    NotebookEditorModel,
} from "./NotebookEditorModel";
import { NoteItemView } from "./NoteItem";
import { NotebookEditorProps } from "./notebookTypes";

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
    "& .panel-header": {
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 500,
        color: color.text.light,
        borderBottom: `1px solid ${color.background.light}`,
    },
    "& .panel-content": {
        flex: 1,
        overflow: "auto",
        padding: 8,
        color: color.text.light,
        fontSize: 13,
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
    const notes = pageState.data.notes;

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
                    note={note}
                    notebookModel={pageModel}
                    onDelete={pageModel.deleteNote}
                    onExpand={pageModel.expandNote}
                    onAddComment={pageModel.addComment}
                    onTitleChange={pageModel.updateNoteTitle}
                    cellRef={p.ref}
                />
            );
        },
        [notes, pageModel]
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

    if (pageState.error) {
        return (
            <NotebookEditorRoot>
                <div className="error">{pageState.error}</div>
            </NotebookEditorRoot>
        );
    }

    return (
        <>
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <Button
                        size="small"
                        type="flat"
                        title="Add Note"
                        onClick={pageModel.addNote}
                    >
                        <PlusIcon /> Add Note&nbsp;
                    </Button>,
                    model.editorToolbarRefLast
                )}
            <NotebookEditorRoot>
                <div
                    className="left-panel"
                    style={{ width: pageState.leftPanelWidth }}
                >
                    <div className="panel-header">Categories</div>
                    <div className="panel-content">
                        (categories will be here)
                    </div>
                </div>
                <Splitter
                    type="vertical"
                    initialWidth={pageState.leftPanelWidth}
                    onChangeWidth={pageModel.setLeftPanelWidth}
                    borderSized="right"
                />
                <div className="center-panel">
                    {notes.length === 0 ? (
                        <div className="empty-state">
                            <div className="title">Notes</div>
                            <div className="subtitle">No notes yet</div>
                            <div className="subtitle">
                                Click "Add Note" to create your first note
                            </div>
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
                            maxRowHeight={600}
                            getInitialRowHeight={getInitialRowHeight}
                        />
                    )}
                </div>
            </NotebookEditorRoot>
        </>
    );
}
