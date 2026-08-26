import { app } from "../../api/app";
import { boardInstallRegistry, type InstalledBoardEntry } from "../../api/board-install-registry";
import { boardTrust } from "../../api/board-trust";
import { publishedBoards } from "../../api/published-boards";
import { createLinkData } from "../../../shared/link-data";
import { compareVersions } from "../../../shared/version-utils";
import type { PublishedBoardInfo, PublishedBoardVersion } from "../../../ipc/api-param-types";
import { formatBytes } from "../../core/utils/format-bytes";
import { PageToolbarView, type PageToolbarViewProps } from "../base/PageToolbarView";
import type { EditorModel } from "../base/EditorModel";
import {
    BoardInfoEditorModel,
    type BoardInfoEditorState,
    type BoardPropsInfo,
    type InstallProgress,
} from "./BoardInfoEditorModel";
import { BoardScreenshotView } from "./BoardScreenshotView";
import { ButtonView, type ButtonViewProps } from "../../uikit/Button/ButtonView";
import { ProgressBarView } from "../../uikit/ProgressBar/ProgressBarView";
import { createPanelElement, type PanelStyleProps } from "../../uikit/Panel/panel-style";
import { createTextElement, type TextStyleProps } from "../../uikit/Text/text-style";
import { VanillaView, type IOwnedView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Button/Button.css";
import "../../uikit/Panel/Panel.css";
import "../../uikit/ProgressBar/ProgressBar.css";
import "../../uikit/Text/Text.css";

function isHttpUrl(value: string | undefined): boolean {
    return !!value && /^https?:\/\//i.test(value);
}

type TileStatus =
    | { kind: "idle" }
    | { kind: "downloading"; received?: number; total?: number }
    | { kind: "error"; error?: string }
    | { kind: "downloaded"; root: string }
    | { kind: "registered"; root: string };

const selectSurfaceState = (state: BoardInfoEditorState) => ({
    boardRoot: state.boardRoot,
    matches: state.matches,
    installDir: state.installDir,
    installUi: state.installUi,
    props: state.props,
    versions: state.versions,
    versionsState: state.versionsState,
});

const selectAutoSwitchState = (state: BoardInfoEditorState) => ({
    matchCount: state.matches.length,
    isProperties: Boolean(state.boardRoot),
});

type SurfaceState = ReturnType<typeof selectSurfaceState>;

interface BoardInfoBodyProps extends SurfaceState {
    model: BoardInfoEditorModel;
    installed: InstalledBoardEntry[];
    catalog: PublishedBoardInfo[];
}

function requireBoardInfoModel(model: EditorModel): BoardInfoEditorModel {
    if (!(model instanceof BoardInfoEditorModel)) {
        throw new Error("Board Info view received an invalid model.");
    }
    return model;
}

function panel(props: PanelStyleProps, ...children: Node[]): HTMLDivElement {
    return createPanelElement(props, children);
}

function text(value: string, props: TextStyleProps = {}): HTMLSpanElement {
    return createTextElement(value, props);
}

export class BoardInfoEditorView extends VanillaView<{ model: EditorModel }> {
    private model: BoardInfoEditorModel;
    private pageToolbar!: PageToolbarView;
    private body!: BoardInfoBodyView;

    public constructor(props: { model: EditorModel }) {
        const root = createPanelElement({
            direction: "column",
            width: "100%",
            height: "100%",
            minHeight: 0,
        });
        root.dataset.type = "board-info-editor";
        super(props, root);
        this.model = requireBoardInfoModel(props.model);
    }

    protected onMount(): void {
        this.pageToolbar = this.child(new PageToolbarView(this.pageToolbarProps()));
        this.body = this.child(new BoardInfoBodyView(this.bodyProps(selectSurfaceState(this.model.state.get()))));
        this.root.append(this.pageToolbar.root, this.body.root);
        this.pageToolbar.mount();
        this.body.mount();

        this.bind(this.model.state, selectSurfaceState, (state) => this.applySurfaceState(state));
        this.bind(this.model.state, selectAutoSwitchState, () => this.maybeAutoSwitch());
        this.own(boardInstallRegistry.subscribeInstalled(() => this.syncSurface()));
        this.own(boardTrust.subscribePaths(() => this.syncSurface()));
        this.own(publishedBoards.subscribeCatalog(() => this.syncSurface()));
        this.listen(window, "focus", () => {
            if (this.model.mode === "properties") void this.model.loadProperties();
            else void this.model.reconcile();
        });
    }

    protected onUpdate(props: { model: EditorModel }): void {
        this.model = requireBoardInfoModel(props.model);
        this.applySurfaceState(selectSurfaceState(this.model.state.get()));
    }

    private pageToolbarProps(): PageToolbarViewProps {
        return {
            model: this.model,
            name: this.model.mode === "properties" ? "Board properties" : "Install editor",
        };
    }

    private bodyProps(state: SurfaceState): BoardInfoBodyProps {
        return {
            ...state,
            model: this.model,
            installed: boardInstallRegistry.listInstalled(),
            catalog: publishedBoards.getCatalog(),
        };
    }

    private applySurfaceState(state: SurfaceState): void {
        this.pageToolbar.update(this.pageToolbarProps());
        this.body.update(this.bodyProps(state));
    }

    private syncSurface(): void {
        this.applySurfaceState(selectSurfaceState(this.model.state.get()));
    }

    private maybeAutoSwitch(): void {
        if (this.model.mode === "install" && this.model.shouldAutoSwitch()) {
            void this.model.autoSwitchToNatural();
        }
    }
}

class BoardInfoBodyView extends VanillaView<BoardInfoBodyProps> {
    private readonly dynamicChildren: IOwnedView[] = [];
    private readonly transientCleanups: Array<() => void> = [];

    public constructor(props: BoardInfoBodyProps) {
        super(props, createPanelElement({
            direction: "column",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            align: "stretch",
            gap: "lg",
            paddingX: "xl",
            paddingY: "lg",
        }));
    }

    protected onMount(): void {
        this.sync(this.props);
    }

    protected onUpdate(props: BoardInfoBodyProps): void {
        this.sync(props);
    }

    protected onDispose(): void {
        this.clearTransientCleanups();
    }

    private sync(props: BoardInfoBodyProps): void {
        this.releaseDynamicChildren();
        this.clearTransientCleanups();
        this.root.replaceChildren();
        if (props.boardRoot) this.renderProperties(props);
        else this.renderInstall(props);
    }

    private renderInstall(props: BoardInfoBodyProps): void {
        this.root.append(text("Install an editor for this file", { size: "lg", bold: true }));

        const location = panel({ direction: "column", gap: "xs", align: "stretch" },
            text("Install location", { size: "sm", color: "light" }));
        const locationRow = panel({ direction: "row", gap: "sm", align: "center" },
            text(props.installDir ?? "", { size: "sm" }));
        this.addButton(locationRow, {
            name: "board-info-browse",
            size: "sm",
            variant: "link",
            children: "Browse…",
            onClick: () => void props.model.changeInstallDir(),
        });
        location.append(locationRow);
        this.root.append(location);

        if (props.matches.length === 0) {
            this.root.append(text("No installable editor is published for this file type.", {
                size: "sm",
                color: "light",
            }));
            return;
        }

        for (const entry of props.matches) this.renderInstallTile(props, entry);
    }

    private renderInstallTile(props: BoardInfoBodyProps, entry: PublishedBoardInfo): void {
        const tile = panel({
            direction: "row",
            gap: "md",
            align: "start",
            border: true,
            borderColor: "default",
            rounded: "sm",
            padding: "md",
        });
        this.addChild(tile, new BoardScreenshotView({ url: entry.screenshotUrl }));
        const details = panel({ direction: "column", gap: "sm", align: "stretch", flex: 1, minWidth: 0 });
        details.append(panel({ direction: "row", align: "baseline", gap: "sm" },
            text(entry.name, { bold: true }),
            text(`v${entry.version}`, { size: "sm", color: "light" }),
            text(formatBytes(entry.archive.size), { size: "sm", color: "light" })));
        if (entry.description) details.append(text(entry.description, { size: "sm" }));
        if ((entry.fileMasks?.length ?? 0) > 0) {
            const masks = panel({ direction: "row", align: "center", gap: "xs", wrap: true },
                text("Files:", { size: "sm", color: "light" }));
            for (const mask of entry.fileMasks ?? []) masks.append(this.maskChip(mask));
            details.append(masks);
        }

        const status = this.tileStatus(props, entry);
        if (status.kind === "idle") {
            const actions = panel({ direction: "row", gap: "sm" });
            this.addButton(actions, {
                name: "board-info-download",
                variant: "link",
                children: "Download",
                onClick: () => void props.model.download(entry),
            });
            details.append(actions);
        } else if (status.kind === "downloading") {
            const downloading = panel({ direction: "column", gap: "xs", align: "stretch" });
            this.addChild(downloading, new ProgressBarView({
                name: "board-info-progress",
                value: status.received,
                max: status.total ?? entry.archive.size,
            }));
            const progressRow = panel({ direction: "row", align: "center", gap: "sm" },
                text(`${formatBytes(status.received ?? 0)} / ${formatBytes(status.total ?? entry.archive.size)}`, {
                    size: "sm",
                    color: "light",
                }));
            this.addButton(progressRow, {
                name: "board-info-cancel",
                size: "sm",
                variant: "link",
                children: "Cancel",
                onClick: () => props.model.cancelDownload(entry),
            });
            downloading.append(progressRow);
            details.append(downloading);
        } else if (status.kind === "error") {
            const error = panel({ direction: "column", gap: "xs", align: "stretch" },
                text(status.error ?? "Download failed.", { size: "sm", color: "danger" }));
            const actions = panel({ direction: "row", gap: "sm" });
            this.addButton(actions, {
                name: "board-info-retry",
                variant: "link",
                children: "Retry",
                onClick: () => void props.model.download(entry),
            });
            error.append(actions);
            details.append(error);
        } else if (status.kind === "downloaded") {
            const downloaded = panel({ direction: "column", gap: "sm", align: "stretch" },
                text("Downloaded — not registered", { size: "sm", color: "warning" }),
                text(status.root, { size: "sm", color: "light" }),
                text("You can ask your AI agent to review this board's files before trusting it.", {
                    size: "sm",
                    color: "light",
                }));
            const actions = panel({ direction: "row", gap: "sm" });
            this.addButton(actions, {
                name: "board-info-register",
                variant: "link",
                children: "Register board",
                onClick: () => void props.model.register(entry),
            });
            this.addButton(actions, {
                name: "board-info-delete",
                variant: "danger",
                children: "Delete download",
                onClick: () => void props.model.deleteDownload(entry),
            });
            downloaded.append(actions);
            details.append(downloaded);
        } else {
            details.append(text("Installed", { size: "sm", color: "success" }));
        }
        tile.append(details);
        this.root.append(tile);
    }

    private renderProperties(props: BoardInfoBodyProps): void {
        const info = props.props;
        if (!info) return;
        if (info.missing) {
            this.root.append(
                text(info.name, { size: "lg", bold: true }),
                text("This board is no longer installed (its folder was not found on disk).", {
                    size: "sm",
                    color: "warning",
                }),
            );
            return;
        }

        const screenshotUrl = info.catalogId
            ? props.catalog.find((board) => board.id === info.catalogId)?.screenshotUrl
            : undefined;
        const heading = panel({ direction: "row", align: "start", gap: "md" });
        this.addChild(heading, new BoardScreenshotView({ url: screenshotUrl }));
        const headingDetails = panel({ direction: "row", align: "baseline", gap: "sm", wrap: true, flex: 1, minWidth: 0 },
            text(info.name, { size: "lg", bold: true }));
        if (info.installedVersion) headingDetails.append(text(`v${info.installedVersion}`, { size: "sm", color: "light" }));
        const trusted = boardTrust.isTrusted(info.root);
        headingDetails.append(text(trusted ? "Trusted" : "Not trusted", {
            size: "sm",
            color: trusted ? "success" : "warning",
        }));
        heading.append(headingDetails);
        this.root.append(heading);

        const metadata = panel({ direction: "column", gap: "xs", align: "stretch" });
        if (info.description) metadata.append(this.infoRow("Description", text(info.description, { size: "sm" })));
        if (info.author) metadata.append(this.infoRow("Author", text(info.author, { size: "sm" })));
        if (info.repository) {
            const repository = text(info.repository, { size: "sm", hoverUnderline: isHttpUrl(info.repository) });
            if (isHttpUrl(info.repository)) {
                const repositoryUrl = info.repository;
                const openRepository = (): void => {
                    void app.events.openRawLink.sendAsync(createLinkData(repositoryUrl));
                };
                repository.addEventListener("click", openRepository);
                this.transientCleanups.push(() => repository.removeEventListener("click", openRepository));
            }
            metadata.append(this.infoRow("Repository", repository));
        }
        metadata.append(this.infoRow("Location", text(info.root, { size: "sm" })));
        if ((info.fileMasks?.length ?? 0) > 0) {
            const masks = panel({ direction: "row", align: "center", gap: "xs", wrap: true });
            if (info.editorName) masks.append(text(info.editorName, { size: "sm" }));
            for (const mask of info.fileMasks ?? []) masks.append(this.maskChip(mask));
            if ((info.folderMasks?.length ?? 0) > 0) {
                masks.append(text("in", { size: "sm", color: "light" }));
                for (const mask of info.folderMasks ?? []) masks.append(this.maskChip(mask));
            }
            if (info.editorKind) masks.append(text(`(${info.editorKind})`, { size: "sm", color: "light" }));
            metadata.append(this.infoRow("Editor for", masks));
        }
        if (info.isCatalogInstall && info.catalogId) {
            metadata.append(this.infoRow("Catalog id", text(info.catalogId, { size: "sm" })));
        }
        this.root.append(metadata);

        if (info.isCatalogInstall) this.renderVersions(props, info);

        const actions = panel({ direction: "row", gap: "sm", align: "center" });
        this.addButton(actions, {
            name: "board-info-open",
            variant: "primary",
            children: "Open board",
            onClick: () => void props.model.openBoard(),
        });
        this.addButton(actions, {
            name: info.isCatalogInstall ? "board-info-uninstall" : "board-info-unregister",
            variant: "danger",
            title: info.isCatalogInstall
                ? "Delete the board folder and remove it from trusted boards"
                : "Remove from trusted boards; the folder is kept on disk",
            children: info.isCatalogInstall ? "Uninstall" : "Unregister",
            onClick: info.isCatalogInstall
                ? () => void props.model.uninstall()
                : () => void props.model.unregister(),
        });
        this.root.append(actions);
    }

    private renderVersions(props: BoardInfoBodyProps, info: BoardPropsInfo): void {
        const versions = panel({ direction: "column", gap: "sm", align: "stretch" }, text("Versions", { bold: true }));
        if (props.versionsState === "loading") {
            const loading = panel({ direction: "column", gap: "xs", align: "stretch" });
            this.addChild(loading, new ProgressBarView({ name: "board-info-versions-loading" }));
            loading.append(text("Loading versions…", { size: "sm", color: "light" }));
            versions.append(loading);
        }
        if (props.versionsState === "error") {
            const error = panel({ direction: "row", gap: "sm", align: "center" },
                text("Couldn't load version history.", { size: "sm", color: "danger" }));
            this.addButton(error, {
                name: "board-info-versions-retry",
                size: "sm",
                variant: "link",
                children: "Retry",
                onClick: () => {
                    const id = props.model.state.get().props?.catalogId;
                    if (id) void props.model.loadVersions(id);
                },
            });
            versions.append(error);
        }
        if (props.versionsState === "idle" && (props.versions?.length ?? 0) === 0) {
            versions.append(text("No published versions found.", { size: "sm", color: "light" }));
        }
        if (props.versionsState === "idle" && (props.versions?.length ?? 0) > 0) {
            const rows = panel({ direction: "column", gap: "xs", align: "stretch" });
            for (const version of props.versions ?? []) {
                this.renderVersionRow(rows, props.model, version, info.installedVersion);
            }
            versions.append(rows);
        }
        this.root.append(versions);
    }

    private renderVersionRow(
        parent: HTMLElement,
        model: BoardInfoEditorModel,
        version: PublishedBoardVersion,
        installedVersion?: string,
    ): void {
        const cmp = installedVersion ? compareVersions(installedVersion, version.version) : 1;
        const isCurrent = cmp === 0;
        const isNewer = cmp > 0;
        const compatible = publishedBoards.isCompatible(version.minAppVersion);
        const row = panel({
            direction: "row",
            align: "center",
            gap: "sm",
            border: true,
            borderColor: isNewer && compatible ? "active" : "default",
            rounded: "sm",
            paddingX: "md",
            paddingY: "sm",
        });
        const details = panel({ direction: "column", flex: 1, minWidth: 0, gap: "xs" });
        const heading = panel({ direction: "row", align: "baseline", gap: "sm", wrap: true },
            text(`v${version.version}`, { bold: true }));
        if (version.date) heading.append(text(version.date, { size: "sm", color: "light" }));
        if (isCurrent) heading.append(text("Current", { size: "sm", color: "success" }));
        details.append(heading);
        if (version.notes) details.append(text(version.notes, { size: "sm" }));
        if (!compatible) details.append(text(`Requires Persephone ≥ ${version.minAppVersion}`, {
            size: "sm",
            color: "warning",
        }));
        row.append(details);
        if (!isCurrent) {
            this.addButton(row, {
                name: "board-info-version-install",
                size: "sm",
                variant: "link",
                disabled: !compatible,
                children: isNewer ? "Update" : "Install",
                onClick: () => void model.installBoardVersion(version),
            });
        }
        parent.append(row);
    }

    private infoRow(label: string, value: Node): HTMLDivElement {
        const labelPanel = panel({ width: 120, shrink: false }, text(label, { size: "sm", color: "light" }));
        const valuePanel = panel({ flex: 1, minWidth: 0 }, value);
        return panel({ direction: "row", gap: "sm", align: "baseline" }, labelPanel, valuePanel);
    }

    private maskChip(mask: string): HTMLDivElement {
        return panel({
            name: "board-info-mask",
            direction: "row",
            align: "center",
            background: "light",
            border: true,
            borderColor: "default",
            rounded: "sm",
            paddingX: "sm",
            paddingY: "xs",
        }, text(mask, { size: "sm" }));
    }

    private tileStatus(props: BoardInfoBodyProps, entry: PublishedBoardInfo): TileStatus {
        const ui: InstallProgress | undefined = props.installUi[entry.id];
        if (ui?.phase === "downloading") {
            return { kind: "downloading", received: ui.received, total: ui.total };
        }
        const installed = props.installed.find((candidate) => candidate.id === entry.id);
        if (installed) {
            return boardTrust.isTrusted(installed.root)
                ? { kind: "registered", root: installed.root }
                : { kind: "downloaded", root: installed.root };
        }
        if (ui?.phase === "error") return { kind: "error", error: ui.error };
        return { kind: "idle" };
    }

    private addButton(parent: HTMLElement, props: ButtonViewProps): ButtonView {
        return this.addChild(parent, new ButtonView(props));
    }

    private addChild<T extends IOwnedView & { mount(): HTMLElement }>(parent: HTMLElement, view: T): T {
        const child = this.child(view);
        this.dynamicChildren.push(child);
        parent.append(child.root);
        child.mount();
        return child;
    }

    private releaseDynamicChildren(): void {
        const children = this.dynamicChildren.splice(0);
        for (const child of children) this.releaseChild(child);
    }

    private clearTransientCleanups(): void {
        this.transientCleanups.splice(0).forEach((cleanup) => cleanup());
    }
}
