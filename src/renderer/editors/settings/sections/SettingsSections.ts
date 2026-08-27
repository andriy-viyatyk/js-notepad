import { app } from "../../../api/app";
import { settings } from "../../../api/settings";
import { api } from "../../../../ipc/renderer/api";
import { TComponentState } from "../../../core/state/state";
import { TComponentModel } from "../../../core/state/model";
import { fpBasename } from "../../../core/utils/file-path";
import { ButtonView } from "../../../uikit/Button/ButtonView";
import { CheckboxView } from "../../../uikit/Checkbox/CheckboxView";
import type { CheckboxProps } from "../../../uikit/Checkbox/Checkbox";
import { DotView } from "../../../uikit/Dot/DotView";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { InputView } from "../../../uikit/Input/InputView";
import type { InputProps } from "../../../uikit/Input/Input";
import { SelectView, type SelectViewProps } from "../../../uikit/Select/SelectView";
import type { IListBoxItem } from "../../../uikit/ListBox/types";
import { SubtreeSwap } from "../../../uikit/shared/subtree-swap";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { createSectionRoot, panel, settingsFieldLabel, settingsLink, settingsPath, settingsPlaceholder, text } from "./settings-native";
import "../../../uikit/Button/Button.css";
import "../../../uikit/Checkbox/Checkbox.css";
import "../../../uikit/Dot/Dot.css";
import "../../../uikit/IconButton/IconButton.css";
import "../../../uikit/Input/Input.css";
import "../../../uikit/Select/Select.css";

const LINK_ITEMS: IListBoxItem[] = [
    { value: "default-browser", label: "Open in default OS browser" },
    { value: "internal-browser", label: "Open in internal Browser tab" },
];

const TERMINAL_ITEMS: IListBoxItem[] = [
    { value: "", label: "Auto-detect (pwsh → powershell → cmd)" },
    { value: "pwsh", label: "PowerShell 7 (pwsh)" },
    { value: "powershell", label: "Windows PowerShell (powershell)" },
    { value: "cmd", label: "Command Prompt (cmd)" },
    { value: "wt", label: "Windows Terminal (wt)" },
];

function sectionHeader(root: Node, title: string, description: string): void {
    root.appendChild(panel({ paddingBottom: "lg" }, text(title, { bold: true, size: "sm" })));
    root.appendChild(panel({ paddingBottom: "md" }, text(description, { color: "light", size: "xs" })));
}

export class LinkBehaviorSectionView extends VanillaView<Record<string, never>> {
    private select: SelectView<IListBoxItem> | undefined;

    public constructor(props: Record<string, never>) {
        super(props, createSectionRoot("settings-section"));
    }

    protected onMount(): void {
        const host = panel({ maxWidth: 300 });
        const props = this.selectProps();
        this.select = this.child(new SelectView(props));
        host.append(this.select.root);
        this.select.mount();
        this.root.append(host);
        const subscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "link-open-behavior") this.select?.update(this.selectProps());
        });
        this.own(() => subscription.dispose());
    }

    protected onDispose(): void {
        this.select = undefined;
    }

    private selectProps(): SelectViewProps<IListBoxItem> {
        const value = settings.get("link-open-behavior");
        return { items: LINK_ITEMS, value: LINK_ITEMS.find((item) => item.value === value) ?? null, onChange: (item) => settings.set("link-open-behavior", item.value as "default-browser" | "internal-browser") };
    }
}

export class WindowBehaviorSectionView extends VanillaView<Record<string, never>> {
    private checkbox: CheckboxView | undefined;
    private description: HTMLSpanElement | undefined;

    public constructor(props: Record<string, never>) {
        super(props, createSectionRoot("settings-section"));
    }

