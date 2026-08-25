import React from "react";
import { boardTrust } from "../../api/board-trust";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { mountReactHandle, type MountedReactRoot } from "../../uikit/shared/mount";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../ui/secondary-views/SideBarPanelHeaderView";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { parseBoardSecondaryPanelId } from "./board-secondary";
import { BoardWebview } from "./BoardWebview";
import { BoardEditorModel } from "./BoardEditorModel";

export default class BoardSecondaryView extends VanillaView<SecondaryViewProps> {
    private boardModel: BoardEditorModel | undefined;
    private header: SideBarPanelHeaderHandle | undefined;
    private contentHost: HTMLDivElement | undefined;
    private boardReact: MountedReactRoot | undefined;
    private frameIdentity: string | undefined;
    private viewId: string | null | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "board-secondary-view",
            direction: "column",
            flex: true,
            width: "100%",
            height: 0,
            background: "default",
        }));
    }

    protected onMount(): void {
        const boardModel = this.getBoardModel(this.props);
        if (!boardModel) return;

        this.boardModel = boardModel;
        this.viewId = parseBoardSecondaryPanelId(this.props.panelId);
        this.contentHost = createPanelElement({
            name: "board-secondary-content",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        });
        this.root.append(this.contentHost);
        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "View",
        });

        this.bind(
            boardModel.state,
            (state) => ({
                boardRoot: state.boardRoot,
                selectedBoard: state.selectedBoard,
                reloadToken: state.reloadToken,
                secondaryViewDefs: state.secondaryViewDefs,
            }),
            () => this.renderState(),
        );
        const unsubscribeTrust = boardTrust.subscribePaths(this.renderState);
        this.own(unsubscribeTrust);
        this.own(() => this.disposeBoardReact());
        this.own(() => this.header?.dispose());
        this.renderState();
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const nextViewId = parseBoardSecondaryPanelId(props.panelId);
        if (nextViewId !== this.viewId) {
            this.disposeBoardReact();
            this.frameIdentity = undefined;
            this.viewId = nextViewId;
        }

        const nextModel = this.getBoardModel(props);
        if (nextModel && nextModel !== this.boardModel) {
            this.boardModel = nextModel;
            this.disposeBoardReact();
            this.frameIdentity = undefined;
        }
        this.renderState();
    }

    protected onDispose(): void {
        this.disposeBoardReact();
        this.contentHost?.remove();
        this.contentHost = undefined;
        this.header = undefined;
        this.boardModel = undefined;
        this.viewId = undefined;
    }

    private getBoardModel(props: SecondaryViewProps): BoardEditorModel | undefined {
        return props.model instanceof BoardEditorModel ? props.model : undefined;
    }

    private readonly renderState = (): void => {
        const model = this.boardModel;
        const host = this.contentHost;
        if (!model || !host) return;

        const state = model.state.get();
        const viewId = this.viewId;
        const declaration = state.secondaryViewDefs?.find((view) => view.id === viewId);
        const selectedRoot = state.selectedBoard ? state.boardRoot : undefined;
        const trusted = boardTrust.isTrusted(selectedRoot ?? "");
        this.header?.update({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: declaration?.title ?? viewId ?? "View",
        });

        if (!selectedRoot || !declaration || !trusted) {
            this.disposeBoardReact();
            host.replaceChildren(this.placeholder(
                !selectedRoot
                    ? "Board not available"
                    : !trusted
                      ? "Trust the board to view this panel"
                      : "View not found",
            ));
            return;
        }

        const frameIdentity = `${viewId}__${state.reloadToken}`;
        const element = React.createElement(BoardWebview, {
            model,
            boardRoot: selectedRoot,
            entry: declaration.html ?? "index.html",
            view: declaration.id,
            isMain: false,
        });
        if (!this.boardReact || this.frameIdentity !== frameIdentity) {
            this.disposeBoardReact();
            host.replaceChildren();
            this.boardReact = mountReactHandle(host, element);
            this.frameIdentity = frameIdentity;
        } else {
            this.boardReact.render(element);
        }
    };

    private placeholder(message: string): HTMLDivElement {
        return createPanelElement(
            { flex: true, align: "center", justify: "center", padding: "lg" },
            [createTextElement(message, { color: "light", align: "center", size: "sm" })],
        );
    }

    private disposeBoardReact(): void {
        this.boardReact?.dispose();
        this.boardReact = undefined;
        this.frameIdentity = undefined;
    }
}
