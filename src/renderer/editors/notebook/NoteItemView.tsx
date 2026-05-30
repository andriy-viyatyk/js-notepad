import React, { useCallback, useState } from "react";
import { useComponentModel } from "../../core/state/model";
import { TraitTypeId, setTraitDragData } from "../../core/traits";
import color from "../../theme/color";
import { CircleIcon, CloseIcon, DeleteIcon, PlusIcon, WindowMaximizeIcon } from "../../theme/icons";
import { IconButton } from "../../uikit/IconButton";
import { Input } from "../../uikit/Input";
import { Panel } from "../../uikit/Panel";
import { PathInput } from "../../uikit/PathInput";
import { Textarea } from "../../uikit/Textarea";
import { highlight, useHighlightedText } from "../../uikit/shared/highlight";
import { EditorConfigProvider } from "../base";
import { NoteItemToolbar } from "./note-editor/NoteItemToolbar";
import { NoteItemActiveEditor } from "./note-editor/NoteItemActiveEditor";
import { NoteItemViewProps, NoteItemViewModel, defaultNoteItemViewState } from "./NoteItemViewModel";

// Max height for editors embedded in note items
const NOTE_EDITOR_MAX_HEIGHT = 400;

// =============================================================================
// Inline-style constants
// =============================================================================

const indicatorBaseStyle: React.CSSProperties = {
    position: "absolute",
    left: 4,
    top: 12,
    bottom: 8,
    width: 16,
    cursor: "grab",
    transition: "color 0.5s ease",
};

const indicatorLineStyle = (active: boolean): React.CSSProperties => ({
    position: "absolute",
    left: "50%",
    top: 16,
    bottom: 0,
    width: 1,
    backgroundColor: active ? color.misc.blue : color.background.light,
    transition: "background-color 0.5s ease",
});

const deactivationAreaStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 48,
    cursor: "default",
};

const categoryBadgeStyle: React.CSSProperties = {
    padding: "2px 6px",
    backgroundColor: color.background.light,
    borderRadius: 3,
    cursor: "pointer",
};

const tagBadgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: "2px 6px",
    backgroundColor: color.background.dark,
    borderRadius: 3,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
};

const tagAddBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 4px",
    borderRadius: 2,
    cursor: "pointer",
    flexShrink: 0,
    color: color.text.light,
    backgroundColor: color.background.dark,
};

const tagsContainerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    overflow: "hidden",
    flexShrink: 1,
};

// =============================================================================
// Component
// =============================================================================

