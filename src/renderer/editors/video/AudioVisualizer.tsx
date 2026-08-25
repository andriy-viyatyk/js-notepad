import React, { useEffect, useRef, useState } from "react";
import { IconButton, Panel } from "../../uikit";
import type { EffectType, IVisualizerEffect } from "./effects/types";
import { BarsEffect } from "./effects/BarsEffect";
import { CircularEffect } from "./effects/CircularEffect";
import color from "../../theme/color";
import { settings } from "../../api/settings";
import { themeState } from "../../theme/theme-state";

const FFT_SIZE = 256; // 128 freq bins, 256 time-domain samples

// ── Effect factory ────────────────────────────────────────────────────────────

function createEffect(type: EffectType): IVisualizerEffect | null {
    switch (type) {
        case "bars":     return new BarsEffect();
        case "circular": return new CircularEffect();
        case "none":     return null;
    }
}

// ── Switcher icons (inline SVG, currentColor inherits from button) ─────────────

// These builders intentionally return a fresh node because the effect list is module-scoped,
// while a DOM icon can only be appended to one host at a time.
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
    { type: "bars",     createIcon: createBarsIconElement,     label: "Bars" },
    { type: "circular", createIcon: createCircularIconElement, label: "Circular" },
    { type: "none",     createIcon: createNoneIconElement,     label: "No effect" },
];

// ── Inline-style constants ───────────────────────────────────────────────────

const canvasStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
};

const trackInfoOverlayStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    pointerEvents: "none",
};

const trackTitleStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 600,
    color: color.text.default,
    textAlign: "center",
    maxWidth: "80%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const trackArtistStyle: React.CSSProperties = {
    fontSize: 13,
    color: color.text.light,
    textAlign: "center",
    maxWidth: "80%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const effectSwitcherStyle: React.CSSProperties = {
    position: "absolute",
    top: 8,
    right: 8,
    display: "flex",
    gap: 4,
};

// ── Component ─────────────────────────────────────────────────────────────────

interface TrackInfo {
    title: string;
    artist: string;
}

export interface AudioVisualizerProps {
    mediaRef: React.RefObject<HTMLMediaElement>;
    playing: boolean;
    sourceUrl?: string;
}

/** Extract artist/title from a file path or URL when no ID3 tags are available.
 *  Tries to split on " – " (en-dash) or " - " (hyphen). */
function parseFilenameInfo(sourceUrl: string): TrackInfo | null {
    // Extract filename without extension
    const basename = sourceUrl.replace(/\\/g, "/").split("/").pop() ?? "";
    const name = basename.replace(/\.[^.]+$/, "").trim();
    if (!name) return null;
    const sep = name.includes(" – ") ? " – " : name.includes(" - ") ? " - " : null;
    if (sep) {
        const idx = name.indexOf(sep);
        return { artist: name.slice(0, idx).trim(), title: name.slice(idx + sep.length).trim() };
    }
    return { artist: "", title: name };
}

export function AudioVisualizer({ mediaRef, playing, sourceUrl }: AudioVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number>(0);
    const selectedEffect = (settings.use("visualizer-effect") || "bars") as EffectType;
    const effectRef = useRef<IVisualizerEffect | null>(createEffect(selectedEffect));
    const [trackInfo, setTrackInfo] = useState<TrackInfo | null>(null);
    const [pageVisible, setPageVisible] = useState(true);

    // Track page visibility — stops RAF when the page tab is hidden (display: none)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const observer = new IntersectionObserver(
            ([entry]) => setPageVisible(entry.isIntersecting),
            { threshold: 0 },
        );
        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);

    // Swap effect instance when selection changes
    useEffect(() => {
        effectRef.current?.dispose?.();
        effectRef.current = createEffect(selectedEffect);
    }, [selectedEffect]);

    // Read track metadata — try MediaSession ID3 tags first, fall back to filename
    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;
        const onMeta = () => {
            const meta = navigator.mediaSession?.metadata;
            if (meta?.title || meta?.artist) {
                setTrackInfo({ title: meta.title || "", artist: meta.artist || "" });
            } else if (sourceUrl) {
                setTrackInfo(parseFilenameInfo(sourceUrl));
            } else {
                setTrackInfo(null);
            }
        };
        media.addEventListener("loadedmetadata", onMeta);
        const onEmpty = () => setTrackInfo(null);
        media.addEventListener("emptied", onEmpty);
        return () => {
            media.removeEventListener("loadedmetadata", onMeta);
            media.removeEventListener("emptied", onEmpty);
        };
    }, [mediaRef, sourceUrl]);

    // Set up AudioContext lazily on first play — avoids autoplay policy block
    useEffect(() => {
        if (!playing) return;
        const media = mediaRef.current;
        if (!media || audioCtxRef.current) return;

        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.8;

        const source = ctx.createMediaElementSource(media);
        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
    }, [playing, mediaRef]);

    // Resume AudioContext if browser suspended it (autoplay policy)
    useEffect(() => {
        if (playing && audioCtxRef.current?.state === "suspended") {
            audioCtxRef.current.resume();
        }
    }, [playing]);

    // Animation loop — restarts when playing, selectedEffect, or page visibility changes
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // "none" — just clear the canvas, no RAF loop needed
        if (selectedEffect === "none") {
            const ctx2d = canvas.getContext("2d");
            ctx2d?.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Page hidden (tab inactive) — skip expensive RAF loop
        if (!pageVisible) return;

        const analyser = analyserRef.current;
        if (!analyser) return;

        const ctx2d = canvas.getContext("2d");

        const draw = () => {
            rafRef.current = requestAnimationFrame(draw);
            const W = canvas.offsetWidth;
            const H = canvas.offsetHeight;
            if (canvas.width !== W) canvas.width = W;
            if (canvas.height !== H) canvas.height = H;
            effectRef.current?.draw(ctx2d, analyser, W, H, themeState.get().isDark);
        };

        rafRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafRef.current);
    }, [playing, selectedEffect, pageVisible]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafRef.current);
            audioCtxRef.current?.close();
            audioCtxRef.current = null;
            analyserRef.current = null;
        };
    }, []);

    return (
        <Panel name="audio-visualizer" position="relative" width="100%" height="100%" revealChildrenOnHover>
            <canvas ref={canvasRef} style={canvasStyle} />
            {selectedEffect === "none" && trackInfo && (
                <div style={trackInfoOverlayStyle}>
                    {trackInfo.title  && <div style={trackTitleStyle}>{trackInfo.title}</div>}
                    {trackInfo.artist && <div style={trackArtistStyle}>{trackInfo.artist}</div>}
                </div>
            )}
            <div style={effectSwitcherStyle} data-visibility="parent-hover">
                {EFFECTS.map(({ type, createIcon, label }) => (
                    <IconButton
                        key={type}
                        name={`visualizer-${type}`}
                        variant="chip"
                        size="sm"
                        active={selectedEffect === type}
                        title={label}
                        icon={createIcon()}
                        onClick={(e) => { e.stopPropagation(); settings.set("visualizer-effect", type); }}
                    />
                ))}
            </div>
        </Panel>
    );
}
