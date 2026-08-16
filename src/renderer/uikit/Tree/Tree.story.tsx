import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Tree, ITreeItem, TreeItemRenderContext } from "./Tree";
import type { TreeModel } from "./TreeModel";
import { Panel } from "../Panel/Panel";
import { Button } from "../Button/Button";
import {
    CopyIcon,
    RemoveIcon,
} from "../../theme/icons";
import { FolderIcon } from "../../components/icons/FileIcon";
import { FileTypeIcon } from "../../components/icons/LanguageIcon";
import { ContextMenuEvent } from "../../api/events/events";
import type { MenuItem } from "../Menu";
import { Story } from "../../editors/storybook/storyTypes";
import color from "../../theme/color";
import { TraitSet } from "../../core/traits/traits";
import { traitRegistry, TraitTypeId } from "../../core/traits/TraitRegistry";
import type { TraitDragPayload } from "../../core/traits/dnd";

// Register a no-op TraitSet for the storybook demo so payloads carrying this typeId
// can round-trip through `getTraitDragData`. The Tree itself does not consult this set
// — `canTraitDrop` and `onTraitDrop` operate on the raw payload.
const TREE_DEMO_TRAIT_KEY: TraitTypeId = TraitTypeId.NotebookCategory;
if (!traitRegistry.has(TREE_DEMO_TRAIT_KEY)) {
    traitRegistry.register(TREE_DEMO_TRAIT_KEY, new TraitSet());
}

// --- Styled (used by the custom-row demo only) -------------------------------

const CustomRow = styled.div<{ $level: number; $selected: boolean; $active: boolean }>(
    ({ $level, $selected, $active }) => ({
        display: "flex",
        alignItems: "center",
        height: "100%",
        paddingLeft: 4 + $level * 16,
        paddingRight: 8,
        fontFamily: "monospace",
        fontSize: 12,
        color: color.text.default,
        backgroundColor: $selected
            ? color.background.light
            : $active
                ? color.background.message
                : "transparent",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    }),
    { label: "TreeStoryCustomRow" },
);

// --- Sample data --------------------------------------------------------------

function leaf(value: string, label: string): ITreeItem {
    return {
        value,
        label,
        icon: <FileTypeIcon fileName={label} width={16} height={16} />,
    };
}

function folder(value: string, label: string, items: ITreeItem[]): ITreeItem {
    return { value, label, icon: <FolderIcon />, items };
}

const REGULAR_TREE: ITreeItem[] = [
    folder("src", "src", [
        folder("src/uikit", "uikit", [
            folder("src/uikit/ListBox", "ListBox", [
                leaf("src/uikit/ListBox/ListBox.tsx", "ListBox.tsx"),
                leaf("src/uikit/ListBox/ListBoxModel.ts", "ListBoxModel.ts"),
                leaf("src/uikit/ListBox/ListItem.tsx", "ListItem.tsx"),
                leaf("src/uikit/ListBox/SectionItem.tsx", "SectionItem.tsx"),
                leaf("src/uikit/ListBox/index.ts", "index.ts"),
            ]),
            folder("src/uikit/Select", "Select", [
                leaf("src/uikit/Select/Select.tsx", "Select.tsx"),
                leaf("src/uikit/Select/SelectModel.ts", "SelectModel.ts"),
                leaf("src/uikit/Select/index.ts", "index.ts"),
            ]),
            folder("src/uikit/Tree", "Tree", [
                leaf("src/uikit/Tree/Tree.tsx", "Tree.tsx"),
                leaf("src/uikit/Tree/TreeModel.ts", "TreeModel.ts"),
                leaf("src/uikit/Tree/TreeItem.tsx", "TreeItem.tsx"),
                leaf("src/uikit/Tree/SectionItem.tsx", "SectionItem.tsx"),
                leaf("src/uikit/Tree/types.ts", "types.ts"),
                leaf("src/uikit/Tree/index.ts", "index.ts"),
            ]),
            leaf("src/uikit/index.ts", "index.ts"),
            leaf("src/uikit/tokens.ts", "tokens.ts"),
        ]),
        folder("src/core", "core", [
            folder("src/core/state", "state", [
                leaf("src/core/state/state.ts", "state.ts"),
                leaf("src/core/state/model.ts", "model.ts"),
            ]),
            folder("src/core/traits", "traits", [
                leaf("src/core/traits/traits.ts", "traits.ts"),
                leaf("src/core/traits/dnd.ts", "dnd.ts"),
            ]),
        ]),
        leaf("src/index.ts", "index.ts"),
    ]),
    folder("doc", "doc", [
        folder("doc/tasks", "tasks", [
            leaf("doc/tasks/.md", "-uikit-tree.md"),
            leaf("doc/tasks/.md", "-uikit-tree-dnd.md"),
            leaf("doc/tasks/.md", "-uikit-tree-lazy-load.md"),
        ]),
        leaf("doc/active-work.md", "active-work.md"),
    ]),
    leaf("README.md", "README.md"),
    leaf("package.json", "package.json"),
];

