import { useCallback, useEffect, useRef, useState } from "react";
import { IEditorState, EditorType } from "../../../shared/types";
import type { EditorModel } from "../base";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import {
    SettingsEditor,
    getDefaultSettingsEditorState,
    type SettingsEditorState,
} from "./SettingsEditor";
import color from "../../theme/color";
import { settings } from "../../api/settings";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { applyTheme, getAvailableThemes } from "../../theme/themes";
import { DEFAULT_BROWSER_COLOR, TAG_COLORS } from "../../theme/palette-colors";
import { ui } from "../../api/ui";
import { getPartitionString } from "../browser/BrowserEditorModel";
import { IncognitoIcon, TorIcon } from "../../theme/language-icons";
import { CloseIcon } from "../../theme/icons";
import { api } from "../../../ipc/renderer/api";
import rendererEvents from "../../../ipc/renderer/renderer-events";
const { ipcRenderer } = require("electron");
import { fpBasename } from "../../core/utils/file-path";
import { BrowserChannel } from "../../../ipc/browser-ipc";
import { ColorizedCode } from "../shared/ColorizedCode";
import {
    Panel, Button, IconButton, Input, Textarea, Select, Checkbox,
    Divider, Text, Dot, WithMenu,
} from "../../uikit";
import type { TextareaRef, IListBoxItem, MenuItem } from "../../uikit";

// ============================================================================
// Theme Preview
// ============================================================================

interface ThemePreviewProps {
    bgDefault: string;
    bgDark: string;
    textDefault: string;
    accentColor: string;
}

