import { boardInstallRegistry } from "../../api/board-install-registry";
import type { IPageHost } from "../../api/pages/IPageHost";
import { publishedBoards } from "../../api/published-boards";
import { fpNormalizeForCompare, isPlainLocalPath } from "../../core/utils/file-path";
import type { EditorModel, EditorStateBase } from "./EditorModel";
import { EditorToolbarView } from "./EditorToolbarView";
import { TextHostEditorModel } from "./TextHostEditorModel";
import { customEditorRegistry } from "../board/custom-editor-registry";
import { editorRegistry } from "./editorRegistry";
import { BOARD_INFO_EDITOR_ID } from "../board-info/board-info-id";
import { isTextFileModel, type TextFileEditorModelState, type TextFileModel } from "../text/TextEditorModel";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import {
    SegmentedControlView,
    type ISegment,
    type SegmentedControlViewProps,
} from "../../uikit/SegmentedControl/SegmentedControlView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { fillSlot, type SlotContent } from "../../uikit/shared/fill-slot";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/SegmentedControl/SegmentedControl.css";

export interface PageToolbarViewProps {
    name?: string;
    model: EditorModel;
    children?: SlotContent;
    rightContributions?: SlotContent;
    noSpacer?: boolean;
    borderTop?: boolean;
    borderBottom?: boolean;
}

export interface SwitchWidgetViewProps {
    model: EditorModel;
}

interface EditorSwitchProjection {
    language?: string;
    filePath?: string;
    editor?: string;
    title: string;
}

interface HostSwitchProjection {
    gitRepo: TextFileEditorModelState["gitRepo"];
    filePath?: string;
    title?: string;
}

function selectEditorSwitchProjection(state: EditorStateBase): EditorSwitchProjection {
    return {
        language: state.language,
        filePath: state.filePath,
        editor: state.editor,
        title: state.title,
    };
}

function selectHostSwitchProjection(state: TextFileEditorModelState): HostSwitchProjection {
    return {
        gitRepo: state.gitRepo,
        filePath: state.filePath,
        title: state.title,
    };
}

function selectHostFilePath(state: TextFileEditorModelState): string | undefined {
    return state.filePath;
}

function createContentsPart(part: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.part = part;
    element.style.display = "contents";
    return element;
}

