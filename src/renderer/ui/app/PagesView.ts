import { AppPageManagerView, type AppPageManagerProps } from "../../components/page-manager/AppPageManagerView";
import { pagesModel } from "../../api/pages";
import type { OpenFilesState } from "../../api/pages/PagesModel";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { PageContentView } from "./PageContentView";
import "./Pages.css";

type PagesProjection = Pick<OpenFilesState, "pages" | "ordered" | "leftRight" | "rightLeft" | "compareGroups">;

export class PagesView extends VanillaView<object> {
    private readonly manager: AppPageManagerView;

    public constructor(props: object) {
        const manager = new AppPageManagerView(PagesView.managerProps(PagesView.selectState(pagesModel.state.get())));
        super(props, manager.root);
        this.manager = this.child(manager);
    }

    protected onMount(): void {
        this.manager.mount();
        this.bind(
            pagesModel.state,
            PagesView.selectState,
            (projection) => this.manager.update(PagesView.managerProps(projection)),
        );
    }

    private static selectState(state: OpenFilesState): PagesProjection {
        return {
            pages: state.pages,
            ordered: state.ordered,
            leftRight: state.leftRight,
            rightLeft: state.rightLeft,
            compareGroups: state.compareGroups,
        };
    }

    private static managerProps(projection: PagesProjection): AppPageManagerProps {
        const activePage = projection.ordered[projection.ordered.length - 1];
        const groupedActiveId = activePage
            ? pagesModel.query.getGroupedPage(activePage.id)?.id
            : undefined;
        return {
            pageIds: projection.pages.map((page) => page.id),
            activeId: activePage?.id ?? "",
            groupedActiveId,
            grouping: projection.leftRight,
            compareModeIds: projection.compareGroups,
            pageView: PageContentView,
        };
    }
}
