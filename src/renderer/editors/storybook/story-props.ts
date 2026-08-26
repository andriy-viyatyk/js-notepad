import { resolveIconPreset } from "./iconPresets";
import type { PreviewBackground } from "./StorybookEditorModel";
import {
    STORYBOOK_MANAGED_PROPS,
    type AnyStory,
    type IconPresetId,
} from "./storyTypes";

function resolveSyntheticProps(story: AnyStory, props: Record<string, unknown>): void {
    for (const prop of story.props) {
        if (prop.type !== "icon") continue;
        const presetId = props[prop.name];
        props[prop.name] = typeof presetId === "string"
            ? resolveIconPreset(presetId as IconPresetId)
            : null;
    }
}

export function prepareStoryProps(
    story: AnyStory,
    propValues: Record<string, unknown>,
    previewBackground: PreviewBackground,
): { props: Record<string, unknown>; hasGeneratedChildren: boolean } {
    const hasChildrenProp = story.props.some((p) => p.name === "children");
    const props: Record<string, unknown> = { ...propValues };

    // Drop empty-string enum values so they don't override component defaults.
    for (const key of Object.keys(props)) {
        if (props[key] === "") delete props[key];
    }

    // Auto-inject Storybook-managed values (e.g. background) when the
    // component's story declares the matching prop.
    const managedValues: Record<string, unknown> = { background: previewBackground };
    for (const propName of STORYBOOK_MANAGED_PROPS) {
        if (story.props.some((p) => p.name === propName)) {
            props[propName] = managedValues[propName];
        }
    }
    resolveSyntheticProps(story, props);

    const hasGeneratedChildren = !hasChildrenProp && story.previewChildren !== undefined;
    if (hasGeneratedChildren) {
        props.children = story.previewChildren();
    }

    return { props, hasGeneratedChildren };
}