class NavPanelButtonView extends VanillaView<{ model: EditorModel }> {
    private model: EditorModel;
    private page: IPageHost | null = null;
    private host: TextFileModel | null = null;
    private editorStateModel: EditorModel | null = null;
    private button: IconButtonView | undefined;
    private pageStateUnsubscribe: (() => void) | undefined;
    private hostStateUnsubscribe: (() => void) | undefined;
    private pipeStateUnsubscribe: (() => void) | undefined;
    private editorStateUnsubscribe: (() => void) | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, document.createElement("span"));
        this.model = props.model;
    }

    protected onMount(): void {
        this.root.dataset.type = "nav-panel-button";
        this.root.style.display = "contents";
        this.rebindSubscriptions();
        this.sync();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        this.model = props.model;
        this.rebindSubscriptions();
        this.sync();
    }

    protected onDispose(): void {
        this.pageStateUnsubscribe?.();
        this.pageStateUnsubscribe = undefined;
        this.hostStateUnsubscribe?.();
        this.hostStateUnsubscribe = undefined;
        this.pipeStateUnsubscribe?.();
        this.pipeStateUnsubscribe = undefined;
        this.editorStateUnsubscribe?.();
        this.editorStateUnsubscribe = undefined;
        this.page = null;
        this.host = null;
        this.editorStateModel = null;
        this.button = undefined;
    }

    private rebindSubscriptions(): void {
        const page = this.model.page;
        if (page !== this.page) {
            this.pageStateUnsubscribe?.();
            this.pageStateUnsubscribe = undefined;
            this.page = page;
            if (page) {
                this.pageStateUnsubscribe = this.ownSubscription(page.state.subscribe(
                    () => this.sync(),
                    (state) => state.version,
                ));
            }
        }

        const textHost = this.model instanceof TextHostEditorModel
            ? this.getTextHost()
            : null;
        if (textHost !== this.host) {
            this.hostStateUnsubscribe?.();
            this.hostStateUnsubscribe = undefined;
            this.pipeStateUnsubscribe?.();
            this.pipeStateUnsubscribe = undefined;
            this.host = textHost;
            if (textHost) {
                this.hostStateUnsubscribe = this.ownSubscription(textHost.state.subscribe(
                    () => this.sync(),
                    selectHostFilePath,
                ));
                this.pipeStateUnsubscribe = this.ownSubscription(textHost.pipeState.subscribe(() => this.sync()));
            }
        }

        const needsEditorState = !(this.model instanceof TextHostEditorModel)
            && this.model.getNavigatorTarget() !== null;
        if (needsEditorState && this.editorStateModel !== this.model) {
            this.editorStateUnsubscribe?.();
            this.editorStateModel = this.model;
            this.editorStateUnsubscribe = this.ownSubscription(this.model.state.subscribe(
                () => this.sync(),
                (state) => state.filePath,
            ));
        } else if (!needsEditorState && this.editorStateModel !== null) {
            this.editorStateUnsubscribe?.();
            this.editorStateUnsubscribe = undefined;
            this.editorStateModel = null;
        }
    }

    private getTextHost(): TextFileModel | null {
        const host = this.model.contentHost;
        return isTextFileModel(host) ? host : null;
    }

    private sync(): void {
        this.rebindSubscriptions();
        const page = this.model.page;
        const target = this.model.getNavigatorTarget();
        const visible = !page?.sidebarMandatory
            && target !== null
            && (target.pipe === undefined && target.filePath === undefined
                || Boolean(page?.canOpenNavigator(target.pipe, target.filePath)));

        if (!visible) {
            if (this.button) {
                this.releaseChild(this.button);
                this.button = undefined;
            }
            return;
        }

        const buttonProps: IconButtonViewProps = {
            name: "page-nav-panel",
            size: "sm",
            title: "File Explorer",
            icon: "nav-panel",
            onClick: this.handleClick,
        };
        if (!this.button) {
            this.button = this.child(new IconButtonView(buttonProps));
            this.root.append(this.button.root);
            this.button.mount();
        } else {
            this.button.update(buttonProps);
        }
    }

    private readonly handleClick = (): void => {
        const target = this.model.getNavigatorTarget();
        if (target === null) return;
        void this.model.page?.toggleNavigator(target.pipe, target.filePath);
    };
}

export class SwitchWidgetView extends VanillaView<SwitchWidgetViewProps> {
    private model: EditorModel;
    private host: TextFileModel | null = null;
    private catalogFileName: string | undefined;
    private hostStateUnsubscribe: (() => void) | undefined;
    private catalogUnsubscribe: (() => void) | undefined;
    private segmented: SegmentedControlView | undefined;

    public constructor(props: SwitchWidgetViewProps) {
        super(props, document.createElement("span"));
        this.model = props.model;
    }

    protected onMount(): void {
        this.root.dataset.type = "switch-widget";
        this.root.style.display = "contents";
        this.own(customEditorRegistry.state.subscribe(() => this.syncSegments()));
        this.own(boardInstallRegistry.subscribeInstalled(() => this.syncSegments()));
        this.bind(this.model.state, selectEditorSwitchProjection, () => this.syncSegments());
    }

    protected onUpdate(props: SwitchWidgetViewProps): void {
        this.model = props.model;
        this.syncSegments();
    }

    protected onDispose(): void {
        this.hostStateUnsubscribe?.();
        this.hostStateUnsubscribe = undefined;
        this.catalogUnsubscribe?.();
        this.catalogUnsubscribe = undefined;
        this.host = null;
        this.catalogFileName = undefined;
        this.segmented = undefined;
    }

