import styled from "@emotion/styled";
import React, { useEffect, useMemo, useState } from "react";
import { EditorConfigProvider, EditorStateStorageProvider, useObjectStateStorage } from "../base";
import { Button } from "../../components/basic/Button";
import { PathInput } from "../../components/basic/PathInput";
import { TextAreaField } from "../../components/basic/TextAreaField";
import color from "../../theme/color";
import { CircleIcon, CloseIcon, PlusIcon, WindowRestoreIcon } from "../../theme/icons";
import { NoteItemToolbar } from "./note-editor/NoteItemToolbar";
import { NoteItemActiveEditor } from "./note-editor/NoteItemActiveEditor";
import { NoteItemEditModel } from "./note-editor/NoteItemEditModel";
import { NoteItem } from "./notebookTypes";
import { NotebookEditorModel } from "./NotebookEditorModel";

// =============================================================================
// Styles
// =============================================================================

const ExpandedNoteViewRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    overflow: "hidden",
    paddingLeft: 24,
    position: "relative",

    // Note indicator dot with vertical line — always blue (active state)
    "& .note-indicator": {
        position: "absolute",
        left: 4,
        top: 8,
        bottom: 8,
        width: 16,
        color: color.misc.blue,
        "& svg": {
            width: 16,
            height: 16,
        },
        // Vertical line under the dot
        "&::after": {
            content: "''",
            position: "absolute",
            left: "50%",
            top: 16,
            bottom: 0,
            width: 1,
            backgroundColor: color.misc.blue,
        },
    },

    "& .expanded-toolbar": {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        borderBottom: `1px solid ${color.border.default}`,
        fontSize: 12,
        color: color.text.light,
        flexShrink: 0,
    },

    "& .expanded-metadata": {
        display: "flex",
        alignItems: "center",
        gap: 8,
        flex: 1,
        overflow: "hidden",
    },

    "& .category": {
        padding: "2px 6px",
        backgroundColor: color.background.light,
        borderRadius: 3,
        cursor: "pointer",
        flexShrink: 0,
        "&:hover": {
            color: color.text.dark,
        },
    },

    "& .path-input": {
        "& .path-input-field": {
            padding: "2px 6px",
            fontSize: 12,
            minWidth: 100,
            maxWidth: 200,
        },
    },

    "& .tags-container": {
        display: "flex",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
        overflow: "hidden",
        flexShrink: 1,
    },

    "& .tag": {
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "2px 6px",
        backgroundColor: color.background.dark,
        borderRadius: 3,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        "&:hover": {
            backgroundColor: color.background.light,
        },
        "& .tag-delete": {
            display: "inline-flex",
            alignItems: "center",
            opacity: 0,
            cursor: "pointer",
            marginLeft: 2,
            marginRight: -3,
            "& svg": {
                width: 12,
                height: 12,
            },
            "&:hover": {
                color: color.text.strong,
            },
        },
        "&:hover .tag-delete": {
            opacity: 1,
        },
    },

    "& .tag-add-btn": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 4px",
        borderRadius: 2,
        cursor: "pointer",
        flexShrink: 0,
        color: color.text.light,
        backgroundColor: color.background.dark,
        "& svg": {
            width: 12,
            height: 12,
        },
        "&:hover": {
            backgroundColor: color.background.light,
            color: color.text.default,
        },
    },

    "& .tag-path-input": {
        "& .path-input-field": {
            padding: "2px 6px",
            fontSize: 12,
            minWidth: 80,
            maxWidth: 160,
        },
    },

    "& .expanded-editor-toolbar": {
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderBottom: `1px solid ${color.border.default}`,
        flexShrink: 0,
    },

    "& .title-input": {
        flex: 1,
        border: "none",
        background: "transparent",
        color: color.text.strong,
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

    "& .editor-extras": {
        display: "flex",
        alignItems: "center",
        gap: 4,
    },

    "& .expanded-content": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
    },

    "& .comment-section": {
        padding: "4px 8px",
        fontSize: 12,
        flexShrink: 0,
        borderTop: `1px solid ${color.border.default}`,
    },

    "& .comment-field": {
        maxHeight: 160,
        overflowY: "auto",
        fontSize: 12,
        color: color.text.light,
        fontStyle: "italic",
        backgroundColor: "transparent",
        border: "none",
        borderRadius: 0,
        padding: "4px 0",
        "&:focus": {
            borderColor: "transparent",
        },
    },

    "& .add-comment-btn": {
        fontSize: 11,
        cursor: "pointer",
        color: color.text.light,
        "&:hover": {
            color: color.text.default,
        },
    },

    "& .date": {
        color: color.text.light,
        fontSize: 11,
        flexShrink: 0,
    },
});

// =============================================================================
// Types
// =============================================================================

