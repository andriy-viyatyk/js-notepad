import { useCallback, useRef, useState } from "react";
import styled from "@emotion/styled";
import { IPage, PageType } from "../../../shared/types";
import { getDefaultPageModelState, PageModel } from "../base";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import color from "../../theme/color";
import { appSettings } from "../../store/app-settings";
import { pagesModel } from "../../store/pages-store";
import { applyTheme, getAvailableThemes } from "../../theme/themes";
import { TextAreaField, TextAreaFieldRef } from "../../components/basic/TextAreaField";
import { DEFAULT_BROWSER_COLOR, TAG_COLORS } from "../../theme/palette-colors";
import { WithPopupMenu } from "../../components/overlay/WithPopupMenu";
import { MenuItem } from "../../components/overlay/PopupMenu";
import { showConfirmationDialog } from "../../features/dialogs/ConfirmationDialog";
import { getPartitionString } from "../browser/BrowserPageModel";
const { ipcRenderer } = require("electron");
import { BrowserChannel } from "../../../ipc/browser-ipc";

// ============================================================================
// Styled Component
// ============================================================================

const SettingsPageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 32,
    overflow: "auto",
    fontFamily: "Arial, sans-serif",

    "& .settings-card": {
        display: "flex",
        flexDirection: "column",
        maxWidth: 500,
        width: "100%",
        padding: 32,
        margin: "auto 0",
        backgroundColor: color.background.light,
        borderRadius: 8,
    },

    "& .settings-title": {
        margin: 0,
        fontSize: 24,
        fontWeight: 600,
        color: color.text.default,
        marginBottom: 24,
    },

    "& .section-label": {
        fontSize: 14,
        fontWeight: 600,
        color: color.text.default,
        marginBottom: 12,
    },

    "& .theme-section-label": {
        fontSize: 11,
        fontWeight: 600,
        color: color.text.light,
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
        marginBottom: 8,
    },

    "& .theme-grid": {
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 16,
    },

    "& .theme-card": {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "12px 16px",
        minWidth: 120,
        backgroundColor: color.background.dark,
        border: `1px solid ${color.border.default}`,
        borderRadius: 6,
        cursor: "pointer",
        transition: "border-color 0.15s",

        "&:hover": {
            borderColor: color.text.light,
        },

        "&.active": {
            borderColor: color.border.active,
        },
    },

    "& .theme-preview": {
        width: 80,
        height: 48,
        borderRadius: 4,
        border: `1px solid ${color.border.default}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },

    "& .theme-preview-header": {
        height: 12,
    },

    "& .theme-preview-body": {
        flex: 1,
        padding: "4px 6px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
    },

    "& .theme-preview-line": {
        height: 3,
        borderRadius: 1,
        opacity: 0.6,
    },

    "& .theme-name": {
        fontSize: 12,
        color: color.text.default,
        textAlign: "center",
    },

    "& .divider": {
        width: "100%",
        border: "none",
        borderTop: `1px solid ${color.border.default}`,
        margin: "20px 0",
    },

    "& .section-hint": {
        fontSize: 11,
        color: color.text.light,
        marginBottom: 8,
    },

    "& .extensions-field": {
        fontSize: 12,
        lineHeight: 1.5,
        maxHeight: 200,
        overflowY: "auto",
    },

    "& .link-button": {
        padding: "6px 12px",
        fontSize: 12,
        color: color.misc.blue,
        backgroundColor: "transparent",
        border: `1px solid ${color.border.default}`,
        borderRadius: 4,
        cursor: "pointer",
        "&:hover": {
            backgroundColor: color.background.dark,
        },
    },

    "& .profile-list": {
        display: "flex",
        flexDirection: "column",
        gap: 4,
        marginBottom: 12,
    },

    "& .profile-row": {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 4,
        backgroundColor: color.background.dark,

        "&:hover .profile-remove, &:hover .profile-clear-data": {
            opacity: 1,
        },
    },

    "& .profile-color-dot": {
        width: 12,
        height: 12,
        borderRadius: "50%",
        flexShrink: 0,
        border: `1px solid ${color.border.default}`,
        "&.clickable": {
            cursor: "pointer",
            "&:hover": {
                outline: `2px solid ${color.border.active}`,
                outlineOffset: 1,
            },
        },
    },

    "& .profile-name": {
        fontSize: 13,
        color: color.text.default,
        flex: 1,
    },

    "& .profile-default-badge": {
        fontSize: 10,
        color: color.text.light,
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
        padding: "1px 6px",
        border: `1px solid ${color.border.default}`,
        borderRadius: 3,
    },

    "& .profile-set-default": {
        fontSize: 11,
        color: color.misc.blue,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "2px 4px",
        "&:hover": {
            textDecoration: "underline",
        },
    },

    "& .profile-clear-data": {
        fontSize: 11,
        color: color.text.light,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "2px 4px",
        opacity: 0,
        transition: "opacity 0.15s",
        "&:hover": {
            color: color.text.default,
        },
    },

    "& .profile-cleared": {
        fontSize: 11,
        color: color.misc.green,
        padding: "2px 4px",
    },

    "& .profile-remove": {
        fontSize: 14,
        color: color.text.light,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "0 4px",
        opacity: 0,
        transition: "opacity 0.15s",
        "&:hover": {
            color: color.text.default,
        },
    },

    "& .profile-add-form": {
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },

    "& .profile-add-row": {
        display: "flex",
        alignItems: "center",
        gap: 8,
    },

    "& .profile-name-input": {
        flex: 1,
        fontSize: 13,
        padding: "4px 8px",
        backgroundColor: color.background.dark,
        border: `1px solid ${color.border.default}`,
        borderRadius: 4,
        color: color.text.default,
        outline: "none",
        "&:focus": {
            borderColor: color.border.active,
        },
    },

    "& .profile-add-button": {
        fontSize: 12,
        padding: "4px 12px",
        color: color.text.default,
        backgroundColor: color.background.dark,
        border: `1px solid ${color.border.default}`,
        borderRadius: 4,
        cursor: "pointer",
        "&:hover": {
            borderColor: color.text.light,
        },
        "&:disabled": {
            opacity: 0.4,
            cursor: "default",
        },
    },

    "& .color-palette": {
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
    },

    "& .color-swatch": {
        width: 18,
        height: 18,
        borderRadius: "50%",
        cursor: "pointer",
        border: "2px solid transparent",
        transition: "border-color 0.15s",
        "&:hover": {
            borderColor: color.text.light,
        },
        "&.selected": {
            borderColor: color.text.default,
        },
    },

    "& .profile-empty": {
        fontSize: 12,
        color: color.text.light,
        fontStyle: "italic",
        marginBottom: 8,
    },
});

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
        <div className="theme-preview">
            <div className="theme-preview-header" style={{ backgroundColor: bgDark }} />
            <div className="theme-preview-body" style={{ backgroundColor: bgDefault }}>
                <div className="theme-preview-line" style={{ backgroundColor: accentColor, width: "60%" }} />
                <div className="theme-preview-line" style={{ backgroundColor: textDefault, width: "80%" }} />
                <div className="theme-preview-line" style={{ backgroundColor: textDefault, width: "45%" }} />
            </div>
        </div>
    );
}

// ============================================================================
// SettingsPageModel (Page Model)
// ============================================================================

export const SETTINGS_PAGE_ID = "settings-page";

interface SettingsPageModelState extends IPage {}

const getDefaultSettingsPageModelState = (): SettingsPageModelState => ({
    ...getDefaultPageModelState(),
    id: SETTINGS_PAGE_ID,
    type: "settingsPage",
    title: "Settings",
});

class SettingsPageModel extends PageModel<SettingsPageModelState, void> {
    noLanguage = true;
    skipSave = true;

    getRestoreData() {
        return JSON.parse(JSON.stringify(this.state.get()));
    }

    async restore() {
        this.state.update((s) => {
            s.title = "Settings";
        });
    }
}

// ============================================================================
// Browser Profiles Section
// ============================================================================

function clearPartitionData(partition: string): Promise<void> {
    return ipcRenderer.invoke(BrowserChannel.clearProfileData, partition);
}

function BrowserProfilesSection() {
    const profiles = appSettings.use("browser-profiles");
    const defaultProfile = appSettings.use("browser-default-profile");
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState(TAG_COLORS[0].hex);
    const [clearedProfile, setClearedProfile] = useState<string | null>(null);

    const handleAddProfile = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        const exists = profiles.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) return;
        appSettings.set("browser-profiles", [...profiles, { name: trimmed, color: newColor }]);
        setNewName("");
        setNewColor(TAG_COLORS[(profiles.length + 1) % TAG_COLORS.length].hex);
    };

    const handleRemoveProfile = async (name: string) => {
        const result = await showConfirmationDialog({
            title: "Delete Profile",
            message: `Delete profile "${name}"? All browsing data (cookies, storage, cache) for this profile will be permanently removed.`,
            buttons: ["Delete", "Cancel"],
        });
        if (result !== "Delete") return;
        const partition = getPartitionString(name, false);
        await clearPartitionData(partition);
        appSettings.set("browser-profiles", profiles.filter((p) => p.name !== name));
        if (defaultProfile === name) {
            appSettings.set("browser-default-profile", "");
        }
    };

    const handleClearData = async (profileName: string) => {
        const label = profileName || "Default";
        const result = await showConfirmationDialog({
            title: "Clear Profile Data",
            message: `Clear all browsing data (cookies, storage, cache) for the "${label}" profile?`,
            buttons: ["Clear", "Cancel"],
        });
        if (result !== "Clear") return;
        const partition = getPartitionString(profileName, false);
        await clearPartitionData(partition);
        setClearedProfile(profileName);
        setTimeout(() => setClearedProfile((prev) => prev === profileName ? null : prev), 2000);
    };

    const handleSetDefault = (name: string) => {
        appSettings.set("browser-default-profile", defaultProfile === name ? "" : name);
    };

    const handleColorChange = (name: string, newColor: string) => {
        appSettings.set("browser-profiles", profiles.map((p) =>
            p.name === name ? { ...p, color: newColor } : p,
        ));
    };

    const getColorMenuItems = (profileName: string, currentColor: string): MenuItem[] =>
        TAG_COLORS.map((c) => ({
            label: c.name,
            icon: <span style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: c.hex,
            }} />,
            onClick: () => handleColorChange(profileName, c.hex),
            selected: currentColor === c.hex,
        }));

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleAddProfile();
        }
    };

    const canAdd = newName.trim().length > 0
        && !profiles.some((p) => p.name.toLowerCase() === newName.trim().toLowerCase());

    return (
        <>
            <div className="section-label">Browser Profiles</div>
            <div className="section-hint">
                Isolated browsing sessions with separate cookies, storage, and cache
            </div>

            <div className="profile-list">
                <div className="profile-row">
                    <span className="profile-color-dot" style={{ backgroundColor: DEFAULT_BROWSER_COLOR }} />
                    <span className="profile-name">Default</span>
                    {defaultProfile === "" ? (
                        <span className="profile-default-badge">default</span>
                    ) : (
                        <button className="profile-set-default" onClick={() => handleSetDefault("")}>
                            set default
                        </button>
                    )}
                    {clearedProfile === "" && (
                        <span className="profile-cleared">Cleared</span>
                    )}
                    <button className="profile-clear-data" onClick={() => handleClearData("")}>
                        clear data
                    </button>
                </div>
                {profiles.map((profile) => (
                    <div key={profile.name} className="profile-row">
                        <WithPopupMenu items={getColorMenuItems(profile.name, profile.color)}>
                            {(openMenu) => (
                                <span
                                    className="profile-color-dot clickable"
                                    style={{ backgroundColor: profile.color }}
                                    title="Change color"
                                    onClick={(e) => openMenu(e.currentTarget)}
                                />
                            )}
                        </WithPopupMenu>
                        <span className="profile-name">{profile.name}</span>
                        {defaultProfile === profile.name ? (
                            <span className="profile-default-badge">default</span>
                        ) : (
                            <button className="profile-set-default" onClick={() => handleSetDefault(profile.name)}>
                                set default
                            </button>
                        )}
                        {clearedProfile === profile.name && (
                            <span className="profile-cleared">Cleared</span>
                        )}
                        <button className="profile-clear-data" onClick={() => handleClearData(profile.name)}>
                            clear data
                        </button>
                        <button className="profile-remove" onClick={() => handleRemoveProfile(profile.name)}>
                            ×
                        </button>
                    </div>
                ))}
            </div>

            <div className="profile-add-form">
                <div className="profile-add-row">
                    <input
                        className="profile-name-input"
                        placeholder="Profile name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button className="profile-add-button" disabled={!canAdd} onClick={handleAddProfile}>
                        Add
                    </button>
                </div>
                <div className="section-hint">Profile color:</div>
                <div className="color-palette">
                    {TAG_COLORS.map((c) => (
                        <span
                            key={c.hex}
                            className={`color-swatch${newColor === c.hex ? " selected" : ""}`}
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                            onClick={() => setNewColor(c.hex)}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}

// ============================================================================
// SettingsPage Component
// ============================================================================

interface SettingsPageProps {
    model: SettingsPageModel;
}

function SettingsPage({ model }: SettingsPageProps) {
    const currentThemeId = appSettings.use("theme");
    const searchExtensions = appSettings.use("search-extensions");
    const themes = getAvailableThemes();
    const darkThemes = themes.filter((t) => t.isDark);
    const lightThemes = themes.filter((t) => !t.isDark);

    const extensionsText = searchExtensions.join(", ");
    const extensionsRef = useRef<TextAreaFieldRef>(null);

    const handleThemeChange = (themeId: string) => {
        applyTheme(themeId);
        appSettings.set("theme", themeId);
    };

    const handleExtensionsBlur = useCallback(() => {
        const value = extensionsRef.current?.getText() ?? "";
        const extensions = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        appSettings.set("search-extensions", extensions);
    }, []);

    const handleOpenSettingsFile = () => {
        const filePath = appSettings.settingsFilePath;
        if (filePath) {
            pagesModel.openFile(filePath);
        }
    };

    const renderThemeGrid = (sectionThemes: typeof themes) => (
        <div className="theme-grid">
            {sectionThemes.map((theme) => (
                <div
                    key={theme.id}
                    className={`theme-card${currentThemeId === theme.id ? " active" : ""}`}
                    onClick={() => handleThemeChange(theme.id)}
                >
                    <ThemePreview
                        bgDefault={theme.colors["--color-bg-default"]}
                        bgDark={theme.colors["--color-bg-dark"]}
                        textDefault={theme.colors["--color-text-default"]}
                        accentColor={theme.colors["--color-misc-blue"]}
                    />
                    <span className="theme-name">{theme.name}</span>
                </div>
            ))}
        </div>
    );

    return (
        <SettingsPageRoot>
            <div className="settings-card">
                <h1 className="settings-title">Settings</h1>

                <div className="section-label">Theme</div>

                <div className="theme-section-label">Dark</div>
                {renderThemeGrid(darkThemes)}

                <div className="theme-section-label">Light</div>
                {renderThemeGrid(lightThemes)}

                <hr className="divider" />

                <BrowserProfilesSection />

                <hr className="divider" />

                <div className="section-label">File Search</div>
                <div className="section-hint">
                    File extensions included in content search (comma-separated)
                </div>
                <TextAreaField
                    ref={extensionsRef}
                    className="extensions-field"
                    singleLine
                    value={extensionsText}
                    onBlur={handleExtensionsBlur}
                />

                <hr className="divider" />

                <button className="link-button" onClick={handleOpenSettingsFile}>
                    View Settings File
                </button>
            </div>
        </SettingsPageRoot>
    );
}

// ============================================================================
// Editor Module
// ============================================================================

const settingsEditorModule: EditorModule = {
    Editor: SettingsPage,
    newPageModel: async () => {
        return new SettingsPageModel(new TComponentState(getDefaultSettingsPageModelState()));
    },
    newEmptyPageModel: async (pageType: PageType): Promise<PageModel | null> => {
        if (pageType === "settingsPage") {
            return new SettingsPageModel(new TComponentState(getDefaultSettingsPageModelState()));
        }
        return null;
    },
    newPageModelFromState: async (state: Partial<IPage>): Promise<PageModel> => {
        const initialState: SettingsPageModelState = {
            ...getDefaultSettingsPageModelState(),
            ...state,
        };
        return new SettingsPageModel(new TComponentState(initialState));
    },
};

export default settingsEditorModule;

export { SettingsPage, SettingsPageModel };
export type { SettingsPageProps, SettingsPageModelState };