    private getTextHost(): TextFileModel | null {
        const host = this.model.contentHost;
        return isTextFileModel(host) ? host : null;
    }

    private ensureHostSubscription(): void {
        const host = this.getTextHost();
        if (host === this.host) return;

        this.hostStateUnsubscribe?.();
        this.hostStateUnsubscribe = undefined;
        this.host = host;
        if (host) {
            this.hostStateUnsubscribe = this.ownSubscription(host.state.subscribe(
                () => this.syncSegments(),
                selectHostSwitchProjection,
            ));
        }
    }

    private ensureCatalogSubscription(fileName: string): void {
        if (fileName === this.catalogFileName) return;

        this.catalogUnsubscribe?.();
        this.catalogFileName = fileName;
        this.catalogUnsubscribe = this.ownSubscription(publishedBoards.subscribeCatalogBoardsForFile(
            fileName,
            () => this.syncSegments(),
        ));
    }

    private syncSegments(): void {
        this.ensureHostSubscription();
        const editorState = selectEditorSwitchProjection(this.model.state.get());
        const hostState = this.host
            ? selectHostSwitchProjection(this.host.state.get())
            : { gitRepo: undefined, filePath: undefined, title: undefined };
        const filePath = hostState.filePath ?? this.model.filePath;
        const local = Boolean(filePath) && isPlainLocalPath(filePath);
        const fileName = filePath ?? hostState.title ?? editorState.title ?? "";
        this.ensureCatalogSubscription(fileName);

        const options = this.model.findCompatibleEditors();
        const boardMatchesAll = customEditorRegistry.getBoardsForFile(fileName);
        const boardMatches = local
            ? boardMatchesAll
            : boardMatchesAll.filter((board) => board.editorKind === "content-host");
        const catalogAll = publishedBoards.catalogBoardsForFile(fileName);
        const installed = boardInstallRegistry.listInstalled();
        const trustedRoots = new Set(
            boardMatches.map((board) => fpNormalizeForCompare(board.boardRoot)),
        );
        const catalogMatches = catalogAll.filter((catalogBoard) => {
            if (!local && catalogBoard.editorKind !== "content-host") return false;
            const installedEntry = installed.find((entry) => entry.id === catalogBoard.id);
            if (
                installedEntry
                && trustedRoots.has(fpNormalizeForCompare(installedEntry.root))
            ) return false;
            return true;
        });

        const merged = [...options];
        for (const board of boardMatches) {
            if (!merged.includes(board.editorId)) merged.push(board.editorId);
        }
        if (catalogMatches.length > 0 && !merged.includes(BOARD_INFO_EDITOR_ID)) {
            merged.push(BOARD_INFO_EDITOR_ID);
        }
        const plusIndex = merged.indexOf(BOARD_INFO_EDITOR_ID);
        if (plusIndex !== -1 && plusIndex !== merged.length - 1) {
            merged.splice(plusIndex, 1);
            merged.push(BOARD_INFO_EDITOR_ID);
        }
        if (merged.length < 2 || !merged.includes(this.model.editorId)) {
            this.removeSegmented();
            return;
        }

        const boardNameById = new Map(boardMatches.map((board) => [board.editorId, board.name]));
        const items: ISegment[] = merged.map((id) => ({
            value: id,
            label: id === BOARD_INFO_EDITOR_ID
                ? "Â Â +Â Â "
                : boardNameById.get(id) ?? editorRegistry.getById(id)?.name ?? id,
            title: id === BOARD_INFO_EDITOR_ID
                ? "Install an editor for this file typeâ€¦"
                : undefined,
        }));
        const props: SegmentedControlViewProps = {
            name: "page-editor-switch",
            items,
            value: this.model.editorId,
            onChange: this.onSwitch,
            size: "sm",
        };
        if (!this.segmented) {
            this.segmented = this.child(new SegmentedControlView(props));
            this.root.append(this.segmented.root);
            this.segmented.mount();
        } else {
            this.segmented.update(props);
        }
    }

