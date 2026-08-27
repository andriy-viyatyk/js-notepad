import { AppPageManagerView, type AppPageManagerProps } from "../../components/page-manager/AppPageManagerView";
import { pagesModel } from "../../api/pages";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { PageContentView } from "./PageContentView";
import "./Pages.css";

export class PagesView extends VanillaView<object> {
    private readonly manager: AppPageManagerView;

    public constructor(props: object) {
        const manager = new AppPageManagerView(PagesView.managerProps());
        super(props, manager.root);
        this.manager = this.child(manager);
    }

    protected onMount(): void {
        this.manager.mount();
        this.bind(pagesModel.state, (state) => state, () => this.manager.update(PagesView.managerProps()));
    }

    private static managerProps(): AppPageManagerProps {
        const state = pagesModel.state.get();
        return {
            pageIds: state.pages.map((page) => page.id),
            activeId: pagesModel.activePage?.id ?? "",
            groupedActiveId: pagesModel.groupedPage?.id,
            grouping: state.leftRight,
            compareModeIds: state.compareGroups,
            pageView: PageContentView,
        };
    }
}
