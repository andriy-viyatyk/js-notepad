import { ButtonView } from "../Button/ButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { TreeView } from "./TreeView";
import type { ITreeItem, TreeItemRenderContext, TreeProps } from "./types";
import { createFileTypeIconElement, createFolderIconElement } from "../../components/icons/icon-elements";
import { ContextMenuEvent } from "../../api/events/events";
import type { MenuItem } from "../Menu";
import color from "../../theme/color";
import { TraitSet } from "../../core/traits/traits";
import { traitRegistry, TraitTypeId } from "../../core/traits/TraitRegistry";
import type { TraitDragPayload } from "../../core/traits/dnd";
import type { Story } from "../../editors/storybook/storyTypes";

const TREE_DEMO_TRAIT_KEY: TraitTypeId = TraitTypeId.NotebookCategory;
if (!traitRegistry.has(TREE_DEMO_TRAIT_KEY)) traitRegistry.register(TREE_DEMO_TRAIT_KEY, new TraitSet());

type StoryTreeItem = ITreeItem & { storyIcon?: "file" | "folder" };

function leaf(value: string, label: string): StoryTreeItem {
    return { value, label, storyIcon: "file" };
}

function folder(value: string, label: string, items: StoryTreeItem[]): StoryTreeItem {
    return { value, label, storyIcon: "folder", items };
}

const REGULAR_TREE: StoryTreeItem[] = [
    folder("src", "src", [
        folder("src/uikit", "uikit", [
            folder("src/uikit/ListBox", "ListBox", [
                leaf("src/uikit/ListBox/ListBox.tsx", "ListBox.tsx"), leaf("src/uikit/ListBox/ListBoxModel.ts", "ListBoxModel.ts"),
                leaf("src/uikit/ListBox/ListItem.tsx", "ListItem.tsx"), leaf("src/uikit/ListBox/SectionItem.tsx", "SectionItem.tsx"), leaf("src/uikit/ListBox/index.ts", "index.ts"),
            ]),
            folder("src/uikit/Select", "Select", [
                leaf("src/uikit/Select/Select.tsx", "Select.tsx"), leaf("src/uikit/Select/SelectModel.ts", "SelectModel.ts"), leaf("src/uikit/Select/index.ts", "index.ts"),
            ]),
            folder("src/uikit/Tree", "Tree", [
                leaf("src/uikit/Tree/Tree.tsx", "Tree.tsx"), leaf("src/uikit/Tree/TreeModel.ts", "TreeModel.ts"), leaf("src/uikit/Tree/TreeItem.tsx", "TreeItem.tsx"),
                leaf("src/uikit/Tree/SectionItem.tsx", "SectionItem.tsx"), leaf("src/uikit/Tree/types.ts", "types.ts"), leaf("src/uikit/Tree/index.ts", "index.ts"),
            ]),
            leaf("src/uikit/index.ts", "index.ts"), leaf("src/uikit/tokens.ts", "tokens.ts"),
        ]),
        folder("src/core", "core", [
            folder("src/core/state", "state", [leaf("src/core/state/state.ts", "state.ts"), leaf("src/core/state/model.ts", "model.ts")]),
            folder("src/core/traits", "traits", [leaf("src/core/traits/traits.ts", "traits.ts"), leaf("src/core/traits/dnd.ts", "dnd.ts")]),
        ]),
        leaf("src/index.ts", "index.ts"),
    ]),
    folder("doc", "doc", [folder("doc/tasks", "tasks", [leaf("doc/tasks/.md", "-uikit-tree.md"), leaf("doc/tasks/.md", "-uikit-tree-dnd.md"), leaf("doc/tasks/.md", "-uikit-tree-lazy-load.md")]), leaf("doc/active-work.md", "active-work.md")]),
    leaf("README.md", "README.md"), leaf("package.json", "package.json"),
];

function findByValue(items: StoryTreeItem[], value: string | number): StoryTreeItem | null {
    for (const item of items) {
        if (item.value === value) return item;
        if (item.items) {
            const found = findByValue(item.items, value);
            if (found) return found;
        }
    }
    return null;
}

const LAZY_NESTED_CHILDREN: Record<string, StoryTreeItem[]> = {
    "lazy/dirA": [leaf("lazy/dirA/file1.ts", "file1.ts"), leaf("lazy/dirA/file2.ts", "file2.ts"), leaf("lazy/dirA/README.md", "README.md")],
    "lazy/dirB": [leaf("lazy/dirB/notes.md", "notes.md")],
    "lazy/dirC": [{ value: "lazy/dirC/inner", label: "inner", storyIcon: "folder", items: undefined }, leaf("lazy/dirC/x.ts", "x.ts")],
    "lazy/dirC/inner": [leaf("lazy/dirC/inner/deep.ts", "deep.ts")],
};

