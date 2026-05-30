import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";
import { ALL_STORIES, findStory } from "./storyRegistry";
import { Story, PropDef } from "./storyTypes";

export const STORYBOOK_PAGE_ID = "storybook-page";

export type PreviewBackground = "default" | "light" | "dark";

export interface StorybookEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "storybookPage";
    selectedStoryId: string;
    propValues: Record<string, unknown>;
    previewBackground: PreviewBackground;
    leftPanelWidth: number;
    rightPanelWidth: number;
}

export const getDefaultStorybookEditorState = (): StorybookEditorState => {
    const first = ALL_STORIES[0];
    return {
        id: STORYBOOK_PAGE_ID,
        title: "Storybook",
        modified: false,
        type: "storybookPage",
        editor: "storybook-view",
        selectedStoryId: first?.id ?? "",
        propValues: first ? buildInitialProps(first) : {},
        previewBackground: "light",
        leftPanelWidth: 200,
        rightPanelWidth: 280,
    };
};

export function buildInitialProps(story: Story): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(story.defaultProps as Record<string, unknown> | undefined) };
    for (const def of story.props) {
        if (out[def.name] !== undefined) continue;
        if ("default" in def && def.default !== undefined) {
            out[def.name] = def.default;
        }
    }
    return out;
}

export class StorybookEditorModel extends EditorModel<StorybookEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "storybook-view";

    noLanguage = true;
    skipSave = true;

    selectStory = (id: string): void => {
        const story = findStory(id);
        if (!story) return;
        this.state.update((s) => {
            s.selectedStoryId = id;
            s.propValues = buildInitialProps(story);
        });
    };

    setPropValue = (name: string, value: unknown): void => {
        this.state.update((s) => {
            s.propValues = { ...s.propValues, [name]: value };
        });
    };

    resetProps = (): void => {
        const story = findStory(this.state.get().selectedStoryId);
        if (!story) return;
        this.state.update((s) => { s.propValues = buildInitialProps(story); });
    };

    setPreviewBackground = (bg: PreviewBackground): void => {
        this.state.update((s) => { s.previewBackground = bg; });
    };

    setLeftPanelWidth = (w: number): void => {
        this.state.update((s) => { s.leftPanelWidth = w; });
    };

    setRightPanelWidth = (w: number): void => {
        this.state.update((s) => { s.rightPanelWidth = w; });
    };
}

// Re-export for use by StorybookEditorView module
export type { Story, PropDef };
