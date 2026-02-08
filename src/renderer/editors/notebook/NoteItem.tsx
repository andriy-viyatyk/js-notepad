import styled from "@emotion/styled";
import { RefObject, useEffect, useMemo } from "react";
import { NoteItem as NoteItemType } from "./notebookTypes";
import { NotebookEditorModel } from "./NotebookEditorModel";
import { NoteItemEditModel } from "./note-editor/NoteItemEditModel";
import { NoteItemToolbar } from "./note-editor/NoteItemToolbar";
import { NoteItemActiveEditor } from "./note-editor/NoteItemActiveEditor";
import color from "../../theme/color";
import { CircleIcon, DeleteIcon, WindowMaximizeIcon } from "../../theme/icons";
import { Button } from "../../components/basic/Button";
import { EditorConfigProvider, EditorStateStorageProvider, useObjectStateStorage } from "../base";

// Max height for editors embedded in note items
const NOTE_EDITOR_MAX_HEIGHT = 400;

// =============================================================================
// Types
// =============================================================================

interface NoteItemViewProps {
    note: NoteItemType;
    notebookModel: NotebookEditorModel;
    onDelete?: (id: string) => void;
    onExpand?: (id: string) => void;
    onAddComment?: (id: string) => void;
    onTitleChange?: (id: string, title: string) => void;
    /** Ref for RenderFlexGrid height detection */
    cellRef?: RefObject<HTMLDivElement>;
}

// =============================================================================
// Styles
// =============================================================================

const NoteItemRoot = styled.div({
    width: "100%",
    height: "fit-content",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    backgroundColor: color.background.default,
    padding: "8px 48px 8px 24px",  // Extra left padding for dot, right for scroll area

    // Note indicator dot with vertical line - absolute positioned
    "& .note-indicator": {
        position: "absolute",
        left: 4,
        top: 12,
        bottom: 8,
        width: 16,
        color: color.text.light,
        transition: "color 0.15s ease",
        "& svg": {
            width: 16,
            height: 16,
        },
        // Vertical line under the dot (centered)
        "&::after": {
            content: "''",
            position: "absolute",
            left: "50%",
            top: 16, // Start right below the 16px icon
            bottom: 0,
            width: 1,
            backgroundColor: color.background.light, // Same as content-area border on hover
            transition: "background-color 0.15s ease",
        },
    },

    // Active state - blue dot and line
    "&:focus-within .note-indicator": {
        color: color.misc.blue,
        "&::after": {
            backgroundColor: color.misc.blue,
        },
    },

    // First toolbar - items hidden by default
    "& .toolbar-hover": {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 4px",
        fontSize: 12,
        color: color.text.light,
    },

    "& .toolbar-hover-content": {
        display: "flex",
        alignItems: "center",
        gap: 8,
        flex: 1,
        opacity: 0,
        transition: "opacity 0.15s ease",
    },

    // Second toolbar
    "& .toolbar-main": {
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 4px",
        marginBottom: 2,
    },

    // Editor extras (switch, run buttons) - hidden by default
    "& .editor-extras": {
        display: "flex",
        alignItems: "center",
        gap: 4,
        opacity: 0,
        transition: "opacity 0.15s ease",
    },

    // Hover/focus states - show hidden elements
    "&:hover, &:focus-within": {
        "& .toolbar-hover-content": {
            opacity: 1,
        },
        "& .editor-extras": {
            opacity: 1,
        },
        "& .add-comment-btn": {
            opacity: 0.5,
        },
        "& .content-area": {
            borderColor: color.background.light,
        },
    },

    // Category/tag badges
    "& .category": {
        padding: "2px 6px",
        backgroundColor: color.background.light,
        borderRadius: 3,
        cursor: "pointer",
        "&:hover": {
            backgroundColor: color.background.selection,
        },
    },

    "& .tag": {
        padding: "2px 6px",
        backgroundColor: color.background.dark,
        borderRadius: 3,
        cursor: "pointer",
        "&:hover": {
            backgroundColor: color.background.light,
        },
    },

    "& .spacer": {
        flex: 1,
    },

    "& .date": {
        color: color.text.light,
        fontSize: 11,
    },

    // Title input
    "& .title-input": {
        flex: 1,
        border: "none",
        background: "transparent",
        color: color.text.default,
        fontSize: 14,
        fontWeight: 500,
        outline: "none",
        padding: "2px 4px",
        "&::placeholder": {
            color: color.text.light,
        },
        "&:focus": {
            backgroundColor: color.background.dark,
        },
    },

    // Content area - height controlled by editor inside
    "& .content-area": {
        border: "1px solid transparent",
        borderRadius: 2,
        margin: "0 4px",
        transition: "border-color 0.15s ease",
    },

    // Comment section
    "& .comment-section": {
        padding: "0 4px",
        fontSize: 12,
        flexShrink: 0,
    },

    "& .comment-text": {
        color: color.text.light,
        fontStyle: "italic",
    },

    "& .add-comment-btn": {
        opacity: 0,
        fontSize: 11,
        cursor: "pointer",
        color: color.text.light,
        transition: "opacity 0.15s ease",
        "&:hover": {
            opacity: 1,
        },
    },
});

