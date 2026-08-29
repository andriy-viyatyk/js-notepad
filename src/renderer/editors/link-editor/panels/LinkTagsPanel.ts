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
    private editorBinding: (() => void) | undefined;
    private boundEditor: LinkEditor | undefined;

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
        this.bindEditorState(this.props.vm);
    }

    protected onUpdate(props: LinkTagsPanelProps): void {
        if (props.vm !== this.boundEditor) this.bindEditorState(props.vm);
        this.categoryList?.update(this.categoryProps());
    }

    private bindEditorState(editor: LinkEditor): void {
        this.editorBinding?.();
        this.boundEditor = editor;
        this.editorBinding = this.bind(
            editor.state,
            (state) => ({ tags: state.tags, selectedTag: state.selectedTag }),
            () => {
                if (this.boundEditor !== editor) return;
                this.updateCategoryList();
            },
        );
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
