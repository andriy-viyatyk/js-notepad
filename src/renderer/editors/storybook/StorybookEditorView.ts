import type { EditorModel } from "../base/EditorModel";
import { createPanelElement, type PanelStyleProps } from "../../uikit/Panel/panel-style";
import { ToolbarView } from "../../uikit/Toolbar/ToolbarView";
import type { ToolbarProps } from "../../uikit/Toolbar/Toolbar";
import { SegmentedControlView } from "../../uikit/SegmentedControl/SegmentedControlView";
import type { ISegment, SegmentedControlProps } from "../../uikit/SegmentedControl/SegmentedControlView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import type { SplitterProps } from "../../uikit/Splitter/SplitterView";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import {
    PreviewBackground,
    StorybookEditorModel,
    STORYBOOK_PAGE_ID,
} from "./StorybookEditorModel";
import { ComponentBrowserView } from "./ComponentBrowser";
import { LivePreviewView } from "./LivePreview";
import { PropertyEditorView } from "./PropertyEditor";
import "../../uikit/SegmentedControl/SegmentedControl.css";

const BG_OPTIONS: ISegment[] = [
    { value: "dark", label: "Dark" },
    { value: "default", label: "Default" },
    { value: "light", label: "Light" },
];

const ROOT_PROPS: PanelStyleProps = {
    name: "storybook-root",
    direction: "column",
    flex: true,
    overflow: "hidden",
    height: 0,
};

function requireStorybookModel(model: EditorModel): StorybookEditorModel {
    if (!(model instanceof StorybookEditorModel)) {
        throw new Error("Storybook view received an invalid model.");
    }
    return model;
}

export class StorybookEditorView extends VanillaView<{ model: EditorModel }> {
    private model: StorybookEditorModel;
    private toolbar: ToolbarView | undefined;
    private readonly toolbarChildren: Node[] = [];
    private backgroundControl: SegmentedControlView | undefined;
    private leftSplitter: SplitterView | undefined;
    private rightSplitter: SplitterView | undefined;
    private componentBrowser: ComponentBrowserView | undefined;
    private livePreview: LivePreviewView | undefined;
    private propertyEditor: PropertyEditorView | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createPanelElement(ROOT_PROPS));
        this.model = requireStorybookModel(props.model);
        this.root.dataset.type = "storybook-editor";
    }

    protected onMount(): void {
        const state = this.model.state.get();
        this.toolbar = this.child(new ToolbarView(this.toolbarProps()));
        this.backgroundControl = this.child(new SegmentedControlView(this.backgroundProps(state.previewBackground)));
        const toolbarLeading = createPanelElement({ paddingLeft: "sm", paddingRight: "md" }, [
            createTextElement("Storybook", { size: "lg", bold: true }),
        ]);
        const body = createPanelElement({
            name: "storybook-body",
            direction: "row",
            flex: true,
            overflow: "hidden",
            height: 0,
        });

        const spacer = this.child(new SpacerView({}));
        const leftSplitter = this.child(new SplitterView(this.leftSplitterProps(state.leftPanelWidth)));
        this.componentBrowser = this.child(new ComponentBrowserView({ model: this.model }));
        this.livePreview = this.child(new LivePreviewView({ model: this.model }));
        const rightSplitter = this.child(new SplitterView(this.rightSplitterProps(state.rightPanelWidth)));
        this.propertyEditor = this.child(new PropertyEditorView({ model: this.model }));

        this.toolbarChildren.push(
            toolbarLeading,
            spacer.root,
            createTextElement("Background:", { size: "sm", color: "light" }),
            this.backgroundControl.root,
        );
        body.append(
            this.componentBrowser.root,
            leftSplitter.root,
            this.livePreview.root,
            rightSplitter.root,
            this.propertyEditor.root,
        );
        this.root.append(this.toolbar.root, body);

        this.toolbar.mount();
        spacer.mount();
        this.backgroundControl.mount();
        this.componentBrowser.mount();
        leftSplitter.mount();
        this.livePreview.mount();
        rightSplitter.mount();
        this.propertyEditor.mount();
        this.leftSplitter = leftSplitter;
        this.rightSplitter = rightSplitter;

        this.bind(
            this.model.state,
            (current) => current.previewBackground,
            (background) => {
                this.backgroundControl?.update(this.backgroundProps(background));
                const current = this.model.state.get();
                this.leftSplitter?.update(this.leftSplitterProps(current.leftPanelWidth));
                this.rightSplitter?.update(this.rightSplitterProps(current.rightPanelWidth));
            },
        );
        this.bind(
            this.model.state,
            (current) => current.leftPanelWidth,
            (width) => this.leftSplitter?.update(this.leftSplitterProps(width)),
        );
        this.bind(
            this.model.state,
            (current) => current.rightPanelWidth,
            (width) => this.rightSplitter?.update(this.rightSplitterProps(width)),
        );
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireStorybookModel(props.model);
        if (model !== this.model) {
            throw new Error("Storybook view model cannot change after mount.");
        }
    }

    private toolbarProps(): ToolbarProps {
        return {
            borderBottom: true,
            "aria-label": "Storybook editor toolbar",
            children: this.toolbarChildren,
        };
    }

    private backgroundProps(value: PreviewBackground): SegmentedControlProps {
        return {
            name: "storybook-bg-select",
            items: BG_OPTIONS,
            value,
            onChange: (next) => this.setPreviewBackground(next),
            size: "sm",
        };
    }

    private setPreviewBackground(value: string): void {
        if (value === "dark" || value === "default" || value === "light") {
            this.model.setPreviewBackground(value);
        }
    }

    private leftSplitterProps(value: number): SplitterProps {
        return {
            name: "storybook-left-splitter",
            value,
            onChange: this.model.setLeftPanelWidth,
            side: "before",
            border: "before",
            background: this.model.state.get().previewBackground,
            hoverBackground: "overlay",
            min: 120,
        };
    }

    private rightSplitterProps(value: number): SplitterProps {
        return {
            name: "storybook-right-splitter",
            value,
            onChange: this.model.setRightPanelWidth,
            side: "after",
            border: "after",
            background: this.model.state.get().previewBackground,
            hoverBackground: "overlay",
            min: 200,
        };
    }
}

export { STORYBOOK_PAGE_ID };