// =============================================================================
// Component
// =============================================================================

export function NoteItemView({
    note,
    notebookModel,
    onDelete,
    onExpand,
    onAddComment,
    onTitleChange,
    cellRef,
}: NoteItemViewProps) {
    // Create edit model for this note
    const editModel = useMemo(() => {
        return new NoteItemEditModel(notebookModel, note);
    }, [note.id]); // Only recreate if note id changes

    // Create state storage backed by notebook's data.state
    const stateStorage = useObjectStateStorage(
        notebookModel.getNoteState,
        notebookModel.setNoteState
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            editModel.dispose();
        };
    }, [editModel]);

    // Sync edit model when note data changes externally
    useEffect(() => {
        editModel.syncFromNote(note);
    }, [note.content.content, note.content.language, note.content.editor]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onTitleChange?.(note.id, e.target.value);
    };

    return (
        <NoteItemRoot ref={cellRef} tabIndex={0}>
            {/* Note indicator dot */}
            <div className="note-indicator">
                <CircleIcon />
            </div>

            {/* First toolbar - items visible on hover/focus */}
            <div className="toolbar-hover">
                <div className="toolbar-hover-content">
                    <span className="category">
                        {note.category || "No category"}
                    </span>
                    {note.tags.map((tag: string) => (
                        <span key={tag} className="tag">
                            {tag}
                        </span>
                    ))}
                    <div className="spacer" />
                    <span className="date">{formatDate(note.updatedDate)}</span>
                    <Button
                        size="small"
                        type="flat"
                        title="Expand"
                        onClick={() => onExpand?.(note.id)}
                    >
                        <WindowMaximizeIcon />
                    </Button>
                    <Button
                        size="small"
                        type="flat"
                        title="Delete"
                        onClick={() => onDelete?.(note.id)}
                    >
                        <DeleteIcon />
                    </Button>
                </div>
            </div>

            {/* Second toolbar - language | title | extras */}
            <div className="toolbar-main">
                <NoteItemToolbar model={editModel}>
                    <input
                        className="title-input"
                        type="text"
                        placeholder="Untitled note"
                        value={note.title}
                        onChange={handleTitleChange}
                    />
                </NoteItemToolbar>
            </div>

            {/* Content area - Monaco or alternative editor */}
            <div className="content-area">
                <EditorStateStorageProvider storage={stateStorage}>
                    <EditorConfigProvider config={{ maxEditorHeight: NOTE_EDITOR_MAX_HEIGHT, hideMinimap: true, disableAutoFocus: true }}>
                        <NoteItemActiveEditor model={editModel} />
                    </EditorConfigProvider>
                </EditorStateStorageProvider>
            </div>

            {/* Comment section - always show if has comment, show add button on hover */}
            <div className="comment-section">
                {note.comment ? (
                    <span className="comment-text">{note.comment}</span>
                ) : (
                    <span
                        className="add-comment-btn"
                        onClick={() => onAddComment?.(note.id)}
                    >
                        + Add comment
                    </span>
                )}
            </div>
        </NoteItemRoot>
    );
}
