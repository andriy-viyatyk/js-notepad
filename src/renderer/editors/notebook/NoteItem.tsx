import styled from "@emotion/styled";
import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NoteItem as NoteItemType } from "./notebookTypes";
import { NotebookEditorModel } from "./NotebookEditorModel";
import { NoteItemEditModel } from "./note-editor/NoteItemEditModel";
import { NoteItemToolbar } from "./note-editor/NoteItemToolbar";
import { NoteItemActiveEditor } from "./note-editor/NoteItemActiveEditor";
import color from "../../theme/color";
import { CircleIcon, DeleteIcon, WindowMaximizeIcon } from "../../theme/icons";
import { Button } from "../../components/basic/Button";
import { PathInput } from "../../components/basic/PathInput";
import { TextAreaField } from "../../components/basic/TextAreaField";
import { EditorConfigProvider, EditorStateStorageProvider, useObjectStateStorage } from "../base";

// Max height for editors embedded in note items
const NOTE_EDITOR_MAX_HEIGHT = 400;

// =============================================================================
// Types
// =============================================================================

interface NoteItemViewProps {
    note: NoteItemType;
    notebookModel: NotebookEditorModel;
    /** Available categories for autocomplete */
    categories: string[];
    onDelete?: (id: string) => void;
    onExpand?: (id: string) => void;
    onAddComment?: (id: string) => void;
    onCommentChange?: (id: string, comment: string) => void;
    onTitleChange?: (id: string, title: string) => void;
    onCategoryChange?: (id: string, category: string) => void;
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
    padding: "8px 48px 8px 24px",  // Extra left padding for dot, right for deactivation area
    position: "relative",
    outline: "none", // Remove default focus outline (we use blue dot indicator instead)

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
            color: color.text.dark,
        },
    },

    // Category PathInput styling
    "& .path-input": {
        "& .path-input-field": {
            padding: "2px 6px",
            fontSize: 12,
            minWidth: 100,
            maxWidth: 200,
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

    // Content area - height controlled by editor inside
    "& .content-area": {
        position: "relative",
        border: "1px solid transparent",
        borderRadius: 2,
        margin: "0 4px",
        transition: "border-color 0.15s ease",
        // Semi-transparent overlay when note is not focused
        "&::before": {
            content: "''",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: color.background.default,
            opacity: 0.5,
            pointerEvents: "none",
            zIndex: 1,
            transition: "opacity 0.15s ease",
        },
    },

    // Remove overlay when note item is focused
    "&:focus-within .content-area::before": {
        opacity: 0,
    },

    // Comment section
    "& .comment-section": {
        padding: "0 4px",
        fontSize: 12,
        flexShrink: 0,
    },

    "& .comment-field": {
        maxHeight: 160, // ~8 lines of text
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
        opacity: 0,
        fontSize: 11,
        cursor: "pointer",
        color: color.text.light,
        transition: "opacity 0.15s ease",
        "&:hover": {
            opacity: 1,
        },
    },

    // Right-side deactivation area - clicking here unfocuses the note item
    "& .deactivation-area": {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 48,
        cursor: "default",
    },
});

// =============================================================================
// Component
// =============================================================================