    protected onMount(): void {
        sectionHeader(this.root, "Window Behavior", "What happens when you close the last Persephone window.");
        const row = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "md" });
        this.checkbox = this.child(new CheckboxView(this.checkboxProps()));
        row.append(this.checkbox.root);
        this.checkbox.mount();
        this.root.append(row);
        const descriptionPanel = panel({ paddingBottom: "lg" });
        this.description = text("", { color: "light", size: "xs" });
        descriptionPanel.append(this.description);
        this.root.append(descriptionPanel);
        this.sync();
        const subscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "window.close-to-tray") this.sync();
        });
        this.own(() => subscription.dispose());
    }

    protected onDispose(): void {
        this.checkbox = undefined;
        this.description = undefined;
    }

    private checkboxProps(): CheckboxProps {
        const closeToTray = settings.get("window.close-to-tray");
        return { checked: closeToTray, onChange: () => settings.set("window.close-to-tray", !settings.get("window.close-to-tray")), children: "Keep running in system tray" };
    }

    private sync(): void {
        const closeToTray = settings.get("window.close-to-tray");
        this.checkbox?.update(this.checkboxProps());
        if (this.description) {
            this.description.textContent = closeToTray
                ? "Closing the last window hides it — click the tray icon to bring it back. Background services stay running."
                : "Closing the last window quits Persephone. Background services (MCP server, Mneme) stop with it.";
        }
    }
}

interface GitIntegrationState { probe: { installed: boolean; version?: string } | null; }

class GitIntegrationModel extends TComponentModel<GitIntegrationState, { gitEnabled: boolean }> {
    setProbe = (probe: GitIntegrationState["probe"]): void => this.state.update((state) => { state.probe = probe; });

    init(): void {
        this.effect(() => {
            if (!this.props.gitEnabled) {
                queueMicrotask(() => { if (this.isLive) this.setProbe(null); });
                return;
            }
            let alive = true;
            void import("../../../api/git")
                .then(({ git }) => git.probe())
                .then((result) => { if (alive) this.setProbe(result); })
                .catch(() => { if (alive) this.setProbe({ installed: false }); });
            return () => { alive = false; };
        }, () => [this.props.gitEnabled]);
    }
}

class GitStatusView extends VanillaView<{ probe: NonNullable<GitIntegrationState["probe"]> }> {
    private dot: DotView | undefined;

    public constructor(props: { probe: NonNullable<GitIntegrationState["probe"]> }) {
        const root = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        super(props, root);
    }

    protected onMount(): void {
        this.dot = this.child(new DotView({ size: "sm", color: this.props.probe.installed ? "success" : "neutral" }));
        this.root.append(this.dot.root, text(this.props.probe.installed ? `Git ${this.props.probe.version ?? ""} detected`.trim() : "git not found on PATH — install git or fix PATH", { size: "sm", color: "light" }));
        this.dot.mount();
    }
}

export class GitIntegrationSectionView extends VanillaView<Record<string, never>> {
    private model: GitIntegrationModel | undefined;
    private checkbox: CheckboxView | undefined;
    private statusSwap: SubtreeSwap<string> | undefined;

    public constructor(props: Record<string, never>) {
        super(props, createSectionRoot("settings-section"));
    }

    protected onMount(): void {
        sectionHeader(this.root, "Git Integration", "Enable Git Tree and File Diff editors. Off by default — requires git installed and on PATH.");
        const model = new GitIntegrationModel(new TComponentState({ probe: null }));
        this.model = model;
        model.setPropsInternal({ gitEnabled: settings.get("git.enabled") });
        model._initInternal();

        const row = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        this.checkbox = this.child(new CheckboxView({ checked: model.props.gitEnabled, onChange: () => settings.set("git.enabled", !settings.get("git.enabled")), children: "Enable Git integration" }));
        row.append(this.checkbox.root);
        this.checkbox.mount();
        this.root.append(row);
        const host = document.createElement("div");
        host.style.display = "contents";
        this.root.append(host);
        this.statusSwap = new SubtreeSwap(host);
        this.own(() => this.statusSwap?.dispose());
        this.own(() => model.onUnmountInternal());
        this.bind(model.state, (state) => state, (state) => this.sync(state));
        const subscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "git.enabled") {
                model.setPropsInternal({ gitEnabled: settings.get("git.enabled") });
                this.sync(model.state.get());
            }
        });
        this.own(() => subscription.dispose());
    }

    protected onDispose(): void {
        this.model = undefined;
        this.checkbox = undefined;
        this.statusSwap = undefined;
    }

    private sync(state: GitIntegrationState): void {
        const model = this.model;
        if (!model) return;
        this.checkbox?.update({ checked: model.props.gitEnabled, onChange: () => settings.set("git.enabled", !settings.get("git.enabled")), children: "Enable Git integration" });
        const probe = model.props.gitEnabled ? state.probe : null;
        if (probe) {
            this.statusSwap?.set(`${probe.installed}-${probe.version ?? ""}`, () => {
                const view = new GitStatusView({ probe });
                view.mount();
                return view;
            });
        } else this.statusSwap?.clear();
    }
}

