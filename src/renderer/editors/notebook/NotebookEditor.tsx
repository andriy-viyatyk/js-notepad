import styled from "@emotion/styled";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/basic/Button";
import { Splitter } from "../../components/layout/Splitter";
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
        alignItems: "center",
        gap: 16,
        padding: 16,
        color: color.text.light,
        fontSize: 14,
        overflow: "auto",
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

export function NotebookEditor(props: NotebookEditorProps) {
    const { model } = props;
    const pageModel = useComponentModel(
        props,
        NotebookEditorModel,
        defaultNotebookEditorState
    );
    const state = model.state.use();
    const pageState = pageModel.state.use();

    useEffect(() => {
        pageModel.init();
        return () => pageModel.dispose();
    }, []);

    useEffect(() => {
        pageModel.updateContent(state.content || "");
    }, [state.content]);

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
                    {pageState.data.notes.length === 0 ? (
                        <>
                            <div className="title">Notes</div>
                            <div className="subtitle">No notes yet</div>
                            <div className="subtitle">
                                Click "Add Note" to create your first note
                            </div>
                        </>
                    ) : (
                        pageState.data.notes.map((note) => (
                            <NoteItemView
                                key={note.id}
                                note={note}
                                notebookModel={pageModel}
                                onDelete={pageModel.deleteNote}
                                onExpand={pageModel.expandNote}
                                onAddComment={pageModel.addComment}
                                onTitleChange={pageModel.updateNoteTitle}
                            />
                        ))
                    )}
                </div>
            </NotebookEditorRoot>
        </>
    );
}
