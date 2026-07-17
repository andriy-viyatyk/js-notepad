import { useEffect } from "react";

import { Panel, Text, Button, ProgressBar } from "../../uikit";
import { PageToolbar } from "../base/PageToolbar";
import { boardInstallRegistry } from "../../api/board-install-registry";
import { boardTrust } from "../../api/board-trust";
import { publishedBoards } from "../../api/published-boards";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { compareVersions } from "../../../shared/version-utils";
import type { PublishedBoardInfo, PublishedBoardVersion } from "../../../ipc/api-param-types";
import type { BoardInfoEditorModel, BoardPropsInfo, InstallProgress } from "./BoardInfoEditorModel";

// Human-readable byte size for the download-size / progress labels.
function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

function isHttpUrl(s: string | undefined): boolean {
    return !!s && /^https?:\/\//i.test(s);
}

type TileStatus =
    | { kind: "idle" }
    | { kind: "downloading"; received?: number; total?: number }
    | { kind: "error"; error?: string }
    | { kind: "downloaded"; root: string }
    | { kind: "registered"; root: string };

/**
 * Board Info editor view (EPIC-045). Two modes over one editor:
 * - **install** (US-864): lists uninstalled catalog boards matching the open file as tiles, each
 *   walking Download → Register board.
 * - **properties** (US-867): an installed board's info + a fetched-on-demand Versions list
 *   (install/rollback), Open board, and Uninstall/Unregister.
 * Pure UIKit composition (editors are app code, outside the `ui/` chrome exception — no Emotion).
 */
