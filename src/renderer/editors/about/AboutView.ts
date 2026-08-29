import { app } from "../../api/app";
import { publishedBoards } from "../../api/published-boards";
import { shell } from "../../api/shell";
import type { IRuntimeVersions, IUpdateInfo } from "../../api/types/shell";
import rendererEvents from "../../../ipc/renderer/renderer-events";
import { EventEndpoint } from "../../../ipc/api-types";
import type { UpdateCheckResult } from "../../../ipc/api-param-types";
import type { EditorModel } from "../base/EditorModel";
import { AboutEditor } from "./AboutEditor";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView, type ButtonViewProps } from "../../uikit/Button/ButtonView";
import { DividerView } from "../../uikit/Divider/DividerView";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Button/Button.css";
import "../../uikit/Divider/Divider.css";

export interface AboutEditorProps {
    model: EditorModel;
}

function requireAboutModel(model: EditorModel): AboutEditor {
    if (!(model instanceof AboutEditor)) {
        throw new Error("About view received an invalid model.");
    }
    return model;
}

function mapUpdateResult(result: UpdateCheckResult): IUpdateInfo {
    const releaseInfo = result.releaseInfo;
    return {
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        updateAvailable: result.updateAvailable,
        releaseUrl: releaseInfo?.htmlUrl ?? null,
        releaseVersion: releaseInfo?.version ?? null,
        publishedAt: releaseInfo?.publishedAt ?? null,
        releaseNotes: releaseInfo?.body ?? null,
        error: result.error,
    };
}

export class AboutEditorView extends VanillaView<AboutEditorProps> {
    private model: AboutEditor;
    private runtimeVersions: IRuntimeVersions | null = null;
    private updateResult: IUpdateInfo | null = null;
    private checking = false;
    private availableBoards = 0;
    private alive = false;

    private electronVersion: HTMLSpanElement | undefined;
    private nodeVersion: HTMLSpanElement | undefined;
    private chromeVersion: HTMLSpanElement | undefined;
    private availableBoardsText: HTMLSpanElement | undefined;
    private checkButton: ButtonView | undefined;
    private readonly statusNodes: Node[] = [];
    private readonly statusButtons: ButtonView[] = [];

    public constructor(props: AboutEditorProps) {
        const root = createPanelElement({
            name: "about-root",
            direction: "column",
            align: "center",
            justify: "center",
            padding: "xxxl",
            flex: true,
            overflow: "auto",
        });
        super(props, root);
        this.model = requireAboutModel(props.model);
    }

    protected onMount(): void {
        this.alive = true;
        this.mountContent();

        const updateSubscription = rendererEvents[EventEndpoint.eUpdateAvailable].subscribe(
            (result: UpdateCheckResult) => {
                if (!this.alive) return;
                this.updateResult = mapUpdateResult(result);
                this.render();
            },
        );
        this.own(updateSubscription);
        this.own(publishedBoards.subscribeCatalog(() => {
            if (!this.alive) return;
            this.availableBoards = publishedBoards.getCatalog().length;
            this.render();
        }));

        this.availableBoards = publishedBoards.getCatalog().length;
        this.render();

        void shell.version.runtimeVersions().then((versions) => {
            if (!this.alive) return;
            this.runtimeVersions = versions;
            this.render();
        });
        // Pull the cached catalog so the count shows on open (idempotent; no network unless due).
        void publishedBoards.load();
    }

    protected onUpdate(props: AboutEditorProps): void {
        this.model = requireAboutModel(props.model);
    }

    protected onDispose(): void {
        this.alive = false;
        this.statusButtons.length = 0;
        this.statusNodes.length = 0;
        this.root.replaceChildren();
        this.electronVersion = undefined;
        this.nodeVersion = undefined;
        this.chromeVersion = undefined;
        this.availableBoardsText = undefined;
        this.checkButton = undefined;
        this.statusHost = undefined;
    }

