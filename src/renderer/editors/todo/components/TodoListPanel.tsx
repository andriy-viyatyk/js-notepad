import React, { useCallback, useRef, useState } from "react";
import color from "../../../theme/color";
import { PlusIcon, DeleteIcon, RenameIcon } from "../../../theme/icons";
import { Panel } from "../../../uikit/Panel/Panel";
import { SelectableRow } from "../../../uikit/SelectableRow";
import { Input } from "../../../uikit/Input/Input";
import { IconButton } from "../../../uikit/IconButton/IconButton";
import { WithMenu } from "../../../uikit/Menu/WithMenu";
import { Dot } from "../../../uikit/Dot/Dot";
import type { MenuItem } from "../../../uikit/Menu/types";
import type { ListCount, TodoSource, TodoTag } from "../todoTypes";
import { TAG_COLORS } from "../todoColors";

const SECTION_LABEL_STYLE: React.CSSProperties = {
    fontSize: 13,
    color: color.text.light,
    opacity: 0.6,
    padding: "6px 8px 2px",
    textTransform: "uppercase",
    textAlign: "center",
};

const NAME_STYLE: React.CSSProperties = {
    flex: "1 1 auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
};

const COUNT_STYLE: React.CSSProperties = {
    flexShrink: 0,
    fontSize: 11,
    opacity: 0.7,
};

interface TodoListPanelProps {
    pageModel: TodoSource;
    lists: string[];
    selectedList: string;
    listCounts: { [listName: string]: ListCount };
    tags: TodoTag[];
    selectedTag: string;
}

interface RowShellProps {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
    revealOnHover?: boolean;
}

function RowShell({ selected, onClick, children, revealOnHover }: RowShellProps) {
    return (
        <SelectableRow selected={selected} onClick={onClick}>
            <Panel
                direction="row"
                align="center"
                gap="xs"
                paddingX="sm"
                minHeight={28}
                flex={1}
                minWidth={0}
                revealChildrenOnHover={revealOnHover}
            >
                {children}
            </Panel>
        </SelectableRow>
    );
}

