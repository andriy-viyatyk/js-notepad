import type { EditorModel } from "../base/EditorModel";
import { boardTrust } from "../../api/board-trust";
import { showTrustBoardDialog } from "../../ui/dialogs/TrustBoardDialog";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { BoardEditorModel } from "./BoardEditorModel";
import { UntrustedBoardView } from "./UntrustedBoardView";
import { BoardNotFoundView } from "./BoardNotFoundView";
import { BoardWebview } from "./BoardWebview";
import { BoardToolbarView } from "./BoardToolbar";
import { ScriptPanelView } from "../text/ScriptPanelView";
import { ContentHostFooterView } from "../base/ContentHostFooterView";
import type { TextFileModel } from "../text/TextEditorModel";
import { spacing } from "../../uikit/tokens";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";

interface BoardEditorViewProps {
    model: EditorModel;
}

interface ContentErrorProps {
    message: string;
}

class ContentErrorView extends VanillaView<ContentErrorProps> {
    private readonly messageElement: HTMLSpanElement;

    public constructor(props: ContentErrorProps) {
        const messageElement = createTextElement("", { color: "light", align: "center" });
        super(props, createPanelElement({
            direction: "column",
            flex: true,
            align: "center",
            justify: "center",
            gap: "md",
            padding: "xl",
        }, [
            createIconElement("warning", { width: 32, height: 32 }),
            createTextElement("Content unavailable", { size: "lg" }),
            messageElement,
        ]));
        this.messageElement = messageElement;
    }

    protected onMount(): void {
        this.updateMessage();
    }

    protected onUpdate(): void {
        this.updateMessage();
    }

    private updateMessage(): void {
        this.messageElement.textContent = this.props.message;
    }
}

interface BoardHostViewProps {
    model: BoardEditorModel;
    boardRoot: string;
}

class BoardHostView extends VanillaView<BoardHostViewProps> {
    private readonly model: BoardEditorModel;
    private readonly toolbar: BoardToolbarView;
    private readonly webview: BoardWebview;
    private readonly host: TextFileModel | null;
    private scriptPanel: ScriptPanelView | undefined;
    private footer: ContentHostFooterView | undefined;
    private statusElement: HTMLSpanElement | undefined;

    public constructor(props: BoardHostViewProps) {
        super(props, createPanelElement({
            name: "board-host",
            direction: "column",
            flex: true,
            width: "100%",
        }));
        this.model = props.model;
        this.host = props.model.contentHost as unknown as TextFileModel | null;
        this.toolbar = new BoardToolbarView({ model: props.model });
        this.webview = new BoardWebview({
            model: props.model,
            boardRoot: props.boardRoot,
        });
    }

    protected onMount(): void {
        const toolbar = this.child(this.toolbar);
        const webviewWrap = createPanelElement({
            name: "board-webview-wrap",
            direction: "column",
            flex: true,
            width: "100%",
            height: 0,
        }, [this.child(this.webview).root]);
        this.root.append(toolbar.root, webviewWrap);
        toolbar.mount();
        this.webview.mount();

        if (this.host?.script) {
            this.scriptPanel = this.child(new ScriptPanelView({ model: this.host }));
            this.root.append(this.scriptPanel.root);
            this.scriptPanel.mount();
        }
        if (this.host) {
            this.statusElement = createTextElement("", { color: "light", size: "md" });
            this.statusElement.style.padding = `0 ${spacing.sm}px`;
            this.footer = this.child(new ContentHostFooterView({
                host: this.host,
                footerContributions: null,
            }));
            this.root.append(this.footer.root);
            this.footer.mount();
            this.bind(this.model.state, (state) => state.statusText, this.updateStatus);
        }
    }

    protected onUpdate(): void {
        // BoardWebview is intentionally not retargeted. The parent branch key
        // gives it stable-key replacement semantics: a changed key gets a fresh board element.
    }

    private readonly updateStatus = (statusText: string | undefined): void => {
        if (!this.footer || !this.statusElement || !this.host) return;
        this.statusElement.textContent = statusText ?? "";
        this.footer.update({
            host: this.host,
            footerContributions: statusText ? this.statusElement : null,
        });
    };
}

type BranchView = BoardNotFoundView | UntrustedBoardView | ContentErrorView | BoardHostView;

/** Native four-way board editor host. Branch identity owns the board iframe lifetime. */
export class BoardEditorView extends VanillaView<BoardEditorViewProps> {
    private readonly model: BoardEditorModel;
    private readonly swap: SubtreeSwap<string>;
    private activeBranch: BranchView | undefined;
    private activeBranchKey: string | undefined;

