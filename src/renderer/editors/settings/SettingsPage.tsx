import { useCallback, useRef } from "react";
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

// ============================================================================
// Styled Component
// ============================================================================

const SettingsPageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    overflow: "auto",
    fontFamily: "Arial, sans-serif",

    "& .settings-card": {
        display: "flex",
        flexDirection: "column",
        maxWidth: 500,
        width: "100%",
        padding: 32,
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