export function TodoListPanel({ pageModel, lists, selectedList, listCounts, tags, selectedTag }: TodoListPanelProps) {
    const [newListName, setNewListName] = useState("");
    const [renamingList, setRenamingList] = useState<string | null>(null);
    const [renameListValue, setRenameListValue] = useState("");
    const renameListInputRef = useRef<HTMLInputElement>(null);

    const [newTagName, setNewTagName] = useState("");
    const [renamingTag, setRenamingTag] = useState<string | null>(null);
    const [renameTagValue, setRenameTagValue] = useState("");
    const renameTagInputRef = useRef<HTMLInputElement>(null);

    const handleAddList = useCallback(() => {
        if (newListName.trim()) {
            const added = pageModel.addList(newListName.trim());
            if (added) {
                setNewListName("");
            }
        }
    }, [newListName, pageModel]);

    const handleAddListKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleAddList();
        }
    }, [handleAddList]);

    const handleStartListRename = useCallback((e: React.MouseEvent, listName: string) => {
        e.stopPropagation();
        setRenamingList(listName);
        setRenameListValue(listName);
        setTimeout(() => renameListInputRef.current?.focus(), 0);
    }, []);

    const handleListRenameSubmit = useCallback(() => {
        if (renamingList && renameListValue.trim()) {
            pageModel.renameList(renamingList, renameListValue.trim());
        }
        setRenamingList(null);
    }, [renamingList, renameListValue, pageModel]);

    const handleListRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleListRenameSubmit();
        } else if (e.key === "Escape") {
            setRenamingList(null);
        }
    }, [handleListRenameSubmit]);

    const handleDeleteList = useCallback((e: React.MouseEvent, listName: string) => {
        e.stopPropagation();
        pageModel.deleteList(listName);
    }, [pageModel]);

    const handleAddTag = useCallback(() => {
        if (newTagName.trim()) {
            const added = pageModel.addTag(newTagName.trim());
            if (added) {
                setNewTagName("");
            }
        }
    }, [newTagName, pageModel]);

    const handleAddTagKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleAddTag();
        }
    }, [handleAddTag]);

    const handleStartTagRename = useCallback((e: React.MouseEvent, tagName: string) => {
        e.stopPropagation();
        setRenamingTag(tagName);
        setRenameTagValue(tagName);
        setTimeout(() => renameTagInputRef.current?.focus(), 0);
    }, []);

    const handleTagRenameSubmit = useCallback(() => {
        if (renamingTag && renameTagValue.trim()) {
            pageModel.renameTag(renamingTag, renameTagValue.trim());
        }
        setRenamingTag(null);
    }, [renamingTag, renameTagValue, pageModel]);

    const handleTagRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleTagRenameSubmit();
        } else if (e.key === "Escape") {
            setRenamingTag(null);
        }
    }, [handleTagRenameSubmit]);

    const handleDeleteTag = useCallback((e: React.MouseEvent, tagName: string) => {
        e.stopPropagation();
        pageModel.deleteTag(tagName);
    }, [pageModel]);

    const handleTagColorChange = useCallback((tagName: string, newColor: string) => {
        pageModel.updateTagColor(tagName, newColor);
    }, [pageModel]);

    const renderCount = (count: ListCount | undefined) => {
        if (!count) return "0/0";
        return <><b>{count.undone}</b>/{count.total}</>;
    };

    const getColorMenuItems = (tagName: string, currentColor: string): MenuItem[] => {
        const items: MenuItem[] = TAG_COLORS.map((c) => ({
            label: c.name,
            icon: <Dot size={10} color={c.hex} />,
            onClick: () => handleTagColorChange(tagName, c.hex),
            selected: currentColor === c.hex,
        }));
        items.push({
            label: "No color",
            startGroup: true,
            onClick: () => handleTagColorChange(tagName, ""),
        });
        return items;
    };

    return (
        <Panel name="todo-list-panel" direction="column" overflow="hidden" flex={1}>
            <Panel
                name="todo-new-list-row"
                direction="row"
                gap="xs"
                paddingX="sm"
                paddingY="xs"
                align="center"
                shrink={false}
                background="default"
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Input
                        name="todo-new-list"
                        value={newListName}
                        onChange={setNewListName}
                        onKeyDown={handleAddListKeyDown}
                        placeholder="New list..."
                    />
                </div>
                <IconButton
                    name="todo-add-list"
                    size="sm"
                    icon={<PlusIcon />}
                    title="Add list"
                    onClick={handleAddList}
                    disabled={!newListName.trim()}
                />
            </Panel>

            <Panel
                name="todo-lists-body"
                direction="column"
                flex={1}
                overflowY="auto"
                overflowX="hidden"
                tabIndex={0}
                data-focus-selection=""
            >
                <div style={SECTION_LABEL_STYLE}>Lists</div>

                <RowShell
                    selected={selectedList === ""}
                    onClick={() => pageModel.setSelectedList("")}
                >
                    <span style={NAME_STYLE}>All</span>
                    <span style={COUNT_STYLE}>{renderCount(listCounts[""])}</span>
                </RowShell>

                {lists.map((listName) => (
                    <RowShell
                        key={listName}
                        selected={selectedList === listName}
                        onClick={() => pageModel.setSelectedList(listName)}
                        revealOnHover
                    >
                        {renamingList === listName ? (
                            <Input
                                variant="ghost"
                                size="sm"
                                ref={renameListInputRef}
                                value={renameListValue}
                                onChange={setRenameListValue}
                                onKeyDown={handleListRenameKeyDown}
                                onBlur={handleListRenameSubmit}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                <span style={NAME_STYLE} title={listName}>{listName}</span>
                                <IconButton
                                    hideUntilParentHover
                                    size="sm"
                                    icon={<RenameIcon />}
                                    title="Rename list"
                                    onClick={(e) => handleStartListRename(e, listName)}
                                />
                                <IconButton
                                    hideUntilParentHover
                                    size="sm"
                                    icon={<DeleteIcon />}
                                    title="Delete list"
                                    onClick={(e) => handleDeleteList(e, listName)}
                                />
                                <span style={COUNT_STYLE}>{renderCount(listCounts[listName])}</span>
                            </>
                        )}
                    </RowShell>
                ))}

                <div style={SECTION_LABEL_STYLE}>Tags</div>

                <RowShell
                    selected={selectedTag === ""}
                    onClick={() => pageModel.setSelectedTag("")}
                >
                    <span style={NAME_STYLE}>All Tags</span>
                </RowShell>

                {tags.map((tag) => (
                    <RowShell
                        key={tag.name}
                        selected={selectedTag === tag.name}
                        onClick={() => pageModel.setSelectedTag(tag.name)}
                        revealOnHover
                    >
                        {renamingTag === tag.name ? (
                            <Input
                                variant="ghost"
                                size="sm"
                                ref={renameTagInputRef}
                                value={renameTagValue}
                                onChange={setRenameTagValue}
                                onKeyDown={handleTagRenameKeyDown}
                                onBlur={handleTagRenameSubmit}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                <Dot
                                    size="sm"
                                    color={tag.color || "neutral"}
                                />
                                <span style={NAME_STYLE} title={tag.name}>{tag.name}</span>
                                <WithMenu items={getColorMenuItems(tag.name, tag.color)}>
                                    {(setOpen) => (
                                        <Dot
                                            size={14}
                                            bordered
                                            hideUntilParentHover
                                            color={tag.color || color.text.light}
                                            title="Change color"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpen(e.currentTarget);
                                            }}
                                        />
                                    )}
                                </WithMenu>
                                <IconButton
                                    hideUntilParentHover
                                    size="sm"
                                    icon={<RenameIcon />}
                                    title="Rename tag"
                                    onClick={(e) => handleStartTagRename(e, tag.name)}
                                />
                                <IconButton
                                    hideUntilParentHover
                                    size="sm"
                                    icon={<DeleteIcon />}
                                    title="Delete tag"
                                    onClick={(e) => handleDeleteTag(e, tag.name)}
                                />
                            </>
                        )}
                    </RowShell>
                ))}
            </Panel>

            <Panel
                name="todo-new-tag-row"
                direction="row"
                gap="xs"
                paddingX="sm"
                paddingY="xs"
                align="center"
                shrink={false}
                background="default"
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Input
                        name="todo-new-tag"
                        value={newTagName}
                        onChange={setNewTagName}
                        onKeyDown={handleAddTagKeyDown}
                        placeholder="New tag..."
                    />
                </div>
                <IconButton
                    name="todo-add-tag"
                    size="sm"
                    icon={<PlusIcon />}
                    title="Add tag"
                    onClick={handleAddTag}
                    disabled={!newTagName.trim()}
                />
            </Panel>
        </Panel>
    );
}
