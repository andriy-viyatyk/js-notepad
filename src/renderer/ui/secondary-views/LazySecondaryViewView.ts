import { errMessage } from "../../../shared/utils";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { guard } from "../../core/utils/guard";
import { type VanillaViewCtor } from "../../uikit/shared/mount";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import {
    secondaryViewRegistry,
    type SecondaryViewProps,
} from "./secondary-view-registry";

/** Native asynchronous loader for secondary-view definitions on the vanilla arm. */
export class LazySecondaryViewView extends VanillaView<SecondaryViewProps> {
    private currentPanelId: string;
    private panelCtor: VanillaViewCtor<SecondaryViewProps> | undefined;
    private panelView: VanillaView<SecondaryViewProps> | undefined;
    private loadGeneration = 0;
    private live = true;

    public constructor(props: SecondaryViewProps) {
        super(
            props,
            createPanelElement({
                name: "secondary-view-host",
                direction: "column",
                flex: true,
                minHeight: 0,
                overflow: "hidden",
            }),
        );
        this.currentPanelId = props.panelId;
    }

    protected onMount(): void {
        this.startLoad();
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const panelIdentityChanged = this.currentPanelId !== props.panelId;
        this.currentPanelId = props.panelId;
        if (panelIdentityChanged) {
            this.cancelLoad();
            this.retirePanel();
            this.root.replaceChildren();
            this.startLoad();
            return;
        }

        if (this.panelView && this.panelCtor) this.panelView.update(props);
    }

    protected onDispose(): void {
        this.live = false;
        this.cancelLoad();
        this.retirePanel();
        this.root.replaceChildren();
    }

    private startLoad(): void {
        const generation = ++this.loadGeneration;
        const panelId = this.props.panelId;
        const definition = secondaryViewRegistry.get(panelId);
        if (!definition) {
            this.showError(`Unknown secondary view: "${panelId}"`);
            return;
        }
        void definition.loadComponent().then((module) => {
            if (!this.live || generation !== this.loadGeneration || this.props.panelId !== panelId) return;
            this.mountPanel(module.default, this.props);
        }).catch((error: unknown) => {
            if (!this.live || generation !== this.loadGeneration || this.props.panelId !== panelId) return;
            this.showError(errMessage(error, `Failed to load "${panelId}".`));
        });
    }

    private mountPanel(
        ctor: VanillaViewCtor<SecondaryViewProps>,
        props: SecondaryViewProps,
    ): void {
        this.retirePanel();
        this.root.replaceChildren();

        let view: VanillaView<SecondaryViewProps> | undefined;
        try {
            view = new ctor(props);
            this.panelCtor = ctor;
            this.panelView = view;
            this.root.append(view.root);
            view.mount();
        } catch (error: unknown) {
            this.panelCtor = undefined;
            this.panelView = undefined;
            if (view) {
                view.root.remove();
                void guard("Failed to dispose secondary view", () => view?.dispose());
            }
            this.showError(errMessage(error, `Failed to load "${props.panelId}".`));
        }
    }

    private cancelLoad(): void {
        this.loadGeneration++;
    }

    private retirePanel(): void {
        const view = this.panelView;
        this.panelView = undefined;
        this.panelCtor = undefined;
        if (!view) return;

        void guard("Failed to dispose secondary view", () => {
            try {
                view.dispose();
            } finally {
                view.root.remove();
            }
        });
    }

    private showError(message: string): void {
        this.root.replaceChildren(createPanelElement(
            { name: "secondary-view-error", padding: "md" },
            [createTextElement(message, { color: "light", preWrap: true })],
        ));
    }
}