export function BoardInfoEditorView({ model }: { model: BoardInfoEditorModel }) {
    const s = model.state.use((st) => ({
        boardRoot: st.boardRoot,
        matches: st.matches,
        installDir: st.installDir,
        installUi: st.installUi,
        props: st.props,
        versions: st.versions,
        versionsState: st.versionsState,
    }));
    // Subscribe to install-registry + trust so tile / properties status re-renders on
    // download/register/delete/untrust.
    const installed = boardInstallRegistry.useInstalled();
    boardTrust.useTrustedPaths();

    const isProperties = !!s.boardRoot;

    // Install-mode restart edge (Concern 2A): the catalog no longer advertises a board for this
    // file → switch back to the file's natural editor. Guarded to install mode — in properties
    // mode a content-host board legitimately has a host file + zero matches.
    const matchCount = s.matches.length;
    useEffect(() => {
        if (isProperties) return;
        if (model.shouldAutoSwitch()) void model.autoSwitchToNatural();
    }, [model, matchCount, isProperties]);

    // Re-check disk state when the app regains focus. In install mode this heals a stale
    // "Downloaded — not registered" tile; in properties mode it refreshes trust/version info
    // (e.g. the folder was deleted externally).
    useEffect(() => {
        const onFocus = (): void => {
            if (isProperties) void model.loadProperties();
            else void model.reconcile();
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [model, isProperties]);

    return (
        <Panel data-type="board-info-editor" direction="column" width="100%" height="100%" minHeight={0}>
            <PageToolbar model={model} name={isProperties ? "Board properties" : "Install editor"} />
            <Panel
                direction="column"
                flex={1}
                minHeight={0}
                overflowY="auto"
                align="stretch"
                gap="lg"
                paddingX="xl"
                paddingY="lg"
            >
                {isProperties
                    ? <PropertiesBody model={model} props={s.props} versions={s.versions} versionsState={s.versionsState} />
                    : <InstallBody model={model} matches={s.matches} installDir={s.installDir} installUi={s.installUi} installed={installed} />}
            </Panel>
        </Panel>
    );
}

// =============================================================================
// Install mode (US-864)
// =============================================================================

function InstallBody({
    model,
    matches,
    installDir,
    installUi,
    installed,
}: {
    model: BoardInfoEditorModel;
    matches: PublishedBoardInfo[];
    installDir?: string;
    installUi: Record<string, InstallProgress>;
    installed: ReturnType<typeof boardInstallRegistry.useInstalled>;
}) {
    const tileStatus = (entry: PublishedBoardInfo): TileStatus => {
        const ui = installUi[entry.id];
        if (ui?.phase === "downloading") {
            return { kind: "downloading", received: ui.received, total: ui.total };
        }
        const reg = installed.find((e) => e.id === entry.id);
        if (reg) {
            return boardTrust.isTrusted(reg.root)
                ? { kind: "registered", root: reg.root }
                : { kind: "downloaded", root: reg.root };
        }
        if (ui?.phase === "error") return { kind: "error", error: ui.error };
        return { kind: "idle" };
    };

    return (
        <>
            <Text size="lg" bold>Install an editor for this file</Text>

            {/* Install location */}
            <Panel direction="column" gap="xs" align="stretch">
                <Text size="sm" color="light">Install location</Text>
                <Panel direction="row" gap="sm" align="center">
                    <Text size="sm">{installDir ?? ""}</Text>
                    <Button
                        name="board-info-browse"
                        size="sm"
                        variant="link"
                        onClick={() => void model.changeInstallDir()}
                    >
                        Browse…
                    </Button>
                </Panel>
            </Panel>

            {matches.length === 0 ? (
                <Text size="sm" color="light">
                    No installable editor is published for this file type.
                </Text>
            ) : (
                matches.map((entry) => {
                    const status = tileStatus(entry);
                    return (
                        <Panel
                            key={entry.id}
                            direction="column"
                            gap="sm"
                            align="stretch"
                            border
                            borderColor="default"
                            rounded="sm"
                            padding="md"
                        >
                            <Panel direction="row" align="baseline" gap="sm">
                                <Text bold>{entry.name}</Text>
                                <Text size="sm" color="light">{`v${entry.version}`}</Text>
                                <Text size="sm" color="light">
                                    {formatBytes(entry.archive.size)}
                                </Text>
                            </Panel>
                            {entry.description && <Text size="sm">{entry.description}</Text>}
                            {(entry.fileMasks?.length ?? 0) > 0 && (
                                <Panel direction="row" align="center" gap="xs" wrap>
                                    <Text size="sm" color="light">Files:</Text>
                                    {entry.fileMasks?.map((m) => (
                                        // Panel chip (not Tag) so the mask text stays selectable/copyable.
                                        <Panel
                                            key={m}
                                            name="board-info-mask"
                                            direction="row"
                                            align="center"
                                            background="light"
                                            border
                                            borderColor="default"
                                            rounded="sm"
                                            paddingX="sm"
                                            paddingY="xs"
                                        >
                                            <Text size="sm">{m}</Text>
                                        </Panel>
                                    ))}
                                </Panel>
                            )}

                            {status.kind === "idle" && (
                                <Panel direction="row" gap="sm">
                                    <Button
                                        name="board-info-download"
                                        variant="link"
                                        onClick={() => void model.download(entry)}
                                    >
                                        Download
                                    </Button>
                                </Panel>
                            )}

                            {status.kind === "downloading" && (
                                <Panel direction="column" gap="xs" align="stretch">
                                    <ProgressBar
                                        name="board-info-progress"
                                        value={status.received}
                                        max={status.total ?? entry.archive.size}
                                    />
                                    <Panel direction="row" align="center" gap="sm">
                                        <Text size="sm" color="light">
                                            {`${formatBytes(status.received ?? 0)} / ${formatBytes(
                                                status.total ?? entry.archive.size,
                                            )}`}
                                        </Text>
                                        <Button
                                            name="board-info-cancel"
                                            size="sm"
                                            variant="link"
                                            onClick={() => model.cancelDownload(entry)}
                                        >
                                            Cancel
                                        </Button>
                                    </Panel>
                                </Panel>
                            )}

                            {status.kind === "error" && (
                                <Panel direction="column" gap="xs" align="stretch">
                                    <Text size="sm" color="danger">
                                        {status.error ?? "Download failed."}
                                    </Text>
                                    <Panel direction="row" gap="sm">
                                        <Button
                                            name="board-info-retry"
                                            variant="link"
                                            onClick={() => void model.download(entry)}
                                        >
                                            Retry
                                        </Button>
                                    </Panel>
                                </Panel>
                            )}

                            {status.kind === "downloaded" && (
                                <Panel direction="column" gap="sm" align="stretch">
                                    <Text size="sm" color="warning">Downloaded — not registered</Text>
                                    <Text size="sm" color="light">{status.root}</Text>
                                    <Text size="sm" color="light">
                                        You can ask your AI agent to review this board's files
                                        before trusting it.
                                    </Text>
                                    <Panel direction="row" gap="sm">
                                        <Button
                                            name="board-info-register"
                                            variant="link"
                                            onClick={() => void model.register(entry)}
                                        >
                                            Register board
                                        </Button>
                                        <Button
                                            name="board-info-delete"
                                            variant="danger"
                                            onClick={() => void model.deleteDownload(entry)}
                                        >
                                            Delete download
                                        </Button>
                                    </Panel>
                                </Panel>
                            )}

                            {status.kind === "registered" && (
                                <Text size="sm" color="success">Installed</Text>
                            )}
                        </Panel>
                    );
                })
            )}
        </>
    );
}

// =============================================================================
// Properties mode (US-867)
// =============================================================================

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Panel direction="row" gap="sm" align="baseline">
            <Panel width={120} shrink={false}>
                <Text size="sm" color="light">{label}</Text>
            </Panel>
            <Panel flex={1} minWidth={0}>{children}</Panel>
        </Panel>
    );
}

