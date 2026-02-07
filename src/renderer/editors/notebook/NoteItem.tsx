import styled from "@emotion/styled";
import { useEffect, useMemo } from "react";
import { NoteItem as NoteItemType } from "./notebookTypes";
import { NotebookEditorModel } from "./NotebookEditorModel";
import { NoteItemEditModel } from "./note-editor/NoteItemEditModel";
import { NoteItemToolbar } from "./note-editor/NoteItemToolbar";
import { NoteItemActiveEditor } from "./note-editor/NoteItemActiveEditor";
import color from "../../theme/color";
import { DeleteIcon, WindowMaximizeIcon } from "../../theme/icons";
import { Button } from "../../components/basic/Button";

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
}

// =============================================================================
// Styles
// =============================================================================

const NoteItemRoot = styled.div({
    width: 800,
    height: 500,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    backgroundColor: color.background.default,
    overflow: "hidden",

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

    // Content area
    "& .content-area": {
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
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
}: NoteItemViewProps) {
    // Create edit model for this note
    const editModel = useMemo(() => {
        return new NoteItemEditModel(notebookModel, note);
    }, [note.id]); // Only recreate if note id changes

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
        <NoteItemRoot tabIndex={0}>
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
                <NoteItemActiveEditor model={editModel} />
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