function makeLazyTree(): StoryTreeItem[] {
    return [
        { value: "lazy/dirA", label: "dirA", storyIcon: "folder", items: undefined },
        { value: "lazy/dirB", label: "dirB", storyIcon: "folder", items: undefined },
        { value: "lazy/dirC", label: "dirC (deeper)", storyIcon: "folder", items: undefined },
        leaf("lazy/standalone.txt", "standalone.txt"),
    ];
}

const SECTIONED_TREE: StoryTreeItem[] = [
    { value: "section-recent", label: "Recent", section: true, items: [leaf("recent/Tree.tsx", "Tree.tsx"), leaf("recent/TreeModel.ts", "TreeModel.ts"), leaf("recent/types.ts", "types.ts")] },
    { value: "section-pinned", label: "Pinned", section: true, items: [leaf("pinned/active-work.md", "active-work.md"), leaf("pinned/CLAUDE.md", "CLAUDE.md")] },
    { value: "section-all", label: "All Files", section: true, items: REGULAR_TREE },
];

function makeDeepTree(): StoryTreeItem[] {
    const chain = (depth: number, prefix: string): StoryTreeItem[] | undefined => depth === 0 ? undefined : [{ value: `${prefix}/d${depth}`, label: `deep-${depth}`, storyIcon: "folder", items: chain(depth - 1, prefix) }];
    return Array.from({ length: 60 }, (_, i) => ({ value: `synthetic/root-${i}`, label: `root-${i}`, storyIcon: "folder", items: chain(i % 8, `synthetic/root-${i}`) }));
}

const DEEP_TREE = makeDeepTree();

interface DemoProps {
    searchText?: string; keyboardNav?: boolean; loading?: boolean; customRow?: boolean; tooltip?: boolean;
    contextMenu?: boolean; predicateSelection?: boolean; multiSelect?: boolean; sections?: boolean;
    defaultExpandAll?: boolean; dnd?: boolean; lazy?: boolean; deep?: boolean;
}

class TreeDemoView extends VanillaView<DemoProps> {
    private model: import("./TreeModel").TreeModel<StoryTreeItem> | null = null;
    private tree: TreeView<StoryTreeItem> | undefined;
    private value: StoryTreeItem | null = null;
    private selectedValues = new Set<StoryTreeItem["value"]>();
    private active: number | null = 0;
    private removed = new Set<StoryTreeItem["value"]>();
    private lazyTree: StoryTreeItem[] | null = null;
    private items: StoryTreeItem[] = [];
    private itemsKey = "";
    private selectionVersion = 0;
    private appliedSelectionVersion = -1;
    private selectionMode: "multi" | "predicate" | "none" = "none";
    private removedVersion = 0;
    private isSelected: TreeProps<StoryTreeItem>["isSelected"];
    private selectionRow: HTMLElement | undefined;
    private treeHost: HTMLElement | undefined;
    private readonly pendingLazyTimers = new Set<number>();

