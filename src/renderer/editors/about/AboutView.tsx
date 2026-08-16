import { useEffect } from "react";
import { AboutEditor } from "./AboutEditor";
import { PersephoneIcon } from "../../theme/icons";
import { Panel, Text, Button, Divider } from "../../uikit";
import { app } from "../../api/app";
import { shell } from "../../api/shell";
import { publishedBoards } from "../../api/published-boards";
import type { IRuntimeVersions, IUpdateInfo } from "../../api/types/shell";
import rendererEvents from "../../../ipc/renderer/renderer-events";
import { EventEndpoint } from "../../../ipc/api-types";
import type { UpdateCheckResult } from "../../../ipc/api-param-types";
import { TComponentModel, useComponentModel } from "../../core/state/model";

// ============================================================================
// AboutView Component
// ============================================================================

interface AboutEditorProps {
    model: AboutEditor;
}

interface AboutViewState {
    runtimeVersions: IRuntimeVersions | null;
    updateResult: IUpdateInfo | null;
    checking: boolean;
}

const defaultAboutViewState: AboutViewState = {
    runtimeVersions: null,
    updateResult: null,
    checking: false,
};

class AboutViewModel extends TComponentModel<AboutViewState, AboutEditorProps> {
    setRuntimeVersions = (runtimeVersions: IRuntimeVersions) => {
        this.state.update((s) => { s.runtimeVersions = runtimeVersions; });
    };

    setUpdateResult = (updateResult: IUpdateInfo) => {
        this.state.update((s) => { s.updateResult = updateResult; });
    };

    setChecking = (checking: boolean) => {
        this.state.update((s) => { s.checking = checking; });
    };
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

function AboutView(props: AboutEditorProps) {
    const viewModel = useComponentModel(props, AboutViewModel, defaultAboutViewState);
    const runtimeVersions = viewModel.state.use((s) => s.runtimeVersions);
    const updateResult = viewModel.state.use((s) => s.updateResult);
    const checking = viewModel.state.use((s) => s.checking);
    // Reactive count of published-catalog boards — updates live when the catalog is refreshed
    // (including by "Check for Updates" below).
    const availableBoards = publishedBoards.useCatalog().length;

    useEffect(() => {
        shell.version.runtimeVersions().then(viewModel.setRuntimeVersions);
        // Pull the cached catalog so the count shows on open (idempotent; no network unless due).
        void publishedBoards.load();

        const subscription = rendererEvents[EventEndpoint.eUpdateAvailable].subscribe(
            (result: UpdateCheckResult) => {
                viewModel.setUpdateResult(mapUpdateResult(result));
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, [viewModel]);

    const handleCheckForUpdates = async () => {
        viewModel.setChecking(true);
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
            viewModel.setUpdateResult(result);
        } finally {
            viewModel.setChecking(false);
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

export { AboutView };
export type { AboutEditorProps };