function findByValue(items: ITreeItem[], value: string | number): ITreeItem | null {
    for (const it of items) {
        if (it.value === value) return it;
        if (it.items) {
            const found = findByValue(it.items, value);
            if (found) return found;
        }
    }
    return null;
}

// --- Lazy-load demo data ----------------------------------------------------

// Mutable copy is created per-render-cycle by `makeLazyTree`; `loadChildren` mutates
// it in place. The model bumps `state.revision` after each resolve, forcing the
// rows-memo to re-walk against the now-populated subtree.
const LAZY_NESTED_CHILDREN: Record<string, ITreeItem[]> = {
    "lazy/dirA": [
        leaf("lazy/dirA/file1.ts", "file1.ts"),
        leaf("lazy/dirA/file2.ts", "file2.ts"),
        leaf("lazy/dirA/README.md", "README.md"),
    ],
    "lazy/dirB": [
        leaf("lazy/dirB/notes.md", "notes.md"),
    ],
    "lazy/dirC": [
        { value: "lazy/dirC/inner", label: "inner", icon: <FolderIcon />, items: undefined },
        leaf("lazy/dirC/x.ts", "x.ts"),
    ],
    "lazy/dirC/inner": [
        leaf("lazy/dirC/inner/deep.ts", "deep.ts"),
    ],
};

function makeLazyTree(): ITreeItem[] {
    return [
        { value: "lazy/dirA", label: "dirA", icon: <FolderIcon />, items: undefined },
        { value: "lazy/dirB", label: "dirB", icon: <FolderIcon />, items: undefined },
        { value: "lazy/dirC", label: "dirC (deeper)", icon: <FolderIcon />, items: undefined },
        leaf("lazy/standalone.txt", "standalone.txt"),
    ];
}

const SECTIONED_TREE: ITreeItem[] = [
    {
        value: "section-recent",
        label: "Recent",
        section: true,
        items: [
            leaf("recent/Tree.tsx", "Tree.tsx"),
            leaf("recent/TreeModel.ts", "TreeModel.ts"),
            leaf("recent/types.ts", "types.ts"),
        ],
    },
    {
        value: "section-pinned",
        label: "Pinned",
        section: true,
        items: [
            leaf("pinned/active-work.md", "active-work.md"),
            leaf("pinned/CLAUDE.md", "CLAUDE.md"),
        ],
    },
    {
        value: "section-all",
        label: "All Files",
        section: true,
        items: REGULAR_TREE,
    },
];

// --- Demo ---------------------------------------------------------------------

interface DemoProps {
    searchText?: string;
    keyboardNav?: boolean;
    loading?: boolean;
    customRow?: boolean;
    tooltip?: boolean;
    contextMenu?: boolean;
    predicateSelection?: boolean;
    multiSelect?: boolean;
    sections?: boolean;
    defaultExpandAll?: boolean;
    dnd?: boolean;
    lazy?: boolean;
}