export class BoardVarsSectionView extends VanillaView<Record<string, never>> {
    private valuePanel: HTMLDivElement | undefined;
    private row: HTMLDivElement | undefined;
    private unlinkButton: ButtonView | undefined;
    private openButton: ButtonView | undefined;

    public constructor(props: Record<string, never>) { super(props, createSectionRoot("settings-section")); }

    protected onMount(): void {
        sectionHeader(this.root, "Board Environment Variables", "File storing per-board variables/secrets (.env.json), kept outside board folders.");
        this.valuePanel = panel({ flex: true, minWidth: 0, paddingY: "sm", paddingX: "md", background: "dark", border: true, rounded: "sm", overflow: "hidden" });
        const row = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        this.row = row;
        row.append(this.valuePanel);
        const browse = new ButtonView({ variant: "link", size: "sm", background: "light", onClick: () => void this.handleBrowse(), children: "Browse..." });
        const create = new ButtonView({ variant: "link", size: "sm", background: "light", onClick: () => void this.handleCreate(), children: "Create..." });
        this.child(browse); this.child(create);
        row.append(browse.root, create.root);
        browse.mount(); create.mount();
        this.openButton = this.child(new ButtonView({ disabled: true, onClick: () => void app.openRawLink(settings.get("board-vars.file"), { editor: "env-vars-view" }), children: "Open Environment Variables" }));
        const openRow = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        openRow.append(this.openButton.root);
        this.openButton.mount();
        this.root.append(row, openRow);
        this.sync();
        const subscription = settings.onChanged.subscribe(({ key }) => { if (key === "board-vars.file") this.sync(); });
        this.own(() => subscription.dispose());
    }

    protected onDispose(): void { this.valuePanel = undefined; this.row = undefined; this.unlinkButton = undefined; this.openButton = undefined; }

    private sync(): void {
        const filePath = settings.get("board-vars.file");
        this.valuePanel?.replaceChildren(filePath ? settingsPath(filePath) : text("Not configured yet", { size: "sm", italic: true, color: "light" }));
        if (filePath && !this.unlinkButton) {
            const unlinkButton = this.child(new ButtonView({ variant: "link", size: "sm", background: "light", onClick: () => settings.set("board-vars.file", ""), children: "Unlink" }));
            this.unlinkButton = unlinkButton;
            this.row?.append(unlinkButton.root);
            unlinkButton.mount();
        } else if (!filePath && this.unlinkButton) {
            this.releaseChild(this.unlinkButton);
            this.unlinkButton = undefined;
        }
        this.openButton?.update({ disabled: !filePath, onClick: () => void app.openRawLink(filePath, { editor: "env-vars-view" }), children: "Open Environment Variables" });
    }

    private async handleBrowse(): Promise<void> {
        const { fs } = await import("../../../api/fs");
        const picked = await fs.showOpenDialog({ title: "Select environment variables file", defaultPath: settings.get("board-vars.file") || undefined, filters: [{ name: "Env JSON", extensions: ["env.json"] }, { name: "JSON", extensions: ["json"] }] });
        if (picked?.[0]) settings.set("board-vars.file", picked[0]);
    }

    private async handleCreate(): Promise<void> {
        const { showCreateBoardVarsStorageDialog } = await import("../../../ui/dialogs/CreateBoardVarsStorageDialog");
        await showCreateBoardVarsStorageDialog();
    }
}

interface LibraryPathConfig {
    pathKey: "script-library.path" | "drawing.library-path";
    title: string;
    description: string;
    emptyText: string;
    browse: () => Promise<void>;
    clearLabel: string;
}

class LibraryPathSectionView extends VanillaView<Record<string, never>> {
    private readonly config: LibraryPathConfig;
    private valuePanel: HTMLDivElement | undefined;
    private row: HTMLDivElement | undefined;
    private clearButton: ButtonView | undefined;

    public constructor(_props: Record<string, never>, config: LibraryPathConfig) {
        super(_props, createSectionRoot("settings-section"));
        this.config = config;
    }

