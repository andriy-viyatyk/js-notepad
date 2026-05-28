import {
    EditorModel,
    type EditorStateBase,
} from "../base/v4/EditorModel";
import { ALL_STORIES, findStory } from "./storyRegistry";
import { Story, PropDef } from "./storyTypes";

/**
 * EPIC-028 / US-575 — native v4 Storybook page. NO-HOST editor (no
 * `CONTENT_HOST_TRAIT`). Singleton well-known page (fixed id `STORYBOOK_PAGE_ID`),
 * opened only via the `showStorybookPage` Tools entry (never via `openFile`), so
 * the v4 registry `accepts` predicate returns -1.
 *
 * Unlike Settings/About (identity-only state), Storybook carries real persisted
 * UI state (selected story, prop values, preview background, panel widths) with
 * NO transient runtime fields and NO instance state outside `state` — so the base
 * `getRestoreData()` (serializes the full `state`) and the no-host restore branch's
 * `Object.assign(s, d.state)` restore everything with no persistence overrides.
 *
 * Design rationale: doc/tasks/US-575-storybook-editor-migration/README.md.
 */

export const STORYBOOK_PAGE_ID = "storybook-page";

export type PreviewBackground = "default" | "light" | "dark";

export interface StorybookEditorState extends EditorStateBase {
    /** Discriminator — preserved for `deriveEditorId` and pre-US-575 saved
     *  descriptors. `deriveEditorId({type:"storybookPage"})` === "storybook-view". */
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
    /** v4 editor identity. Matches the legacy registry id so v4
     *  EditorDescriptor.editorId and pre-US-575 saved descriptors agree. */
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