function ThemePreview({ bgDefault, bgDark, textDefault, accentColor }: ThemePreviewProps) {
    return (
        <div
            style={{
                width: 80,
                height: 48,
                borderRadius: 4,
                border: `1px solid ${color.border.default}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
            <div style={{ height: 12, backgroundColor: bgDark }} />
            <div
                style={{
                    flex: 1,
                    padding: "4px 6px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    backgroundColor: bgDefault,
                }}
            >
                <div style={{ height: 3, borderRadius: 1, opacity: 0.6, backgroundColor: accentColor, width: "60%" }} />
                <div style={{ height: 3, borderRadius: 1, opacity: 0.6, backgroundColor: textDefault, width: "80%" }} />
                <div style={{ height: 3, borderRadius: 1, opacity: 0.6, backgroundColor: textDefault, width: "45%" }} />
            </div>
        </div>
    );
}

// ============================================================================
// Shared inline styles for one-off chrome (Rule 7 — plain HTML elements only)
// ============================================================================

const labelTextStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.text.light,
};

const fieldLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.text.dark,
    minWidth: 42,
    flexShrink: 0,
};

const linkStyle: React.CSSProperties = {
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const placeholderStyle: React.CSSProperties = {
    fontStyle: "italic",
    cursor: "pointer",
};

const defaultBadgeStyle: React.CSSProperties = {
    fontSize: 10,
    color: color.text.light,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    padding: "1px 6px",
    border: `1px solid ${color.border.default}`,
    borderRadius: 3,
};

const monoTextStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily: "monospace",
    padding: "4px 8px",
    backgroundColor: color.background.dark,
    borderRadius: 4,
    border: `1px solid ${color.border.default}`,
    color: color.text.default,
    userSelect: "all",
};

const configBlockStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: "monospace",
    lineHeight: 1.5,
    padding: "8px 12px",
    backgroundColor: color.background.dark,
    borderRadius: 4,
    border: `1px solid ${color.border.default}`,
    color: color.text.default,
    overflow: "auto",
    margin: 0,
};

const pathDisplayStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily: "monospace",
    color: color.text.default,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

// ============================================================================
// Browser Profiles Section
// ============================================================================

function clearPartitionData(partition: string): Promise<void> {
    return ipcRenderer.invoke(BrowserChannel.clearProfileData, partition);
}

const BOOKMARKS_FILE_FILTER = { name: "Link Files", extensions: ["link.json"] };

async function browseBookmarksFile(): Promise<string | undefined> {
    const result = await api.showOpenFileDialog({
        title: "Select Bookmarks File",
        filters: [BOOKMARKS_FILE_FILTER],
    });
    return result?.[0];
}

function BookmarksFileLine({ filePath, onBrowse, onClear }: {
    filePath: string;
    onBrowse: () => void;
    onClear: () => void;
}) {
    const filename = filePath ? fpBasename(filePath) : "";
    return (
        <Panel
            direction="row"
            align="center"
            gap="md"
            paddingTop="xs"
            paddingRight="md"
            paddingBottom="sm"
            paddingLeft="xxl"
        >
            {filename && <span style={labelTextStyle}>Bookmark file:</span>}
            <span style={labelTextStyle}>📁</span>
            {filename ? (
                <span
                    style={{ ...labelTextStyle, ...linkStyle }}
                    title={filePath}
                    onClick={onBrowse}
                >
                    {filename}
                </span>
            ) : (
                <span
                    style={{ ...labelTextStyle, ...placeholderStyle }}
                    onClick={onBrowse}
                >
                    No bookmarks file
                </span>
            )}
            {filename && (
                <IconButton
                    size="sm"
                    icon={<CloseIcon />}
                    title="Remove bookmarks file"
                    onClick={onClear}
                />
            )}
        </Panel>
    );
}

async function browseVlcExe(): Promise<string | undefined> {
    const result = await api.showOpenFileDialog({
        title: "Select vlc.exe",
        filters: [{ name: "Executable Files", extensions: ["exe"] }],
    });
    return result?.[0];
}

async function browseTorExe(): Promise<string | undefined> {
    const result = await api.showOpenFileDialog({
        title: "Select tor.exe",
        filters: [{ name: "Executable Files", extensions: ["exe"] }],
    });
    return result?.[0];
}

function TorProfileRow() {
    const torExePath = settings.use("tor.exe-path");
    const torSocksPort = settings.use("tor.socks-port");
    const torBookmarksFile = settings.use("tor.bookmarks-file");
    const [portValue, setPortValue] = useState(String(torSocksPort));

    useEffect(() => {
        setPortValue(String(torSocksPort));
    }, [torSocksPort]);

    const handleBrowseTorExe = async () => {
        const filePath = await browseTorExe();
        if (filePath) {
            settings.set("tor.exe-path", filePath);
        }
    };

    const handleClearTorExe = () => {
        settings.set("tor.exe-path", "");
    };

    const handleBrowseTorBookmarks = async () => {
        const filePath = await browseBookmarksFile();
        if (filePath) {
            settings.set("tor.bookmarks-file", filePath);
        }
    };

    const handlePortBlur = () => {
        const num = parseInt(portValue, 10);
        if (num >= 1024 && num <= 65535) {
            settings.set("tor.socks-port", num);
        } else {
            setPortValue(String(torSocksPort));
        }
    };

    const handlePortKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
        }
    };

    const torExeFilename = torExePath ? fpBasename(torExePath) : "";

    return (
        <Panel direction="column" rounded="sm" background="dark">
            <Panel direction="row" align="center" gap="md" paddingX="md" paddingY="xs">
                <TorIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
                <Panel flex>
                    <Text size="sm">Tor</Text>
                </Panel>
            </Panel>
            <Panel
                direction="row"
                align="center"
                gap="md"
                paddingTop="xs"
                paddingRight="md"
                paddingBottom="sm"
                paddingLeft="xxl"
            >
                <span style={fieldLabelStyle}>tor.exe:</span>
                {torExeFilename ? (
                    <span
                        style={{ ...labelTextStyle, ...linkStyle }}
                        title={torExePath}
                        onClick={handleBrowseTorExe}
                    >
                        {torExeFilename}
                    </span>
                ) : (
                    <span
                        style={{ ...labelTextStyle, ...placeholderStyle }}
                        onClick={handleBrowseTorExe}
                    >
                        Not configured
                    </span>
                )}
                {torExeFilename && (
                    <IconButton
                        size="sm"
                        icon={<CloseIcon />}
                        title="Remove tor.exe path"
                        onClick={handleClearTorExe}
                    />
                )}
            </Panel>
            <Panel
                direction="row"
                align="center"
                gap="md"
                paddingTop="xs"
                paddingRight="md"
                paddingBottom="sm"
                paddingLeft="xxl"
            >
                <span style={fieldLabelStyle}>Port:</span>
                <Input
                    size="sm"
                    width={56}
                    type="text"
                    value={portValue}
                    onChange={setPortValue}
                    onBlur={handlePortBlur}
                    onKeyDown={handlePortKeyDown}
                />
            </Panel>
            <BookmarksFileLine
                filePath={torBookmarksFile}
                onBrowse={handleBrowseTorBookmarks}
                onClear={() => settings.set("tor.bookmarks-file", "")}
            />
        </Panel>
    );
}

function BrowserProfilesSection() {
    const profiles = settings.use("browser-profiles");
    const defaultProfile = settings.use("browser-default-profile");
    const defaultBookmarksFile = settings.use("browser-default-bookmarks-file");
    const incognitoBookmarksFile = settings.use("browser-incognito-bookmarks-file");
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState(TAG_COLORS[0].hex);
    const [clearedProfile, setClearedProfile] = useState<string | null>(null);

    const handleAddProfile = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        const exists = profiles.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) return;
        settings.set("browser-profiles", [...profiles, { name: trimmed, color: newColor }]);
        setNewName("");
        setNewColor(TAG_COLORS[(profiles.length + 1) % TAG_COLORS.length].hex);
    };

    const handleRemoveProfile = async (name: string) => {
        const result = await ui.confirm(
            `Delete profile "${name}"? All browsing data (cookies, storage, cache) for this profile will be permanently removed.`,
            { title: "Delete Profile", buttons: ["Delete", "Cancel"] },
        );
        if (result !== "Delete") return;
        const partition = getPartitionString(name, false);
        await clearPartitionData(partition);
        settings.set("browser-profiles", profiles.filter((p) => p.name !== name));
        if (defaultProfile === name) {
            settings.set("browser-default-profile", "");
        }
    };

    const handleClearData = async (profileName: string) => {
        const label = profileName || "Default";
        const result = await ui.confirm(
            `Clear all browsing data (cookies, storage, cache) for the "${label}" profile?`,
            { title: "Clear Profile Data", buttons: ["Clear", "Cancel"] },
        );
        if (result !== "Clear") return;
        const partition = getPartitionString(profileName, false);
        await clearPartitionData(partition);
        setClearedProfile(profileName);
        setTimeout(() => setClearedProfile((prev) => prev === profileName ? null : prev), 2000);
    };

    const handleSetDefault = (name: string) => {
        settings.set("browser-default-profile", defaultProfile === name ? "" : name);
    };

    const handleColorChange = (name: string, newProfileColor: string) => {
        settings.set("browser-profiles", profiles.map((p) =>
            p.name === name ? { ...p, color: newProfileColor } : p,
        ));
    };

    const getColorMenuItems = (profileName: string, currentColor: string): MenuItem[] =>
        TAG_COLORS.map((c) => ({
            label: c.name,
            icon: <Dot size={10} color={c.hex} />,
            onClick: () => handleColorChange(profileName, c.hex),
            selected: currentColor === c.hex,
        }));

    const handleBrowseDefaultBookmarks = async () => {
        const filePath = await browseBookmarksFile();
        if (filePath) settings.set("browser-default-bookmarks-file", filePath);
    };

    const handleBrowseProfileBookmarks = async (profileName: string) => {
        const filePath = await browseBookmarksFile();
        if (filePath) {
            settings.set("browser-profiles", profiles.map((p) =>
                p.name === profileName ? { ...p, bookmarksFile: filePath } : p,
            ));
        }
    };

    const handleBrowseIncognitoBookmarks = async () => {
        const filePath = await browseBookmarksFile();
        if (filePath) settings.set("browser-incognito-bookmarks-file", filePath);
    };

    const handleClearProfileBookmarks = (profileName: string) => {
        settings.set("browser-profiles", profiles.map((p) =>
            p.name === profileName ? { ...p, bookmarksFile: undefined } : p,
        ));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleAddProfile();
        }
    };

    const canAdd = newName.trim().length > 0
        && !profiles.some((p) => p.name.toLowerCase() === newName.trim().toLowerCase());

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Browser Profiles</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    Isolated browsing sessions with separate cookies, storage, and cache
                </Text>
            </Panel>

            <Panel direction="column" gap="sm" paddingBottom="lg">
                {/* Default profile */}
                <Panel direction="column" rounded="sm" background="dark">
                    <Panel direction="row" align="center" gap="md" paddingX="md" paddingY="xs">
                        <Dot size="md" color={DEFAULT_BROWSER_COLOR} bordered />
                        <Panel flex>
                            <Text size="sm">Default</Text>
                        </Panel>
                        {defaultProfile === "" ? (
                            <span style={defaultBadgeStyle}>default</span>
                        ) : (
                            <Button variant="ghost" size="sm" background="light" onClick={() => handleSetDefault("")}>
                                set default
                            </Button>
                        )}
                        {clearedProfile === "" && (
                            <Text color="success" size="xs">Cleared</Text>
                        )}
                        <Button variant="ghost" size="sm" background="light" onClick={() => handleClearData("")}>
                            clear data
                        </Button>
                    </Panel>
                    <BookmarksFileLine
                        filePath={defaultBookmarksFile}
                        onBrowse={handleBrowseDefaultBookmarks}
                        onClear={() => settings.set("browser-default-bookmarks-file", "")}
                    />
                </Panel>

                {/* Custom profiles */}
                {profiles.map((profile) => (
                    <Panel key={profile.name} direction="column" rounded="sm" background="dark">
                        <Panel direction="row" align="center" gap="md" paddingX="md" paddingY="xs">
                            <WithMenu items={getColorMenuItems(profile.name, profile.color)}>
                                {(setOpen) => (
                                    <Dot
                                        size="md"
                                        color={profile.color}
                                        bordered
                                        title="Change color"
                                        onClick={(e) => setOpen(e.currentTarget)}
                                    />
                                )}
                            </WithMenu>
                            <Panel flex>
                                <Text size="sm">{profile.name}</Text>
                            </Panel>
                            {defaultProfile === profile.name ? (
                                <span style={defaultBadgeStyle}>default</span>
                            ) : (
                                <Button variant="ghost" size="sm" background="light" onClick={() => handleSetDefault(profile.name)}>
                                    set default
                                </Button>
                            )}
                            {clearedProfile === profile.name && (
                                <Text color="success" size="xs">Cleared</Text>
                            )}
                            <Button variant="ghost" size="sm" background="light" onClick={() => handleClearData(profile.name)}>
                                clear data
                            </Button>
                            <IconButton
                                size="sm"
                                icon={<CloseIcon />}
                                title="Remove profile"
                                onClick={() => handleRemoveProfile(profile.name)}
                            />
                        </Panel>
                        <BookmarksFileLine
                            filePath={profile.bookmarksFile || ""}
                            onBrowse={() => handleBrowseProfileBookmarks(profile.name)}
                            onClear={() => handleClearProfileBookmarks(profile.name)}
                        />
                    </Panel>
                ))}

                {/* Incognito */}
                <Panel direction="column" rounded="sm" background="dark">
                    <Panel direction="row" align="center" gap="md" paddingX="md" paddingY="xs">
                        <IncognitoIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
                        <Panel flex>
                            <Text size="sm">Incognito</Text>
                        </Panel>
                    </Panel>
                    <BookmarksFileLine
                        filePath={incognitoBookmarksFile}
                        onBrowse={handleBrowseIncognitoBookmarks}
                        onClear={() => settings.set("browser-incognito-bookmarks-file", "")}
                    />
                </Panel>

                {/* Tor */}
                <TorProfileRow />
            </Panel>

            {/* Add profile form */}
            <Panel direction="column" gap="md">
                <Panel direction="row" align="center" gap="md">
                    <Panel flex>
                        <Input
                            size="sm"
                            placeholder="Profile name"
                            value={newName}
                            onChange={setNewName}
                            onKeyDown={handleKeyDown}
                        />
                    </Panel>
                    <Button variant="default" size="sm" background="light" disabled={!canAdd} onClick={handleAddProfile}>
                        Add
                    </Button>
                </Panel>
                <Text color="light" size="xs">Profile color:</Text>
                <Panel direction="row" wrap gap="md">
                    {TAG_COLORS.map((c) => (
                        <Dot
                            key={c.hex}
                            size="lg"
                            color={c.hex}
                            selected={newColor === c.hex}
                            title={c.name}
                            onClick={() => setNewColor(c.hex)}
                        />
                    ))}
                </Panel>
            </Panel>
        </>
    );
}

// ============================================================================
// Link Behavior Section
// ============================================================================

const LINK_BEHAVIOR_ITEMS: IListBoxItem[] = [
    { value: "default-browser",  label: "Open in default OS browser" },
    { value: "internal-browser", label: "Open in internal Browser tab" },
];

function LinkBehaviorSection() {
    const linkBehavior = settings.use("link-open-behavior");
    return (
        <Panel maxWidth={300}>
            <Select
                items={LINK_BEHAVIOR_ITEMS}
                value={LINK_BEHAVIOR_ITEMS.find((i) => i.value === linkBehavior) ?? null}
                onChange={(item) => settings.set(
                    "link-open-behavior",
                    item.value as "default-browser" | "internal-browser",
                )}
            />
        </Panel>
    );
}

// ============================================================================
// Default Browser Section
// ============================================================================

function DefaultBrowserSection() {
    const [registered, setRegistered] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);

    const checkStatus = useCallback(async () => {
        const result = await api.isRegisteredAsDefaultBrowser();
        setRegistered(result);
    }, []);

    // Check on mount
    useState(() => { checkStatus(); });

    const handleRegister = async () => {
        setBusy(true);
        try {
            await api.registerAsDefaultBrowser();
            await checkStatus();
        } finally {
            setBusy(false);
        }
    };

    const handleUnregister = async () => {
        setBusy(true);
        try {
            await api.unregisterAsDefaultBrowser();
            await checkStatus();
        } finally {
            setBusy(false);
        }
    };

    const handleOpenSettings = () => {
        api.openDefaultAppsSettings();
    };

    return (
        <>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    Register Persephone as a browser so it appears in Windows Default Apps
                </Text>
            </Panel>
            <Panel direction="row" align="center" gap="md" wrap>
                {registered === null ? (
                    <Text size="sm" color="light">Checking...</Text>
                ) : registered ? (
                    <>
                        <Text size="sm" color="success">Registered</Text>
                        <Button variant="link" size="sm" background="light" disabled={busy} onClick={handleUnregister}>
                            Unregister
                        </Button>
                    </>
                ) : (
                    <Button variant="link" size="sm" background="light" disabled={busy} onClick={handleRegister}>
                        Register as Default Browser
                    </Button>
                )}
                <Button variant="link" size="sm" background="light" onClick={handleOpenSettings}>
                    Open Windows Default Apps
                </Button>
            </Panel>
        </>
    );
}

// ============================================================================
// MCP Server Section
// ============================================================================

function McpSection() {
    const mcpEnabled = settings.use("mcp.enabled");
    const mcpPort = settings.use("mcp.port");
    const browserToolsEnabled = settings.use("mcp.browser-tools.enabled");
    const mnemeEnabled = settings.use("mneme.enabled");
    const mnemePort = settings.use("mneme.port");
    const [status, setStatus] = useState<{ running: boolean; url: string; clientCount: number } | null>(null);
    const [mnemeStatus, setMnemeStatus] = useState<{ running: boolean; url: string } | null>(null);
    const [portValue, setPortValue] = useState(String(mcpPort));
    const [mnemePortValue, setMnemePortValue] = useState(String(mnemePort));
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => {
        setPortValue(String(mcpPort));
    }, [mcpPort]);

    useEffect(() => {
        setMnemePortValue(String(mnemePort));
    }, [mnemePort]);

    useEffect(() => {
        api.getMcpStatus().then(setStatus).catch(() => setStatus(null));

        const sub = rendererEvents.eMcpStatusChanged.subscribe((s) => {
            setStatus(s);
        });

        return () => sub.unsubscribe();
    }, [mcpEnabled]);

    useEffect(() => {
        api.getMnemeStatus().then(setMnemeStatus).catch(() => setMnemeStatus(null));

        const sub = rendererEvents.eMnemeStatusChanged.subscribe((s) => {
            setMnemeStatus(s);
        });

        return () => sub.unsubscribe();
    }, [mnemeEnabled]);

    const handleToggle = () => {
        settings.set("mcp.enabled", !mcpEnabled);
    };

    const handleBrowserToolsToggle = () => {
        settings.set("mcp.browser-tools.enabled", !browserToolsEnabled);
    };

    const handlePortBlur = () => {
        const num = parseInt(portValue, 10);
        if (num >= 1024 && num <= 65535) {
            settings.set("mcp.port", num);
        } else {
            setPortValue(String(mcpPort));
        }
    };

    const handleMnemeToggle = () => {
        settings.set("mneme.enabled", !mnemeEnabled);
    };

    const handleMnemePortBlur = () => {
        const num = parseInt(mnemePortValue, 10);
        if (num >= 1024 && num <= 65535) {
            settings.set("mneme.port", num);
        } else {
            setMnemePortValue(String(mnemePort));
        }
    };

    const handlePortKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
        }
    };

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied((prev) => prev === label ? null : prev), 2000);
    };

    // 127.0.0.1, not "localhost": both servers bind IPv4 loopback. An IPv6-first
    // client (incl. the renderer's own fetch transport on Windows) that resolves
    // "localhost" to ::1 stalls instead of failing over — so hand out the bound IPv4.
    const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
    const mnemeUrl = `http://127.0.0.1:${mnemePort}/mcp`;
    const mcpServers: Record<string, { type: string; url: string }> = {
        "persephone": {
            type: "http",
            url: mcpUrl,
        },
    };
    if (mnemeEnabled) {
        mcpServers["mneme"] = {
            type: "http",
            url: mnemeUrl,
        };
    }
    const configJson = JSON.stringify({ mcpServers }, null, 2);

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">MCP Server</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    AI agents (Claude, ChatGPT, Gemini) can control Persephone via MCP
                </Text>
            </Panel>

            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Checkbox checked={mcpEnabled} onChange={handleToggle}>
                    Enable MCP server
                </Checkbox>
            </Panel>

            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Checkbox
                    checked={!!browserToolsEnabled}
                    disabled={!!mcpEnabled}
                    onChange={handleBrowserToolsToggle}
                >
                    Enable browser interaction
                </Checkbox>
            </Panel>

            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Text size="sm">Port:</Text>
                <Input
                    size="sm"
                    width={72}
                    type="text"
                    value={portValue}
                    onChange={setPortValue}
                    onBlur={handlePortBlur}
                    onKeyDown={handlePortKeyDown}
                    disabled={mcpEnabled}
                />
            </Panel>

            {mcpEnabled && status && (
                <>
                    <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                        <Dot size="sm" color={status.running ? "success" : "neutral"} />
                        <Text size="sm" color="light">
                            {status.running
                                ? `Running${status.clientCount > 0 ? ` — ${status.clientCount} client${status.clientCount !== 1 ? "s" : ""} connected` : ""}`
                                : "Stopped"}
                        </Text>
                    </Panel>

                    <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                        <span style={monoTextStyle}>{status.url}</span>
                        <Button variant="default" size="sm" background="light" onClick={() => handleCopy(status.url, "url")}>
                            {copied === "url" ? "Copied!" : "Copy URL"}
                        </Button>
                    </Panel>
                </>
            )}

            <Panel paddingTop="sm" paddingBottom="lg"><Text bold size="sm">Mneme (vector memory)</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    Local knowledge-base / memory service. Persephone launches it as a sidecar and serves it over loopback HTTP.
                </Text>
            </Panel>

            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Checkbox checked={mnemeEnabled} onChange={handleMnemeToggle}>
                    Enable Mneme
                </Checkbox>
            </Panel>

            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Text size="sm">Port:</Text>
                <Input
                    size="sm"
                    width={72}
                    type="text"
                    value={mnemePortValue}
                    onChange={setMnemePortValue}
                    onBlur={handleMnemePortBlur}
                    onKeyDown={handlePortKeyDown}
                    disabled={mnemeEnabled}
                />
            </Panel>

            {mnemeEnabled && mnemeStatus && (
                <>
                    <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                        <Dot size="sm" color={mnemeStatus.running ? "success" : "neutral"} />
                        <Text size="sm" color="light">
                            {mnemeStatus.running ? "Running" : "Stopped"}
                        </Text>
                    </Panel>

                    <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                        <span style={monoTextStyle}>{mnemeStatus.url}</span>
                        <Button variant="default" size="sm" background="light" onClick={() => handleCopy(mnemeStatus.url, "mneme-url")}>
                            {copied === "mneme-url" ? "Copied!" : "Copy URL"}
                        </Button>
                    </Panel>
                </>
            )}

            <Panel paddingTop="sm" paddingBottom="md">
                <Text color="light" size="xs">AI client configuration:</Text>
            </Panel>
            <pre style={configBlockStyle}>
                <ColorizedCode code={configJson} language="json" />
            </pre>
            <Panel paddingTop="md">
                <Button variant="default" size="sm" background="light" onClick={() => handleCopy(configJson, "config")}>
                    {copied === "config" ? "Copied!" : "Copy"}
                </Button>
            </Panel>
        </>
    );
}

// ============================================================================
// Git Integration Section
// ============================================================================

function GitIntegrationSection() {
    const gitEnabled = settings.use("git.enabled");
    const [probe, setProbe] = useState<{ installed: boolean; version?: string } | null>(null);

    useEffect(() => {
        if (!gitEnabled) {
            setProbe(null);
            return;
        }
        let alive = true;
        import("../../api/git")
            .then(({ git }) => git.probe())
            .then((r) => { if (alive) setProbe(r); })
            .catch(() => { if (alive) setProbe({ installed: false }); });
        return () => { alive = false; };
    }, [gitEnabled]);

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
                        {probe.installed
                            ? `Git ${probe.version ?? ""} detected`.trim()
                            : "git not found on PATH — install git or fix PATH"}
                    </Text>
                </Panel>
            )}
        </>
    );
}

