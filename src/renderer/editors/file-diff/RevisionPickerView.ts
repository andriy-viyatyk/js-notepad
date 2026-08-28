import { ButtonView, type ButtonViewProps } from "../../uikit/Button/ButtonView";
import { PopoverView, type PopoverViewProps } from "../../uikit/Popover/PopoverView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { GitTreeView, type GitTreeProps } from "../../components/git-tree/GitTreeView";
import { syntheticCommitRow, type GitCommitRow } from "../../components/git-tree/swimlane-layout";
import type { GitTreeModel } from "../../components/git-tree/GitTreeModel";
import type { RevSel } from "./FileDiffEditor";
import "../../uikit/Button/Button.css";

export interface RevisionPickerViewProps {
    /** Which diff side this picker controls. `from` (left) omits the "Unstaged" option. */
    side: "from" | "to";
    /** The editor-owned, file-scoped commit-list model for this side. */
    picker: GitTreeModel;
    /** Current selection (drives the button label + commit highlight). */
    value: RevSel;
    /** Whether to offer the "Staged" option (hidden when the file has no staged changes). */
    showStaged: boolean;
    onPick: (sel: RevSel) => void;
}

function labelFor(selection: RevSel): string {
    switch (selection.kind) {
        case "unstaged": return "Unstaged";
        case "staged": return "Staged";
        case "head": return "HEAD";
        case "commit": return selection.shortHash;
    }
}

class RevisionPickerContentView extends VanillaView<GitTreeProps> {
    private tree: GitTreeView | undefined;

    public constructor(props: GitTreeProps) {
        super(props, createPanelElement({
            direction: "column",
            gap: "xs",
            padding: "xs",
            width: 460,
        }));
    }

    protected onMount(): void {
        const heightPanel = createPanelElement({ direction: "column", height: 280 });
        const flexPanel = createPanelElement({ direction: "column", flex: 1, height: 0 });
        const tree = this.child(new GitTreeView(this.props));
        this.tree = tree;
        flexPanel.append(tree.root);
        heightPanel.append(flexPanel);
        this.root.append(heightPanel);
        tree.mount();
    }

    protected onUpdate(props: GitTreeProps): void {
        this.tree?.update(props);
    }

    protected onDispose(): void {
        // The GitTreeModel belongs to FileDiffEditor and is deliberately borrowed here.
        this.tree = undefined;
    }
}

export class RevisionPickerView extends VanillaView<RevisionPickerViewProps> {
    private readonly button: ButtonView;
    private readonly popover: PopoverView;
    private open = false;
    /** Borrowed content owned by the Popover floating branch, not this picker. */
    private contentView: RevisionPickerContentView | undefined;

    public constructor(props: RevisionPickerViewProps) {
        super(props, createContentsRoot());
        const button = this.child(new ButtonView(this.buttonProps(props)));
        const popover = this.child(new PopoverView(this.popoverProps(props, button.root)));
        this.button = button;
        this.popover = popover;
        this.root.append(button.root, popover.root);
    }

    protected onMount(): void {
        this.button.mount();
        this.popover.mount();
    }

    protected onUpdate(props: RevisionPickerViewProps): void {
        this.button.update(this.buttonProps(props));
        this.popover.update(this.popoverProps(props, this.button.root));
        if (this.open) this.contentView?.update(this.contentProps(props));
        else this.contentView = undefined;
    }

    private readonly toggle = (): void => {
        this.open = !this.open;
        void this.props.picker.ensureLoaded();
        this.updatePopover();
    };

    private readonly close = (): void => {
        if (!this.open) return;
        this.open = false;
        this.updatePopover();
    };

    private updatePopover(): void {
        this.popover.update(this.popoverProps(this.props, this.button.root));
        if (this.open) this.contentView?.update(this.contentProps(this.props));
        else this.contentView = undefined;
    }

    private readonly pick = (hash: string): void => {
        const leadingRows = this.makeLeadingRows(this.props);
        const leading = leadingRows.find((row) => row.hash === hash);
        if (leading) this.props.onPick({ kind: leading.recordType } as RevSel);
        else this.props.onPick({ kind: "commit", hash, shortHash: hash.slice(0, 7) });
        this.close();
    };

    private buttonProps(props: RevisionPickerViewProps): ButtonViewProps {
        return {
            name: `file-diff-picker-${props.side}`,
            size: "sm",
            variant: "ghost",
            onClick: this.toggle,
            children: labelFor(props.value),
        };
    }

    private popoverProps(props: RevisionPickerViewProps, anchor: HTMLElement): PopoverViewProps {
        return {
            name: `file-diff-picker-${props.side}-popover`,
            open: this.open,
            elementRef: anchor,
            onClose: this.close,
            placement: "bottom-start",
            contentView: (host) => {
                const content = new RevisionPickerContentView(this.contentProps(props));
                host.append(content.root);
                this.contentView = content;
                return content;
            },
        };
    }

    private contentProps(props: RevisionPickerViewProps): GitTreeProps {
        const leadingRows = this.makeLeadingRows(props);
        return {
            model: props.picker,
            compact: true,
            leadingRows,
            selectedHash: this.selectedHash(props.value, leadingRows),
            onSelectCommit: this.pick,
        };
    }

    private makeLeadingRows(props: RevisionPickerViewProps): GitCommitRow[] {
        const rows: GitCommitRow[] = [];
        if (props.side === "to") rows.push(syntheticCommitRow("unstaged", "Unstaged changes"));
        if (props.showStaged) rows.push(syntheticCommitRow("staged", "Staged changes"));
        return rows;
    }

    private selectedHash(value: RevSel, leadingRows: GitCommitRow[]): string | undefined {
        if (value.kind === "commit") return value.hash;
        return leadingRows.find((row) => row.recordType === value.kind)?.hash;
    }
}

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}