export function NoteItemView({
    note,
    notebookModel,
    categories,
    onDelete,
    onExpand,
    onAddComment,
    onCommentChange,
    onTitleChange,
    onCategoryChange,
    cellRef,
}: NoteItemViewProps) {
    // Category editing state
    const [editingCategory, setEditingCategory] = useState(false);
    const [categoryValue, setCategoryValue] = useState(note.category);

    // Create edit model for this note
    const editModel = useMemo(() => {
        return new NoteItemEditModel(notebookModel, note);
    }, [note.id]); // Only recreate if note id changes

    // Create state storage backed by notebook's data.state
    const stateStorage = useObjectStateStorage(
        notebookModel.getNoteState,
        notebookModel.setNoteState
    );

    // Internal ref for wheel event handling
    const noteItemRef = useRef<HTMLDivElement>(null);

    // Merge refs for both cellRef (RenderFlexGrid) and noteItemRef (wheel handling)
    const setRefs = useCallback((element: HTMLDivElement | null) => {
        noteItemRef.current = element;
        if (cellRef) {
            (cellRef as React.MutableRefObject<HTMLDivElement | null>).current = element;
        }
    }, [cellRef]);

    // Capture wheel events to prevent nested editors from stealing scroll
    // when the note item is not focused
    useEffect(() => {
        const element = noteItemRef.current;
        if (!element) return;

        const handleWheel = (e: WheelEvent) => {
            // Check if this note item or any child has focus
            const hasFocus = element.contains(document.activeElement);

            if (!hasFocus) {
                // Prevent default scroll behavior on nested scrollable elements (e.g., Markdown view)
                e.preventDefault();
                // Stop the event from reaching nested editors (Monaco, Grid)
                e.stopPropagation();

                // Find the notebook's scroll container and scroll it
                const scrollContainer = element.closest("#avg-container");
                if (scrollContainer) {
                    scrollContainer.scrollTop += e.deltaY;
                    scrollContainer.scrollLeft += e.deltaX;
                }
            }
        };

        // Use capture phase to intercept BEFORE event reaches nested editors
        // Note: passive: false is required to allow preventDefault()
        element.addEventListener("wheel", handleWheel, { capture: true, passive: false });

        return () => {
            element.removeEventListener("wheel", handleWheel, { capture: true });
        };
    }, []);

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

    // Sync category value when note category changes externally
    useEffect(() => {
        if (!editingCategory) {
            setCategoryValue(note.category);
        }
    }, [note.category, editingCategory]);

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

    const handleCommentChange = (value: string) => {
        onCommentChange?.(note.id, value);
    };

    const handleCategoryClick = () => {
        setCategoryValue(note.category);
        setEditingCategory(true);
    };

    const handleCategoryChange = (value: string) => {
        setCategoryValue(value);
    };

    const handleCategoryBlur = (finalValue?: string) => {
        setEditingCategory(false);
        // Use finalValue if provided (from selection), otherwise use current state
        const valueToSave = finalValue ?? categoryValue;
        if (valueToSave !== note.category) {
            onCategoryChange?.(note.id, valueToSave);
        }
        // Focus note item to maintain active state after category edit
        noteItemRef.current?.focus();
    };

    const handleDeactivate = () => {
        // Focus the scroll container instead of just blurring
        // This ensures keyboard shortcuts (like Ctrl+S) continue to work
        const element = noteItemRef.current;
        if (element) {
            const scrollContainer = element.closest("#avg-container") as HTMLElement;
            if (scrollContainer) {
                scrollContainer.focus();
                return;
            }
        }
        // Fallback: blur active element
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    return (
        <NoteItemRoot ref={setRefs} tabIndex={0}>
            {/* Right-side area to deactivate note item */}
            <div className="deactivation-area" onClick={handleDeactivate} />

            {/* Note indicator dot */}
            <div className="note-indicator">
                <CircleIcon />
            </div>

            {/* First toolbar - items visible on hover/focus */}
            <div className="toolbar-hover">
                <div className="toolbar-hover-content">
                    {editingCategory ? (
                        <PathInput
                            value={categoryValue}
                            onChange={handleCategoryChange}
                            onBlur={handleCategoryBlur}
                            paths={categories}
                            placeholder="category..."
                            autoFocus
                        />
                    ) : (
                        <span className="category" onClick={handleCategoryClick}>
                            {note.category || "No category"}
                        </span>
                    )}
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
                        placeholder="note title..."
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
                {note.comment !== undefined ? (
                    <TextAreaField
                        className="comment-field"
                        value={note.comment}
                        onChange={handleCommentChange}
                        placeholder="Add a comment..."
                    />
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
