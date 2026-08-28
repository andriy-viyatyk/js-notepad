import type { AutocompleteProps } from "../../uikit/Autocomplete/AutocompleteModel";
import { AutocompleteView } from "../../uikit/Autocomplete/AutocompleteView";
import type { CheckboxProps } from "../../uikit/Checkbox/CheckboxView";
import { CheckboxView } from "../../uikit/Checkbox/CheckboxView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { TextareaProps } from "../../uikit/Textarea/TextareaView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { applyPanelAttributes, createPanelElement, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { RestHeader } from "./restClientTypes";
import "../../uikit/Autocomplete/Autocomplete.css";
import "../../uikit/Checkbox/Checkbox.css";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/Textarea/Textarea.css";

export interface KeyValueEditorProps {
    items: RestHeader[];
    onUpdate: (index: number, changes: Partial<RestHeader>) => void;
    onDelete: (index: number) => void;
    onToggle: (index: number) => void;
    keyOptions?: string[];
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

interface KeyedHeader {
    item: RestHeader;
    index: number;
}

interface KeyValueRowProps {
    item: RestHeader;
    index: number;
    isLast: boolean;
    onUpdate: (index: number, changes: Partial<RestHeader>) => void;
    onDelete: (index: number) => void;
    onToggle: (index: number) => void;
    keyOptions?: string[];
    keyPlaceholder: string;
    valuePlaceholder: string;
}

class StaticPanelView extends VanillaView<Record<string, never>> {
    public constructor() {
        super({}, createPanelElement({ width: 24, shrink: false }));
    }
}

class KeyValueRowView extends VanillaView<KeyValueRowProps> {
    private readonly keyHost = document.createElement("span");
    private readonly deleteHost = document.createElement("span");
    private readonly keySwap = new SubtreeSwap<"autocomplete" | "textarea">(this.keyHost);
    private readonly deleteSwap = new SubtreeSwap<"spacer" | "delete">(this.deleteHost);
    private checkbox: CheckboxView | undefined;
    private value: TextareaView | undefined;
    private keyBranch: VanillaView<unknown> | undefined;
    private deleteBranch: VanillaView<unknown> | undefined;
    private pendingKeyBranch: VanillaView<unknown> | undefined;
    private pendingDeleteBranch: VanillaView<unknown> | undefined;

    public constructor(props: KeyValueRowProps) {
        super(props, createPanelElement({
            name: "kv-row",
            direction: "row",
            align: "start",
            gap: "xs",
            paddingTop: "xs",
            dimmed: !props.item.enabled,
        }));
        this.keyHost.style.display = "contents";
        this.deleteHost.style.display = "contents";
    }

    protected onMount(): void {
        const checkSlot = createPanelElement({ name: "kv-row-check-slot", paddingTop: "sm", shrink: false });
        const keySlot = createPanelElement({ name: "kv-row-key-slot", width: "35%", minWidth: 100, shrink: false }, [this.keyHost]);
        const checkbox = this.child(new CheckboxView(this.checkboxProps()));
        const value = this.child(new TextareaView(this.valueProps()));
        const valueSlot = value.root;
        checkSlot.append(checkbox.root);
        this.checkbox = checkbox;
        this.value = value;
        this.root.append(checkSlot, keySlot, valueSlot, this.deleteHost);
        checkbox.mount();
        value.mount();
        this.syncKeyBranch();
        this.syncDeleteBranch();
    }

    protected onUpdate(props: KeyValueRowProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes({
            name: "kv-row",
            direction: "row",
            align: "start",
            gap: "xs",
            paddingTop: "xs",
            dimmed: !props.item.enabled,
        }));
        this.checkbox?.update(this.checkboxProps());
        this.value?.update(this.valueProps());
        this.syncKeyBranch();
        this.syncDeleteBranch();
    }

    protected onDispose(): void {
        this.keySwap.dispose();
        this.deleteSwap.dispose();
        this.checkbox = undefined;
        this.value = undefined;
        this.keyBranch = undefined;
        this.deleteBranch = undefined;
    }

    private checkboxProps(): CheckboxProps {
        return {
            checked: this.props.item.enabled,
            onChange: () => this.props.onToggle(this.props.index),
        };
    }

    private valueProps(): TextareaProps {
        return {
            name: "kv-row-value",
            variant: "ghost",
            singleLine: true,
            value: this.props.item.value,
            onChange: (value) => this.props.onUpdate(this.props.index, { value }),
            placeholder: this.props.valuePlaceholder,
            flex: "1 1 0",
            minWidth: 0,
            minHeight: 24,
        };
    }

    private syncKeyBranch(): void {
        const key = this.props.keyOptions ? "autocomplete" : "textarea";
        if (this.keyBranch && this.keyBranchKey === key) {
            this.keyBranch.update(this.keyBranchProps(key));
            return;
        }
        this.pendingKeyBranch = undefined;
        this.keySwap.set(key, () => {
            const branch = this.createKeyBranch(key);
            this.pendingKeyBranch = branch;
            return branch;
        });
        const branch = this.pendingKeyBranch;
        this.pendingKeyBranch = undefined;
        if (!branch) return;
        this.keyBranch = branch;
        this.keyBranchKey = key;
        branch.mount();
    }

    private keyBranchKey: "autocomplete" | "textarea" | undefined;

    private createKeyBranch(key: "autocomplete" | "textarea"): VanillaView<unknown> {
        if (key === "autocomplete") {
            return new AutocompleteView(this.keyBranchProps(key) as AutocompleteProps);
        }
        return new TextareaView(this.keyBranchProps(key) as TextareaProps);
    }

    private keyBranchProps(key: "autocomplete" | "textarea"): AutocompleteProps | TextareaProps {
        if (key === "autocomplete") {
            return {
                name: "kv-row-key",
                items: this.props.keyOptions ?? [],
                value: this.props.item.key,
                onChange: (value) => this.props.onUpdate(this.props.index, { key: value }),
                placeholder: this.props.keyPlaceholder,
                filterMode: "contains",
                size: "sm",
            };
        }
        return {
            name: "kv-row-key",
            variant: "ghost",
            singleLine: true,
            value: this.props.item.key,
            onChange: (value) => this.props.onUpdate(this.props.index, { key: value }),
            placeholder: this.props.keyPlaceholder,
            flex: "1 1 0",
            minWidth: 0,
            minHeight: 24,
        };
    }

    private syncDeleteBranch(): void {
        const empty = !this.props.item.key && !this.props.item.value;
        const key = this.props.isLast && empty ? "spacer" : "delete";
        if (this.deleteBranch && this.deleteBranchKey === key) return;
        this.pendingDeleteBranch = undefined;
        this.deleteSwap.set(key, () => {
            const branch = key === "spacer"
                ? new StaticPanelView()
                : new IconButtonView(this.deleteProps());
            this.pendingDeleteBranch = branch;
            return branch;
        });
        const branch = this.pendingDeleteBranch;
        this.pendingDeleteBranch = undefined;
        if (!branch) return;
        this.deleteBranch = branch;
        this.deleteBranchKey = key;
        branch.mount();
    }

    private deleteBranchKey: "spacer" | "delete" | undefined;

    private deleteProps(): IconButtonProps {
        return {
            name: "kv-row-delete",
            size: "sm",
            icon: "close",
            title: "Delete",
            onClick: () => this.props.onDelete(this.props.index),
        };
    }
}

export class KeyValueEditorView extends VanillaView<KeyValueEditorProps> {
    private readonly list = new KeyedList<KeyedHeader, number, HTMLDivElement>(this.root, {
        keyOf: (entry) => entry.index,
        create: (entry) => {
            const view = new KeyValueRowView(this.rowProps(entry));
            view.mount();
            this.rows.set(view.root as HTMLDivElement, view);
            return view.root as HTMLDivElement;
        },
        update: (element, entry) => this.rows.get(element)?.update(this.rowProps(entry)),
        remove: (element) => {
            this.rows.get(element)?.dispose();
            this.rows.delete(element);
        },
    });
    private readonly rows = new Map<HTMLDivElement, KeyValueRowView>();

    public constructor(props: KeyValueEditorProps) {
        super(props, createPanelElement({ name: "kv-editor", direction: "column", gap: "xs" }));
    }

    protected onMount(): void {
        this.own(() => this.list.dispose());
        this.updateList(this.props.items);
    }

    protected onUpdate(props: KeyValueEditorProps): void {
        this.updateList(props.items);
    }

    private updateList(items: RestHeader[]): void {
        this.list.update(items.map((item, index) => ({ item, index })));
    }

    private rowProps(entry: KeyedHeader): KeyValueRowProps {
        return {
            item: entry.item,
            index: entry.index,
            isLast: entry.index === this.props.items.length - 1,
            onUpdate: this.props.onUpdate,
            onDelete: this.props.onDelete,
            onToggle: this.props.onToggle,
            keyOptions: this.props.keyOptions,
            keyPlaceholder: this.props.keyPlaceholder ?? "Key",
            valuePlaceholder: this.props.valuePlaceholder ?? "Value",
        };
    }
}
