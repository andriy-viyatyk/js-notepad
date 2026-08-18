import React, { useMemo } from "react";
import { IconButton } from "../../uikit/IconButton";
import { Input } from "../../uikit/Input";
import { Panel } from "../../uikit/Panel";
import { PathInput } from "../../uikit/PathInput";
import { Textarea } from "../../uikit/Textarea";
import { highlight } from "../../uikit/shared/highlight";
import color from "../../theme/color";
import { CircleIcon, CloseIcon, PlusIcon, WindowRestoreIcon } from "../../theme/icons";
import { NoteItemToolbar } from "./note-editor/NoteItemToolbar";
import { NoteItemActiveEditor } from "./note-editor/NoteItemActiveEditor";
import { NoteItemEditModel } from "./note-editor/NoteItemEditModel";
import { NoteItem, NotebookSource } from "./notebookTypes";
import { formatDate } from "../../core/utils/utils";
import { TComponentModel, useComponentModel } from "../../core/state/model";

// =============================================================================
// Inline-style constants
// =============================================================================

const indicatorStyle: React.CSSProperties = {
    position: "absolute",
    left: 4,
    top: 8,
    bottom: 8,
    width: 16,
    color: color.misc.blue,
};

const indicatorLineStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: 16,
    bottom: 0,
    width: 1,
    backgroundColor: color.misc.blue,
};

