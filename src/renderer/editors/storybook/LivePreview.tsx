import React from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { Panel } from "../../uikit/Panel/Panel";
import { Text } from "../../uikit/Text/Text";
import { mountVanilla } from "../../uikit/shared/mount";
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
    const sharedProps: Record<string, unknown> = { ...propValues };

    // Drop empty-string enum values so they don't override component defaults.
    for (const key of Object.keys(sharedProps)) {
        if (sharedProps[key] === "") delete sharedProps[key];
    }

    // Auto-inject Storybook-managed values (e.g. background) when the
    // component's story declares the matching prop.
    const managedValues: Record<string, unknown> = { background: previewBackground };
    for (const propName of STORYBOOK_MANAGED_PROPS) {
        if (story.props.some((p) => p.name === propName)) {
            sharedProps[propName] = managedValues[propName];
        }
    }

    // Keep the two prop objects separate. In particular, previewChildren is a ReactNode and
    // must never cross into a vanilla view's constructor.
    const reactProps: Record<string, unknown> = { ...sharedProps };
    if (!hasChildrenProp && story.previewChildren) {
        reactProps.children = story.previewChildren();
    }

    if (!story.vanillaComponent) {
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
                <Component {...reactProps} />
            </Panel>
        );
    }

    const vanillaProps: Record<string, unknown> = { ...sharedProps };

    return (
        <Panel
            name="storybook-live-preview"
            data-type="live-preview"
            flex
            direction="row"
            overflow="auto"
            minHeight={0}
            gap="md"
            background={previewBackground}
        >
            <Panel
                name="storybook-preview-react"
                data-type="storybook-preview-react"
                flex="1 1 0"
                minWidth={0}
                minHeight={0}
                overflow="auto"
                align="center"
                justify="center"
                padding="xl"
            >
                <Component {...reactProps} />
            </Panel>
            <Panel
                name="storybook-preview-vanilla"
                data-type="storybook-preview-vanilla"
                flex="1 1 0"
                minWidth={0}
                minHeight={0}
                overflow="auto"
                align="center"
                justify="center"
                padding="xl"
            >
                <EditorErrorBoundary>
                    {mountVanilla(story.vanillaComponent, vanillaProps)}
                </EditorErrorBoundary>
            </Panel>
        </Panel>
    );
}
