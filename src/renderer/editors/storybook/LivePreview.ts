import React from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { createPanelElement, type PanelStyleProps } from "../../uikit/Panel/panel-style";
import { mountReactHandle, type MountedReactRoot } from "../../uikit/shared/mount";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createTextElement } from "../../uikit/Text/text-style";
import { errMessage } from "../../../shared/utils";
import { findStory } from "./storyRegistry";
import { prepareStoryProps } from "./story-props";
import type { AnyStory } from "./storyTypes";
import { StorybookEditorModel, type PreviewBackground } from "./StorybookEditorModel";

type PreviewArm = "react" | "vanilla" | "error";

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

function hasStoryComponent(story: AnyStory): boolean {
    return "component" in story && story.component !== undefined;
}

function hasStoryView(story: AnyStory): boolean {
    return "view" in story && story.view !== undefined;
}

export class LivePreviewView extends VanillaView<{ model: StorybookEditorModel }> {
    private readonly model: StorybookEditorModel;
    private storyId: string | undefined;
    private arm: PreviewArm | undefined;
    private reactHost: HTMLDivElement | undefined;
    private reactHandle: MountedReactRoot | undefined;
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

        const component = hasStoryComponent(story);
        const view = hasStoryView(story);
        if (component === view) {
            this.replaceWithMessage(story.id, `Story "${story.id}" must declare exactly one of component or view.`);
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

        const nextArm: PreviewArm = view ? "vanilla" : "react";
        if (this.storyId !== story.id || this.arm !== nextArm) {
            const cleanupError = this.clearActiveContent();
            this.storyId = story.id;
            this.arm = nextArm;
            if (cleanupError) {
                this.showError(cleanupError);
                this.arm = "error";
                return;
            }
            if (nextArm === "vanilla") {
                this.mountVanillaStory(story, prepared.props);
            } else {
                this.mountReactStory(story, prepared.props);
            }
            return;
        }

        if (this.arm === "vanilla") {
            try {
                this.vanillaView?.update(prepared.props);
            } catch (error) {
                this.replaceWithError(story.id, error);
            }
        } else if (this.arm === "react") {
            try {
                this.reactHandle?.render(this.reactElement(story, prepared.props));
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

    private mountReactStory(story: AnyStory, props: Record<string, unknown>): void {
        const host = document.createElement("div");
        host.style.display = "contents";
        this.reactHost = host;
        this.root.append(host);
        try {
            this.reactHandle = mountReactHandle(host, this.reactElement(story, props));
        } catch (error) {
            const cleanupError = this.clearActiveContent();
            this.showError(cleanupError ?? error);
            this.arm = "error";
        }
    }

    private reactElement(story: AnyStory, props: Record<string, unknown>): React.ReactElement {
        const Component = story.component;
        return React.createElement(
            EditorErrorBoundary,
            {
                key: story.id,
                children: React.createElement(Component, props),
            },
        );
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
        if (this.reactHandle) {
            const handle = this.reactHandle;
            this.reactHandle = undefined;
            try {
                handle.dispose();
            } catch (error) {
                firstError ??= error;
            }
        }
        this.reactHost?.remove();
        this.reactHost = undefined;
        this.root.replaceChildren();
        return firstError;
    }
}