interface ExpandedNoteViewProps {
    note: NoteItem;
    notebookModel: NotebookEditorModel;
    categories: string[];
    tags: string[];
    onCollapse: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function ExpandedNoteView({
    note,
    notebookModel,
    categories,
    tags,
    onCollapse,
}: ExpandedNoteViewProps) {
    // Create edit model for expanded view
    const editModel = useMemo(
        () => new NoteItemEditModel(notebookModel, note),
        [note.id]
    );

    // Sync edit model when note data changes
    useEffect(() => {
        editModel.syncFromNote(note);
    }, [note.content.content, note.content.language, note.content.editor]);

    // Cleanup on unmount
    useEffect(() => {
        return () => editModel.dispose();
    }, [editModel]);

    // Category editing state
    const [editingCategory, setEditingCategory] = useState(false);
    const [categoryValue, setCategoryValue] = useState(note.category);

    // Tag editing state
    const [addingTag, setAddingTag] = useState(false);
    const [newTagValue, setNewTagValue] = useState("");
    const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
    const [editingTagValue, setEditingTagValue] = useState("");

    // Sync category value when note changes
    useEffect(() => {
        if (!editingCategory) {
            setCategoryValue(note.category);
        }
    }, [note.category, editingCategory]);

    const stateStorage = useObjectStateStorage(
        notebookModel.getNoteState,
        notebookModel.setNoteState
    );

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    // Handle Escape key to collapse
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape" && !editingCategory && !addingTag && editingTagIndex === null) {
            onCollapse();
        }
    };

    return (
        <ExpandedNoteViewRoot tabIndex={0} onKeyDown={handleKeyDown}>
            {/* Note indicator — always blue to signal expanded note */}
            <div className="note-indicator">
                <CircleIcon />
            </div>

            {/* Top toolbar: category, tags, date, collapse */}
            <div className="expanded-toolbar">
                <div className="expanded-metadata">
                    {editingCategory ? (
                        <PathInput
                            value={categoryValue}
                            onChange={setCategoryValue}
                            onBlur={(finalValue?: string) => {
                                setEditingCategory(false);
                                if (finalValue !== undefined && finalValue !== note.category) {
                                    notebookModel.updateNoteCategory(note.id, finalValue);
                                }
                            }}
                            paths={categories}
                            placeholder="category..."
                            autoFocus
                        />
                    ) : (
                        <span
                            className="category"
                            title="Category"
                            onClick={() => {
                                setCategoryValue(note.category);
                                setEditingCategory(true);
                            }}
                        >
                            {note.category || "No category"}
                        </span>
                    )}
                    <div className="tags-container">
                        {note.tags.map((tag: string, index: number) =>
                            editingTagIndex === index ? (
                                <PathInput
                                    key={index}
                                    className="tag-path-input"
                                    value={editingTagValue}
                                    onChange={setEditingTagValue}
                                    onBlur={(finalValue?: string) => {
                                        setEditingTagIndex(null);
                                        if (finalValue !== undefined && finalValue !== note.tags[index]) {
                                            if (finalValue === "") {
                                                notebookModel.removeNoteTag(note.id, index);
                                            } else {
                                                notebookModel.updateNoteTag(note.id, index, finalValue);
                                            }
                                        }
                                    }}
                                    paths={tags}
                                    separator=":"
                                    maxDepth={1}
                                    placeholder="tag..."
                                    autoFocus
                                />
                            ) : (
                                <span
                                    key={index}
                                    className="tag"
                                    onClick={() => {
                                        setEditingTagValue(note.tags[index]);
                                        setEditingTagIndex(index);
                                    }}
                                >
                                    {tag}
                                    <span
                                        className="tag-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            notebookModel.removeNoteTag(note.id, index);
                                        }}
                                    >
                                        <CloseIcon />
                                    </span>
                                </span>
                            )
                        )}
                        {addingTag ? (
                            <PathInput
                                className="tag-path-input"
                                value={newTagValue}
                                onChange={setNewTagValue}
                                onBlur={(finalValue?: string) => {
                                    setAddingTag(false);
                                    if (finalValue !== undefined && finalValue) {
                                        notebookModel.addNoteTag(note.id, finalValue);
                                    }
                                }}
                                paths={tags}
                                separator=":"
                                maxDepth={1}
                                placeholder="tag..."
                                autoFocus
                            />
                        ) : (
                            <span
                                className="tag-add-btn"
                                title="Add tag"
                                onClick={() => {
                                    setNewTagValue("");
                                    setAddingTag(true);
                                }}
                            >
                                <PlusIcon />
                            </span>
                        )}
                    </div>
                    <div style={{ flex: 1 }} />
                    <span className="date">{formatDate(note.updatedDate)}</span>
                </div>
                <Button
                    size="small"
                    type="flat"
                    title="Collapse (Esc)"
                    onClick={onCollapse}
                >
                    <WindowRestoreIcon />
                </Button>
            </div>

            {/* Editor toolbar: language, title, editor switch */}
            <div className="expanded-editor-toolbar">
                <NoteItemToolbar model={editModel}>
                    <input
                        className="title-input"
                        type="text"
                        placeholder="note title..."
                        value={note.title}
                        onChange={(e) => notebookModel.updateNoteTitle(note.id, e.target.value)}
                    />
                </NoteItemToolbar>
            </div>

            {/* Content area - full height, no max constraint */}
            <div className="expanded-content">
                <EditorStateStorageProvider storage={stateStorage}>
                    <EditorConfigProvider config={{ hideMinimap: false, disableAutoFocus: false }}>
                        <NoteItemActiveEditor model={editModel} />
                    </EditorConfigProvider>
                </EditorStateStorageProvider>
            </div>

            {/* Comment section */}
            <div className="comment-section">
                {note.comment !== undefined ? (
                    <TextAreaField
                        className="comment-field"
                        value={note.comment}
                        onChange={(value) => notebookModel.updateNoteComment(note.id, value)}
                        onBlur={() => {
                            if (note.comment !== undefined && note.comment.trim() === "") {
                                notebookModel.removeComment(note.id);
                            }
                        }}
                        placeholder="Add a comment..."
                    />
                ) : (
                    <span
                        className="add-comment-btn"
                        onClick={() => notebookModel.addComment(note.id)}
                    >
                        + Add comment
                    </span>
                )}
            </div>
        </ExpandedNoteViewRoot>
    );
}