    private removeSegmented(): void {
        if (!this.segmented) return;
        this.releaseChild(this.segmented);
        this.segmented = undefined;
    }

    private readonly onSwitch = (newEditorId: string): void => {
        void this.model.page?.switchMainEditor(newEditorId);
    };
}

export class PageToolbarView extends VanillaView<PageToolbarViewProps> {
    private readonly toolbar: EditorToolbarView;
    private content: HTMLSpanElement | undefined;
    private childrenHost: HTMLSpanElement | undefined;
    private rightHost: HTMLSpanElement | undefined;
    private childrenCleanup: (() => void) | undefined;
    private rightCleanup: (() => void) | undefined;
    private navPanel: NavPanelButtonView | undefined;
    private spacer: SpacerView | undefined;
    private switchWidget: SwitchWidgetView | undefined;

    public constructor(props: PageToolbarViewProps) {
        const toolbar = new EditorToolbarView(toolbarProps(props));
        super(props, toolbar.root);
        this.toolbar = toolbar;
    }

    protected onMount(): void {
        this.child(this.toolbar);
        this.toolbar.mount();

        const content = createContentsPart("page-toolbar-content");
        const childrenHost = createContentsPart("page-toolbar-children");
        const rightHost = createContentsPart("page-toolbar-right");
        this.content = content;
        this.childrenHost = childrenHost;
        this.rightHost = rightHost;

        this.toolbar.update({ ...toolbarProps(this.props), children: content });
        this.childrenCleanup = fillSlot(childrenHost, this.props.children);
        this.rightCleanup = fillSlot(rightHost, this.props.rightContributions);

        const navPanel = this.child(new NavPanelButtonView({ model: this.props.model }));
        const switchWidget = this.child(new SwitchWidgetView({ model: this.props.model }));
        this.navPanel = navPanel;
        this.switchWidget = switchWidget;

        content.append(navPanel.root, childrenHost);
        if (!this.props.noSpacer) {
            this.spacer = this.child(new SpacerView({}));
            content.append(this.spacer.root);
        }
        content.append(rightHost, switchWidget.root);

        navPanel.mount();
        this.spacer?.mount();
        switchWidget.mount();

        this.own(() => {
            this.childrenCleanup?.();
            this.childrenCleanup = undefined;
            this.rightCleanup?.();
            this.rightCleanup = undefined;
        });
    }

    protected onUpdate(props: PageToolbarViewProps): void {
        this.toolbar.update({ ...toolbarProps(props), children: this.content });
        if (this.childrenHost) {
            this.childrenCleanup = fillSlot(this.childrenHost, props.children);
        }
        if (this.rightHost) {
            this.rightCleanup = fillSlot(this.rightHost, props.rightContributions);
        }
        this.navPanel?.update({ model: props.model });
        this.updateSpacer(props.noSpacer);
        this.switchWidget?.update({ model: props.model });
    }

    protected onDispose(): void {
        this.content = undefined;
        this.childrenHost = undefined;
        this.rightHost = undefined;
        this.navPanel = undefined;
        this.spacer = undefined;
        this.switchWidget = undefined;
    }

    private updateSpacer(noSpacer: boolean | undefined): void {
        if (noSpacer) {
            if (this.spacer) {
                this.releaseChild(this.spacer);
                this.spacer = undefined;
            }
            return;
        }
        if (this.spacer || !this.content || !this.rightHost) return;
        const spacer = this.child(new SpacerView({}));
        this.spacer = spacer;
        this.content.insertBefore(spacer.root, this.rightHost);
        spacer.mount();
    }
}

function toolbarProps(props: PageToolbarViewProps): ConstructorParameters<typeof EditorToolbarView>[0] {
    return {
        name: props.name,
        borderTop: props.borderTop,
        borderBottom: props.borderBottom,
    };
}