export function NoteItemView(props: NoteItemViewProps) {
    const { note } = props;

    const model = useComponentModel(props, NoteItemViewModel, defaultNoteItemViewState);
    const {
        editingCategory,
        categoryValue,
        addingTag,
        newTagValue,
        editingTagIndex,
        editingTagValue,
    } = model.state.use();

    // Read search text from UIKit HighlightedTextProvider (set in NotebookEditor)
    const searchText = useHighlightedText();
    model.searchText = searchText;
    const isSearching = Boolean(searchText);

    // Track focus + hover for the cascades that the legacy CSS handled via
    // :focus-within and :hover. The deactivation-area's onMouseEnter clears
    // isHovered so the toolbar fades when the user moves to the right edge.
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleFocus = useCallback(() => setIsFocused(true), []);
    const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsFocused(false);
        }
    }, []);
    const handleMouseEnter = useCallback(() => setIsHovered(true), []);
    const handleMouseLeave = useCallback(() => setIsHovered(false), []);
    const handleDeactivationEnter = useCallback(() => setIsHovered(false), []);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.stopPropagation();
        setTraitDragData(e.dataTransfer, TraitTypeId.Note, { noteId: note.id });
        setIsDragging(true);
    }, [note.id]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    const active = isFocused; // alias for blue indicator
    const showToolbar = isHovered || isFocused || isSearching;
    const showExtras = isHovered || isFocused;

    return (
        <div
            ref={model.setRefs}
            tabIndex={0}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
                width: "100%",
                height: "fit-content",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                backgroundColor: color.background.default,
                padding: "8px 48px 8px 24px",
                position: "relative",
                outline: "none",
                opacity: isDragging ? 0.5 : 1,
            }}
        >
            {/* Right-side area to deactivate note item */}
            <div
                style={deactivationAreaStyle}
                onClick={model.handleDeactivate}
                onMouseEnter={handleDeactivationEnter}
            />

            {/* Note indicator dot (drag handle) */}
            <div
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                style={{
                    ...indicatorBaseStyle,
                    color: active ? color.misc.blue : color.text.light,
                }}
            >
                <CircleIcon style={{ width: 16, height: 16 }} />
                <div style={indicatorLineStyle(active)} />
            </div>

            {/* First toolbar — items visible on hover/focus/searching */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 4px",
                    fontSize: 12,
                    color: color.text.light,
                    opacity: showToolbar ? 1 : 0,
                    transition: "opacity 0.15s ease",
                }}
            >
                {editingCategory ? (
                    <PathInput
                        size="sm"
                        value={categoryValue}
                        onChange={model.handleCategoryChange}
                        onBlur={model.handleCategoryBlur}
                        paths={props.categories}
                        placeholder="category..."
                        autoFocus
                    />
                ) : (
                    <span
                        style={categoryBadgeStyle}
                        title="Category"
                        onClick={model.handleCategoryClick}
                    >
                        {note.category ? highlight(note.category, searchText) : "No category"}
                    </span>
                )}
                <div style={tagsContainerStyle}>
                    {/* Render in reverse DOM order because row-reverse flips layout.
                        Visual result: [tag0] [tag1] ... [tagN] [+button] */}
                    {addingTag ? (
                        <PathInput
                            size="sm"
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
                        <span
                            style={tagAddBtnStyle}
                            title="Add tag"
                            onClick={model.handleAddTagClick}
                        >
                            <PlusIcon style={{ width: 12, height: 12 }} />
                        </span>
                    )}
                    {[...note.tags].reverse().map((tag: string, reverseIndex: number) => {
                        const index = note.tags.length - 1 - reverseIndex;
                        return editingTagIndex === index ? (
                            <PathInput
                                key={index}
                                size="sm"
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
                            <span
                                key={index}
                                style={tagBadgeStyle}
                                onClick={() => model.handleTagClick(index)}
                            >
                                {highlight(tag, searchText)}
                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        cursor: "pointer",
                                        marginLeft: 2,
                                        marginRight: -3,
                                    }}
                                    onClick={(e) => model.handleTagDelete(e, index)}
                                >
                                    <CloseIcon style={{ width: 12, height: 12 }} />
                                </span>
                            </span>
                        );
                    })}
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11 }}>{model.formatDate(note.updatedDate)}</span>
                <IconButton
                    size="sm"
                    icon={<WindowMaximizeIcon />}
                    title="Expand"
                    onClick={() => props.onExpand?.(note.id)}
                />
                <IconButton
                    size="sm"
                    icon={<DeleteIcon />}
                    title="Delete"
                    onClick={() => props.onDelete?.(note.id)}
                />
            </div>

            {/* Second toolbar — language | title | extras */}
            <Panel
                direction="row"
                align="center"
                gap="sm"
                paddingX="sm"
                paddingBottom="xs"
            >
                <NoteItemToolbar model={model.editModel} extrasVisible={showExtras}>
                    <Input
                        variant="ghost"
                        size="sm"
                        placeholder="note title..."
                        value={note.title}
                        onChange={(value) => props.onTitleChange?.(note.id, value)}
                    />
                </NoteItemToolbar>
            </Panel>

            {/* Content area — Monaco or alternative editor */}
            <div
                style={{
                    position: "relative",
                    border: `1px solid ${
                        showToolbar ? color.background.light : "transparent"
                    }`,
                    borderRadius: 2,
                    margin: "0 4px",
                    transition: "border-color 0.5s ease",
                }}
            >
                {/* Semi-transparent overlay when note is not focused */}
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: color.background.default,
                        opacity: isFocused ? 0 : 0.5,
                        pointerEvents: "none",
                        zIndex: 1,
                        transition: "opacity 0.5s ease",
                    }}
                />
                <EditorConfigProvider
                    config={{
                        maxEditorHeight: NOTE_EDITOR_MAX_HEIGHT,
                        hideMinimap: true,
                        disableAutoFocus: true,
                        highlightText: searchText,
                        compact: true,
                    }}
                >
                    <NoteItemActiveEditor model={model.editModel} />
                </EditorConfigProvider>
            </div>

            {/* Comment section — always show if has comment, show add button on hover */}
            <div style={{ padding: "0 4px", fontSize: 12, flexShrink: 0 }}>
                {note.comment !== undefined ? (
                    <Textarea
                        variant="ghost"
                        size="sm"
                        value={note.comment}
                        onChange={model.handleCommentChange}
                        onBlur={model.handleCommentBlur}
                        placeholder="Add a comment..."
                        maxHeight={160}
                    />
                ) : (
                    <span
                        style={{
                            opacity: isHovered ? 0.5 : 0,
                            fontSize: 11,
                            cursor: "pointer",
                            color: color.text.light,
                            transition: "opacity 0.5s ease",
                        }}
                        onClick={() => props.onAddComment?.(note.id)}
                    >
                        + Add comment
                    </span>
                )}
            </div>
        </div>
    );
}
