import { createPanelElement } from "../../uikit/Panel/panel-style";
import { ListBoxView } from "../../uikit/ListBox/ListBoxView";
import type { IListBoxItem, ListBoxProps } from "../../uikit/ListBox/types";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { storiesBySection } from "./storyRegistry";
import { StorybookEditorModel } from "./StorybookEditorModel";

function buildItems(): IListBoxItem[] {
    const items: IListBoxItem[] = [];
    for (const [section, stories] of storiesBySection()) {
        items.push({
            value: `__section__:${section}`,
            label: section,
            section: true,
        });
        for (const story of stories) {
            items.push({ value: story.id, label: story.name });
        }
    }
    return items;
}

export class ComponentBrowserView extends VanillaView<{ model: StorybookEditorModel }> {
    private readonly model: StorybookEditorModel;
    private readonly items: IListBoxItem[] = [];
    private list: ListBoxView<IListBoxItem> | undefined;

    public constructor(props: { model: StorybookEditorModel }) {
        super(props, createPanelElement({
            name: "storybook-component-browser",
            direction: "column",
            width: props.model.state.get().leftPanelWidth,
            shrink: false,
            overflow: "hidden",
        }));
        this.model = props.model;
        this.root.dataset.type = "component-browser";
    }

    protected onMount(): void {
        this.items.push(...buildItems());
        this.list = this.child(new ListBoxView<IListBoxItem>(this.listProps(this.model.state.get().selectedStoryId)));
        this.root.append(this.list.root);
        this.list.mount();
        this.bind(
            this.model.state,
            (state) => state.selectedStoryId,
            (selectedStoryId) => this.list?.update(this.listProps(selectedStoryId)),
        );
        this.bind(
            this.model.state,
            (state) => state.leftPanelWidth,
            (width) => this.applyWidth(width),
        );
    }

    protected onUpdate(props: { model: StorybookEditorModel }): void {
        if (props.model !== this.model) {
            throw new Error("Component browser model cannot change after mount.");
        }
    }

    private listProps(selectedStoryId: string): ListBoxProps<IListBoxItem> {
        return {
            name: "storybook-component-list",
            items: this.items,
            value: this.items.find((item) => item.value === selectedStoryId) ?? null,
            onChange: (item) => this.model.selectStory(String(item.value)),
            variant: "browse",
            selectionStyle: "focus",
            rowHeight: 26,
        };
    }

    private applyWidth(width: number): void {
        this.root.style.width = `${width}px`;
    }
}
