import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DotView } from "../../uikit/Dot/DotView";
import { ProgressBarView } from "../../uikit/ProgressBar/ProgressBarView";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { claimViewOwnership, VanillaView } from "../../uikit/shared/vanilla-view";
import { MnemeConfigEditorModel } from "./MnemeConfigEditorModel";
import type { WikiModelDownload, WikiModelFile, WikiModelStatus } from "./mnemeTypes";
import { formatBytes, isDownloadActive, isModelReady } from "./mnemeTypes";
import type { MnemeConfigEditorState } from "./MnemeConfigEditorModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Button/Button.css";
import "../../uikit/ProgressBar/ProgressBar.css";

export interface ModelPanelProps { model: MnemeConfigEditorModel; state: MnemeConfigEditorState; }

function text(value: string, color?: "light" | "error" | "success" | "warning", size: "xs" | "sm" | "md" | "base" = "md"): HTMLSpanElement {
    return createTextElement(value, { size, color });
}

class DownloadProgressView extends VanillaView<{ download: WikiModelDownload }> {
    private progress: ProgressBarView | undefined; private label: HTMLSpanElement | undefined;
    public constructor(props: { download: WikiModelDownload }) { super(props, createPanelElement({ direction: "column", gap: "xs" })); }
    protected onMount(): void {
        const row = createPanelElement({ direction: "row", align: "center", gap: "sm" });
        const host = createPanelElement({ flex: true }); this.progress = this.child(new ProgressBarView({})); host.append(this.progress.root); this.progress.mount();
        this.label = text(""); row.append(host, this.label); this.root.append(row); this.sync(this.props);
    }
    protected onUpdate(props: { download: WikiModelDownload }): void { this.sync(props); }
    private sync(props: { download: WikiModelDownload }): void {
        const d = props.download; this.progress.update({ value: d.bytesTotal > 0 ? d.bytesDone : undefined, max: d.bytesTotal > 0 ? d.bytesTotal : undefined });
        this.label.dataset.color = d.phase === "error" ? "error" : "light";
        this.label.textContent = d.phase === "verifying" ? "verifying…" : d.phase === "error" ? "download failed" : `${formatBytes(d.bytesDone)} / ${formatBytes(d.bytesTotal)}`;
    }
}

class NoModelView extends VanillaView<Record<string, never>> {
    public constructor() { super({}, createPanelElement({ direction: "row", align: "center", gap: "sm" })); }
    protected onMount(): void { const dot = this.child(new DotView({ size: "xs", color: "warning" })); this.root.append(dot.root, text("No model resolved — semantic search is unavailable.", "warning")); dot.mount(); }
}

interface ModelDetailsProps { model: WikiModelStatus; ready: boolean; }
class ModelDetailsView extends VanillaView<ModelDetailsProps> {
    private heading: HTMLSpanElement | undefined; private statusDot: DotView | undefined; private statusText: HTMLSpanElement | undefined; private cache: HTMLSpanElement | undefined;
    private filesList: KeyedList<WikiModelFile, string, HTMLElement> | undefined; private filesHost: HTMLDivElement | undefined;
    private fileViews = new Map<HTMLElement, ModelFileView>();
    public constructor(props: ModelDetailsProps) { super(props, createPanelElement({ direction: "column", gap: "sm" })); }
    protected onMount(): void {
        const head = createPanelElement({ direction: "row", align: "center", gap: "md" });
        this.heading = text(""); this.statusDot = this.child(new DotView({ size: "xs", color: "warning" })); this.statusText = text("");
        head.append(this.heading, this.statusDot.root, this.statusText); this.statusDot.mount();
        this.cache = text("", "light", "xs");
        this.filesHost = createPanelElement({ direction: "column", gap: "xs", border: true, rounded: "md", padding: "md" });
        this.root.append(head, this.cache, this.filesHost);
        this.filesList = new KeyedList<WikiModelFile, string, HTMLElement>(this.filesHost, { keyOf: (file) => file.filename, create: (file) => this.createFile(file), update: (element, file) => this.fileViews.get(element)?.update({ file }), remove: (element) => this.removeFile(element) });
        this.own(() => this.filesList.dispose()); this.sync(this.props);
    }
    protected onUpdate(props: ModelDetailsProps): void { this.sync(props); }
    protected onDispose(): void { this.fileViews.clear(); this.filesList = undefined; this.filesHost = undefined; }
    private sync(props: ModelDetailsProps): void {
        const model = props.model; this.heading.textContent = `${model.name} · ${model.precision} · v${model.version}`; this.cache.textContent = `Cache: ${model.dir}`;
        this.statusDot.update({ size: "xs", color: props.ready ? "success" : "warning" }); this.statusText.dataset.color = props.ready ? "success" : "warning"; this.statusText.textContent = props.ready ? "ready" : "not loaded"; this.filesList.update(model.files);
    }
    private createFile(file: WikiModelFile): HTMLElement { const view = new ModelFileView({ file }); claimViewOwnership(view); view.mount(); this.fileViews.set(view.root, view); return view.root; }
    private removeFile(element: HTMLElement): void { this.fileViews.get(element)?.dispose(); this.fileViews.delete(element); }
}