// ============================================================================
// Script Library Section
// ============================================================================

function ScriptLibrarySection() {
    const libraryPath = settings.use("script-library.path");

    const handleBrowse = async () => {
        const { showLibrarySetupDialog } = await import("../../ui/dialogs/LibrarySetupDialog");
        showLibrarySetupDialog();
    };

    const handleUnlink = () => {
        settings.set("script-library.path", "");
    };

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Script Library</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    Folder for saved scripts and reusable modules
                </Text>
            </Panel>
            <Panel direction="row" align="center" gap="md">
                <Panel flex minWidth={0} paddingY="sm" paddingX="md" background="dark" border rounded="sm" overflow="hidden">
                    {libraryPath ? (
                        <span style={pathDisplayStyle} title={libraryPath}>{libraryPath}</span>
                    ) : (
                        <Text size="sm" italic color="light">Not linked</Text>
                    )}
                </Panel>
                <Button variant="link" size="sm" background="light" onClick={handleBrowse}>
                    Browse...
                </Button>
                {libraryPath && (
                    <Button variant="link" size="sm" background="light" onClick={handleUnlink}>
                        Unlink
                    </Button>
                )}
            </Panel>
        </>
    );
}

// ============================================================================
// Drawing Library Section
// ============================================================================

function DrawingLibrarySection() {
    const libraryPath = settings.use("drawing.library-path");

    const handleBrowse = async () => {
        const result = await api.showOpenFolderDialog({
            title: "Select Drawing Library Folder",
            defaultPath: libraryPath || undefined,
        });
        if (result && result.length > 0) {
            settings.set("drawing.library-path", result[0]);
        }
    };

    const handleReset = () => {
        settings.set("drawing.library-path", "");
    };

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Drawing Library</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    Folder for Excalidraw library items (reusable shapes)
                </Text>
            </Panel>
            <Panel direction="row" align="center" gap="md">
                <Panel flex minWidth={0} paddingY="sm" paddingX="md" background="dark" border rounded="sm" overflow="hidden">
                    {libraryPath ? (
                        <span style={pathDisplayStyle} title={libraryPath}>{libraryPath}</span>
                    ) : (
                        <Text size="sm" italic color="light">Default (auto)</Text>
                    )}
                </Panel>
                <Button variant="link" size="sm" background="light" onClick={handleBrowse}>
                    Browse...
                </Button>
                {libraryPath && (
                    <Button variant="link" size="sm" background="light" onClick={handleReset}>
                        Reset
                    </Button>
                )}
            </Panel>
        </>
    );
}

