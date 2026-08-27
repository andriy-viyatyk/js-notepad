import { settings } from "../../../api/settings";
import { applyTheme, getAvailableThemes } from "../../../theme/themes";
import type { ThemeDefinition } from "../../../theme/themes/types";
import { themeState } from "../../../theme/theme-state";
import { applyPanelAttributes, resolvePanelAttributes } from "../../../uikit/Panel/panel-style";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { createSectionRoot, panel, text } from "./settings-native";

interface ThemePreviewProps {
    bgDefault: string;
    bgDark: string;
    textDefault: string;
    accentColor: string;
}

class ThemePreviewView extends VanillaView<ThemePreviewProps> {
    private header: HTMLDivElement | undefined;
    private body: HTMLDivElement | undefined;
    private accentLine: HTMLDivElement | undefined;
    private textLine: HTMLDivElement | undefined;
    private shortLine: HTMLDivElement | undefined;

    public constructor(props: ThemePreviewProps) {
        const root = document.createElement("div");
        root.dataset.type = "settings-theme-preview";
        super(props, root);
    }

    protected onMount(): void {
        this.header = document.createElement("div");
        this.header.dataset.part = "header";
        this.body = document.createElement("div");
        this.body.dataset.part = "body";
        this.accentLine = this.createLine("line-accent");
        this.textLine = this.createLine("line-long");
        this.shortLine = this.createLine("line-short");
        this.body.append(this.accentLine, this.textLine, this.shortLine);
        this.root.append(this.header, this.body);
        this.applyProps(this.props);
    }

    protected onUpdate(props: ThemePreviewProps): void {
        this.applyProps(props);
    }

    protected onDispose(): void {
        this.header = undefined;
        this.body = undefined;
        this.accentLine = undefined;
        this.textLine = undefined;
        this.shortLine = undefined;
    }

    private createLine(part: string): HTMLDivElement {
        const line = document.createElement("div");
        line.dataset.part = "line";
        line.dataset.kind = part;
        return line;
    }

    private applyProps(props: ThemePreviewProps): void {
        if (this.header) this.header.style.backgroundColor = props.bgDark;
        if (this.body) this.body.style.backgroundColor = props.bgDefault;
        if (this.accentLine) this.accentLine.style.backgroundColor = props.accentColor;
        if (this.textLine) this.textLine.style.backgroundColor = props.textDefault;
        if (this.shortLine) this.shortLine.style.backgroundColor = props.textDefault;
    }
}

interface ThemeOption {
    theme: ThemeDefinition;
    panel: HTMLDivElement;
    view: ThemePreviewView;
}

export class ThemeSectionView extends VanillaView<Record<string, never>> {
    private readonly options: ThemeOption[] = [];

    public constructor(props: Record<string, never>) {
        super(props, createSectionRoot("settings-section"));
    }

    protected onMount(): void {
        const themes = getAvailableThemes();
        const darkThemes = themes.filter((theme) => theme.isDark);
        const lightThemes = themes.filter((theme) => !theme.isDark);
        this.root.append(
            panel({ paddingBottom: "lg" }, text("Theme", { bold: true, size: "sm" })),
            panel({ paddingBottom: "md" }, text("Dark", { variant: "uppercased", color: "light", bold: true, size: "xs" })),
            this.createGrid(darkThemes),
            panel({ paddingBottom: "md" }, text("Light", { variant: "uppercased", color: "light", bold: true, size: "xs" })),
            this.createGrid(lightThemes),
        );
        this.applySelection(themeState.get().id);
        this.own(themeState.subscribe(() => this.applySelection(themeState.get().id)));
    }

    protected onDispose(): void {
        this.options.length = 0;
    }

    private createGrid(themes: ThemeDefinition[]): HTMLDivElement {
        const grid = panel({ direction: "row", wrap: true, gap: "lg", justify: "center", paddingBottom: "xl" });
        themes.forEach((theme) => {
            const option = document.createElement("div");
            option.dataset.type = "settings-theme-option";
            this.listen(option, "click", () => this.handleThemeChange(theme.id));
            const preview = this.child(new ThemePreviewView({
                bgDefault: theme.colors["--color-bg-default"],
                bgDark: theme.colors["--color-bg-dark"],
                textDefault: theme.colors["--color-text-default"],
                accentColor: theme.colors["--color-misc-blue"],
            }));
            const themePanel = panel({
                direction: "column",
                align: "center",
                justify: "center",
                gap: "md",
                paddingY: "lg",
                paddingX: "md",
                width: 160,
                height: 100,
                background: "dark",
                border: true,
                borderColor: "default",
                rounded: "md",
            });
            option.append(themePanel);
            themePanel.append(preview.root, text(theme.name, { size: "sm", align: "center" }));
            preview.mount();
            grid.append(option);
            this.options.push({ theme, panel: themePanel, view: preview });
        });
        return grid;
    }

    private handleThemeChange(themeId: string): void {
        applyTheme(themeId);
        settings.set("theme", themeId);
    }

    private applySelection(themeId: string): void {
        this.options.forEach(({ theme, panel: themePanel }) => {
            applyPanelAttributes(themePanel, resolvePanelAttributes({
                direction: "column",
                align: "center",
                justify: "center",
                gap: "md",
                paddingY: "lg",
                paddingX: "md",
                width: 160,
                height: 100,
                background: "dark",
                border: true,
                borderColor: theme.id === themeId ? "active" : "default",
                rounded: "md",
            }));
        });
    }
}

export { ThemeSectionView as ThemeSection };
