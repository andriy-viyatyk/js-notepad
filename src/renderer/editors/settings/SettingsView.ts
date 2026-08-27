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

        this.appendSection(new ThemeSectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new WindowBehaviorSectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new BrowserProfilesSectionView({}), content);
        this.appendDivider(content);

        content.append(
            panel({ paddingBottom: "lg" }, text("Links", { bold: true, size: "sm" })),
            panel({ paddingBottom: "md" }, text("How external links open from editors (Monaco, Markdown)", { color: "light", size: "xs" })),
        );
        this.appendSection(new LinkBehaviorSectionView({}), content);
        this.appendDivider(content);

        content.append(panel({ paddingBottom: "lg" }, text("Default Browser", { bold: true, size: "sm" })));
        this.appendSection(new DefaultBrowserSectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new FileSearchSectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new McpSectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new GitIntegrationSectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new BoardVarsSectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new ScriptLibrarySectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new DrawingLibrarySectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new VideoPlayerSectionView({}), content);
        this.appendDivider(content);
        this.appendSection(new TerminalSectionView({}), content);
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

    private appendSection(view: SettingsChildView, parent: HTMLDivElement): void {
        this.child(view);
        parent.append(view.root);
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