const categoryBadgeStyle: React.CSSProperties = {
    padding: "2px 6px",
    backgroundColor: color.background.light,
    borderRadius: 3,
    cursor: "pointer",
    flexShrink: 0,
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

// =============================================================================
// Types
// =============================================================================

interface ExpandedNoteViewProps {
    note: NoteItem;
    notebookModel: NotebookSource;
    categories: string[];
    tags: string[];
    onCollapse: () => void;
    searchText?: string;
}

interface ExpandedNoteState {
    editingCategory: boolean;
    categoryValue: string;
    addingTag: boolean;
    newTagValue: string;
    editingTagIndex: number | null;
    editingTagValue: string;
}

interface ExpandedNoteModelProps extends Omit<ExpandedNoteViewProps, "note"> {
    note: NoteItem;
    editModel: NoteItemEditModel;
}

const defaultExpandedNoteState: ExpandedNoteState = {
    editingCategory: false,
    categoryValue: "",
    addingTag: false,
    newTagValue: "",
    editingTagIndex: null,
    editingTagValue: "",
};

class ExpandedNoteModel extends TComponentModel<ExpandedNoteState, ExpandedNoteModelProps> {
    setEditingCategory = (value: boolean) => this.state.update((s) => { s.editingCategory = value; });
    setCategoryValue = (value: string) => this.state.update((s) => { s.categoryValue = value; });
    setAddingTag = (value: boolean) => this.state.update((s) => { s.addingTag = value; });
    setNewTagValue = (value: string) => this.state.update((s) => { s.newTagValue = value; });
    setEditingTagIndex = (value: number | null) => this.state.update((s) => { s.editingTagIndex = value; });
    setEditingTagValue = (value: string) => this.state.update((s) => { s.editingTagValue = value; });

    init() {
        this.effect(() => {
            const editModel = this.props.editModel;
            let cancelled = false;
            queueMicrotask(() => {
                if (!cancelled && this.isLive) editModel.syncFromNote(this.props.note);
            });
            return () => { cancelled = true; };
        }, () => [
            this.props.editModel,
            this.props.note.content.content,
            this.props.note.content.language,
            this.props.note.content.editor,
        ]);

        this.effect(() => {
            const editModel = this.props.editModel;
            return () => editModel.dispose();
        }, () => [this.props.editModel]);

        this.effect(() => {
            if (this.state.get().editingCategory) return;
            const category = this.props.note.category;
            queueMicrotask(() => {
                if (!this.isLive || this.state.get().editingCategory) return;
                this.setCategoryValue(category);
            });
        }, () => [this.props.note.category, this.state.get().editingCategory]);
    }
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
    searchText,
}: ExpandedNoteViewProps) {

    // Create edit model for expanded view
    const editModel = useMemo(
        () => new NoteItemEditModel(notebookModel, note),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow: rebuild model only when the underlying note swaps (note.id), not on every parent re-render or data refresh
        [note.id]
    );

    const editState = useComponentModel(
        { note, notebookModel, categories, tags, onCollapse, editModel },
        ExpandedNoteModel,
        defaultExpandedNoteState,
    );
    const editingCategory = editState.state.use((s) => s.editingCategory);
    const categoryValue = editState.state.use((s) => s.categoryValue);
    const addingTag = editState.state.use((s) => s.addingTag);
    const newTagValue = editState.state.use((s) => s.newTagValue);
    const editingTagIndex = editState.state.use((s) => s.editingTagIndex);
    const editingTagValue = editState.state.use((s) => s.editingTagValue);
    const setEditingCategory = editState.setEditingCategory;
    const setCategoryValue = editState.setCategoryValue;
    const setAddingTag = editState.setAddingTag;
    const setNewTagValue = editState.setNewTagValue;
    const setEditingTagIndex = editState.setEditingTagIndex;
    const setEditingTagValue = editState.setEditingTagValue;

    // Handle Escape key to collapse
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape" && !editingCategory && !addingTag && editingTagIndex === null) {
            onCollapse();
        }
    };

    return (
        <div
            tabIndex={0}
            onKeyDown={handleKeyDown}
            style={{
                display: "flex",
                flexDirection: "column",
                flex: "1 1 auto",
                overflow: "hidden",
                paddingLeft: 24,
                position: "relative",
            }}
        >
            {/* Note indicator — always blue to signal expanded note */}
            <div style={indicatorStyle}>
                <CircleIcon style={{ width: 16, height: 16 }} />
                <div style={indicatorLineStyle} />
            </div>

            {/* Top toolbar: category, tags, date, collapse */}
            <Panel
                name="notebook-expanded-toolbar"
                direction="row"
                align="center"
                gap="md"
                paddingX="md"
                paddingY="sm"
                borderBottom
                shrink={false}
            >
                <Panel direction="row" align="center" gap="md" flex={1} overflow="hidden">
                    {editingCategory ? (
                        <PathInput
                            size="sm"
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
                            style={categoryBadgeStyle}
                            title="Category"
                            onClick={() => {
                                setCategoryValue(note.category);
                                setEditingCategory(true);
                            }}
                        >
                            {note.category
                                ? highlight(note.category, searchText)
                                : "No category"}
                        </span>
                    )}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            minWidth: 0,
                            overflow: "hidden",
                            flexShrink: 1,
                        }}
                    >
                        {note.tags.map((tag: string, index: number) =>
                            editingTagIndex === index ? (
                                <PathInput
                                    key={index}
                                    size="sm"
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
                                    style={tagBadgeStyle}
                                    onClick={() => {
                                        setEditingTagValue(note.tags[index]);
                                        setEditingTagIndex(index);
                                    }}
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
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            notebookModel.removeNoteTag(note.id, index);
                                        }}
                                    >
                                        <CloseIcon style={{ width: 12, height: 12 }} />
                                    </span>
                                </span>
                            )
                        )}
                        {addingTag ? (
                            <PathInput
                                size="sm"
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
                                style={tagAddBtnStyle}
                                title="Add tag"
                                onClick={() => {
                                    setNewTagValue("");
                                    setAddingTag(true);
                                }}
                            >
                                <PlusIcon style={{ width: 12, height: 12 }} />
                            </span>
                        )}
                    </div>
                    <div style={{ flex: 1 }} />
                    <span style={{ color: color.text.light, fontSize: 11, flexShrink: 0 }}>
                        {formatDate(note.updatedDate)}
                    </span>
                </Panel>
                <IconButton
                    name="notebook-expanded-collapse"
                    size="sm"
                    icon={<WindowRestoreIcon />}
                    title="Collapse (Esc)"
                    onClick={onCollapse}
                />
            </Panel>

            {/* Editor toolbar: language, title, editor switch */}
            <Panel
                name="notebook-expanded-editor-toolbar"
                direction="row"
                align="center"
                gap="sm"
                paddingX="md"
                paddingY="sm"
                borderBottom
                shrink={false}
            >
                <NoteItemToolbar model={editModel}>
                    <Input
                        variant="ghost"
                        size="sm"
                        placeholder="note title..."
                        value={note.title}
                        onChange={(value) => notebookModel.updateNoteTitle(note.id, value)}
                    />
                </NoteItemToolbar>
            </Panel>

            {/* Content area — flex={1} + height={0} forces flex-basis to 0 so
                the column-flex parent fully controls our height; without it,
                long editor content would overflow even with overflow: hidden. */}
            <Panel
                name="notebook-expanded-content"
                direction="column"
                flex={1}
                height={0}
                overflow="hidden"
                position="relative"
            >
                <NoteItemActiveEditor
                    model={editModel}
                    editorConfig={{
                        hideMinimap: false,
                        disableAutoFocus: false,
                        fillContainer: true,
                        highlightText: searchText,
                    }}
                />
            </Panel>

            {/* Comment section */}
            <Panel
                name="notebook-expanded-comment"
                direction="column"
                paddingX="md"
                paddingY="sm"
                borderTop
                shrink={false}
            >
                {note.comment !== undefined ? (
                    <Textarea
                        variant="ghost"
                        size="sm"
                        value={note.comment}
                        onChange={(value) => notebookModel.updateNoteComment(note.id, value)}
                        onBlur={() => {
                            if (note.comment !== undefined && note.comment.trim() === "") {
                                notebookModel.removeComment(note.id);
                            }
                        }}
                        placeholder="Add a comment..."
                        maxHeight={160}
                    />
                ) : (
                    <span
                        style={{
                            fontSize: 11,
                            cursor: "pointer",
                            color: color.text.light,
                        }}
                        onClick={() => notebookModel.addComment(note.id)}
                    >
                        + Add comment
                    </span>
                )}
            </Panel>
        </div>
    );
}