    protected onMount(): void {
        sectionHeader(this.root, this.config.title, this.config.description);
        const row = panel({ direction: "row", align: "center", gap: "md" });
        this.row = row;
        this.valuePanel = panel({ flex: true, minWidth: 0, paddingY: "sm", paddingX: "md", background: "dark", border: true, rounded: "sm", overflow: "hidden" });
        row.append(this.valuePanel);
        const browse = this.child(new ButtonView({ variant: "link", size: "sm", background: "light", onClick: () => void this.config.browse(), children: "Browse..." }));
        row.append(browse.root);
        browse.mount();
        this.root.append(row);
        this.sync();
        const subscription = settings.onChanged.subscribe(({ key }) => { if (key === this.config.pathKey) this.sync(); });
        this.own(() => subscription.dispose());
    }

    protected onDispose(): void { this.valuePanel = undefined; this.row = undefined; this.clearButton = undefined; }

    private sync(): void {
        const value = settings.get(this.config.pathKey);
        this.valuePanel?.replaceChildren(value ? settingsPath(value) : text(this.config.emptyText, { size: "sm", italic: true, color: "light" }));
        if (value && !this.clearButton) {
            const clearButton = this.child(new ButtonView({ variant: "link", size: "sm", background: "light", onClick: () => settings.set(this.config.pathKey, ""), children: this.config.clearLabel }));
            this.clearButton = clearButton;
            this.row?.append(clearButton.root);
            clearButton.mount();
        } else if (!value && this.clearButton) {
            this.releaseChild(this.clearButton);
            this.clearButton = undefined;
        }
    }
}

export class ScriptLibrarySectionView extends LibraryPathSectionView {
    public constructor(props: Record<string, never>) {
        super(props, { pathKey: "script-library.path", title: "Script Library", description: "Folder for saved scripts and reusable modules", emptyText: "Not linked", browse: async () => { const { showLibrarySetupDialog } = await import("../../../ui/dialogs/LibrarySetupDialog"); showLibrarySetupDialog(); }, clearLabel: "Unlink" });
    }
}

export class DrawingLibrarySectionView extends LibraryPathSectionView {
    public constructor(props: Record<string, never>) {
        super(props, { pathKey: "drawing.library-path", title: "Drawing Library", description: "Folder for Excalidraw library items (reusable shapes)", emptyText: "Default (auto)", browse: async () => { const result = await api.showOpenFolderDialog({ title: "Select Drawing Library Folder", defaultPath: settings.get("drawing.library-path") || undefined }); if (result?.[0]) settings.set("drawing.library-path", result[0]); }, clearLabel: "Reset" });
    }
}

class VideoPlayerModel extends TComponentModel<{ portValue: string }, { videoStreamPort: number }> {
    setPortValue = (portValue: string): void => this.state.update((state) => { state.portValue = portValue; });

    init(): void {
        this.effect(() => {
            const portValue = String(this.props.videoStreamPort);
            queueMicrotask(() => { if (this.isLive && this.state.get().portValue !== portValue) this.setPortValue(portValue); });
        }, () => [this.props.videoStreamPort]);
    }
}

export class VideoPlayerSectionView extends VanillaView<Record<string, never>> {
    private model: VideoPlayerModel | undefined;
    private valuePanel: HTMLDivElement | undefined;
    private clearButton: IconButtonView | undefined;
    private input: InputView | undefined;

    public constructor(props: Record<string, never>) { super(props, createSectionRoot("settings-section")); }

