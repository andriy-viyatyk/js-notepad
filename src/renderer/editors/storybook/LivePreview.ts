import { createPanelElement, type PanelStyleProps } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createTextElement } from "../../uikit/Text/text-style";
import { errMessage } from "../../../shared/utils";
import { findStory } from "./storyRegistry";
import { prepareStoryProps } from "./story-props";
import type { AnyStory } from "./storyTypes";
import { StorybookEditorModel, type PreviewBackground } from "./StorybookEditorModel";

type PreviewArm = "vanilla" | "error";

const PREVIEW_PROPS: PanelStyleProps = {
    name: "storybook-live-preview",
    flex: true,
    overflow: "auto",
    align: "center",
    justify: "center",
    padding: "xl",
};

function warnUnexpectedProps(
    story: AnyStory,
    props: Record<string, unknown>,
    hasGeneratedChildren: boolean,
): void {
    const allowedKeys = new Set([
        ...story.props.map((prop) => prop.name),
        ...Object.keys(story.defaultProps ?? {}),
    ]);
    if (hasGeneratedChildren) allowedKeys.add("children");

    for (const key of Object.keys(props)) {
        if (!allowedKeys.has(key)) {
            console.warn(`Story "${story.id}" (${story.name}) received unexpected prop key "${key}".`);
        }
    }
}

function hasStoryView(story: AnyStory): boolean {
    return "view" in story && story.view !== undefined;
}

export class LivePreviewView extends VanillaView<{ model: StorybookEditorModel }> {
    private readonly model: StorybookEditorModel;
    private storyId: string | undefined;
    private arm: PreviewArm | undefined;
    private vanillaView: VanillaView<Record<string, unknown>> | undefined;

    public constructor(props: { model: StorybookEditorModel }) {
        super(props, createPanelElement(PREVIEW_PROPS));
        this.model = props.model;
        this.root.dataset.type = "live-preview";
    }

    protected onMount(): void {
        this.bind(this.model.state, (state) => state, (state) => this.sync(
            state.selectedStoryId,
            state.propValues,
            state.previewBackground,
        ));
    }

    protected onUpdate(props: { model: StorybookEditorModel }): void {
        if (props.model !== this.model) {
            throw new Error("Live preview model cannot change after mount.");
        }
    }

    protected onDispose(): void {
        this.clearActiveContent();
    }

    private sync(
        selectedStoryId: string,
        propValues: Record<string, unknown>,
        previewBackground: PreviewBackground,
    ): void {
        this.applyBackground(previewBackground);
        const story = findStory(selectedStoryId);
        if (!story) {
            this.replaceWithMessage(undefined, "Select a component");
            return;
        }

        if (!hasStoryView(story)) {
            this.replaceWithMessage(story.id, `Story "${story.id}" must declare a view.`);
            return;
        }

        if (this.storyId === story.id && this.arm === "error") return;

        let prepared: { props: Record<string, unknown>; hasGeneratedChildren: boolean };
        try {
            prepared = prepareStoryProps(story, propValues, previewBackground);
        } catch (error) {
            this.replaceWithError(story.id, error);
            return;
        }
        warnUnexpectedProps(story, prepared.props, prepared.hasGeneratedChildren);

        const nextArm: PreviewArm = "vanilla";
        if (this.storyId !== story.id || this.arm !== nextArm) {
            const cleanupError = this.clearActiveContent();
            this.storyId = story.id;
            this.arm = nextArm;
            if (cleanupError) {
                this.showError(cleanupError);
                this.arm = "error";
                return;
            }
            this.mountVanillaStory(story, prepared.props);
            return;
        }

        if (this.arm === "vanilla") {
            try {
                this.vanillaView?.update(prepared.props);
            } catch (error) {
                this.replaceWithError(story.id, error);
            }
        }
    }

    private mountVanillaStory(
        story: AnyStory,
        props: Record<string, unknown>,
    ): void {
        try {
            const view = this.child(new story.view(props));
            this.vanillaView = view;
            this.root.append(view.root);
            view.mount();
        } catch (error) {
            const cleanupError = this.clearActiveContent();
            this.showError(cleanupError ?? error);
            this.arm = "error";
        }
    }

    private replaceWithMessage(storyId: string | undefined, message: string): void {
        if (this.storyId === storyId && this.arm === "error") return;
        const cleanupError = this.clearActiveContent();
        this.storyId = storyId;
        this.arm = "error";
        if (cleanupError) {
            this.showError(cleanupError);
        } else {
            this.root.append(createTextElement(message, { size: "sm", color: "error" }));
        }
    }

    private replaceWithError(storyId: string, error: unknown): void {
        const cleanupError = this.clearActiveContent();
        this.storyId = storyId;
        this.arm = "error";
        this.showError(cleanupError ?? error);
    }

    private showError(error: unknown, prefix = "Editor crashed"): void {
        this.root.append(createTextElement(
            `${prefix}: ${errMessage(error, "Unexpected preview error")}`,
            { size: "sm", color: "error" },
        ));
    }

    private applyBackground(background: PreviewBackground): void {
        this.root.dataset.bg = background;
    }

    private clearActiveContent(): unknown | undefined {
        let firstError: unknown;
        if (this.vanillaView) {
            const view = this.vanillaView;
            this.vanillaView = undefined;
            try {
                this.releaseChild(view);
            } catch (error) {
                firstError = error;
            }
        }
        this.root.replaceChildren();
        return firstError;
    }
}