    private mountContent(): void {
        const content = createPanelElement({
            name: "about-content",
            direction: "column",
            align: "center",
            padding: "xxxl",
            background: "light",
            rounded: "xl",
            width: "100%",
            maxWidth: 400,
            gap: "xl",
        });

        content.append(createPanelElement(
            { width: 64, height: 64, align: "center", justify: "center" },
            [createIconElement("persephone", { width: 64, height: 64 })],
        ));

        content.append(createPanelElement(
            { direction: "column", align: "center", gap: "xs" },
            [
                createTextElement("Persephone", { size: "xxl", bold: true }),
                createTextElement(`Version ${app.version || "..."}`, { color: "light" }),
            ],
        ));

        const firstDivider = this.child(new DividerView({}));
        content.append(firstDivider.root);
        firstDivider.mount();

        const versions = createPanelElement({ direction: "column", gap: "lg", width: "100%" });
        this.electronVersion = this.versionRow(versions, "Electron");
        this.nodeVersion = this.versionRow(versions, "Node.js");
        this.chromeVersion = this.versionRow(versions, "Chromium");
        this.availableBoardsText = this.versionRow(versions, "Available boards");
        content.append(versions);

        const secondDivider = this.child(new DividerView({}));
        content.append(secondDivider.root);
        secondDivider.mount();

        const updatePanel = createPanelElement({
            direction: "column",
            align: "center",
            gap: "lg",
            width: "100%",
        });
        this.checkButton = this.child(new ButtonView(this.checkButtonProps()));
        updatePanel.append(this.checkButton.root);
        this.checkButton.mount();
        content.append(updatePanel);
        this.statusHost = updatePanel;

        const thirdDivider = this.child(new DividerView({}));
        content.append(thirdDivider.root);
        thirdDivider.mount();

        const links = createPanelElement({ direction: "row", justify: "center", wrap: true, gap: "lg", width: "100%" });
        const github = this.child(new ButtonView({
            name: "about-github",
            variant: "link",
            size: "sm",
            onClick: () => { void shell.openExternal("https://github.com/andriy-viyatyk/persephone"); },
            children: "GitHub Repository",
        }));
        const reportIssue = this.child(new ButtonView({
            name: "about-report-issue",
            variant: "link",
            size: "sm",
            onClick: () => { void shell.openExternal("https://github.com/andriy-viyatyk/persephone/issues"); },
            children: "Report Issue",
        }));
        links.append(github.root, reportIssue.root);
        github.mount();
        reportIssue.mount();
        content.append(links);
        this.root.append(content);
    }

    private statusHost: HTMLDivElement | undefined;

    private versionRow(parent: HTMLElement, label: string): HTMLSpanElement {
        const value = createTextElement("...", { size: "md" });
        parent.append(createPanelElement(
            { justify: "between" },
            [createTextElement(label, { size: "md", color: "light" }), value],
        ));
        return value;
    }

    private checkButtonProps(): ButtonViewProps {
        return {
            name: "about-check-updates",
            variant: "primary",
            disabled: this.checking,
            onClick: () => { void this.handleCheckForUpdates(); },
            children: this.checking ? "Checking..." : "Check for Updates",
        };
    }

    private render(): void {
        const { electronVersion, nodeVersion, chromeVersion, availableBoardsText, checkButton } = this;
        if (!electronVersion || !nodeVersion || !chromeVersion || !availableBoardsText || !checkButton || !this.statusHost) return;
        electronVersion.textContent = this.runtimeVersions?.electron || "...";
        nodeVersion.textContent = this.runtimeVersions?.node || "...";
        chromeVersion.textContent = this.runtimeVersions?.chrome || "...";
        availableBoardsText.textContent = String(this.availableBoards);
        checkButton.update(this.checkButtonProps());
        this.renderUpdateStatus();
    }

    private renderUpdateStatus(): void {
        for (const button of this.statusButtons.splice(0)) this.releaseChild(button);
        for (const node of this.statusNodes.splice(0)) node.parentNode?.removeChild(node);

        if (this.checking) {
            const status = createTextElement("Checking for updates...", { size: "md", color: "light" });
            this.statusNodes.push(status);
            this.statusHost.append(status);
            return;
        }
        if (!this.updateResult) return;

        if (this.updateResult.updateAvailable && this.updateResult.releaseVersion && this.updateResult.releaseUrl) {
            const { releaseVersion, releaseUrl } = this.updateResult;
            const status = createTextElement(`New version ${releaseVersion} available!`, {
                size: "md",
                color: "warning",
            });
            const actions = createPanelElement({ justify: "center", wrap: true, gap: "lg" });
            const download = this.child(new ButtonView({
                variant: "link",
                size: "sm",
                onClick: () => { void shell.openExternal(releaseUrl); },
                children: "Download",
            }));
            const whatsNew = this.child(new ButtonView({
                variant: "link",
                size: "sm",
                onClick: () => {
                    void shell.openExternal("https://github.com/andriy-viyatyk/persephone/blob/main/docs/whats-new.md");
                },
                children: "What's New",
            }));
            this.statusButtons.push(download, whatsNew);
            actions.append(download.root, whatsNew.root);
            download.mount();
            whatsNew.mount();
            this.statusNodes.push(status, actions);
            this.statusHost.append(status, actions);
            return;
        }

        const status = createTextElement("You're up to date!", { size: "md", color: "success" });
        this.statusNodes.push(status);
        this.statusHost.append(status);
    }

    private async handleCheckForUpdates(): Promise<void> {
        this.checking = true;
        this.render();
        try {
            const [result] = await Promise.all([
                shell.version.checkForUpdates(true),
                publishedBoards.refresh().catch(() => {}),
            ]);
            if (this.alive) {
                this.updateResult = result;
                this.render();
            }
        } finally {
            if (this.alive) {
                this.checking = false;
                this.render();
            }
        }
    }
}

export { mapUpdateResult };
