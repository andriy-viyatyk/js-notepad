import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { RestDetailView } from "./RestClientShared";
import type { RestClientEditor, RestClientEditorState } from "./RestClientEditor";
import type { RestRequest } from "./restClientTypes";

type RestClientBodyProps = { model: RestClientEditor };

type RestClientBodyProjection = Pick<
    RestClientEditorState,
    "data" | "error" | "selectedRequestId" | "executing" | "response" | "responseTime" | "headersJsonInvalid"
>;

function selectBodyProjection(state: RestClientEditorState): RestClientBodyProjection {
    return {
        data: state.data,
        error: state.error,
        selectedRequestId: state.selectedRequestId,
        executing: state.executing,
        response: state.response,
        responseTime: state.responseTime,
        headersJsonInvalid: state.headersJsonInvalid,
    };
}

type BodyBranch = "error" | "detail" | "empty";

class RestClientErrorView extends VanillaView<{ message: string }> {
    private readonly messageElement: HTMLSpanElement;

    public constructor(props: { message: string }) {
        const messageElement = createTextElement(props.message, {
            color: "warning",
            preWrap: true,
        });
        super(props, createPanelElement({
            direction: "column",
            flex: 1,
            align: "center",
            justify: "center",
            padding: "xxl",
        }, [messageElement]));
        this.messageElement = messageElement;
    }

    protected onUpdate(props: { message: string }): void {
        this.messageElement.textContent = props.message;
    }
}

class RestEmptyView extends VanillaView<{ hasRequests: boolean }> {
    private readonly messageElement: HTMLSpanElement;

    public constructor(props: { hasRequests: boolean }) {
        const messageElement = createTextElement("", { color: "light", italic: true, align: "center" });
        super(props, createPanelElement({
            name: "rest-client-root",
            direction: "column",
            flex: 1,
            height: 0,
            overflow: "hidden",
        }, [createPanelElement({
            name: "rest-empty",
            flex: 1,
            align: "center",
            justify: "center",
            padding: "lg",
        }, [messageElement])]));
        this.messageElement = messageElement;
    }

    protected onMount(): void {
        this.updateMessage(this.props);
    }

    protected onUpdate(props: { hasRequests: boolean }): void {
        this.updateMessage(props);
    }

    private updateMessage(props: { hasRequests: boolean }): void {
        this.messageElement.textContent = props.hasRequests
            ? "Select a request from the list."
            : "No requests yet. Click + to add one.";
    }
}

export class RestClientBodyView extends VanillaView<RestClientBodyProps> {
    private readonly branchHost = document.createElement("span");
    private readonly swap = new SubtreeSwap<BodyBranch>(this.branchHost);
    private activeBranch: VanillaView<unknown> | undefined;
    private pendingBranch: VanillaView<unknown> | undefined;

    public constructor(props: RestClientBodyProps) {
        super(props, document.createElement("span"));
        this.root.style.display = "contents";
        this.branchHost.style.display = "contents";
    }

    protected onMount(): void {
        this.root.append(this.branchHost);
        this.own(() => this.swap.dispose());
        const unsubscribe = this.editor.typedQueue.subscribe(() => undefined);
        this.own(unsubscribe);
        this.bind(this.editor.state, selectBodyProjection, this.sync);
    }

    protected onUpdate(props: RestClientBodyProps): void {
        if (props.model !== this.editor) {
            throw new Error("Rest Client view received a different model instance.");
        }
    }

    protected onDispose(): void {
        this.activeBranch = undefined;
        this.pendingBranch = undefined;
    }

    private get editor(): RestClientEditor {
        return this.props.model;
    }

    private readonly sync = (projection: RestClientBodyProjection): void => {
        const request = this.editor.selectedRequest;
        const key: BodyBranch = projection.error ? "error" : request ? "detail" : "empty";

        if (this.activeBranch && this.currentKey === key) {
            this.updateBranch(this.activeBranch, key, projection, request);
            return;
        }

        this.pendingBranch = undefined;
        this.swap.set(key, () => {
            const branch = this.createBranch(key, projection, request);
            this.pendingBranch = branch;
            return branch;
        });
        const branch = this.pendingBranch;
        this.pendingBranch = undefined;
        if (!branch) return;
        this.activeBranch = branch;
        this.currentKey = key;
        branch.mount();
    };

    private currentKey: BodyBranch | undefined;

    private updateBranch(
        branch: VanillaView<unknown>,
        key: BodyBranch,
        projection: RestClientBodyProjection,
        request: RestRequest | undefined,
    ): void {
        if (key === "error") {
            branch.update({ message: projection.error ?? "" });
        } else if (key === "detail" && request) {
            branch.update({
                vm: this.editor,
                request,
                state: projection,
            });
        } else if (key === "empty") {
            branch.update({ hasRequests: projection.data.requests.length > 0 });
        }
    }

    private createBranch(
        key: BodyBranch,
        projection: RestClientBodyProjection,
        request: RestRequest | undefined,
    ): VanillaView<unknown> {
        if (key === "error") return new RestClientErrorView({ message: projection.error ?? "" });
        if (key === "detail" && request) {
            return new RestDetailView({ vm: this.editor, request, state: projection });
        }
        return new RestEmptyView({ hasRequests: projection.data.requests.length > 0 });
    }
}