function PropertiesBody({
    model,
    props,
    versions,
    versionsState,
}: {
    model: BoardInfoEditorModel;
    props?: BoardPropsInfo;
    versions?: PublishedBoardVersion[];
    versionsState?: "idle" | "loading" | "error";
}) {
    if (!props) return null;

    if (props.missing) {
        return (
            <>
                <Text size="lg" bold>{props.name}</Text>
                <Text size="sm" color="warning">
                    This board is no longer installed (its folder was not found on disk).
                </Text>
            </>
        );
    }

    const openRepo = (): void => {
        if (isHttpUrl(props.repository)) {
            void app.events.openRawLink.sendAsync(createLinkData(props.repository as string));
        }
    };

    return (
        <>
            <Panel direction="row" align="baseline" gap="sm" wrap>
                <Text size="lg" bold>{props.name}</Text>
                {props.installedVersion && (
                    <Text size="sm" color="light">{`v${props.installedVersion}`}</Text>
                )}
                <Text size="sm" color={props.trusted ? "success" : "warning"}>
                    {props.trusted ? "Trusted" : "Not trusted"}
                </Text>
            </Panel>

            <Panel direction="column" gap="xs" align="stretch">
                {props.description && <InfoRow label="Description"><Text size="sm">{props.description}</Text></InfoRow>}
                {props.author && <InfoRow label="Author"><Text size="sm">{props.author}</Text></InfoRow>}
                {props.repository && (
                    <InfoRow label="Repository">
                        {isHttpUrl(props.repository)
                            ? <Text size="sm" hoverUnderline onClick={openRepo}>{props.repository}</Text>
                            : <Text size="sm">{props.repository}</Text>}
                    </InfoRow>
                )}
                <InfoRow label="Location"><Text size="sm">{props.root}</Text></InfoRow>
                {(props.fileMasks?.length ?? 0) > 0 && (
                    <InfoRow label="Editor for">
                        <Panel direction="row" align="center" gap="xs" wrap>
                            {props.editorName && <Text size="sm">{props.editorName}</Text>}
                            {props.fileMasks?.map((m) => (
                                <Panel
                                    key={m}
                                    name="board-info-mask"
                                    direction="row"
                                    align="center"
                                    background="light"
                                    border
                                    borderColor="default"
                                    rounded="sm"
                                    paddingX="sm"
                                    paddingY="xs"
                                >
                                    <Text size="sm">{m}</Text>
                                </Panel>
                            ))}
                            {props.editorKind && (
                                <Text size="sm" color="light">{`(${props.editorKind})`}</Text>
                            )}
                        </Panel>
                    </InfoRow>
                )}
                {props.isCatalogInstall && props.catalogId && (
                    <InfoRow label="Catalog id"><Text size="sm">{props.catalogId}</Text></InfoRow>
                )}
            </Panel>

            {props.isCatalogInstall && (
                <VersionsSection
                    model={model}
                    installedVersion={props.installedVersion}
                    versions={versions}
                    versionsState={versionsState}
                />
            )}

            {/* Footer actions */}
            <Panel direction="row" gap="sm" align="center">
                <Button name="board-info-open" variant="primary" onClick={() => void model.openBoard()}>
                    Open board
                </Button>
                {props.isCatalogInstall ? (
                    <Button
                        name="board-info-uninstall"
                        variant="danger"
                        title="Delete the board folder and remove it from trusted boards"
                        onClick={() => void model.uninstall()}
                    >
                        Uninstall
                    </Button>
                ) : (
                    <Button
                        name="board-info-unregister"
                        variant="danger"
                        title="Remove from trusted boards; the folder is kept on disk"
                        onClick={() => void model.unregister()}
                    >
                        Unregister
                    </Button>
                )}
            </Panel>
        </>
    );
}