function TreeDemo({
    searchText = "",
    keyboardNav = true,
    loading = false,
    customRow = false,
    tooltip = false,
    contextMenu = false,
    predicateSelection = false,
    multiSelect = false,
    sections = false,
    defaultExpandAll = false,
    dnd = false,
    lazy = false,
}: DemoProps) {
    const treeRef = useRef<TreeModel<ITreeItem> | null>(null);
    const [value, setValue] = useState<ITreeItem | null>(null);
    // Multi-selection lives here, in the consumer — the Tree stores none of it. Held as a Set of
    // `value`s and painted back through `isSelected`, which is also how the Tree reads the current
    // selection when a gesture starts.
    const [selectedValues, setSelectedValues] = useState<Set<ITreeItem["value"]>>(new Set());
    const [active, setActive] = useState<number | null>(0);
    const [removed, setRemoved] = useState<Set<ITreeItem["value"]>>(new Set());
    const [lazyTree, setLazyTree] = useState<ITreeItem[] | null>(null);

    // Reset the lazy-tree mutable structure when the toggle flips. Fresh unloaded
    // folders on every lazy-on; cleared on lazy-off.
    useEffect(() => {
        setLazyTree(lazy ? makeLazyTree() : null);
    }, [lazy]);

    const items = useMemo(() => {
        if (lazy) return lazyTree ?? [];
        const base = sections ? SECTIONED_TREE : REGULAR_TREE;
        if (removed.size === 0) return base;
        // Recursively filter — only used in the customRow demo.
        const filterTree = (nodes: ITreeItem[]): ITreeItem[] =>
            nodes
                .filter((n) => !removed.has(n.value))
                .map((n) => (n.items ? { ...n, items: filterTree(n.items) } : n));
        return filterTree(base);
    }, [lazy, lazyTree, sections, removed]);

    const renderItem = customRow
        ? (ctx: TreeItemRenderContext<ITreeItem>) => (
            <CustomRow
                id={ctx.id}
                $level={ctx.level}
                $selected={ctx.selected}
                $active={ctx.active}
                role="treeitem"
                aria-level={ctx.level + 1}
                aria-expanded={ctx.hasChildren ? ctx.expanded : undefined}
                onClick={() => ctx.hasChildren && ctx.toggleExpanded()}
            >
                <span style={{ opacity: 0.5, marginRight: 6 }}>
                    {ctx.hasChildren ? (ctx.expanded ? "▼" : "▶") : "·"}
                </span>
                <span style={{ opacity: 0.6, marginRight: 6 }}>L{ctx.level}</span>
                {ctx.item.label}
            </CustomRow>
        )
        : undefined;

    const getTooltip = tooltip
        ? (it: ITreeItem): React.ReactNode =>
            typeof it.label === "string" ? `Tooltip: ${it.label}` : null
        : undefined;

    const getContextMenu = contextMenu
        ? (it: ITreeItem): MenuItem[] => [
            {
                label: typeof it.label === "string" ? `Copy "${it.label}"` : "Copy",
                icon: <CopyIcon />,
                onClick: () => {},
            },
            {
                label: "Remove",
                icon: <RemoveIcon />,
                onClick: () => {
                    setRemoved((s) => {
                        const next = new Set(s);
                        next.add(it.value);
                        return next;
                    });
                },
            },
        ]
        : undefined;

    const onContextMenu = contextMenu
        ? (e: React.MouseEvent<HTMLDivElement>) => {
            const ctx = ContextMenuEvent.fromNativeEvent(e, "generic");
            ctx.items.push({
                label: "Tree background action",
                onClick: () => {},
            });
        }
        : undefined;

    // multiSelect wins over predicateSelection: the Set-backed predicate IS the selection.
    const isSelected = multiSelect
        ? (it: ITreeItem) => selectedValues.has(it.value)
        : predicateSelection
            ? (it: ITreeItem) =>
                typeof it.value === "string" && it.value.endsWith(".tsx")
            : undefined;

    // DnD demo wiring — getDragData returns a serializable shape; canTraitDrop forbids
    // self-drop; onTraitDrop logs (consumer migration tasks own the actual move).
    const getDragData = dnd
        ? (it: ITreeItem) => ({
            value: it.value,
            label: typeof it.label === "string" ? it.label : String(it.value),
        })
        : undefined;

    const canTraitDrop = dnd
        ? (target: ITreeItem, payload: TraitDragPayload) => {
            const data = payload.data as { value: string | number };
            return data.value !== target.value;
        }
        : undefined;

    const onTraitDrop = dnd
        ? (target: ITreeItem, payload: TraitDragPayload) => {
            const data = payload.data as { value: string | number; label: string };
            // eslint-disable-next-line no-console
            console.log(
                `[Tree dnd demo] drop "${data.label}" on "${String(target.value)}"`,
            );
        }
        : undefined;

    // Lazy-load demo wiring — getHasChildren says "yes" for any directory whose value
    // is in LAZY_NESTED_CHILDREN; loadChildren sleeps 400ms then attaches the children
    // in place.
    const getHasChildren = lazy
        ? (it: ITreeItem) =>
            typeof it.value === "string" && LAZY_NESTED_CHILDREN[it.value] !== undefined
        : undefined;

    const lazyLoadChildren = lazy
        ? async (source: ITreeItem) => {
            await new Promise((r) => setTimeout(r, 400));
            const v = source.value as string;
            const children = LAZY_NESTED_CHILDREN[v];
            if (!children) return;
            // Mutate IN PLACE — the model bumps revision after resolve, forcing
            // rows-memo to re-walk.
            source.items = children.map((c) => ({ ...c }));
        }
        : undefined;

    const onLoadError = lazy
        ? (v: string | number, err: unknown) => {
            // eslint-disable-next-line no-console
            console.warn("[Tree lazy demo] load error", v, err);
        }
        : undefined;

    return (
        <Panel direction="column" gap="sm" width={420} height={460}>
            <Panel direction="row" gap="sm">
                <Button onClick={() => treeRef.current?.expandAll()}>Expand all</Button>
                <Button onClick={() => treeRef.current?.collapseAll()}>Collapse all</Button>
                <Button
                    onClick={() => {
                        const target = findByValue(items, "src/uikit/Tree/Tree.tsx");
                        if (!target) return;
                        treeRef.current?.revealItem(target.value);
                        // Compose with selection — `revealItem` only reveals; the caller
                        // owns selection state.
                        setValue(target);
                    }}
                >
                    Reveal Tree.tsx
                </Button>
            </Panel>
            {multiSelect && (
                <Panel direction="row" gap="sm">
                    <span style={{ fontSize: 12, color: color.text.light }}>
                        {selectedValues.size} selected — Ctrl+click toggles, Shift+click extends,
                        Ctrl+A all
                    </span>
                </Panel>
            )}
            <Tree
                onModel={(model) => { treeRef.current = model; }}
                items={items}
                value={predicateSelection || multiSelect ? null : value}
                onChange={(item) => setValue(item)}
                isSelected={isSelected}
                multiSelect={multiSelect}
                onSelectionChange={(_sources, values) => setSelectedValues(new Set(values))}
                activeIndex={active}
                onActiveChange={setActive}
                searchText={searchText}
                renderItem={renderItem}
                getTooltip={getTooltip}
                getContextMenu={getContextMenu}
                onContextMenu={onContextMenu}
                keyboardNav={keyboardNav}
                loading={loading}
                emptyMessage="no items"
                defaultExpandAll={defaultExpandAll}
                traitTypeId={dnd ? TREE_DEMO_TRAIT_KEY : undefined}
                getDragData={getDragData}
                acceptsDrop={dnd}
                canTraitDrop={canTraitDrop}
                onTraitDrop={onTraitDrop}
                getHasChildren={getHasChildren}
                loadChildren={lazyLoadChildren}
                onLoadError={onLoadError}
            />
        </Panel>
    );
}

export const treeStory: Story = {
    id: "tree",
    name: "Tree",
    section: "Lists",
    component: TreeDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "searchText",         type: "string",  default: "" },
        { name: "keyboardNav",        type: "boolean", default: true },
        { name: "loading",            type: "boolean", default: false },
        { name: "customRow",          type: "boolean", default: false },
        { name: "tooltip",            type: "boolean", default: false },
        { name: "contextMenu",        type: "boolean", default: false },
        { name: "predicateSelection", type: "boolean", default: false },
        { name: "multiSelect",        type: "boolean", default: false },
        { name: "sections",           type: "boolean", default: false },
        { name: "defaultExpandAll",   type: "boolean", default: false },
        { name: "dnd",                type: "boolean", default: false },
        { name: "lazy",               type: "boolean", default: false },
    ],
};
