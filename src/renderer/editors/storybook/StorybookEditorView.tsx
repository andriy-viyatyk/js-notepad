import React from "react";
import { EditorType, IEditorState } from "../../../shared/types";
import type { EditorModel } from "../base";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import { Panel } from "../../uikit/Panel/Panel";
import { Toolbar } from "../../uikit/Toolbar/Toolbar";
import { SegmentedControl } from "../../uikit/SegmentedControl/SegmentedControl";
import { Spacer } from "../../uikit/Spacer/Spacer";
import { Splitter } from "../../uikit/Splitter/Splitter";
import { Text } from "../../uikit/Text/Text";
import {
    PreviewBackground,
    StorybookEditorModel,
    StorybookEditorState,
    getDefaultStorybookEditorState,
    STORYBOOK_PAGE_ID,
} from "./StorybookEditorModel";
import { ComponentBrowser } from "./ComponentBrowser";
import { LivePreview } from "./LivePreview";
import { PropertyEditor } from "./PropertyEditor";

const BG_OPTIONS: Array<{ value: PreviewBackground; label: string }> = [
    { value: "dark",    label: "Dark"    },
    { value: "default", label: "Default" },
    { value: "light",   label: "Light"   },
];

function StorybookEditorView({ model }: { model: StorybookEditorModel }) {
    const { previewBackground, leftPanelWidth, rightPanelWidth } = model.state.use();
    return (
        <Panel
            name="storybook-root"
            data-type="storybook-editor"
            direction="column"
            flex
            overflow="hidden"
            height={0}
        >
            <Toolbar borderBottom aria-label="Storybook editor toolbar">
                <Panel paddingLeft="sm" paddingRight="md">
                    <Text size="lg" bold>Storybook</Text>
                </Panel>
                <Spacer />
                <Text size="sm" color="light">Background:</Text>
                <SegmentedControl
                    name="storybook-bg-select"
                    items={BG_OPTIONS}
                    value={previewBackground}
                    onChange={(v) => model.setPreviewBackground(v as PreviewBackground)}
                    size="sm"
                />
            </Toolbar>
            <Panel name="storybook-body" direction="row" flex overflow="hidden" height={0}>
                <ComponentBrowser model={model} />
                <Splitter
                    name="storybook-left-splitter"
                    value={leftPanelWidth}
                    onChange={model.setLeftPanelWidth}
                    side="before"
                    border="before"
                    background={previewBackground}
                    hoverBackground="overlay"
                    min={120}
                />
                <LivePreview model={model} />
                <Splitter
                    name="storybook-right-splitter"
                    value={rightPanelWidth}
                    onChange={model.setRightPanelWidth}
                    side="after"
                    border="after"
                    background={previewBackground}
                    hoverBackground="overlay"
                    min={200}
                />
                <PropertyEditor model={model} />
            </Panel>
        </Panel>
    );
}


const storybookEditorModule: EditorModule = {
    Editor: StorybookEditorView as unknown as EditorModule["Editor"],

    newEditorModel: async () =>
        new StorybookEditorModel(
            new TComponentState(getDefaultStorybookEditorState()),
        ) as unknown as EditorModel,

    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "storybookPage") return null;
        return new StorybookEditorModel(
            new TComponentState(getDefaultStorybookEditorState()),
        ) as unknown as EditorModel;
    },

    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const s: StorybookEditorState = {
            ...getDefaultStorybookEditorState(),
            ...(state as Partial<StorybookEditorState>),
        };
        return new StorybookEditorModel(
            new TComponentState(s),
        ) as unknown as EditorModel;
    },
};

export default storybookEditorModule;
export { StorybookEditorView, STORYBOOK_PAGE_ID };
