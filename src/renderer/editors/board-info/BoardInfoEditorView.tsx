import { useEffect } from "react";

import { Panel, Text, Button, ProgressBar } from "../../uikit";
import { PageToolbar } from "../base/PageToolbar";
import { boardInstallRegistry } from "../../api/board-install-registry";
import { boardTrust } from "../../api/board-trust";
import type { PublishedBoardInfo } from "../../../ipc/api-param-types";
import type { BoardInfoEditorModel } from "./BoardInfoEditorModel";

// Human-readable byte size for the download-size / progress labels.
function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

type TileStatus =
    | { kind: "idle" }
    | { kind: "downloading"; received?: number; total?: number }
    | { kind: "error"; error?: string }
    | { kind: "downloaded"; root: string }
    | { kind: "registered"; root: string };

/**
 * Board Info editor — install-mode view (EPIC-045 / US-864). Lists uninstalled catalog boards
 * matching the open file as install tiles, each walking the Download → Register board flow.
 * Pure UIKit composition (editors are app code, outside the `ui/` chrome exception — no Emotion).
 */
export function BoardInfoEditorView({ model }: { model: BoardInfoEditorModel }) {
    const s = model.state.use((st) => ({
        matches: st.matches,
        installDir: st.installDir,
        installUi: st.installUi,
    }));
    // Subscribe to install-registry + trust so tile status re-renders on download/register/delete.
    const installed = boardInstallRegistry.useInstalled();
    boardTrust.useTrustedPaths();

    // Restart edge (Concern 2A): the catalog no longer advertises a board for this file →
    // switch back to the file's natural editor rather than stranding an empty screen.
    const matchCount = s.matches.length;
    useEffect(() => {
        if (model.shouldAutoSwitch()) void model.autoSwitchToNatural();
    }, [model, matchCount]);

    // Re-check disk state when the app regains focus (e.g. the user deleted a downloaded board's
    // folder in Explorer and switched back) — there is no filesystem watcher, so a stale
    // "Downloaded — not registered" tile heals here.
    useEffect(() => {
        const onFocus = (): void => { void model.reconcile(); };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [model]);

    const tileStatus = (entry: PublishedBoardInfo): TileStatus => {
        const ui = s.installUi[entry.id];
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
        <Panel data-type="board-info-editor" direction="column" width="100%" height="100%" minHeight={0}>
            <PageToolbar model={model} name="Install editor" />
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
                <Text size="lg" bold>Install an editor for this file</Text>

                {/* Install location */}
                <Panel direction="column" gap="xs" align="stretch">
                    <Text size="sm" color="light">Install location</Text>
                    <Panel direction="row" gap="sm" align="center">
                        <Text size="sm">{s.installDir ?? ""}</Text>
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

                {s.matches.length === 0 ? (
                    <Text size="sm" color="light">
                        No installable editor is published for this file type.
                    </Text>
                ) : (
                    s.matches.map((entry) => {
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
            </Panel>
        </Panel>
    );
}