// ============================================================================
// Video Player Section
// ============================================================================

function VideoPlayerSection() {
    const vlcPath = settings.use("vlc-path");
    const videoStreamPort = settings.use("video-stream.port");
    const [portValue, setPortValue] = useState(String(videoStreamPort));

    useEffect(() => {
        setPortValue(String(videoStreamPort));
    }, [videoStreamPort]);

    const handleBrowseVlc = async () => {
        const filePath = await browseVlcExe();
        if (filePath) {
            settings.set("vlc-path", filePath);
        }
    };

    const handleClearVlc = () => {
        settings.set("vlc-path", "");
    };

    const handlePortBlur = () => {
        const num = parseInt(portValue, 10);
        if (num >= 1024 && num <= 65535) {
            settings.set("video-stream.port", num);
        } else {
            setPortValue(String(videoStreamPort));
        }
    };

    const handlePortKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
        }
    };

    const vlcFilename = vlcPath ? fpBasename(vlcPath) : "";

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Video Player</Text></Panel>
            <Panel paddingBottom="md">
                <Text color="light" size="xs">
                    VLC integration and local video streaming server settings
                </Text>
            </Panel>
            <Panel direction="column" rounded="sm" background="dark">
                <Panel
                    direction="row"
                    align="center"
                    gap="md"
                    paddingTop="xs"
                    paddingRight="md"
                    paddingBottom="sm"
                    paddingLeft="xxl"
                >
                    <span style={fieldLabelStyle}>vlc.exe:</span>
                    {vlcFilename ? (
                        <span
                            style={{ ...labelTextStyle, ...linkStyle }}
                            title={vlcPath}
                            onClick={handleBrowseVlc}
                        >
                            {vlcFilename}
                        </span>
                    ) : (
                        <span
                            style={{ ...labelTextStyle, ...placeholderStyle }}
                            onClick={handleBrowseVlc}
                        >
                            Auto-detect
                        </span>
                    )}
                    {vlcFilename && (
                        <IconButton
                            size="sm"
                            icon={<CloseIcon />}
                            title="Remove VLC path"
                            onClick={handleClearVlc}
                        />
                    )}
                </Panel>
                <Panel
                    direction="row"
                    align="center"
                    gap="md"
                    paddingTop="xs"
                    paddingRight="md"
                    paddingBottom="sm"
                    paddingLeft="xxl"
                >
                    <span style={fieldLabelStyle}>Stream port:</span>
                    <Input
                        size="sm"
                        width={56}
                        type="text"
                        value={portValue}
                        onChange={setPortValue}
                        onBlur={handlePortBlur}
                        onKeyDown={handlePortKeyDown}
                    />
                </Panel>
            </Panel>
        </>
    );
}

