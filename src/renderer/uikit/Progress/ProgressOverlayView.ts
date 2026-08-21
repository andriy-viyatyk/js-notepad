import { SpinnerView } from "../Spinner/SpinnerView";
import { applyTextAttributes, resolveTextAttributes } from "../Text/text-style";
import { SubtreeSwap } from "../shared/subtree-swap";
import { VanillaView } from "../shared/vanilla-view";
import { progressState } from "./progressModel";
import type { ProgressOverlayProps } from "./ProgressOverlay";
import "./Progress.css";
import "../Spinner/Spinner.css";
import "../Text/Text.css";

const HEADER_HEIGHT = 32;
const SYSTEM_BUTTONS_WIDTH = 130;

type OverlayMode = "notification" | "progress" | "locked" | "empty";
type BranchKey = "notification" | "blocking";

interface OverlayProjection {
    mode: OverlayMode;
    label?: string;
}

interface BlockingState {
    mode: "progress" | "locked";
    label?: string;
}

function projectState(state: {
    notifications: Array<{ label: string }>;
    items: Array<{ label: string }>;
    locks: Array<unknown>;
}): OverlayProjection {
    if (state.notifications.length > 0) {
        return { mode: "notification", label: state.notifications[0].label };
    }
    if (state.items.length > 0) {
        return { mode: "progress", label: state.items[0].label };
    }
    if (state.locks.length > 0) {
        return { mode: "locked" };
    }
    return { mode: "empty" };
}

class NotificationBranchView extends VanillaView<{ label: string }> {
    private readonly message = document.createElement("span");

    public constructor(props: { label: string }) {
        super(props, document.createElement("div"));
        this.root.dataset.part = "notification";
    }

    protected onMount(): void {
        this.root.append(this.message);
        this.updateMessage(this.props.label);
    }

    protected onUpdate(props: { label: string }): void {
        this.updateMessage(props.label);
    }

    private updateMessage(label: string): void {
        applyTextAttributes(
            this.message,
            resolveTextAttributes({ size: "base" }),
        );
        this.message.textContent = label;
    }
}

class ProgressPillView extends VanillaView<{ label: string }> {
    private readonly spinner: SpinnerView;
    private readonly message = document.createElement("span");

    public constructor(props: { label: string }) {
        super(props, document.createElement("div"));
        this.root.dataset.part = "progress-pill";
        this.spinner = this.child(new SpinnerView({ size: 18 }));
    }

    protected onMount(): void {
        this.root.append(this.spinner.root, this.message);
        this.spinner.mount();
        this.updateMessage(this.props.label);
    }

    protected onUpdate(props: { label: string }): void {
        this.updateMessage(props.label);
    }

    private updateMessage(label: string): void {
        applyTextAttributes(
            this.message,
            resolveTextAttributes({ size: "base" }),
        );
        this.message.textContent = label;
    }
}

class BlockingBranchView extends VanillaView<BlockingState> {
    private readonly header = document.createElement("div");
    private readonly content = document.createElement("div");
    private readonly progressSwap = new SubtreeSwap<"progress">(this.root);
    private progressView: ProgressPillView | undefined;

    public constructor(props: BlockingState) {
        super(props, document.createElement("div"));
        this.root.dataset.part = "blocking";
        this.header.dataset.part = "header";
        this.content.dataset.part = "content";
    }

    protected onMount(): void {
        this.root.append(this.header, this.content);
        this.own(() => this.progressSwap.dispose());
        this.updateBlocking(this.props);
    }

    protected onUpdate(props: BlockingState): void {
        this.updateBlocking(props);
    }

    private updateBlocking(props: BlockingState): void {
        let created: ProgressPillView | undefined;
        this.progressSwap.set(
            props.mode === "progress" ? "progress" : null,
            () => {
                this.progressView = new ProgressPillView({ label: props.label ?? "" });
                created = this.progressView;
                return this.progressView;
            },
        );

        if (created) {
            try {
                created.mount();
            } catch (error) {
                try {
                    this.progressSwap.clear();
                } catch {
                    // Preserve the mount failure after attempting full cleanup.
                }
                this.progressView = undefined;
                throw error;
            }
        } else if (props.mode === "locked") {
            this.progressView = undefined;
        } else if (this.progressView) {
            this.progressView.update({ label: props.label ?? "" });
        }
    }
}

export class ProgressOverlayView extends VanillaView<ProgressOverlayProps> {
    private readonly modeHost = document.createElement("div");
    private readonly branchSwap = new SubtreeSwap<BranchKey>(this.modeHost);
    private notificationView: NotificationBranchView | undefined;
    private blockingView: BlockingBranchView | undefined;

    public constructor(props: ProgressOverlayProps) {
        super(props, document.createElement("div"));
        this.modeHost.dataset.part = "mode";
    }

    protected onMount(): void {
        this.root.append(this.modeHost);
        this.root.style.setProperty("--progress-header-height", `${HEADER_HEIGHT}px`);
        this.root.style.setProperty("--progress-system-buttons-width", `${SYSTEM_BUTTONS_WIDTH}px`);
        this.own(() => this.branchSwap.dispose());
        this.applyName(this.props.name);
        this.bind(progressState, projectState, (projection) => this.applyProjection(projection));
    }

    protected onUpdate(props: ProgressOverlayProps): void {
        this.applyName(props.name);
    }

    private applyProjection(projection: OverlayProjection): void {
        if (projection.mode === "empty") {
            delete this.root.dataset.mode;
            this.branchSwap.clear();
            this.notificationView = undefined;
            this.blockingView = undefined;
            return;
        }

        this.root.dataset.mode = projection.mode;

        if (projection.mode === "notification") {
            let created: NotificationBranchView | undefined;
            this.branchSwap.set("notification", () => {
                created = new NotificationBranchView({ label: projection.label ?? "" });
                this.notificationView = created;
                return created;
            });
            if (created) {
                this.mountBranch(created);
            } else {
                this.notificationView?.update({ label: projection.label ?? "" });
            }
            return;
        }

        let created: BlockingBranchView | undefined;
        this.branchSwap.set("blocking", () => {
            created = new BlockingBranchView({
                mode: projection.mode === "progress" ? "progress" : "locked",
                label: projection.label,
            });
            this.blockingView = created;
            return created;
        });
        if (created) {
            this.mountBranch(created);
        } else {
            this.blockingView?.update({
                mode: projection.mode === "progress" ? "progress" : "locked",
                label: projection.label,
            });
        }
    }

    private mountBranch(view: VanillaView<unknown>): void {
        try {
            view.mount();
        } catch (error) {
            try {
                this.branchSwap.clear();
            } catch {
                // Preserve the branch mount failure after attempting full cleanup.
            }
            throw error;
        }
    }

    private applyName(name: string | undefined): void {
        this.root.dataset.type = "progress-overlay";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
    }
}
