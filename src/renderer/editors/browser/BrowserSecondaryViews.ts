import { SecondaryViewsView } from "../../ui/secondary-views/SecondaryViewsView";
import type { EditorModel } from "../base/EditorModel";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { BrowserPanelHost } from "./BrowserPanelHost";
import { sameItems } from "../../core/utils/utils";

/** Native bridge used by both browser bookmark surfaces. */
export class BrowserSecondaryViewsView extends VanillaView<{ host: BrowserPanelHost }> {
    private host: BrowserPanelHost;
    private nav: ReturnType<BrowserPanelHost["ensureSecondaryViewsModel"]>;
    private readonly secondary: SecondaryViewsView;
    private hostSubscription: (() => void) | undefined;
    private lastViews: EditorModel[];

    public constructor(props: { host: BrowserPanelHost }) {
        super(props, document.createElement("span"));
        this.root.style.display = "contents";
        this.host = props.host;
        this.nav = props.host.ensureSecondaryViewsModel();
        this.lastViews = this.host.panelEditors;
        this.secondary = this.child(new SecondaryViewsView(this.childProps()));
    }

    protected onMount(): void {
        this.root.append(this.secondary.root);
        this.secondary.mount();
        this.subscribe();
        this.sync();
    }

    protected onUpdate(props: { host: BrowserPanelHost }): void {
        const hostChanged = props.host !== this.host;
        if (hostChanged) {
            this.unsubscribe();
            this.host = props.host;
            this.nav = props.host.ensureSecondaryViewsModel();
            this.subscribe();
        }
        const views = this.host.panelEditors;
        if (hostChanged || !sameItems(this.lastViews, views)) {
            this.secondary.update(this.childProps(views));
        }
        this.lastViews = views;
    }

    protected onDispose(): void { this.unsubscribe(); }

    private childProps(views = this.host.panelEditors) {
        return {
            views,
            nav: this.nav,
            onActivatePanel: this.activatePanel,
            onResizeWidth: this.resizeWidth,
        };
    }

    private readonly activatePanel = (panelId: string): void => {
        this.host.setSecondaryViewsState({ activePanel: panelId });
    };

    private readonly resizeWidth = (width: number): void => {
        this.host.setSecondaryViewsState({ width });
    };

    private subscribe(): void {
        this.hostSubscription = this.ownSubscription(
            this.host.state.subscribe(() => this.sync(), (state) => state.version),
        );
    }
    private unsubscribe(): void { this.hostSubscription?.(); this.hostSubscription = undefined; }
    private readonly sync = (): void => {
        const views = this.host.panelEditors;
        if (!sameItems(this.lastViews, views)) this.secondary.update(this.childProps(views));
        this.lastViews = views;
    };
}
