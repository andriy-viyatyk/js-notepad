import { app } from "../../api/app";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DividerView } from "../../uikit/Divider/DividerView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { BrowserProfilesSectionView } from "./sections/BrowserProfilesSection";
import { DefaultBrowserSectionView } from "./sections/DefaultBrowserSection";
import { FileSearchSectionView } from "./sections/FileSearchSection";
import { McpSectionView } from "./sections/McpSection";
import { ThemeSectionView } from "./sections/ThemeSection";
import {
    BoardVarsSectionView,
    DrawingLibrarySectionView,
    GitIntegrationSectionView,
    LinkBehaviorSectionView,
    ScriptLibrarySectionView,
    TerminalSectionView,
    VideoPlayerSectionView,
    WindowBehaviorSectionView,
} from "./sections/SettingsSections";
import { panel, text } from "./sections/settings-native";
import "./settings.css";
import "../../uikit/Button/Button.css";
import "../../uikit/Divider/Divider.css";

export interface SettingsEditorProps {
    model: import("./SettingsEditor").SettingsEditor;
}

type SettingsChildView = VanillaView<Record<string, never>>;

export class SettingsView extends VanillaView<SettingsEditorProps> {
    private content: HTMLDivElement | undefined;

    public constructor(props: SettingsEditorProps) {
        const root = createPanelElement({
            name: "settings-root",
            direction: "column",
            align: "center",
            padding: "xxxl",
        });
        root.dataset.type = "settings-view";
        super(props, root);
    }

    protected onMount(): void {
        const content = createPanelElement({
            name: "settings-content",
            direction: "column",
            width: "100%",
            maxWidth: 560,
            padding: "xxxl",
            background: "light",
            rounded: "lg",
        });
        this.content = content;
        const title = document.createElement("h1");
        title.textContent = "Settings";
        content.append(title);

        this.appendSection(new ThemeSectionView({}), content, "settings-section-theme");
        this.appendDivider(content);
        this.appendSection(new WindowBehaviorSectionView({}), content, "settings-section-window-behavior");
        this.appendDivider(content);
        this.appendSection(new BrowserProfilesSectionView({}), content, "settings-section-browser-profiles");
        this.appendDivider(content);

        content.append(
            panel({ paddingBottom: "lg" }, text("Links", { bold: true, size: "sm" })),
            panel({ paddingBottom: "md" }, text("How external links open from editors (Monaco, Markdown)", { color: "light", size: "xs" })),
        );
        this.appendSection(new LinkBehaviorSectionView({}), content, "settings-section-link-behavior");
        this.appendDivider(content);

        content.append(panel({ paddingBottom: "lg" }, text("Default Browser", { bold: true, size: "sm" })));
        this.appendSection(new DefaultBrowserSectionView({}), content, "settings-section-default-browser");
        this.appendDivider(content);
        this.appendSection(new FileSearchSectionView({}), content, "settings-section-file-search");
        this.appendDivider(content);
        this.appendSection(new McpSectionView({}), content, "settings-section-mcp");
        this.appendDivider(content);
        this.appendSection(new GitIntegrationSectionView({}), content, "settings-section-git-integration");
        this.appendDivider(content);
        this.appendSection(new BoardVarsSectionView({}), content, "settings-section-board-vars");
        this.appendDivider(content);
        this.appendSection(new ScriptLibrarySectionView({}), content, "settings-section-script-library");
        this.appendDivider(content);
        this.appendSection(new DrawingLibrarySectionView({}), content, "settings-section-drawing-library");
        this.appendDivider(content);
        this.appendSection(new VideoPlayerSectionView({}), content, "settings-section-video-player");
        this.appendDivider(content);
        this.appendSection(new TerminalSectionView({}), content, "settings-section-terminal");
        this.appendDivider(content);

        const viewFileButton = this.child(new ButtonView({
            name: "settings-view-file",
            variant: "link",
            size: "sm",
            background: "light",
            onClick: this.handleOpenSettingsFile,
            children: "View Settings File",
        }));
        content.append(viewFileButton.root);
        this.root.append(content);
        viewFileButton.mount();
    }

    protected onDispose(): void {
        this.content = undefined;
    }

    private appendSection(view: SettingsChildView, parent: HTMLDivElement, name: string): void {
        this.child(view);
        const wrapper = document.createElement("div");
        wrapper.dataset.name = name;
        wrapper.className = "settings-section-wrapper";
        wrapper.append(view.root);
        parent.append(wrapper);
        view.mount();
    }

    private appendDivider(parent: HTMLDivElement): void {
        const wrapper = panel({ paddingY: "xl" });
        const divider = this.child(new DividerView({}));
        wrapper.append(divider.root);
        divider.mount();
        parent.append(wrapper);
    }

    private readonly handleOpenSettingsFile = (): void => {
        const filePath = settings.settingsFilePath;
        if (filePath) void app.events.openRawLink.sendAsync(createLinkData(filePath));
    };
}

export type { SettingsEditor } from "./SettingsEditor";
