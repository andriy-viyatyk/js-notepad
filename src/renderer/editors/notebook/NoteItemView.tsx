import styled from "@emotion/styled";
import clsx from "clsx";
import { useEffect } from "react";
import { useComponentModel } from "../../core/state/model";
import color from "../../theme/color";
import { CircleIcon, CloseIcon, DeleteIcon, PlusIcon, WindowMaximizeIcon } from "../../theme/icons";
import { Button } from "../../components/basic/Button";
import { PathInput } from "../../components/basic/PathInput";
import { TextAreaField } from "../../components/basic/TextAreaField";
import { highlightText, useHighlightedText } from "../../components/basic/useHighlightedText";
import { EditorConfigProvider, EditorStateStorageProvider, useObjectStateStorage } from "../base";
import { NoteItemToolbar } from "./note-editor/NoteItemToolbar";
import { NoteItemActiveEditor } from "./note-editor/NoteItemActiveEditor";
import { NoteItemViewProps, NoteItemViewModel, defaultNoteItemViewState } from "./NoteItemViewModel";

// Max height for editors embedded in note items
const NOTE_EDITOR_MAX_HEIGHT = 400;

// =============================================================================
// Styles
// =============================================================================

const NoteItemViewRoot = styled.div({
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

    // Show toolbar when searching (search text is active)
    "&.searching .toolbar-hover-content": {
        opacity: 1,
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

    // Tags container - shrinks and overflows to the left when space is limited
    "& .tags-container": {
        display: "flex",
        flexDirection: "row-reverse", // Lays out right-to-left; overflow clips from left
        alignItems: "center",
        gap: 4,
        minWidth: 0,        // Allow shrinking
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
        flexShrink: 0,     // Tags don't shrink individually
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

    // Tag PathInput styling
    "& .tag-path-input": {
        "& .path-input-field": {
            padding: "2px 6px",
            fontSize: 12,
            minWidth: 80,
            maxWidth: 160,
        },
    },

    "& .spacer": {
        flex: 1,
    },

    "& .date": {
        color: color.text.light,
        fontSize: 11,
    },

    // Search match tint for input fields
    "& .title-input.search-match": {
        color: color.misc.blue,
    },
    "& .comment-field.search-match": {
        color: color.misc.blue,
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

export function NoteItemView(props: NoteItemViewProps) {
    const { note, notebookModel } = props;

    const model = useComponentModel(props, NoteItemViewModel, defaultNoteItemViewState);
    const {
        editingCategory,
        categoryValue,
        addingTag,
        newTagValue,
        editingTagIndex,
        editingTagValue,
    } = model.state.use();

    // React hooks that must stay in the view
    const searchText = useHighlightedText();
    model.searchText = searchText;

    const stateStorage = useObjectStateStorage(
        notebookModel.getNoteState,
        notebookModel.setNoteState
    );

    // Lifecycle
    useEffect(() => {
        model.init();
        return () => model.dispose();
    }, []);

    // Sync edit model when note data changes externally
    useEffect(() => {
        model.syncEditModel();
    }, [note.content.content, note.content.language, note.content.editor]);

    // Sync category value when note category changes externally
    useEffect(() => {
        model.syncCategoryValue();
    }, [note.category, editingCategory]);

    return (
        <NoteItemViewRoot ref={model.setRefs} tabIndex={0} className={clsx(searchText && "searching")}>
            {/* Right-side area to deactivate note item */}
            <div className="deactivation-area" onClick={model.handleDeactivate} />

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
                            onChange={model.handleCategoryChange}
                            onBlur={model.handleCategoryBlur}
                            paths={props.categories}
                            placeholder="category..."
                            autoFocus
                        />
                    ) : (
                        <span className="category" title="Category" onClick={model.handleCategoryClick}>
                            {note.category ? highlightText(searchText, note.category) : "No category"}
                        </span>
                    )}
                    <div className="tags-container">
                        {/* Render in reverse DOM order because row-reverse flips layout.
                            Visual result: [tag0] [tag1] ... [tagN] [+button] */}
                        {addingTag ? (
                            <PathInput
                                className="tag-path-input"
                                value={newTagValue}
                                onChange={model.handleNewTagChange}
                                onBlur={model.handleNewTagBlur}
                                paths={props.tags}
                                separator=":"
                                maxDepth={1}
                                placeholder="tag..."
                                autoFocus
                            />
                        ) : (
                            <span className="tag-add-btn" title="Add tag" onClick={model.handleAddTagClick}>
                                <PlusIcon />
                            </span>
                        )}
                        {[...note.tags].reverse().map((tag: string, reverseIndex: number) => {
                            const index = note.tags.length - 1 - reverseIndex;
                            return editingTagIndex === index ? (
                                <PathInput
                                    key={index}
                                    className="tag-path-input"
                                    value={editingTagValue}
                                    onChange={model.handleTagEditChange}
                                    onBlur={model.handleTagEditBlur}
                                    paths={props.tags}
                                    separator=":"
                                    maxDepth={1}
                                    placeholder="tag..."
                                    autoFocus
                                />
                            ) : (
                                <span key={index} className="tag" onClick={() => model.handleTagClick(index)}>
                                    {highlightText(searchText, tag)}
                                    <span className="tag-delete" onClick={(e) => model.handleTagDelete(e, index)}>
                                        <CloseIcon />
                                    </span>
                                </span>
                            );
                        })}
                    </div>
                    <div className="spacer" />
                    <span className="date">{model.formatDate(note.updatedDate)}</span>
                    <Button
                        size="small"
                        type="flat"
                        title="Expand"
                        onClick={() => props.onExpand?.(note.id)}
                    >
                        <WindowMaximizeIcon />
                    </Button>
                    <Button
                        size="small"
                        type="flat"
                        title="Delete"
                        onClick={() => props.onDelete?.(note.id)}
                    >
                        <DeleteIcon />
                    </Button>
                </div>
            </div>

            {/* Second toolbar - language | title | extras */}
            <div className="toolbar-main">
                <NoteItemToolbar model={model.editModel}>
                    <input
                        className={clsx("title-input", model.hasSearchMatch(note.title) && "search-match")}
                        type="text"
                        placeholder="note title..."
                        value={note.title}
                        onChange={model.handleTitleChange}
                    />
                </NoteItemToolbar>
            </div>

            {/* Content area - Monaco or alternative editor */}
            <div className="content-area">
                <EditorStateStorageProvider storage={stateStorage}>
                    <EditorConfigProvider config={{ maxEditorHeight: NOTE_EDITOR_MAX_HEIGHT, hideMinimap: true, disableAutoFocus: true }}>
                        <NoteItemActiveEditor model={model.editModel} />
                    </EditorConfigProvider>
                </EditorStateStorageProvider>
            </div>

            {/* Comment section - always show if has comment, show add button on hover */}
            <div className="comment-section">
                {note.comment !== undefined ? (
                    <TextAreaField
                        className={clsx("comment-field", model.hasSearchMatch(note.comment || "") && "search-match")}
                        value={note.comment}
                        onChange={model.handleCommentChange}
                        placeholder="Add a comment..."
                    />
                ) : (
                    <span
                        className="add-comment-btn"
                        onClick={() => props.onAddComment?.(note.id)}
                    >
                        + Add comment
                    </span>
                )}
            </div>
        </NoteItemViewRoot>
    );
}