// ============================================================================
// Terminal Section
// ============================================================================

const TERMINAL_ITEMS: IListBoxItem[] = [
    { value: "", label: "Auto-detect (pwsh → powershell → cmd)" },
    { value: "pwsh", label: "PowerShell 7 (pwsh)" },
    { value: "powershell", label: "Windows PowerShell (powershell)" },
    { value: "cmd", label: "Command Prompt (cmd)" },
    { value: "wt", label: "Windows Terminal (wt)" },
];

function TerminalSection() {
    const terminalCommand = settings.use("terminal.command");
    // Surface a custom command/path (not one of the known options) as its own
    // item so the Select shows it instead of appearing empty.
    const items =
        terminalCommand && !TERMINAL_ITEMS.some((i) => i.value === terminalCommand)
            ? [...TERMINAL_ITEMS, { value: terminalCommand, label: terminalCommand }]
            : TERMINAL_ITEMS;
    const selected = items.find((i) => i.value === terminalCommand) ?? items[0];

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
                <Select
                    items={items}
                    value={selected}
                    onChange={(item) =>
                        settings.set("terminal.command", (item?.value as string) ?? "")
                    }
                />
            </Panel>
        </>
    );
}

// ============================================================================
// SettingsView Component
// ============================================================================

interface SettingsEditorProps {
    model: SettingsEditor;
}

