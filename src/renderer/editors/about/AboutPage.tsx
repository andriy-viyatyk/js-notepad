import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { IPage, PageType } from "../../../shared/types";
import { getDefaultPageModelState, PageModel } from "../base";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import color from "../../theme/color";
import { JsNotepadIcon } from "../../theme/icons";
import { api } from "../../../ipc/renderer/api";
import rendererEvents from "../../../ipc/renderer/renderer-events";
import { EventEndpoint } from "../../../ipc/api-types";
import { RuntimeVersions, UpdateCheckResult } from "../../../ipc/api-param-types";
const { shell } = require("electron");

// ============================================================================
// Styled Component
// ============================================================================

const AboutPageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    overflow: "auto",
    fontFamily: "Arial, sans-serif",

    "& .about-card": {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        maxWidth: 400,
        width: "100%",
        padding: 32,
        backgroundColor: color.background.light,
        borderRadius: 8,
    },

    "& .app-icon": {
        width: 64,
        height: 64,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        "& svg": {
            width: "100%",
            height: "100%",
        },
    },

    "& .app-name": {
        margin: 0,
        fontSize: 24,
        fontWeight: 600,
        color: color.text.default,
    },

    "& .version-text": {
        fontSize: 14,
        color: color.text.light,
        marginTop: 4,
    },

    "& .divider": {
        width: "100%",
        border: "none",
        borderTop: `1px solid ${color.border.default}`,
        margin: "20px 0",
    },

    "& .info-section": {
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },

    "& .info-row": {
        display: "flex",
        justifyContent: "space-between",
        fontSize: 13,
        "& .label": {
            color: color.text.light,
        },
        "& .value": {
            color: color.text.default,
            fontFamily: "monospace",
        },
    },

    "& .update-section": {
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
    },

    "& .update-button": {
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 500,
        color: color.text.selection,
        backgroundColor: color.background.selection,
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        "&:hover": {
            opacity: 0.9,
        },
        "&:disabled": {
            opacity: 0.6,
            cursor: "not-allowed",
        },
    },

    "& .update-status": {
        fontSize: 13,
        textAlign: "center",
        color: color.text.light,
        "&.success": {
            color: color.misc.green,
        },
        "&.warning": {
            color: color.misc.yellow,
        },
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

    "& .links-section": {
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        justifyContent: "center",
    },
});

// ============================================================================
// AboutPageModel (Page Model)
// ============================================================================

export const ABOUT_PAGE_ID = "about-page";

interface AboutPageModelState extends IPage {}

const getDefaultAboutPageModelState = (): AboutPageModelState => ({
    ...getDefaultPageModelState(),
    id: ABOUT_PAGE_ID,
    type: "aboutPage",
    title: "About",
});

class AboutPageModel extends PageModel<AboutPageModelState, void> {
    noLanguage = true;
    skipSave = true;

    getRestoreData() {
        return JSON.parse(JSON.stringify(this.state.get()));
    }

    async restore() {
        this.state.update((s) => {
            s.title = "About";
        });
    }
}

// ============================================================================
// AboutPage Component
// ============================================================================

interface AboutPageProps {
    model: AboutPageModel;
}

function AboutPage({ model }: AboutPageProps) {
    const [appVersion, setAppVersion] = useState<string>("");
    const [runtimeVersions, setRuntimeVersions] = useState<RuntimeVersions | null>(null);
    const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        // Load version info
        api.getAppVersion().then(setAppVersion);
        api.getRuntimeVersions().then(setRuntimeVersions);

        // Subscribe to update available events
        const subscription = rendererEvents[EventEndpoint.eUpdateAvailable].subscribe(
            (result: UpdateCheckResult) => {
                setUpdateResult(result);
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const handleCheckForUpdates = async () => {
        setChecking(true);
        try {
            const result = await api.checkForUpdates(true);
            setUpdateResult(result);
        } finally {
            setChecking(false);
        }
    };

    const openExternal = (url: string) => {
        shell.openExternal(url);
    };

    const renderUpdateStatus = () => {
        if (checking) {
            return <div className="update-status">Checking for updates...</div>;
        }

        if (!updateResult) {
            return null;
        }

        if (updateResult.updateAvailable && updateResult.releaseInfo) {
            const { releaseInfo } = updateResult;
            return (
                <>
                    <div className="update-status warning">
                        New version {releaseInfo.version} available!
                    </div>
                    <div className="links-section">
                        <button
                            className="link-button"
                            onClick={() => openExternal(releaseInfo.htmlUrl)}
                        >
                            Download
                        </button>
                        <button
                            className="link-button"
                            onClick={() =>
                                openExternal(
                                    "https://github.com/andriy-viyatyk/js-notepad/blob/main/docs/whats-new.md"
                                )
                            }
                        >
                            What's New
                        </button>
                    </div>
                </>
            );
        }

        return <div className="update-status success">You're up to date!</div>;
    };

    return (
        <AboutPageRoot>
            <div className="about-card">
                <div className="app-icon">
                    <JsNotepadIcon />
                </div>

                <h1 className="app-name">js-notepad</h1>
                <div className="version-text">Version {appVersion || "..."}</div>

                <hr className="divider" />

                <div className="info-section">
                    <div className="info-row">
                        <span className="label">Electron</span>
                        <span className="value">{runtimeVersions?.electron || "..."}</span>
                    </div>
                    <div className="info-row">
                        <span className="label">Node.js</span>
                        <span className="value">{runtimeVersions?.node || "..."}</span>
                    </div>
                    <div className="info-row">
                        <span className="label">Chromium</span>
                        <span className="value">{runtimeVersions?.chrome || "..."}</span>
                    </div>
                </div>

                <hr className="divider" />

                <div className="update-section">
                    <button
                        className="update-button"
                        onClick={handleCheckForUpdates}
                        disabled={checking}
                    >
                        {checking ? "Checking..." : "Check for Updates"}
                    </button>
                    {renderUpdateStatus()}
                </div>

                <hr className="divider" />

                <div className="links-section">
                    <button
                        className="link-button"
                        onClick={() =>
                            openExternal("https://github.com/andriy-viyatyk/js-notepad")
                        }
                    >
                        GitHub Repository
                    </button>
                    <button
                        className="link-button"
                        onClick={() =>
                            openExternal("https://github.com/andriy-viyatyk/js-notepad/issues")
                        }
                    >
                        Report Issue
                    </button>
                </div>
            </div>
        </AboutPageRoot>
    );
}

// ============================================================================
// Editor Module
// ============================================================================

const aboutEditorModule: EditorModule = {
    Editor: AboutPage,
    newPageModel: async () => {
        return new AboutPageModel(new TComponentState(getDefaultAboutPageModelState()));
    },
    newEmptyPageModel: async (pageType: PageType): Promise<PageModel | null> => {
        if (pageType === "aboutPage") {
            return new AboutPageModel(new TComponentState(getDefaultAboutPageModelState()));
        }
        return null;
    },
    newPageModelFromState: async (state: Partial<IPage>): Promise<PageModel> => {
        const initialState: AboutPageModelState = {
            ...getDefaultAboutPageModelState(),
            ...state,
        };
        return new AboutPageModel(new TComponentState(initialState));
    },
};

export default aboutEditorModule;

// Named exports
export { AboutPage, AboutPageModel };
export type { AboutPageProps, AboutPageModelState };
