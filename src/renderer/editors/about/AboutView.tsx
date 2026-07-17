import { useEffect, useState } from "react";
import { IEditorState, EditorType } from "../../../shared/types";
import type { EditorModel } from "../base";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import {
    AboutEditor,
    getDefaultAboutEditorState,
    type AboutEditorState,
} from "./AboutEditor";
import { PersephoneIcon } from "../../theme/icons";
import { Panel, Text, Button, Divider } from "../../uikit";
import { app } from "../../api/app";
import { shell } from "../../api/shell";
import { publishedBoards } from "../../api/published-boards";
import type { IRuntimeVersions, IUpdateInfo } from "../../api/types/shell";
import rendererEvents from "../../../ipc/renderer/renderer-events";
import { EventEndpoint } from "../../../ipc/api-types";
import type { UpdateCheckResult } from "../../../ipc/api-param-types";

// ============================================================================
// AboutView Component
// ============================================================================

interface AboutEditorProps {
    model: AboutEditor;
}

function mapUpdateResult(result: UpdateCheckResult): IUpdateInfo {
    const ri = result.releaseInfo;
    return {
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        updateAvailable: result.updateAvailable,
        releaseUrl: ri?.htmlUrl ?? null,
        releaseVersion: ri?.version ?? null,
        publishedAt: ri?.publishedAt ?? null,
        releaseNotes: ri?.body ?? null,
        error: result.error,
    };
}

function AboutView(_props: AboutEditorProps) {
    const [runtimeVersions, setRuntimeVersions] = useState<IRuntimeVersions | null>(null);
    const [updateResult, setUpdateResult] = useState<IUpdateInfo | null>(null);
    const [checking, setChecking] = useState(false);
    // Reactive count of published-catalog boards — updates live when the catalog is refreshed
    // (including by "Check for Updates" below).
    const availableBoards = publishedBoards.useCatalog().length;

    useEffect(() => {
        shell.version.runtimeVersions().then(setRuntimeVersions);
        // Pull the cached catalog so the count shows on open (idempotent; no network unless due).
        void publishedBoards.load();

        const subscription = rendererEvents[EventEndpoint.eUpdateAvailable].subscribe(
            (result: UpdateCheckResult) => {
                setUpdateResult(mapUpdateResult(result));
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const handleCheckForUpdates = async () => {
        setChecking(true);
        try {
            // "Check for Updates" force-refreshes BOTH update sources on one click: the app
            // version (GitHub releases) and the published-boards catalog (a separate service
            // with its own 24h gate). The boards refresh is best-effort — a catalog fetch
            // failure must not break the app-version result — and its outcome surfaces
            // reactively through the publishedBoards model, so nothing here consumes it.
            const [result] = await Promise.all([
                shell.version.checkForUpdates(true),
                publishedBoards.refresh().catch(() => {}),
            ]);
            setUpdateResult(result);
        } finally {
            setChecking(false);
        }
    };

    const renderUpdateStatus = () => {
        if (checking) {
            return <Text size="md" color="light">Checking for updates...</Text>;
        }
        if (!updateResult) {
            return null;
        }
        if (updateResult.updateAvailable && updateResult.releaseVersion && updateResult.releaseUrl) {
            const { releaseVersion, releaseUrl } = updateResult;
            return (
                <>
                    <Text size="md" color="warning">
                        New version {releaseVersion} available!
                    </Text>
                    <Panel justify="center" wrap gap="lg">
                        <Button variant="link" size="sm" onClick={() => shell.openExternal(releaseUrl)}>
                            Download
                        </Button>
                        <Button
                            variant="link"
                            size="sm"
                            onClick={() => shell.openExternal("https://github.com/andriy-viyatyk/persephone/blob/main/docs/whats-new.md")}
                        >
                            What's New
                        </Button>
                    </Panel>
                </>
            );
        }
        return <Text size="md" color="success">You're up to date!</Text>;
    };

    return (
        <Panel name="about-root" direction="column" align="center" justify="center" padding="xxxl" flex overflow="auto">
            <Panel
                name="about-content"
                direction="column"
                align="center"
                padding="xxxl"
                background="light"
                rounded="xl"
                width="100%"
                maxWidth={400}
                gap="xl"
            >
                <Panel width={64} height={64} align="center" justify="center">
                    <PersephoneIcon width={64} height={64} />
                </Panel>

                <Panel direction="column" align="center" gap="xs">
                    <Text size="xxl" bold>Persephone</Text>
                    <Text color="light">Version {app.version || "..."}</Text>
                </Panel>

                <Divider />

                <Panel direction="column" gap="lg" width="100%">
                    <Panel justify="between">
                        <Text size="md" color="light">Electron</Text>
                        <Text size="md">{runtimeVersions?.electron || "..."}</Text>
                    </Panel>
                    <Panel justify="between">
                        <Text size="md" color="light">Node.js</Text>
                        <Text size="md">{runtimeVersions?.node || "..."}</Text>
                    </Panel>
                    <Panel justify="between">
                        <Text size="md" color="light">Chromium</Text>
                        <Text size="md">{runtimeVersions?.chrome || "..."}</Text>
                    </Panel>
                    <Panel justify="between">
                        <Text size="md" color="light">Available boards</Text>
                        <Text size="md">{availableBoards}</Text>
                    </Panel>
                </Panel>

                <Divider />

                <Panel direction="column" align="center" gap="lg" width="100%">
                    <Button name="about-check-updates" variant="primary" onClick={handleCheckForUpdates} disabled={checking}>
                        {checking ? "Checking..." : "Check for Updates"}
                    </Button>
                    {renderUpdateStatus()}
                </Panel>

                <Divider />

                <Panel justify="center" wrap gap="lg" width="100%">
                    <Button
                        name="about-github"
                        variant="link"
                        size="sm"
                        onClick={() => shell.openExternal("https://github.com/andriy-viyatyk/persephone")}
                    >
                        GitHub Repository
                    </Button>
                    <Button
                        name="about-report-issue"
                        variant="link"
                        size="sm"
                        onClick={() => shell.openExternal("https://github.com/andriy-viyatyk/persephone/issues")}
                    >
                        Report Issue
                    </Button>
                </Panel>
            </Panel>
        </Panel>
    );
}


const aboutEditorModule: EditorModule = {
    Editor: AboutView as unknown as EditorModule["Editor"],
    newEditorModel: async () =>
        new AboutEditor(
            new TComponentState(getDefaultAboutEditorState()),
        ) as unknown as EditorModel,
    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "aboutPage") return null;
        return new AboutEditor(
            new TComponentState(getDefaultAboutEditorState()),
        ) as unknown as EditorModel;
    },
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const initialState: AboutEditorState = {
            ...getDefaultAboutEditorState(),
            ...(state as Partial<AboutEditorState>),
        };
        return new AboutEditor(
            new TComponentState(initialState),
        ) as unknown as EditorModel;
    },
};

export default aboutEditorModule;

export { AboutView };
export type { AboutEditorProps };
