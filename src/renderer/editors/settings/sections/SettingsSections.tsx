import { settings } from "../../../api/settings";
import { app } from "../../../api/app";
import { api } from "../../../../ipc/renderer/api";
import { fpBasename } from "../../../core/utils/file-path";
import { CloseIcon } from "../../../theme/icons";
import color from "../../../theme/color";
import { Panel } from "../../../uikit/Panel";
import { Button } from "../../../uikit/Button";
import { IconButton } from "../../../uikit/IconButton";
import { Input } from "../../../uikit/Input";
import { Select } from "../../../uikit/Select";
import { Checkbox } from "../../../uikit/Checkbox";
import { Text } from "../../../uikit/Text";
import { Dot } from "../../../uikit/Dot";
import type { IListBoxItem } from "../../../uikit/ListBox";
import { TComponentModel, useComponentModel } from "../../../core/state/model";

const labelTextStyle: React.CSSProperties = { fontSize: 11, color: color.text.light };
const fieldLabelStyle: React.CSSProperties = {
    fontSize: 11, color: color.text.dark, minWidth: 42, flexShrink: 0,
};
const linkStyle: React.CSSProperties = {
    cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const placeholderStyle: React.CSSProperties = { fontStyle: "italic", cursor: "pointer" };
const pathDisplayStyle: React.CSSProperties = {
    fontSize: 12, fontFamily: "monospace", color: color.text.default,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

interface GitIntegrationState {
    probe: { installed: boolean; version?: string } | null;
}

class GitIntegrationModel extends TComponentModel<GitIntegrationState, { gitEnabled: boolean }> {
    setProbe = (probe: { installed: boolean; version?: string } | null) => {
        this.state.update((s) => { s.probe = probe; });
    };

    init() {
        this.effect(() => {
            if (!this.props.gitEnabled) {
                queueMicrotask(() => {
                    if (this.isLive) this.setProbe(null);
                });
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

interface VideoPlayerState {
    portValue: string;
}

class VideoPlayerModel extends TComponentModel<VideoPlayerState, { videoStreamPort: number }> {
    setPortValue = (portValue: string) => {
        this.state.update((s) => { s.portValue = portValue; });
    };

    init() {
        this.effect(() => {
            const portValue = String(this.props.videoStreamPort);
            queueMicrotask(() => {
                if (this.isLive && this.state.get().portValue !== portValue) {
                    this.setPortValue(portValue);
                }
            });
        }, () => [this.props.videoStreamPort]);
    }
}

const browseVlcExe = async (): Promise<string | undefined> => {
    const result = await api.showOpenFileDialog({
        title: "Select vlc.exe",
        filters: [{ name: "Executable Files", extensions: ["exe"] }],
    });
    return result?.[0];
};

export function LinkBehaviorSection() {
    const linkBehavior = settings.use("link-open-behavior");
    const items: IListBoxItem[] = [
        { value: "default-browser", label: "Open in default OS browser" },
        { value: "internal-browser", label: "Open in internal Browser tab" },
    ];
    return (
        <Panel maxWidth={300}>
            <Select
                items={items}
                value={items.find((item) => item.value === linkBehavior) ?? null}
                onChange={(item) => settings.set(
                    "link-open-behavior",
                    item.value as "default-browser" | "internal-browser",
                )}
            />
        </Panel>
    );
}

export function WindowBehaviorSection() {
    const closeToTray = settings.use("window.close-to-tray");
    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Window Behavior</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">What happens when you close the last Persephone window.</Text>
            </Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="md">
                <Checkbox checked={closeToTray} onChange={() => settings.set("window.close-to-tray", !closeToTray)}>
                    Keep running in system tray
                </Checkbox>
            </Panel>
            <Panel paddingBottom="lg">
                <Text color="light" size="xs">
                    {closeToTray
                        ? "Closing the last window hides it — click the tray icon to bring it back. Background services stay running."
                        : "Closing the last window quits Persephone. Background services (MCP server, Mneme) stop with it."}
                </Text>
            </Panel>
        </>
    );
}

export function GitIntegrationSection() {
    const gitEnabled = settings.use("git.enabled");
    const model = useComponentModel({ gitEnabled }, GitIntegrationModel, { probe: null });
    const { probe } = model.state.use();

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Git Integration</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    Enable Git Tree and File Diff editors. Off by default — requires git installed and on PATH.
                </Text>
            </Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Checkbox checked={gitEnabled} onChange={() => settings.set("git.enabled", !gitEnabled)}>
                    Enable Git integration
                </Checkbox>
            </Panel>
            {gitEnabled && probe && (
                <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                    <Dot size="sm" color={probe.installed ? "success" : "neutral"} />
                    <Text size="sm" color="light">
                        {probe.installed ? `Git ${probe.version ?? ""} detected`.trim() : "git not found on PATH — install git or fix PATH"}
                    </Text>
                </Panel>
            )}
        </>
    );
}

export function BoardVarsSection() {
    const filePath = settings.use("board-vars.file");
    const handleBrowse = async () => {
        const { fs } = await import("../../../api/fs");
        const picked = await fs.showOpenDialog({
            title: "Select environment variables file",
            defaultPath: filePath || undefined,
            filters: [{ name: "Env JSON", extensions: ["env.json"] }, { name: "JSON", extensions: ["json"] }],
        });
        if (picked?.[0]) settings.set("board-vars.file", picked[0]);
    };
    const handleCreate = async () => {
        const { showCreateBoardVarsStorageDialog } = await import("../../../ui/dialogs/CreateBoardVarsStorageDialog");
        await showCreateBoardVarsStorageDialog();
    };
    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Board Environment Variables</Text></Panel>
            <Panel paddingBottom="md"><Text color="light" size="xs">File storing per-board variables/secrets (.env.json), kept outside board folders.</Text></Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Panel flex minWidth={0} paddingY="sm" paddingX="md" background="dark" border rounded="sm" overflow="hidden">
                    {filePath ? <span style={pathDisplayStyle} title={filePath}>{filePath}</span> : <Text size="sm" italic color="light">Not configured yet</Text>}
                </Panel>
                <Button variant="link" size="sm" background="light" onClick={() => void handleBrowse()}>Browse...</Button>
                <Button variant="link" size="sm" background="light" onClick={() => void handleCreate()}>Create...</Button>
                {filePath && <Button variant="link" size="sm" background="light" onClick={() => settings.set("board-vars.file", "")}>Unlink</Button>}
            </Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Button disabled={!filePath} onClick={() => void app.openRawLink(filePath, { editor: "env-vars-view" })}>Open Environment Variables</Button>
            </Panel>
        </>
    );
}

export function ScriptLibrarySection() {
    const libraryPath = settings.use("script-library.path");
    const handleBrowse = async () => {
        const { showLibrarySetupDialog } = await import("../../../ui/dialogs/LibrarySetupDialog");
        showLibrarySetupDialog();
    };
    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Script Library</Text></Panel>
            <Panel paddingBottom="md"><Text color="light" size="xs">Folder for saved scripts and reusable modules</Text></Panel>
            <Panel direction="row" align="center" gap="md">
                <Panel flex minWidth={0} paddingY="sm" paddingX="md" background="dark" border rounded="sm" overflow="hidden">
                    {libraryPath ? <span style={pathDisplayStyle} title={libraryPath}>{libraryPath}</span> : <Text size="sm" italic color="light">Not linked</Text>}
                </Panel>
                <Button variant="link" size="sm" background="light" onClick={() => void handleBrowse()}>Browse...</Button>
                {libraryPath && <Button variant="link" size="sm" background="light" onClick={() => settings.set("script-library.path", "")}>Unlink</Button>}
            </Panel>
        </>
    );
}

export function DrawingLibrarySection() {
    const libraryPath = settings.use("drawing.library-path");
    const handleBrowse = async () => {
        const result = await api.showOpenFolderDialog({ title: "Select Drawing Library Folder", defaultPath: libraryPath || undefined });
        if (result?.[0]) settings.set("drawing.library-path", result[0]);
    };
    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Drawing Library</Text></Panel>
            <Panel paddingBottom="md"><Text color="light" size="xs">Folder for Excalidraw library items (reusable shapes)</Text></Panel>
            <Panel direction="row" align="center" gap="md">
                <Panel flex minWidth={0} paddingY="sm" paddingX="md" background="dark" border rounded="sm" overflow="hidden">
                    {libraryPath ? <span style={pathDisplayStyle} title={libraryPath}>{libraryPath}</span> : <Text size="sm" italic color="light">Default (auto)</Text>}
                </Panel>
                <Button variant="link" size="sm" background="light" onClick={() => void handleBrowse()}>Browse...</Button>
                {libraryPath && <Button variant="link" size="sm" background="light" onClick={() => settings.set("drawing.library-path", "")}>Reset</Button>}
            </Panel>
        </>
    );
}

export function VideoPlayerSection() {
    const vlcPath = settings.use("vlc-path");
    const videoStreamPort = settings.use("video-stream.port");
    const model = useComponentModel({ videoStreamPort }, VideoPlayerModel, { portValue: String(videoStreamPort) });
    const { portValue } = model.state.use();
    const handleBrowseVlc = async () => {
        const filePath = await browseVlcExe();
        if (filePath) settings.set("vlc-path", filePath);
    };
    const handlePortBlur = () => {
        const num = parseInt(portValue, 10);
        if (num >= 1024 && num <= 65535) settings.set("video-stream.port", num);
        else model.setPortValue(String(videoStreamPort));
    };
    const vlcFilename = vlcPath ? fpBasename(vlcPath) : "";
    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Video Player</Text></Panel>
            <Panel paddingBottom="md"><Text color="light" size="xs">VLC integration and local video streaming server settings</Text></Panel>
            <Panel direction="column" rounded="sm" background="dark">
                <Panel direction="row" align="center" gap="md" paddingTop="xs" paddingRight="md" paddingBottom="sm" paddingLeft="xxl">
                    <span style={fieldLabelStyle}>vlc.exe:</span>
                    {vlcFilename
                        ? <span style={{ ...labelTextStyle, ...linkStyle }} title={vlcPath} onClick={() => void handleBrowseVlc()}>{vlcFilename}</span>
                        : <span style={{ ...labelTextStyle, ...placeholderStyle }} onClick={() => void handleBrowseVlc()}>Auto-detect</span>}
                    {vlcFilename && <IconButton size="sm" icon={<CloseIcon />} title="Remove VLC path" onClick={() => settings.set("vlc-path", "")} />}
                </Panel>
                <Panel direction="row" align="center" gap="md" paddingTop="xs" paddingRight="md" paddingBottom="sm" paddingLeft="xxl">
                    <span style={fieldLabelStyle}>Stream port:</span>
                    <Input
                        size="sm" width={56} type="text" value={portValue} onChange={model.setPortValue}
                        onBlur={handlePortBlur}
                        onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                    />
                </Panel>
            </Panel>
        </>
    );
}

const TERMINAL_ITEMS: IListBoxItem[] = [
    { value: "", label: "Auto-detect (pwsh → powershell → cmd)" },
    { value: "pwsh", label: "PowerShell 7 (pwsh)" },
    { value: "powershell", label: "Windows PowerShell (powershell)" },
    { value: "cmd", label: "Command Prompt (cmd)" },
    { value: "wt", label: "Windows Terminal (wt)" },
];

export function TerminalSection() {
    const terminalCommand = settings.use("terminal.command");
    const items = terminalCommand && !TERMINAL_ITEMS.some((item) => item.value === terminalCommand)
        ? [...TERMINAL_ITEMS, { value: terminalCommand, label: terminalCommand }]
        : TERMINAL_ITEMS;
    const selected = items.find((item) => item.value === terminalCommand) ?? items[0];
    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Terminal</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    Terminal opened by "Open Terminal here" on folders. Auto-detected on
                    first use — change it here (e.g. to pwsh after installing PowerShell 7).
                </Text>
            </Panel>
            <Panel maxWidth={360}>
                <Select items={items} value={selected} onChange={(item) => settings.set("terminal.command", (item?.value as string) ?? "")} />
            </Panel>
        </>
    );
}
