import universalColors from "../../theme/universal-colors";
import { TraitSet } from "../../core/traits/traits";
import { TREE_ITEM_KEY } from "../../uikit/Tree/types";
import { applyPanelAttributes, createPanelElement, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import type { TextareaProps } from "../../uikit/Textarea/TextareaView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import type { SplitterProps } from "../../uikit/Splitter/SplitterView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import { createDepsGate, type DepsGate } from "../../uikit/shared/deps-gate";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { openMenu, type MenuHandle } from "../../uikit/Menu/attach-menu";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { Cleanup } from "../../core/utils/DisposableStore";
import type { RestClientSource, RestClientViewState, RestRequest } from "./restClientTypes";
import { RequestBuilderView } from "./RequestBuilderView";
import { ResponseViewerView } from "./ResponseViewerView";
import { app } from "../../api/app";
import type { MenuItem } from "../../uikit/Menu/types";

export interface RequestTreeItem {
    id: string;
    items?: RequestTreeItem[];
    request?: RestRequest;
    isRoot?: boolean;
    isCollection?: boolean;
    collectionName?: string;
}

export const EMPTY_LABEL = "(empty)";

export const requestTreeItemTraits = new TraitSet().add(TREE_ITEM_KEY, {
    value: (item: unknown) => (item as RequestTreeItem).id,
    label: (item: unknown) => {
        const requestTreeItem = item as RequestTreeItem;
        if (requestTreeItem.isRoot) return "";
        if (requestTreeItem.isCollection) return requestTreeItem.collectionName ?? "";
        return requestTreeItem.request?.name ?? "";
    },
});

export const getRequestTreeChildren = (item: RequestTreeItem) => item.items;

export function buildGroupedTree(requests: RestRequest[]): RequestTreeItem[] {
    const collectionOrder: string[] = [];
    const groups = new Map<string, RequestTreeItem[]>();
    for (const request of requests) {
        const collection = request.collection || "";
        if (!groups.has(collection)) {
            collectionOrder.push(collection);
            groups.set(collection, []);
        }
        groups.get(collection)?.push({ id: request.id, request });
    }
    return collectionOrder.map((collection) => ({
        id: `__col__${collection}`,
        isCollection: true,
        collectionName: collection,
        items: groups.get(collection),
    }));
}

export function getStatusColor(status: number): string {
    if (status === 0) return universalColors.http.serverError;
    if (status < 300) return universalColors.http.success;
    if (status < 400) return universalColors.http.redirect;
    if (status < 500) return universalColors.http.clientError;
    return universalColors.http.serverError;
}

export interface RestDetailProps {
    vm: RestClientSource;
    request: RestRequest;
    state: RestClientViewState;
}

/** Native replacement for the former local SplitDetailPanel. */
export class RestDetailView extends VanillaView<RestDetailProps> {
    private readonly requestPane: HTMLDivElement;
    private readonly responsePane: HTMLDivElement;
    private readonly requestHeader: HTMLDivElement;
    private readonly responseHeader: HTMLDivElement;
    private readonly responseMetaHost = document.createElement("span");
    private readonly responseMetaSwap = new SubtreeSwap<"none" | "response">(this.responseMetaHost);
    private readonly resultMeasureGate: DepsGate = createDepsGate();
    private resultHeight: number | null = null;
    private measureFrame: Cleanup | undefined;
    private collection: TextareaView | undefined;
    private name: TextareaView | undefined;
    private copyButton: IconButtonView | undefined;
    private deleteButton: IconButtonView | undefined;
    private requestSpacer: SpacerView | undefined;
    private responseSpacer: SpacerView | undefined;
    private requestBuilder: RequestBuilderView | undefined;
    private responseViewer: ResponseViewerView | undefined;
    private splitter: SplitterView | undefined;
    private copyMenu: MenuHandle | undefined;
    private pendingMeta: VanillaView<unknown> | undefined;
    private metaBranch: VanillaView<unknown> | undefined;

    public constructor(props: RestDetailProps) {
        super(props, createPanelElement({
            name: "rest-detail",
            direction: "column",
            flex: 1,
            height: 0,
            overflow: "hidden",
        }));
        this.responseMetaHost.style.display = "contents";
        this.requestPane = createPanelElement({
            name: "request-pane",
            direction: "column",
            overflow: "hidden",
            minHeight: 0,
            flex: "7 1 0",
        });
        this.responsePane = createPanelElement({
            name: "response-pane",
            direction: "column",
            overflow: "hidden",
            minHeight: 0,
            flex: "3 1 0",
        });
        this.requestHeader = createPanelElement({
            name: "request-pane-header",
            direction: "row",
            align: "center",
            gap: "xs",
            paddingX: "md",
            paddingY: "xs",
            background: "dark",
            shrink: false,
        });
        this.responseHeader = createPanelElement({
            name: "response-pane-header",
            direction: "row",
            align: "center",
            gap: "sm",
            paddingX: "md",
            paddingY: "xs",
            background: "dark",
            shrink: false,
        });
    }

    protected onMount(): void {
        this.own(() => {
            this.measureFrame?.();
            this.measureFrame = undefined;
        });
        this.own(() => this.responseMetaSwap.dispose());

        const collection = this.child(new TextareaView(this.collectionProps()));
        const name = this.child(new TextareaView(this.nameProps()));
        const copyButton = this.child(new IconButtonView(this.copyProps()));
        const deleteButton = this.child(new IconButtonView(this.deleteProps()));
        const requestSpacer = this.child(new SpacerView({}));
        const responseSpacer = this.child(new SpacerView({}));
        const requestBuilder = this.child(new RequestBuilderView({
            vm: this.props.vm,
            request: this.props.request,
            state: this.props.state,
        }));
        const responseViewer = this.child(new ResponseViewerView({
            response: this.props.state.response,
            responseTime: this.props.state.responseTime,
            executing: this.props.state.executing,
        }));
        const splitter = this.child(new SplitterView(this.splitterProps()));
        this.collection = collection;
        this.name = name;
        this.copyButton = copyButton;
        this.deleteButton = deleteButton;
        this.requestSpacer = requestSpacer;
        this.responseSpacer = responseSpacer;
        this.requestBuilder = requestBuilder;
        this.responseViewer = responseViewer;
        this.splitter = splitter;

        const requestBody = createPanelElement({
            name: "request-pane-body",
            direction: "column",
            flex: "1 1 0",
            overflow: "auto",
            minHeight: 0,
        }, [requestBuilder.root]);
        this.requestPane.append(this.requestHeader, requestBody);
        this.requestHeader.append(
            collection.root,
            createTextElement("/", { color: "light", size: "sm" }),
            name.root,
            requestSpacer.root,
            copyButton.root,
            deleteButton.root,
        );

        const responseBody = createPanelElement({
            name: "response-pane-body",
            direction: "column",
            flex: "1 1 0",
            overflow: "hidden",
            minHeight: 0,
        }, [responseViewer.root]);
        this.responsePane.append(this.responseHeader, responseBody);
        this.responseHeader.append(
            createTextElement("Response", { size: "xs", variant: "uppercased", color: "light", bold: true }),
            responseSpacer.root,
            this.responseMetaHost,
        );
        const detailChildren = [this.requestPane, splitter.root, this.responsePane];
        this.root.append(...detailChildren);
        this.listen(this.requestHeader, "dblclick", this.handleTopHeaderDblClick);
        this.listen(this.responseHeader, "dblclick", this.handleBottomHeaderDblClick);
        collection.mount();
        name.mount();
        copyButton.mount();
        deleteButton.mount();
        requestSpacer.mount();
        responseSpacer.mount();
        requestBuilder.mount();
        responseViewer.mount();
        splitter.mount();
        this.syncMeta();
        if (this.resultMeasureGate.changed([this.resultHeight])) this.syncLayout();
    }

    protected onUpdate(props: RestDetailProps): void {
        this.collection?.update(this.collectionProps(props));
        this.name?.update(this.nameProps(props));
        this.requestBuilder?.update({ vm: props.vm, request: props.request, state: props.state });
        this.responseViewer?.update({
            response: props.state.response,
            responseTime: props.state.responseTime,
            executing: props.state.executing,
        });
        this.splitter?.update(this.splitterProps(props));
        this.syncMeta(props);
        if (this.copyMenu) this.copyMenu.update({ items: this.copyMenuItems(props.request), onClose: this.clearCopyMenu });
        if (this.resultMeasureGate.changed([this.resultHeight])) this.syncLayout();
    }

    protected onDispose(): void {
        this.copyMenu?.dispose();
        this.copyMenu = undefined;
        this.metaBranch = undefined;
        this.pendingMeta = undefined;
    }

    private syncLayout(): void {
        if (this.resultHeight === null) {
            this.scheduleMeasurement();
            return;
        }
        applyPanelAttributes(this.requestPane, resolvePanelAttributes({
            name: "request-pane", direction: "column", overflow: "hidden", minHeight: 0,
            flex: "1 1 auto",
        }));
        applyPanelAttributes(this.responsePane, resolvePanelAttributes({
            name: "response-pane", direction: "column", overflow: "hidden", minHeight: 0,
            flex: "0 0 auto", height: this.resultHeight, shrink: false,
        }));
        this.splitter?.update(this.splitterProps());
    }

    private scheduleMeasurement(): void {
        this.measureFrame?.();
        this.measureFrame = this.schedule.raf(() => {
            this.measureFrame = undefined;
            if (!this.root.isConnected || this.responsePane.offsetHeight <= 0) {
                this.scheduleMeasurement();
                return;
            }
            this.resultHeight = this.responsePane.offsetHeight;
            this.syncLayout();
            this.resultMeasureGate.prime([this.resultHeight]);
        });
    }

    private getClampedHeight(value: number): number {
        const total = this.root.clientHeight;
        if (!total) return value;
        return Math.max(total * 0.1, Math.min(total * 0.9, value));
    }

    private readonly handleResultHeightChange = (value: number): void => {
        this.resultHeight = this.getClampedHeight(value);
        this.resultMeasureGate.prime([this.resultHeight]);
        this.syncLayout();
    };

    private readonly togglePanelHeight = (expandedRatio: number): void => {
        const total = this.root.clientHeight;
        if (!total) return;
        const expanded = total * expandedRatio;
        const collapsed = total * (1 - expandedRatio);
        const current = this.resultHeight ?? total * 0.3;
        this.handleResultHeightChange(Math.abs(current - expanded) < total * 0.05 ? collapsed : expanded);
    };

    private readonly handleTopHeaderDblClick = (): void => this.togglePanelHeight(0.3);
    private readonly handleBottomHeaderDblClick = (): void => this.togglePanelHeight(0.7);

    private splitterProps(props: RestDetailProps = this.props): SplitterProps {
        void props;
        return {
            name: "rest-detail-splitter",
            orientation: "horizontal",
            value: this.resultHeight ?? this.root.clientHeight * 0.3,
            onChange: this.handleResultHeightChange,
            side: "after",
            border: "before",
        };
    }

    private collectionProps(props: RestDetailProps = this.props): TextareaProps {
        return {
            name: "request-header-collection", variant: "ghost", singleLine: true,
            value: props.request.collection, onChange: (value) => props.vm.updateRequestCollection(props.request.id, value),
            placeholder: "Collection", size: "sm", maxWidth: "40%", minHeight: 20,
        };
    }

    private nameProps(props: RestDetailProps = this.props): TextareaProps {
        return {
            name: "request-header-name", variant: "ghost", singleLine: true,
            value: props.request.name, onChange: (value) => props.vm.renameRequest(props.request.id, value),
            placeholder: "Request name", flex: 1, minWidth: 50, minHeight: 20,
        };
    }

    private copyProps(): IconButtonProps {
        return { name: "request-copy-as", size: "sm", icon: "copy", title: "Copy request as...", onClick: this.openCopyMenu };
    }

    private deleteProps(): IconButtonProps {
        return {
            name: "request-delete", size: "sm", icon: "delete", title: "Delete request",
            onClick: async () => {
                const result = await app.ui.confirm(`Delete \"${this.props.request.name || EMPTY_LABEL}\"?`);
                if (result) this.props.vm.deleteRequest(this.props.request.id);
            },
        };
    }

    private readonly clearCopyMenu = (): void => { this.copyMenu = undefined; };

    private readonly openCopyMenu = (): void => {
        this.copyMenu?.dispose();
        this.copyMenu = openMenu(this.copyButton?.root ?? this.root, {
            items: this.copyMenuItems(this.props.request),
            onClose: this.clearCopyMenu,
        });
    };

    private copyMenuItems(request: RestRequest): MenuItem[] {
        return [
            ["Copy as cURL (bash)", "serializeAsCurlBash"],
            ["Copy as cURL (cmd)", "serializeAsCurlCmd"],
            ["Copy as fetch", "serializeAsFetch"],
            ["Copy as fetch (Node.js)", "serializeAsFetchNodeJs"],
        ].map(([label, method]) => ({
            label,
            onClick: async () => {
                const serializers = await import("./serializeRequest");
                await navigator.clipboard.writeText(serializers[method as keyof typeof serializers](request) as string);
            },
        }));
    }

    private syncMeta(props: RestDetailProps = this.props): void {
        const response = props.state.response;
        const key = response ? "response" : "none";
        if (this.metaBranch && this.metaKey === key) {
            if (response) this.metaBranch.update({ response, responseTime: props.state.responseTime });
            return;
        }
        this.pendingMeta = undefined;
        this.responseMetaSwap.set(key, () => {
            const branch = response
                ? new ResponseMetaView({ response, responseTime: props.state.responseTime })
                : new EmptyMetaView();
            this.pendingMeta = branch;
            return branch;
        });
        const branch = this.pendingMeta;
        this.pendingMeta = undefined;
        if (!branch) return;
        this.metaBranch = branch;
        this.metaKey = key;
        branch.mount();
    }

    private metaKey: "none" | "response" | undefined;
}

class EmptyMetaView extends VanillaView<Record<string, never>> {
    public constructor() {
        const root = document.createElement("span");
        root.style.display = "contents";
        super({}, root);
    }
}

class ResponseMetaView extends VanillaView<{ response: NonNullable<RestClientViewState["response"]>; responseTime: number }> {
    private readonly status: HTMLSpanElement;
    private readonly time: HTMLSpanElement;
    private readonly size: HTMLSpanElement;

    public constructor(props: { response: NonNullable<RestClientViewState["response"]>; responseTime: number }) {
        const status = createTextElement("", { size: "sm", bold: true });
        const time = createTextElement("", { size: "xs", color: "light" });
        const size = createTextElement("", { size: "xs", color: "light" });
        const root = document.createElement("span");
        root.style.display = "contents";
        root.append(status, time, size);
        super(props, root);
        this.status = status;
        this.time = time;
        this.size = size;
    }

    protected onMount(): void { this.sync(this.props); }
    protected onUpdate(props: { response: NonNullable<RestClientViewState["response"]>; responseTime: number }): void { this.sync(props); }

    private sync(props: { response: NonNullable<RestClientViewState["response"]>; responseTime: number }): void {
        const response = props.response;
        this.status.textContent = response.status === 0 ? "Error" : `${response.status} ${response.statusText}`;
        this.status.style.color = getStatusColor(response.status);
        this.time.textContent = `${props.responseTime}ms`;
        this.size.textContent = getResponseSize(response);
    }
}

function getResponseSize(response: RestClientViewState["response"]): string {
    if (!response) return "";
    const bytes = new Blob([response.body]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