    public constructor(props: DemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "sm", width: 420, height: 460 }));
        this.isSelected = undefined;
    }

    protected onMount(): void {
        this.syncItems(this.props);
        this.syncSelectionPredicate(this.props);
        const expand = this.child(new ButtonView({ children: "Expand all", onClick: () => this.model?.expandAll() }));
        const collapse = this.child(new ButtonView({ children: "Collapse all", onClick: () => this.model?.collapseAll() }));
        const reveal = this.child(new ButtonView({ children: "Reveal Tree.tsx", onClick: this.revealItem }));
        const controls = createPanelElement({ direction: "row", gap: "sm" }, [expand.root, collapse.root, reveal.root]);
        this.selectionRow = createPanelElement({ direction: "row", gap: "sm" }, [createTextElement("", { size: "sm", color: "light" })]);
        const tree = this.child(new TreeView(this.treeProps(this.props)));
        this.tree = tree;
        this.treeHost = tree.root;
        this.root.append(controls, tree.root);
        expand.mount(); collapse.mount(); reveal.mount(); tree.mount();
        this.syncSelectionRow();
        this.syncSelectionRowVisibility();
    }

    protected onUpdate(props: DemoProps): void {
        this.syncItems(props);
        this.syncSelectionPredicate(props);
        this.tree?.update(this.treeProps(props));
        this.syncSelectionRowVisibility();
        this.syncSelectionRow();
    }

    private readonly onChange = (item: StoryTreeItem): void => {
        this.value = item;
        this.tree?.update(this.treeProps(this.props));
    };

    private readonly onActiveChange = (index: number | null): void => {
        this.active = index;
        this.tree?.update(this.treeProps(this.props));
    };

    private readonly onSelectionChange = (_sources: StoryTreeItem[], values: (string | number)[]): void => {
        this.selectedValues = new Set(values);
        this.selectionVersion++;
        this.syncSelectionPredicate(this.props);
        this.tree?.update(this.treeProps(this.props));
        this.syncSelectionRow();
    };

    private readonly revealItem = (): void => {
        const target = findByValue(this.items, "src/uikit/Tree/Tree.tsx");
        if (!target) return;
        this.model?.revealItem(target.value);
        this.value = target;
        this.tree?.update(this.treeProps(this.props));
    };

    private syncItems(props: DemoProps): void {
        if (props.lazy && !this.lazyTree) this.lazyTree = makeLazyTree();
        if (!props.lazy) this.lazyTree = null;
        const key = `${props.lazy ?? false}:${props.deep ?? false}:${props.sections ?? false}:${this.removedVersion}`;
        if (key === this.itemsKey) return;
        this.itemsKey = key;
        if (props.lazy) this.items = this.lazyTree ?? [];
        else if (props.deep) this.items = DEEP_TREE;
        else {
            const base = props.sections ? SECTIONED_TREE : REGULAR_TREE;
            if (this.removed.size === 0) this.items = base;
            else {
                const filter = (nodes: StoryTreeItem[]): StoryTreeItem[] => nodes.filter((node) => !this.removed.has(node.value)).map((node) => node.items ? { ...node, items: filter(node.items) } : node);
                this.items = filter(base);
            }
        }
    }

    private syncSelectionPredicate(props: DemoProps): void {
        const mode = props.multiSelect ? "multi" : props.predicateSelection ? "predicate" : "none";
        if (mode !== this.selectionMode) {
            this.selectionMode = mode;
            if (mode === "multi") {
                this.isSelected = (item) => this.selectedValues.has(item.value);
                this.appliedSelectionVersion = this.selectionVersion;
            } else if (mode === "predicate") this.isSelected = this.isPredicateSelected;
            else this.isSelected = undefined;
        } else if (mode === "multi" && this.appliedSelectionVersion !== this.selectionVersion) {
            this.isSelected = (item) => this.selectedValues.has(item.value);
            this.appliedSelectionVersion = this.selectionVersion;
        }
    }

    private readonly isPredicateSelected = (item: StoryTreeItem): boolean => typeof item.value === "string" && item.value.endsWith(".tsx");

    private treeProps(props: DemoProps): TreeProps<StoryTreeItem> {
        return {
            onModel: (model) => { this.model = model; },
            items: this.items,
            value: props.predicateSelection || props.multiSelect ? null : this.value,
            onChange: this.onChange,
            isSelected: this.isSelected,
            multiSelect: props.multiSelect,
            onSelectionChange: this.onSelectionChange,
            activeIndex: this.active,
            onActiveChange: this.onActiveChange,
            searchText: props.searchText,
            renderItem: props.customRow ? this.renderCustomRow : undefined,
            getTooltip: props.tooltip ? this.getTooltip : undefined,
            getIconElement: this.getIconElement,
            getContextMenu: props.contextMenu ? this.getContextMenu : undefined,
            onContextMenu: props.contextMenu ? this.onContextMenu : undefined,
            keyboardNav: props.keyboardNav,
            loading: props.loading,
            emptyMessage: "no items",
            defaultExpandAll: props.defaultExpandAll,
            traitTypeId: props.dnd ? TREE_DEMO_TRAIT_KEY : undefined,
            getDragData: props.dnd ? this.getDragData : undefined,
            acceptsDrop: props.dnd,
            canTraitDrop: props.dnd ? this.canTraitDrop : undefined,
            onTraitDrop: props.dnd ? this.onTraitDrop : undefined,
            getHasChildren: props.lazy ? this.getHasChildren : undefined,
            loadChildren: props.lazy ? this.loadChildren : undefined,
            onLoadError: props.lazy ? this.onLoadError : undefined,
        };
    }

    private readonly getTooltip = (item: StoryTreeItem): string | null => typeof item.label === "string" ? `Tooltip: ${item.label}` : null;
    private readonly getIconElement = (item: StoryTreeItem): Node | undefined => item.storyIcon === "folder" ? createFolderIconElement() : item.storyIcon === "file" ? createFileTypeIconElement({ fileName: String(item.label), width: 16, height: 16 }) : undefined;
    private readonly getContextMenu = (item: StoryTreeItem): MenuItem[] => [
        { label: typeof item.label === "string" ? `Copy "${item.label}"` : "Copy", icon: "copy", onClick: () => undefined },
        { label: "Remove", icon: "remove", onClick: () => { this.removed = new Set(this.removed).add(item.value); this.removedVersion++; this.itemsKey = ""; this.syncItems(this.props); this.tree?.update(this.treeProps(this.props)); } },
    ];
    private readonly onContextMenu = (event: MouseEvent): void => { ContextMenuEvent.fromNativeEvent(event, "generic").items.push({ label: "Tree background action", onClick: () => undefined }); };
    private readonly getDragData = (item: StoryTreeItem): unknown => ({ value: item.value, label: typeof item.label === "string" ? item.label : String(item.value) });
    private readonly canTraitDrop = (target: StoryTreeItem, payload: TraitDragPayload): boolean => (payload.data as { value: string | number }).value !== target.value;
    private readonly onTraitDrop = (target: StoryTreeItem, payload: TraitDragPayload): void => { const data = payload.data as { value: string | number; label: string }; /* eslint-disable-next-line no-console */ console.log(`[Tree dnd demo] drop "${data.label}" on "${String(target.value)}"`); };
    private readonly getHasChildren = (item: StoryTreeItem): boolean => typeof item.value === "string" && LAZY_NESTED_CHILDREN[item.value] !== undefined;
    private readonly loadChildren = (source: StoryTreeItem): Promise<void> => new Promise((resolve) => {
        const timer = window.setTimeout(() => { this.pendingLazyTimers.delete(timer); const children = LAZY_NESTED_CHILDREN[String(source.value)]; if (children) source.items = children.map((child) => ({ ...child })); resolve(); }, 400);
        this.pendingLazyTimers.add(timer);
    });
    private readonly onLoadError = (value: string | number, error: unknown): void => { console.warn("[Tree lazy demo] load error", value, error); };

    private readonly renderCustomRow = (context: TreeItemRenderContext<StoryTreeItem>): Node => {
        const row = document.createElement("div");
        row.id = context.id;
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.height = "100%";
        row.style.paddingLeft = `${4 + context.level * 16}px`;
        row.style.paddingRight = "8px";
        row.style.fontFamily = "monospace";
        row.style.fontSize = "12px";
        row.style.color = color.text.default;
        row.style.backgroundColor = context.selected ? color.background.light : context.active ? color.background.message : "";
        row.style.cursor = "pointer";
        row.style.whiteSpace = "nowrap";
        row.style.overflow = "hidden";
        row.style.textOverflow = "ellipsis";
        row.setAttribute("role", "treeitem");
        row.setAttribute("aria-level", String(context.level + 1));
        if (context.hasChildren) row.setAttribute("aria-expanded", String(context.expanded));
        this.listen(row, "click", () => { if (context.hasChildren) context.toggleExpanded(); });
        const chevron = document.createElement("span"); chevron.style.opacity = "0.5"; chevron.style.marginRight = "6px"; chevron.textContent = context.hasChildren ? (context.expanded ? "▼" : "▶") : "·";
        const level = document.createElement("span"); level.style.opacity = "0.6"; level.style.marginRight = "6px"; level.textContent = `L${context.level}`;
        row.append(chevron, level, document.createTextNode(typeof context.item.label === "string" ? context.item.label : String(context.item.value)));
        return row;
    };

    private syncSelectionRowVisibility(): void {
        if (!this.selectionRow) return;
        const visible = this.props.multiSelect === true;
        if (visible && !this.selectionRow.isConnected) this.root.insertBefore(this.selectionRow, this.treeHost ?? null);
        else if (!visible && this.selectionRow.isConnected) this.selectionRow.remove();
    }

    private syncSelectionRow(): void {
        const label = this.selectionRow?.firstElementChild;
        if (label) label.textContent = `${this.selectedValues.size} selected — Ctrl+click toggles, Shift+click extends, Ctrl+A all`;
    }

    protected onDispose(): void {
        this.pendingLazyTimers.forEach((timer) => window.clearTimeout(timer));
        this.pendingLazyTimers.clear();
        this.tree = undefined;
        this.model = null;
    }
}

export const treeStory: Story<DemoProps> = {
    id: "tree", name: "Tree", section: "Lists", view: TreeDemoView,
    props: [
        { name: "searchText", type: "string", default: "" }, { name: "keyboardNav", type: "boolean", default: true },
        { name: "loading", type: "boolean", default: false }, { name: "customRow", type: "boolean", default: false },
        { name: "tooltip", type: "boolean", default: false }, { name: "contextMenu", type: "boolean", default: false },
        { name: "predicateSelection", type: "boolean", default: false }, { name: "multiSelect", type: "boolean", default: false },
        { name: "sections", type: "boolean", default: false }, { name: "defaultExpandAll", type: "boolean", default: false },
        { name: "dnd", type: "boolean", default: false }, { name: "lazy", type: "boolean", default: false }, { name: "deep", type: "boolean", default: false },
    ],
};
