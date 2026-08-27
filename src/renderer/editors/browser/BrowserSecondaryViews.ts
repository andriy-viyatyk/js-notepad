import { SecondaryViewsView } from "../../ui/secondary-views/SecondaryViewsView";
import type { ISecondaryViewsState } from "../../ui/secondary-views/SecondaryViewsModel";
import type { EditorModel } from "../base/EditorModel";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { BrowserPanelHost } from "./BrowserPanelHost";

/** Native controlled bridge used by both browser bookmark surfaces. */
export class BrowserSecondaryViewsView extends VanillaView<{ host: BrowserPanelHost }> {
    private host: BrowserPanelHost;
    private nav: ReturnType<BrowserPanelHost["ensureSecondaryViewsModel"]>;
    private readonly secondary: SecondaryViewsView;
    private navSubscription: (() => void) | undefined;
    private hostSubscription: (() => void) | undefined;

    public constructor(props: { host: BrowserPanelHost }) {
        super(props, document.createElement("span"));
        this.root.style.display = "contents";
        this.host = props.host;
        this.nav = props.host.ensureSecondaryViewsModel();
        this.secondary = this.child(new SecondaryViewsView(this.childProps()));
    }

    protected onMount(): void {
        this.root.append(this.secondary.root);
        this.secondary.mount();
        this.subscribe();
        this.sync();
    }

    protected onUpdate(props: { host: BrowserPanelHost }): void {
        if (props.host !== this.host) {
            this.unsubscribe();
            this.host = props.host;
            this.nav = props.host.ensureSecondaryViewsModel();
            this.subscribe();
        }
        this.secondary.update(this.childProps());
    }

    protected onDispose(): void { this.unsubscribe(); }

    private childProps(): { views: EditorModel[]; state: ISecondaryViewsState; setState: (patch: Partial<ISecondaryViewsState>) => void } {
        return { views: this.host.panelEditors, state: this.nav.state.get(), setState: this.host.setSecondaryViewsState };
    }

    private subscribe(): void {
        this.navSubscription = this.nav.state.subscribe(() => this.sync());
        this.hostSubscription = this.host.state.subscribe(() => this.sync(), (state) => state.version);
    }
    private unsubscribe(): void { this.navSubscription?.(); this.hostSubscription?.(); this.navSubscription = undefined; this.hostSubscription = undefined; }
    private readonly sync = (): void => { this.secondary.update(this.childProps()); };
}