class ModelFileView extends VanillaView<{ file: WikiModelFile }> {
    private filename: HTMLSpanElement | undefined; private present: HTMLSpanElement | undefined; private verified: HTMLSpanElement | undefined; private bytes: HTMLSpanElement | undefined;
    public constructor(props: { file: WikiModelFile }) { super(props, createPanelElement({ direction: "row", align: "center", gap: "md" })); }
    protected onMount(): void {
        const nameHost = createPanelElement({ width: 180 }); this.filename = text("", undefined, "md"); nameHost.append(this.filename);
        this.present = text(""); this.verified = text(""); const spacer = createPanelElement({ flex: true }); this.bytes = text("", "light", "xs"); this.root.append(nameHost, this.present, this.verified, spacer, this.bytes); this.sync(this.props);
    }
    protected onUpdate(props: { file: WikiModelFile }): void { this.sync(props); }
    private sync(props: { file: WikiModelFile }): void { const f = props.file; this.filename.textContent = f.filename; this.filename.dataset.truncate = ""; this.present.dataset.color = f.present ? "success" : "error"; this.present.textContent = f.present ? "present ✓" : "missing"; this.verified.hidden = !f.present; this.verified.dataset.color = f.verified ? "success" : "error"; this.verified.textContent = f.verified ? "verified ✓" : "verified ✕"; this.bytes.textContent = formatBytes(f.bytes); }
}

class ModelWarningView extends VanillaView<Record<string, never>> {
    public constructor() { super({}, createPanelElement({ direction: "row", align: "center", gap: "xs" })); }
    protected onMount(): void { const dot = this.child(new DotView({ size: "xs", color: "warning" })); this.root.append(dot.root, text("Model not loaded — semantic search unavailable", "warning")); dot.mount(); }
}

export class ModelPanelView extends VanillaView<ModelPanelProps> {
    private modelButton: ButtonView | undefined; private warningHost: HTMLDivElement | undefined; private body: HTMLDivElement | undefined;
    private warningView: ModelWarningView | undefined; private downloadView: DownloadProgressView | undefined; private modelArm: VanillaView<Record<string, never>> | ModelDetailsView | undefined;

    public constructor(props: ModelPanelProps) { super(props, createPanelElement({ direction: "column" })); }
    protected onMount(): void {
        const header = createPanelElement({ background: "dark", borderBottom: true, direction: "row", align: "center", gap: "sm", paddingX: "lg", paddingY: "sm" });
        header.append(text("Embedding model", undefined, "base"), createPanelElement({ flex: true })); this.warningHost = createPanelElement({});
        this.modelButton = this.child(new ButtonView(this.buttonProps())); header.append(this.warningHost, this.modelButton.root); this.modelButton.mount();
        this.body = createPanelElement({ direction: "column", gap: "md", padding: "lg" }); this.root.append(header, this.body); this.sync(this.props);
    }
    protected onUpdate(props: ModelPanelProps): void { this.sync(props); }
    protected onDispose(): void { this.warningView = undefined; this.downloadView = undefined; this.modelArm = undefined; this.warningHost = undefined; this.body = undefined; }
    private sync(props: ModelPanelProps): void {
        const model = props.state.status?.model; const ready = isModelReady(props.state.status); const download = model?.download; const downloading = isDownloadActive(download);
        this.modelButton.update(this.buttonProps());
        if (!ready && !downloading && !this.warningView) { this.warningView = this.child(new ModelWarningView()); this.warningHost.append(this.warningView.root); this.warningView.mount(); }
        else if ((ready || downloading) && this.warningView) { this.releaseChild(this.warningView); this.warningView = undefined; }
        if (download && (downloading || download.phase === "error") && !this.downloadView) { this.downloadView = this.child(new DownloadProgressView({ download })); if (this.modelArm) this.body.insertBefore(this.downloadView.root, this.modelArm.root); else this.body.append(this.downloadView.root); this.downloadView.mount(); }
        else if (!(download && (downloading || download.phase === "error")) && this.downloadView) { this.releaseChild(this.downloadView); this.downloadView = undefined; }
        else if (this.downloadView && download) this.downloadView.update({ download });
        if (!model && !this.modelArm) { const view = this.child(new NoModelView()); this.modelArm = view; this.body.append(view.root); view.mount(); }
        else if (model && !this.modelArm) { const view = this.child(new ModelDetailsView({ model, ready })); this.modelArm = view; this.body.append(view.root); view.mount(); }
        else if (!model && this.modelArm) { this.releaseChild(this.modelArm); this.modelArm = undefined; const view = this.child(new NoModelView()); this.modelArm = view; this.body.append(view.root); view.mount(); }
        else if (model && this.modelArm instanceof ModelDetailsView) this.modelArm.update({ model, ready });
        else if (model && this.modelArm) { this.releaseChild(this.modelArm); const view = this.child(new ModelDetailsView({ model, ready })); this.modelArm = view; this.body.append(view.root); view.mount(); }
    }
    private buttonProps() { const status = this.props.state.status; const model = status?.model; const downloading = isDownloadActive(model?.download); const ready = isModelReady(status); return { name: "mneme-update-model", size: "sm" as const, variant: ready ? "default" as const : "primary" as const, disabled: downloading, children: downloading ? "Downloading…" : ready ? "Update model" : "Load model", onClick: () => { void this.props.model.updateModel(); } }; }
}
