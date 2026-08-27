import { errMessage } from "../../../shared/utils";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "./EditorErrorBoundary.css";

interface NativeEditorErrorViewProps {
    error: unknown;
}

export class NativeEditorErrorView extends VanillaView<NativeEditorErrorViewProps> {
    private titleElement: HTMLDivElement | undefined;
    private messageElement: HTMLDivElement | undefined;
    private stackElement: HTMLDivElement | undefined;

    public constructor(props: NativeEditorErrorViewProps) {
        const root = document.createElement("div");
        root.dataset.type = "native-editor-error";
        root.className = "editor-error-root";
        super(props, root);
    }

    protected onMount(): void {
        const titleElement = document.createElement("div");
        titleElement.className = "error-title";
        titleElement.dataset.part = "title";
        titleElement.textContent = "Editor crashed";

        const messageElement = document.createElement("div");
        messageElement.className = "error-message";
        messageElement.dataset.part = "message";
        messageElement.textContent = errMessage(this.props.error);

        this.root.append(titleElement, messageElement);
        this.titleElement = titleElement;
        this.messageElement = messageElement;

        const stack = this.getStack(this.props.error);
        if (!stack) return;

        const stackElement = document.createElement("div");
        stackElement.className = "error-stack";
        stackElement.dataset.part = "stack";
        stackElement.textContent = stack;
        this.root.append(stackElement);
        this.stackElement = stackElement;
    }

    protected onDispose(): void {
        this.titleElement = undefined;
        this.messageElement = undefined;
        this.stackElement = undefined;
    }

    private getStack(error: unknown): string | undefined {
        if (typeof error !== "object" || error === null || !("stack" in error)) {
            return undefined;
        }

        const stack = error.stack;
        return typeof stack === "string" && stack.trim() ? stack : undefined;
    }
}
