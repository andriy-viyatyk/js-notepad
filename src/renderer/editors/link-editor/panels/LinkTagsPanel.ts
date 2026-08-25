import { CategoryListView } from "../../../uikit/CategoryList/CategoryListView";
import type { CategoryListProps } from "../../../uikit/CategoryList/CategoryList";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import "../../../uikit/Panel/Panel.css";
import "../../../uikit/CategoryList/CategoryList.css";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { LinkEditor } from "../LinkEditor";

export interface LinkTagsPanelProps {
    vm: LinkEditor;
}

export class LinkTagsPanelView extends VanillaView<LinkTagsPanelProps> {
    private categoryList: CategoryListView | undefined;

    public constructor(props: LinkTagsPanelProps) {
        super(props, createPanelElement({
            name: "link-tags-panel",
            direction: "row",
            flex: 1,
            height: 0,
            overflow: "hidden",
            width: "100%",
        }));
    }

    protected onMount(): void {
        const categoryList = this.child(new CategoryListView(this.categoryProps()));
        this.categoryList = categoryList;
        this.root.append(categoryList.root);
        categoryList.mount();
        this.bind(
            this.props.vm.state,
            (state) => ({ tags: state.tags, selectedTag: state.selectedTag }),
            this.updateCategoryList,
        );
    }

    protected onUpdate(_props: LinkTagsPanelProps): void {
        this.categoryList?.update(this.categoryProps());
    }

    protected onDispose(): void {
        this.categoryList = undefined;
    }

    private categoryProps(): CategoryListProps {
        const editor = this.props.vm;
        const state = editor.state.get();
        return {
            name: "link-tags",
            items: state.tags,
            value: state.selectedTag,
            onChange: editor.setSelectedTag,
            getCount: editor.getTagCount,
        };
    }

    private readonly updateCategoryList = (): void => {
        this.categoryList?.update(this.categoryProps());
    };
}

export const LinkTagsPanel = LinkTagsPanelView;
