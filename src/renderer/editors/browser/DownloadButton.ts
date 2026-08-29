import { createPanelElement } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import color from "../../theme/color";
import { downloads } from "../../api/downloads";
import { closeDownloadsPopup, isDownloadsPopupOpen, showDownloadsPopup } from "./BrowserDownloadsPopup";
import "../../uikit/Panel/Panel.css";

const RING_SIZE = 22;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type DownloadProjection = { hasActive: boolean; progress: number };

export class DownloadButtonView extends VanillaView<Record<string, never>> {
    private readonly button: IconButtonView;
    private ring: SVGSVGElement | undefined;
    private progressCircle: SVGCircleElement | undefined;

    public constructor() {
        super({}, createPanelElement({ name: "downloads-button", position: "relative", align: "center", justify: "center" }));
        this.root.dataset.downloadsButton = "";
        this.button = this.child(new IconButtonView({ name: "toolbar-downloads", size: "sm", title: "Downloads", icon: "download", onClick: this.handleClick }));
    }
    protected onMount(): void { this.root.append(this.button.root); this.button.mount(); this.bind(downloads.state, (state) => this.project(state), this.sync); }
    private readonly project = (state: typeof downloads.state extends { get(): infer T } ? T : never): DownloadProjection => { const active = state.downloads.filter((download) => download.status === "downloading"); const total = active.reduce((sum, download) => sum + download.totalBytes, 0); const received = active.reduce((sum, download) => sum + download.receivedBytes, 0); return { hasActive: active.length > 0, progress: total > 0 ? Math.min(1, received / total) : 0 }; };
    private readonly sync = (projection: DownloadProjection): void => { this.button.update({ name: "toolbar-downloads", size: "sm", title: "Downloads", active: projection.hasActive, icon: "download", onClick: this.handleClick }); if (!projection.hasActive) { this.ring?.remove(); this.ring = undefined; this.progressCircle = undefined; return; } if (!this.ring) this.createRing(); if (this.progressCircle) this.progressCircle.setAttribute("stroke-dashoffset", String(RING_CIRCUMFERENCE * (1 - projection.progress))); };
    private createRing(): void { const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg"); ring.dataset.part = "progress-ring"; ring.setAttribute("viewBox", `0 0 ${RING_SIZE} ${RING_SIZE}`); ring.setAttribute("width", String(RING_SIZE)); ring.setAttribute("height", String(RING_SIZE)); ring.style.position = "absolute"; ring.style.top = "1px"; ring.style.left = "1px"; ring.style.pointerEvents = "none"; const background = document.createElementNS("http://www.w3.org/2000/svg", "circle"); background.setAttribute("cx", String(RING_CENTER)); background.setAttribute("cy", String(RING_CENTER)); background.setAttribute("r", String(RING_RADIUS)); background.setAttribute("fill", "none"); background.setAttribute("stroke", color.border.light); background.setAttribute("stroke-width", "1.5"); const progress = document.createElementNS("http://www.w3.org/2000/svg", "circle"); progress.setAttribute("cx", String(RING_CENTER)); progress.setAttribute("cy", String(RING_CENTER)); progress.setAttribute("r", String(RING_RADIUS)); progress.setAttribute("fill", "none"); progress.setAttribute("stroke", color.border.active); progress.setAttribute("stroke-width", "1.5"); progress.setAttribute("stroke-linecap", "round"); progress.setAttribute("stroke-dasharray", String(RING_CIRCUMFERENCE)); progress.setAttribute("transform", `rotate(-90 ${RING_CENTER} ${RING_CENTER})`); progress.style.transition = "stroke-dashoffset 0.3s ease"; ring.append(background, progress); this.root.append(ring); this.ring = ring; this.progressCircle = progress; }
    private readonly handleClick = (): void => { const button = this.button.root; if (isDownloadsPopupOpen()) closeDownloadsPopup(); else showDownloadsPopup(button); };
}
