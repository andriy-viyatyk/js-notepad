import { settings } from "../../api/settings";
import { themeState } from "../../theme/theme-state";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EffectType, IVisualizerEffect } from "./effects/types";
import { BarsEffect } from "./effects/BarsEffect";
import { CircularEffect } from "./effects/CircularEffect";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "./video-editor.css";

const FFT_SIZE = 256;

function createEffect(type: EffectType): IVisualizerEffect | null {
    switch (type) {
        case "bars": return new BarsEffect();
        case "circular": return new CircularEffect();
        case "none": return null;
    }
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function createBarsIconElement(): SVGElement {
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("width", "14");
    element.setAttribute("height", "12");
    element.setAttribute("viewBox", "0 0 14 12");
    element.setAttribute("fill", "currentColor");
    element.setAttribute("aria-hidden", "true");
    const bars = [
        ["0", "5", "2", "7"], ["3", "2", "2", "10"], ["6", "0", "2", "12"],
        ["9", "3", "2", "9"], ["12", "6", "2", "6"],
    ];
    for (const [x, y, width, height] of bars) {
        const bar = document.createElementNS(SVG_NAMESPACE, "rect");
        bar.setAttribute("x", x);
        bar.setAttribute("y", y);
        bar.setAttribute("width", width);
        bar.setAttribute("height", height);
        bar.setAttribute("rx", "0.5");
        element.append(bar);
    }
    return element;
}

function createCircularIconElement(): SVGElement {
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("width", "14");
    element.setAttribute("height", "14");
    element.setAttribute("viewBox", "0 0 14 14");
    element.setAttribute("fill", "none");
    element.setAttribute("stroke", "currentColor");
    element.setAttribute("stroke-width", "1.2");
    element.setAttribute("aria-hidden", "true");
    const shapes: [string, Record<string, string>][] = [
        ["circle", { cx: "7", cy: "7", r: "2.5" }],
        ["line", { x1: "7", y1: "4.5", x2: "7", y2: "1" }],
        ["line", { x1: "7", y1: "9.5", x2: "7", y2: "13" }],
        ["line", { x1: "4.5", y1: "7", x2: "1", y2: "7" }],
        ["line", { x1: "9.5", y1: "7", x2: "13", y2: "7" }],
        ["line", { x1: "5.3", y1: "5.3", x2: "2.9", y2: "2.9" }],
        ["line", { x1: "8.7", y1: "8.7", x2: "11.1", y2: "11.1" }],
        ["line", { x1: "8.7", y1: "5.3", x2: "11.1", y2: "2.9" }],
        ["line", { x1: "5.3", y1: "8.7", x2: "2.9", y2: "11.1" }],
    ];
    for (const [tag, attributes] of shapes) {
        const shape = document.createElementNS(SVG_NAMESPACE, tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
        element.append(shape);
    }
    return element;
}

function createNoneIconElement(): SVGElement {
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("width", "14");
    element.setAttribute("height", "14");
    element.setAttribute("viewBox", "0 0 14 14");
    element.setAttribute("fill", "none");
    element.setAttribute("stroke", "currentColor");
    element.setAttribute("stroke-width", "1.2");
    element.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS(SVG_NAMESPACE, "circle");
    circle.setAttribute("cx", "7");
    circle.setAttribute("cy", "7");
    circle.setAttribute("r", "5.5");
    const line = document.createElementNS(SVG_NAMESPACE, "line");
    line.setAttribute("x1", "3.1");
    line.setAttribute("y1", "3.1");
    line.setAttribute("x2", "10.9");
    line.setAttribute("y2", "10.9");
    element.append(circle, line);
    return element;
}

const EFFECTS: { type: EffectType; createIcon: () => SVGElement; label: string }[] = [
    { type: "bars", createIcon: createBarsIconElement, label: "Bars" },
    { type: "circular", createIcon: createCircularIconElement, label: "Circular" },
    { type: "none", createIcon: createNoneIconElement, label: "No effect" },
];

interface TrackInfo {
    title: string;
    artist: string;
}

export interface AudioVisualizerProps {
    media: HTMLMediaElement;
    playing: boolean;
    sourceUrl?: string;
}

function parseFilenameInfo(sourceUrl: string): TrackInfo | null {
    const basename = sourceUrl.replace(/\\/g, "/").split("/").pop() ?? "";
    const name = basename.replace(/\.[^.]+$/, "").trim();
    if (!name) return null;
    const separator = name.includes(" – ") ? " – " : name.includes(" - ") ? " - " : null;
    if (separator) {
        const index = name.indexOf(separator);
        return { artist: name.slice(0, index).trim(), title: name.slice(index + separator.length).trim() };
    }
    return { artist: "", title: name };
}

function selectedEffect(value: unknown): EffectType {
    return value === "circular" || value === "none" ? value : "bars";
}

export class AudioVisualizerView extends VanillaView<AudioVisualizerProps> {
    private canvas!: HTMLCanvasElement;
    private metadata!: HTMLDivElement;
    private titleLabel!: HTMLSpanElement;
    private artistLabel!: HTMLSpanElement;
    private switcher!: HTMLDivElement;
    private effectButtons!: Map<EffectType, IconButtonView>;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private effect: IVisualizerEffect | null = null;
    private contextClosed = false;
    private rafId: number | undefined;
    private sizingRafId: number | undefined;
    private animationGeneration = 0;
    private sizingGeneration = 0;
    private selectedEffect: EffectType = "bars";
    private trackInfo: TrackInfo | null = null;
    private pageVisible = true;
    private sourceUrl: string | undefined;
    private inert = false;

    public constructor(props: AudioVisualizerProps) {
        super(props, createPanelElement({
            name: "audio-visualizer",
            position: "relative",
            width: "100%",
            height: "100%",
            revealChildrenOnHover: true,
        }));
    }

    protected onMount(): void {
        this.sourceUrl = this.props.sourceUrl;
        this.canvas = document.createElement("canvas");
        this.canvas.dataset.part = "visualizer-canvas";
        this.metadata = createPanelElement({
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            direction: "column",
            align: "center",
            justify: "center",
            gap: "md",
        });
        this.metadata.dataset.part = "visualizer-track-info";
        this.titleLabel = createTextElement("", { size: "lg", bold: true, align: "center" });
        this.artistLabel = createTextElement("", { size: "md", color: "light", align: "center" });
        this.metadata.append(this.titleLabel, this.artistLabel);

        this.switcher = createPanelElement({
            position: "absolute",
            top: 8,
            right: 8,
            direction: "row",
            gap: "sm",
        });
        this.switcher.dataset.part = "visualizer-effect-switcher";
        this.switcher.dataset.visibility = "parent-hover";
        this.effectButtons = new Map();
        for (const item of EFFECTS) {
            const button = this.child(new IconButtonView({
                name: `visualizer-${item.type}`,
                variant: "chip",
                size: "sm",
                active: false,
                title: item.label,
                icon: item.createIcon(),
                onClick: (event) => {
                    event.stopPropagation();
                    settings.set("visualizer-effect", item.type);
                },
            }));
            this.effectButtons.set(item.type, button);
            this.switcher.append(button.root);
        }
        this.root.append(this.canvas, this.metadata, this.switcher);
        for (const button of this.effectButtons.values()) button.mount();

        // This disposer deliberately reads the live frame fields at teardown time. Capturing the
        // first requestAnimationFrame id here would leak every subsequent scheduled frame.
        this.own(() => {
            this.inert = true;
            this.animationGeneration++;
            if (this.rafId !== undefined) cancelAnimationFrame(this.rafId);
            this.rafId = undefined;
            this.sizingGeneration++;
            if (this.sizingRafId !== undefined) cancelAnimationFrame(this.sizingRafId);
            this.sizingRafId = undefined;
        });

        const observer = new IntersectionObserver(([entry]) => {
            if (this.inert) return;
            this.pageVisible = entry.isIntersecting;
            this.syncAnimation();
        }, { threshold: 0 });
        observer.observe(this.canvas);
        this.own(() => observer.disconnect());

        this.listen(this.props.media, "loadedmetadata", this.handleMetadata);
        this.listen(this.props.media, "emptied", () => {
            if (this.inert) return;
            this.trackInfo = null;
            this.syncMetadata();
        });

        const settingsSubscription = settings.onChanged.subscribe(({ key, value }) => {
            if (this.inert || key !== "visualizer-effect") return;
            this.applyEffectSelection(selectedEffect(value));
        });
        this.own(settingsSubscription);

        this.own(() => {
            const context = this.audioContext;
            if (context && !this.contextClosed) {
                this.contextClosed = true;
                void context.close().catch(() => {});
            }
            this.analyser = null;
            this.audioContext = null;
        });
        this.own(() => {
            this.effect?.dispose?.();
            this.effect = null;
        });
        this.own(() => {
            this.canvas = undefined as never;
            this.metadata = undefined as never;
            this.switcher = undefined as never;
        });

        this.applyEffectSelection(selectedEffect(settings.get("visualizer-effect")));
        this.scheduleCanvasMeasurement();
        this.syncPlayback(this.props.playing);
        this.syncAnimation();
    }

    protected onUpdate(props: AudioVisualizerProps): void {
        this.sourceUrl = props.sourceUrl;
        this.syncPlayback(props.playing);
        this.syncAnimation();
    }

    private applyEffectSelection(effect: EffectType): void {
        if (this.selectedEffect === effect && this.effectButtons && (effect === "none" || this.effect !== null)) {
            this.syncMetadata();
            this.syncAnimation();
            return;
        }
        this.selectedEffect = effect;
        this.effect?.dispose?.();
        this.effect = createEffect(effect);
        if (this.effectButtons) {
            for (const [type, button] of this.effectButtons) {
                const props: IconButtonViewProps = {
                    name: `visualizer-${type}`,
                    variant: "chip",
                    size: "sm",
                    active: this.selectedEffect === type,
                    title: EFFECTS.find((item) => item.type === type)?.label,
                    icon: EFFECTS.find((item) => item.type === type)?.createIcon() ?? createNoneIconElement(),
                    onClick: (event) => {
                        event.stopPropagation();
                        settings.set("visualizer-effect", type);
                    },
                };
                button.update(props);
            }
        }
        this.syncMetadata();
        this.syncAnimation();
    }

    private syncPlayback(playing: boolean): void {
        if (!playing) return;
        this.ensureAudioGraph();
        const context = this.audioContext;
        if (context?.state === "suspended") {
            void context.resume().then(() => {
                if (this.inert || context !== this.audioContext) return;
                this.syncAnimation();
            }, () => {});
        }
    }

    private ensureAudioGraph(): void {
        if (this.audioContext || this.contextClosed || this.inert) return;
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.8;
        const source = context.createMediaElementSource(this.props.media);
        source.connect(analyser);
        analyser.connect(context.destination);
        this.audioContext = context;
        this.analyser = analyser;
    }

    private syncAnimation(): void {
        if (!this.canvas || this.inert) return;
        this.stopAnimation();
        if (this.selectedEffect === "none") {
            this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        if (!this.pageVisible || !this.analyser || !this.effect) return;

        const context = this.canvas.getContext("2d");
        if (!context) return;
        const analyser = this.analyser;
        const effect = this.effect;
        const generation = this.animationGeneration;
        const draw = (): void => {
            if (this.inert || generation !== this.animationGeneration) return;
            this.rafId = requestAnimationFrame(draw);
            if (this.inert || generation !== this.animationGeneration) return;
            const width = this.canvas.offsetWidth;
            const height = this.canvas.offsetHeight;
            if (this.canvas.width !== width) this.canvas.width = width;
            if (this.canvas.height !== height) this.canvas.height = height;
            effect.draw(context, analyser, width, height, themeState.get().isDark);
        };
        this.rafId = requestAnimationFrame(draw);
    }

    private stopAnimation(): void {
        this.animationGeneration++;
        if (this.rafId !== undefined) cancelAnimationFrame(this.rafId);
        this.rafId = undefined;
    }

    private scheduleCanvasMeasurement(): void {
        this.cancelCanvasMeasurement();
        const generation = ++this.sizingGeneration;
        let attempts = 0;
        const measure = (): void => {
            if (this.inert || generation !== this.sizingGeneration) return;
            this.sizingRafId = undefined;
            const width = this.canvas.offsetWidth;
            const height = this.canvas.offsetHeight;
            if (width > 0 && height > 0) {
                if (this.canvas.width !== width) this.canvas.width = width;
                if (this.canvas.height !== height) this.canvas.height = height;
                return;
            }
            attempts++;
            if (attempts < 3) this.sizingRafId = requestAnimationFrame(measure);
        };
        this.sizingRafId = requestAnimationFrame(measure);
    }

    private cancelCanvasMeasurement(): void {
        this.sizingGeneration++;
        if (this.sizingRafId !== undefined) cancelAnimationFrame(this.sizingRafId);
        this.sizingRafId = undefined;
    }

    private readonly handleMetadata = (): void => {
        if (this.inert) return;
        const metadata = navigator.mediaSession?.metadata;
        if (metadata?.title || metadata?.artist) {
            this.trackInfo = { title: metadata.title || "", artist: metadata.artist || "" };
        } else if (this.sourceUrl) {
            this.trackInfo = parseFilenameInfo(this.sourceUrl);
        } else {
            this.trackInfo = null;
        }
        this.syncMetadata();
    };

    private syncMetadata(): void {
        if (!this.metadata) return;
        const info = this.trackInfo;
        this.metadata.hidden = this.selectedEffect !== "none" || !info;
        this.titleLabel.textContent = info?.title ?? "";
        this.artistLabel.textContent = info?.artist ?? "";
        this.titleLabel.hidden = !info?.title;
        this.artistLabel.hidden = !info?.artist;
    }
}