function SettingsView(_props: SettingsEditorProps) {
    const currentThemeId = settings.use("theme");
    const searchExtensions = settings.use("search-extensions");
    const themes = getAvailableThemes();
    const darkThemes = themes.filter((t) => t.isDark);
    const lightThemes = themes.filter((t) => !t.isDark);

    const extensionsText = searchExtensions.join(", ");
    const extensionsRef = useRef<TextareaRef>(null);

    const handleThemeChange = (themeId: string) => {
        applyTheme(themeId);
        settings.set("theme", themeId);
    };

    const handleExtensionsBlur = useCallback(() => {
        const value = extensionsRef.current?.getText() ?? "";
        const extensions = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        settings.set("search-extensions", extensions);
    }, []);

    const handleOpenSettingsFile = () => {
        const filePath = settings.settingsFilePath;
        if (filePath) {
            app.events.openRawLink.sendAsync(createLinkData(filePath));
        }
    };

    const renderThemeGrid = (sectionThemes: typeof themes) => (
        <Panel direction="row" wrap gap="lg" justify="center" paddingBottom="xl">
            {sectionThemes.map((theme) => (
                <div
                    key={theme.id}
                    onClick={() => handleThemeChange(theme.id)}
                    style={{ cursor: "pointer" }}
                >
                    <Panel
                        direction="column"
                        align="center"
                        justify="center"
                        gap="md"
                        paddingY="lg"
                        paddingX="md"
                        width={160}
                        height={100}
                        background="dark"
                        border
                        borderColor={currentThemeId === theme.id ? "active" : "default"}
                        rounded="md"
                    >
                        <ThemePreview
                            bgDefault={theme.colors["--color-bg-default"]}
                            bgDark={theme.colors["--color-bg-dark"]}
                            textDefault={theme.colors["--color-text-default"]}
                            accentColor={theme.colors["--color-misc-blue"]}
                        />
                        <Text size="sm" align="center">{theme.name}</Text>
                    </Panel>
                </div>
            ))}
        </Panel>
    );

    return (
        <Panel name="settings-root" direction="column" align="center" padding="xxxl">
            <Panel
                name="settings-content"
                direction="column"
                width="100%"
                maxWidth={560}
                padding="xxxl"
                background="light"
                rounded="lg"
            >
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: color.text.default, marginBottom: 24 }}>
                        Settings
                    </h1>

                    <Panel paddingBottom="lg"><Text bold size="sm">Theme</Text></Panel>

                    <Panel paddingBottom="md">
                        <Text variant="uppercased" color="light" bold size="xs">Dark</Text>
                    </Panel>
                    {renderThemeGrid(darkThemes)}

                    <Panel paddingBottom="md">
                        <Text variant="uppercased" color="light" bold size="xs">Light</Text>
                    </Panel>
                    {renderThemeGrid(lightThemes)}

                    <Panel paddingY="xl"><Divider /></Panel>

                    <BrowserProfilesSection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <Panel paddingBottom="lg"><Text bold size="sm">Links</Text></Panel>
                    <Panel paddingBottom="md">
                        <Text color="light" size="xs">
                            How external links open from editors (Monaco, Markdown)
                        </Text>
                    </Panel>
                    <LinkBehaviorSection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <Panel paddingBottom="lg"><Text bold size="sm">Default Browser</Text></Panel>
                    <DefaultBrowserSection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <Panel paddingBottom="lg"><Text bold size="sm">File Search</Text></Panel>
                    <Panel paddingBottom="md">
                        <Text color="light" size="xs">
                            File extensions included in content search (comma-separated)
                        </Text>
                    </Panel>
                    <Textarea
                        ref={extensionsRef}
                        singleLine
                        value={extensionsText}
                        onBlur={handleExtensionsBlur}
                        maxHeight={200}
                        size="sm"
                    />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <McpSection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <GitIntegrationSection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <ScriptLibrarySection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <DrawingLibrarySection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <VideoPlayerSection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <TerminalSection />

                    <Panel paddingY="xl"><Divider /></Panel>

                    <Button name="settings-view-file" variant="link" size="sm" background="light" onClick={handleOpenSettingsFile}>
                    View Settings File
                </Button>
            </Panel>
        </Panel>
    );
}


const settingsEditorModule: EditorModule = {
    Editor: SettingsView as unknown as EditorModule["Editor"],
    newEditorModel: async () =>
        new SettingsEditor(
            new TComponentState(getDefaultSettingsEditorState()),
        ) as unknown as EditorModel,
    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "settingsPage") return null;
        return new SettingsEditor(
            new TComponentState(getDefaultSettingsEditorState()),
        ) as unknown as EditorModel;
    },
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const initialState: SettingsEditorState = {
            ...getDefaultSettingsEditorState(),
            ...(state as Partial<SettingsEditorState>),
        };
        return new SettingsEditor(
            new TComponentState(initialState),
        ) as unknown as EditorModel;
    },
};

export default settingsEditorModule;

export { SettingsView };
export type { SettingsEditorProps };