    public constructor(props: BoardEditorViewProps) {
        if (!(props.model instanceof BoardEditorModel)) {
            throw new Error("BoardEditorView requires a BoardEditorModel.");
        }
        super(props, createPanelElement({ direction: "column", flex: true }));
        this.model = props.model;
        this.swap = new SubtreeSwap(this.root);
        this.own(() => this.swap.dispose());
    }

    protected onMount(): void {
        this.bind(this.model.state, (state) => ({
            boardRoot: state.boardRoot,
            selectedBoard: state.selectedBoard,
            reloadToken: state.reloadToken,
            contentHostError: state.contentHostError,
        }), this.syncBranch);
        this.own(boardTrust.subscribePaths(this.syncBranch));
    }

    protected onUpdate(): void {
        this.syncBranch();
    }

    protected onDispose(): void {
        this.activeBranch = undefined;
        this.activeBranchKey = undefined;
    }

    private readonly syncBranch = (): void => {
        const state = this.model.state.get();
        const selectedRoot = state.selectedBoard ? state.boardRoot : undefined;
        const key = !state.selectedBoard || !selectedRoot
            ? "not-found"
            : !boardTrust.isTrusted(selectedRoot)
                ? "untrusted"
                : state.contentHostError
                    ? "content-error"
                    : `${selectedRoot}__${state.reloadToken}`;

        if (this.activeBranchKey === key && this.activeBranch) {
            this.updateActiveBranch(selectedRoot, state.contentHostError);
            return;
        }

        const previous = this.activeBranch;
        this.activeBranch = undefined;
        this.activeBranchKey = key;
        try {
            this.swap.set(key, () => {
                const branch = this.createBranch(key, selectedRoot, state.contentHostError);
                this.activeBranch = branch;
                return branch;
            });
            if (!this.activeBranch) return;
            this.activeBranch.mount();
        } catch (mountError) {
            this.activeBranch = undefined;
            this.activeBranchKey = undefined;
            try {
                this.swap.clear();
            } catch {
                // Preserve the original branch mount failure.
            }
            throw mountError;
        }
        // `SubtreeSwap` has already disposed and detached the previous branch.
        // Keep this reference only to make the ordering explicit to readers.
        void previous;
    };

    private createBranch(
        key: string,
        selectedRoot: string | undefined,
        contentHostError: string | undefined,
    ): BranchView {
        const state = this.model.state.get();
        if (key === "not-found") {
            return new BoardNotFoundView({ path: state.boardRoot ?? "" });
        }
        if (key === "untrusted") {
            if (!selectedRoot) throw new Error("An untrusted board branch requires a board root.");
            return new UntrustedBoardView({
                path: selectedRoot,
                onTrust: () => this.trustBoard(selectedRoot),
            });
        }
        if (key === "content-error") {
            if (!contentHostError) throw new Error("A content-error branch requires an error message.");
            return new ContentErrorView({ message: contentHostError });
        }
        if (!selectedRoot) throw new Error("A board host branch requires a board root.");
        return new BoardHostView({ model: this.model, boardRoot: selectedRoot });
    }

    private updateActiveBranch(selectedRoot: string | undefined, contentHostError: string | undefined): void {
        const branch = this.activeBranch;
        if (!branch) return;
        const state = this.model.state.get();
        if (this.activeBranchKey === "not-found" && branch instanceof BoardNotFoundView) {
            branch.update({ path: state.boardRoot ?? "" });
            return;
        }
        if (this.activeBranchKey === "untrusted" && branch instanceof UntrustedBoardView && selectedRoot) {
            branch.update({ path: selectedRoot, onTrust: () => this.trustBoard(selectedRoot) });
            return;
        }
        if (this.activeBranchKey === "content-error" && branch instanceof ContentErrorView && contentHostError) {
            branch.update({ message: contentHostError });
            return;
        }
        if (branch instanceof BoardHostView && selectedRoot) {
            branch.update({ model: this.model, boardRoot: selectedRoot });
        }
    }

    private async trustBoard(boardRoot: string): Promise<void> {
        if (await showTrustBoardDialog(boardRoot)) {
            const { confirmNamespaceNotColliding } = await import("../../api/board-vars/namespace");
            if (await confirmNamespaceNotColliding(boardRoot)) await boardTrust.trust(boardRoot);
        }
    }
}
