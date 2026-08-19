import React from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { Panel } from "../../uikit/Panel/Panel";
import { Text } from "../../uikit/Text/Text";
import { findStory } from "./storyRegistry";
import { STORYBOOK_MANAGED_PROPS } from "./storyTypes";
import { StorybookEditorModel } from "./StorybookEditorModel";

export function LivePreview({ model }: { model: StorybookEditorModel }) {
    const { selectedStoryId, propValues, previewBackground } = model.state.use();
    const story = findStory(selectedStoryId);

    if (!story) {
        return (
            <Panel
                name="storybook-live-preview"
                data-type="live-preview"
                flex
                overflow="auto"
                align="center"
                justify="center"
                padding="xl"
                background={previewBackground}
            >
                <Text size="sm" color="light">Select a component</Text>
            </Panel>
        );
    }

    const Component = story.component as React.ComponentType<Record<string, unknown>>;
    const hasChildrenProp = story.props.some((p) => p.name === "children");
    const componentProps: Record<string, unknown> = { ...propValues };

    // Drop empty-string enum values so they don't override component defaults.
    for (const key of Object.keys(componentProps)) {
        if (componentProps[key] === "") delete componentProps[key];
    }

    // Auto-inject Storybook-managed values (e.g. background) when the
    // component's story declares the matching prop.
    const managedValues: Record<string, unknown> = { background: previewBackground };
    for (const propName of STORYBOOK_MANAGED_PROPS) {
        if (story.props.some((p) => p.name === propName)) {
            componentProps[propName] = managedValues[propName];
        }
    }

    if (!hasChildrenProp && story.previewChildren) {
        componentProps.children = story.previewChildren();
    }

    return (
        <Panel
            name="storybook-live-preview"
            data-type="live-preview"
            flex
            overflow="auto"
            align="center"
            justify="center"
            padding="xl"
            background={previewBackground}
        >
            <EditorErrorBoundary>
                <Component {...componentProps} />
            </EditorErrorBoundary>
        </Panel>
    );
}