function VersionsSection({
    model,
    installedVersion,
    versions,
    versionsState,
}: {
    model: BoardInfoEditorModel;
    installedVersion?: string;
    versions?: PublishedBoardVersion[];
    versionsState?: "idle" | "loading" | "error";
}) {
    return (
        <Panel direction="column" gap="sm" align="stretch">
            <Text bold>Versions</Text>

            {versionsState === "loading" && (
                <Panel direction="column" gap="xs" align="stretch">
                    <ProgressBar name="board-info-versions-loading" />
                    <Text size="sm" color="light">Loading versions…</Text>
                </Panel>
            )}

            {versionsState === "error" && (
                <Panel direction="row" gap="sm" align="center">
                    <Text size="sm" color="danger">Couldn't load version history.</Text>
                    <Button
                        name="board-info-versions-retry"
                        size="sm"
                        variant="link"
                        onClick={() => {
                            const id = model.state.get().props?.catalogId;
                            if (id) void model.loadVersions(id);
                        }}
                    >
                        Retry
                    </Button>
                </Panel>
            )}

            {versionsState === "idle" && (versions?.length ?? 0) === 0 && (
                <Text size="sm" color="light">No published versions found.</Text>
            )}

            {versionsState === "idle" && (versions?.length ?? 0) > 0 && (
                <Panel direction="column" gap="xs" align="stretch">
                    {versions?.map((v) => (
                        <VersionRow
                            key={v.version}
                            model={model}
                            version={v}
                            installedVersion={installedVersion}
                        />
                    ))}
                </Panel>
            )}
        </Panel>
    );
}

function VersionRow({
    model,
    version,
    installedVersion,
}: {
    model: BoardInfoEditorModel;
    version: PublishedBoardVersion;
    installedVersion?: string;
}) {
    // `compareVersions(current, latest)` returns 1 when `latest` (2nd arg) is newer. With the
    // installed version as `current`, cmp > 0 means THIS row is newer (an update), cmp < 0 older
    // (a rollback), 0 the current one.
    const cmp = installedVersion ? compareVersions(installedVersion, version.version) : 1;
    const isCurrent = cmp === 0;
    const isNewer = cmp > 0;
    const compatible = publishedBoards.isCompatible(version.minAppVersion);

    return (
        <Panel
            direction="row"
            align="center"
            gap="sm"
            border
            borderColor={isNewer && compatible ? "active" : "default"}
            rounded="sm"
            paddingX="md"
            paddingY="sm"
        >
            <Panel direction="column" flex={1} minWidth={0} gap="xs">
                <Panel direction="row" align="baseline" gap="sm" wrap>
                    <Text bold>{`v${version.version}`}</Text>
                    {version.date && <Text size="sm" color="light">{version.date}</Text>}
                    {isCurrent && <Text size="sm" color="success">Current</Text>}
                </Panel>
                {version.notes && <Text size="sm">{version.notes}</Text>}
                {!compatible && (
                    <Text size="sm" color="warning">
                        {`Requires Persephone ≥ ${version.minAppVersion}`}
                    </Text>
                )}
            </Panel>
            {!isCurrent && (
                <Button
                    name="board-info-version-install"
                    size="sm"
                    variant="link"
                    disabled={!compatible}
                    onClick={() => void model.installBoardVersion(version)}
                >
                    {isNewer ? "Update" : "Install"}
                </Button>
            )}
        </Panel>
    );
}
