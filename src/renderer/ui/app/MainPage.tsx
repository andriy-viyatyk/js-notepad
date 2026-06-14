import styled from "@emotion/styled";
import color from "../../theme/color";
import { IconButton, Panel } from "../../uikit";
import {
    CloseIcon,
    PersephoneIcon,
    RefreshIcon,
    WindowMaximizeIcon,
    WindowMinimizeIcon,
    WindowRestoreIcon,
} from "../../theme/icons";
import { app } from "../../api/app";
import { showMcpRequestLog } from "../../api/mcp-handler";
import { autoloadService } from "../../api/autoload-service";
import { mnemeStatusModel } from "../../api/mneme-status";
import { pagesModel } from "../../api/pages";
import { Pages } from "./Pages";
import { PageTabs } from "../tabs/PageTabs";
import { clsx } from "clsx";
import { MenuBar } from "../sidebar/MenuBar";

const AppRoot = styled.div({
    backgroundColor: color.background.default,
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    "& .app-header": {
        display: "flex",
        flexDirection: "row",
        columnGap: 4,
        color: color.text.light,
        alignItems: "center",
        padding: "4px 0 0 8px",
        borderBottom: `1px solid ${color.border.light}`,
        position: "relative",
        backgroundColor: color.background.dark,
        WebkitAppRegion: "drag",
        "& button": {
            WebkitAppRegion: "no-drag", // Exclude buttons from drag region
        },
        "& .app-button": {
            flexShrink: 0,
            alignSelf: "flex-end",
            padding: 0,
            marginBottom: 3,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        },
        "& .system-button": {
            alignSelf: "flex-start",
            padding: 0,
            paddingTop: 0,
            marginTop: -4,
            height: 28,
            width: 40,
            border: "none",
            borderRadius: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: "default",
            backgroundColor: color.background.dark,
            color: color.text.light,
            "&.darkBackground:hover": {
                backgroundColor: color.background.light,
            },
            "&.close-button:hover": {
                backgroundColor: "#E81123",
                "& svg": {
                    color: "#FFFFFF",
                },
            },
        },
    },
    "& .app-content": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        "& .pages-container": {
            flex: "1 1 auto",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
        },
    },
    "& .autoload-reload button": {
        padding: "2px 4px",
        color: color.warning.text,
        "& svg": {
            width: 20,
            height: 20,
            color: color.warning.text,
        },
        "&:hover": {
            color: color.warning.textHover,
            "& svg": {
                color: color.warning.textHover,
            },
        },
    },
    "& button.zoom-indicator": {
        fontSize: 12,
        padding: "2px 6px",
        border: "none",
        borderRadius: 4,
        backgroundColor: color.background.light,
        color: color.text.default,
        cursor: "pointer",
        display: "none",
        "&.visible": {
            display: "flex",
        },
    },
    "& .status-indicators": {
        position: "absolute",
        bottom: 1,
        right: 4,
        display: "flex",
        alignItems: "center",
        gap: 8,
        WebkitAppRegion: "no-drag",
        pointerEvents: "auto",
    },
    "& .mcp-indicator, & .mneme-indicator": {
        fontSize: 9,
        lineHeight: 1,
        color: color.text.light,
        opacity: 0.6,
        display: "flex",
        alignItems: "center",
        gap: 3,
        cursor: "pointer",
        "&:hover": {
            opacity: 1,
        },
        "& .mcp-dot": {
            width: 7,
            height: 7,
            borderRadius: "50%",
            backgroundColor: color.misc.green,
        },
        "& .mcp-count": {
            marginLeft: 1,
            fontSize: 11,
            color: color.misc.green,
        },
        "& .mneme-dot": {
            width: 7,
            height: 7,
            borderRadius: "50%",
            backgroundColor: color.text.light,
            "&.success": { backgroundColor: color.misc.green },
            "&.warning": { backgroundColor: color.misc.yellow },
            "&.neutral": { backgroundColor: color.text.light },
        },
    },
});

export function MainPage() {
    const state = app.window.use();

    return (
        <AppRoot>
            <div className="app-header">
                <button
                    type="button"
                    data-name="persephone-menu"
                    className="app-button"
                    title="Menu"
                    onClick={() => app.window.toggleMenuBar()}
                >
                    <PersephoneIcon />
                </button>
                <PageTabs />
                <Panel name="app-header-spacer" flex={1} minWidth={40} />
                <AutoloadReloadButton />
                <button
                    type="button"
                    data-name="zoom-indicator"
                    className={clsx("zoom-indicator", {
                        visible: state.zoomLevel,
                    })}
                    onClick={() => app.window.resetZoom()}
                    title="Reset Zoom"
                >
                    {Math.round(Math.pow(1.2, state.zoomLevel) * 100)}%
                </button>
                <button
                    type="button"
                    data-name="window-minimize"
                    className="system-button darkBackground"
                    onClick={() => app.window.minimize()}
                >
                    <WindowMinimizeIcon />
                </button>
                <button
                    type="button"
                    data-name="window-toggle"
                    className="system-button darkBackground"
                    onClick={() => app.window.toggleWindow()}
                >
                    {state.isMaximized ? (
                        <WindowRestoreIcon />
                    ) : (
                        <WindowMaximizeIcon />
                    )}
                </button>
                <button
                    type="button"
                    data-name="window-close"
                    className="system-button darkBackground close-button"
                    onClick={() => app.window.close()}
                >
                    <CloseIcon />
                </button>
                <div className="status-indicators">
                    <MnemeIndicator />
                    {state.mcpRunning && (
                        <span
                            className="mcp-indicator"
                            title={state.mcpClientCount > 0
                                ? `MCP is active, ${state.mcpClientCount} active connection${state.mcpClientCount !== 1 ? "s" : ""} — click to view request log`
                                : "MCP server is running — click to view request log"
                            }
                            onClick={() => showMcpRequestLog()}
                        >
                            {state.mcpClientCount > 0
                                ? <><span className="mcp-count">{state.mcpClientCount}</span> MCP</>
                                : <><span className="mcp-dot" /> MCP</>
                            }
                        </span>
                    )}
                </div>
            </div>
            <div className="app-content">
                <div className="pages-container">
                    <Pages />
                </div>
                <MenuBar
                    open={state.menuBarOpen}
                    onClose={() => app.window.toggleMenuBar()}
                />
            </div>
        </AppRoot>
    );
}

function MnemeIndicator() {
    const s = mnemeStatusModel.state.use();
    if (!s.enabled) return null;

    const dotClass = s.running ? (s.modelReady ? "success" : "warning") : "neutral";
    const title = s.running
        ? s.modelReady
            ? "Mneme active — vector memory ready. Click to manage."
            : "Mneme is running without an embedding model — semantic search unavailable (text/grep fallback only). Click to fix in Mneme settings."
        : "Mneme is enabled but not running. Click to manage.";

    return (
        <span
            className="mneme-indicator"
            title={title}
            onClick={() => pagesModel.showMnemeConfigPage()}
        >
            <span className={clsx("mneme-dot", dotClass)} /> Mneme
        </span>
    );
}

function AutoloadReloadButton() {
    const autoloadState = autoloadService.state.use();

    if (!autoloadState.needsReload) return null;

    return (
        <span className="autoload-reload">
            <IconButton
                name="autoload-reload"
                size="sm"
                icon={<RefreshIcon />}
                title="Application scripts need to be reloaded. Click to reload."
                onClick={() => autoloadService.loadScripts()}
            />
        </span>
    );
}