    protected onMount(): void {
        sectionHeader(this.root, "Video Player", "VLC integration and local video streaming server settings");
        const model = new VideoPlayerModel(new TComponentState({ portValue: String(settings.get("video-stream.port")) }));
        this.model = model;
        model.setPropsInternal({ videoStreamPort: settings.get("video-stream.port") });
        model._initInternal();
        const outer = panel({ direction: "column", rounded: "sm", background: "dark" });
        const pathRow = panel({ direction: "row", align: "center", gap: "md", paddingTop: "xs", paddingRight: "md", paddingBottom: "sm", paddingLeft: "xxl" });
        this.valuePanel = document.createElement("div");
        this.valuePanel.style.display = "contents";
        this.listen(this.valuePanel, "click", this.onVlcPathClick);
        pathRow.append(settingsFieldLabel("vlc.exe:"), this.valuePanel);
        const portRow = panel({ direction: "row", align: "center", gap: "md", paddingTop: "xs", paddingRight: "md", paddingBottom: "sm", paddingLeft: "xxl" });
        this.input = this.child(new InputView(this.inputProps()));
        portRow.append(settingsFieldLabel("Stream port:"), this.input.root);
        this.input.mount();
        outer.append(pathRow, portRow);
        this.root.append(outer);
        this.sync();
        this.own(() => model.onUnmountInternal());
        this.bind(model.state, (state) => state.portValue, () => this.input?.update(this.inputProps()));
        const subscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "vlc-path" || key === "video-stream.port") {
                model.setPropsInternal({ videoStreamPort: settings.get("video-stream.port") });
                this.sync();
            }
        });
        this.own(() => subscription.dispose());
    }

    protected onDispose(): void { this.model = undefined; this.valuePanel = undefined; this.clearButton = undefined; this.input = undefined; }

    private inputProps(): InputProps {
        const model = this.model;
        return { size: "sm", width: 56, type: "text", value: model?.state.get().portValue ?? String(settings.get("video-stream.port")), onChange: (value) => model?.setPortValue(value), onBlur: () => this.handlePortBlur(), onKeyDown: (event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); } };
    }

    private sync(): void {
        if (!this.valuePanel) return;
        if (this.clearButton) { this.releaseChild(this.clearButton); this.clearButton = undefined; }
        this.valuePanel.replaceChildren();
        const path = settings.get("vlc-path");
        const filename = path ? fpBasename(path) : "";
        if (filename) {
            const link = settingsLink(filename); link.title = path;
            this.valuePanel.append(link);
            this.clearButton = this.child(new IconButtonView({ size: "sm", icon: "close", title: "Remove VLC path", onClick: () => settings.set("vlc-path", "") }));
            this.valuePanel.append(this.clearButton.root); this.clearButton.mount();
        } else {
            const placeholder = settingsPlaceholder("Auto-detect"); this.valuePanel.append(placeholder);
        }
        this.input?.update(this.inputProps());
    }

    private readonly onVlcPathClick = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.closest('[data-type="settings-link"], [data-type="settings-placeholder"]')) return;
        void this.handleBrowseVlc();
    };

    private async handleBrowseVlc(): Promise<void> {
        const result = await api.showOpenFileDialog({ title: "Select vlc.exe", filters: [{ name: "Executable Files", extensions: ["exe"] }] });
        if (result?.[0]) settings.set("vlc-path", result[0]);
    }

    private handlePortBlur(): void {
        const model = this.model;
        const value = model?.state.get().portValue ?? "";
        const port = parseInt(value, 10);
        if (port >= 1024 && port <= 65535) settings.set("video-stream.port", port);
        else model?.setPortValue(String(settings.get("video-stream.port")));
    }
}

export class TerminalSectionView extends VanillaView<Record<string, never>> {
    private select: SelectView<IListBoxItem> | undefined;

    public constructor(props: Record<string, never>) { super(props, createSectionRoot("settings-section")); }

    protected onMount(): void {
        sectionHeader(this.root, "Terminal", "Terminal opened by \"Open Terminal here\" on folders. Auto-detected on first use — change it here (e.g. to pwsh after installing PowerShell 7).");
        const host = panel({ maxWidth: 360 });
        this.select = this.child(new SelectView(this.selectProps()));
        host.append(this.select.root); this.select.mount(); this.root.append(host);
        const subscription = settings.onChanged.subscribe(({ key }) => { if (key === "terminal.command") this.select?.update(this.selectProps()); });
        this.own(() => subscription.dispose());
    }

    protected onDispose(): void { this.select = undefined; }

    private selectProps(): SelectViewProps<IListBoxItem> {
        const command = settings.get("terminal.command");
        const items = command && !TERMINAL_ITEMS.some((item) => item.value === command) ? [...TERMINAL_ITEMS, { value: command, label: command }] : TERMINAL_ITEMS;
        return { items, value: items.find((item) => item.value === command) ?? items[0], onChange: (item) => settings.set("terminal.command", (item?.value as string) ?? "") };
    }
}

export { LinkBehaviorSectionView as LinkBehaviorSection, WindowBehaviorSectionView as WindowBehaviorSection, GitIntegrationSectionView as GitIntegrationSection, BoardVarsSectionView as BoardVarsSection, ScriptLibrarySectionView as ScriptLibrarySection, DrawingLibrarySectionView as DrawingLibrarySection, VideoPlayerSectionView as VideoPlayerSection, TerminalSectionView as TerminalSection };
