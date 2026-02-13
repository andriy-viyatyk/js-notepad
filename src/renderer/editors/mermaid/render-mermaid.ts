// ============================================================================
// Shared Mermaid rendering utilities
// Used by both MermaidView (standalone .mmd viewer) and Markdown inline diagrams
// ============================================================================

let renderCounter = 0;

// ============================================================================
// SVG text contrast fix
// ============================================================================

/** Parse hex color (#rgb, #rrggbb) to [r, g, b] or null */
function parseHexColor(hex: string): [number, number, number] | null {
    const m = hex.match(/^#([0-9a-f]{3,8})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (h.length < 6) return null;
    return [parseInt(h.slice(0,2), 16), parseInt(h.slice(2,4), 16), parseInt(h.slice(4,6), 16)];
}

/** Relative luminance per WCAG 2.0 (0 = black, 1 = white) */
function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Get fill color from element attribute or inline style */
function getFillColor(el: Element): string | null {
    const fillAttr = el.getAttribute("fill");
    if (fillAttr && fillAttr.startsWith("#")) return fillAttr;
    const style = el.getAttribute("style") || "";
    const match = style.match(/fill:\s*(#[0-9a-fA-F]{3,8})/);
    return match ? match[1] : null;
}

/** Set text color on all text/label elements within a group */
function applyTextColor(group: Element, textColor: string): void {
    for (const text of group.querySelectorAll("text")) {
        text.setAttribute("fill", textColor);
    }
    // HTML elements inside foreignObject (Mermaid uses these for node labels)
    for (const el of group.querySelectorAll("foreignObject span, foreignObject div, foreignObject p")) {
        const existing = el.getAttribute("style") || "";
        el.setAttribute("style", `${existing}; color: ${textColor}`);
    }
}

/**
 * Fix text contrast in Mermaid SVG.
 * When classDef specifies light fill colors but the dark theme sets light text,
 * the result is unreadable. This detects low-contrast combinations and fixes them.
 */
function fixTextContrast(doc: Document): void {
    // Fix node labels: each .node group has a shape with fill + label text
    for (const node of doc.querySelectorAll("g.node")) {
        const shape = node.querySelector("rect, polygon, circle, ellipse, path");
        if (!shape) continue;
        const fill = getFillColor(shape);
        if (!fill) continue;
        const rgb = parseHexColor(fill);
        if (!rgb) continue;
        const lum = relativeLuminance(...rgb);
        applyTextColor(node, lum > 0.4 ? "#333333" : "#f0f0f0");
    }

    // Fix cluster (subgraph) labels: only the cluster's own label, not nested nodes
    for (const cluster of doc.querySelectorAll("g.cluster")) {
        // The cluster background rect is a direct child
        const shapeNames = new Set(["rect", "polygon", "circle", "ellipse", "path"]);
        const rect = Array.from(cluster.children).find(
            (ch) => shapeNames.has(ch.tagName) && getFillColor(ch)
        );
        if (!rect) continue;
        const fill = getFillColor(rect);
        if (!fill) continue;
        const rgb = parseHexColor(fill);
        if (!rgb) continue;
        const lum = relativeLuminance(...rgb);
        // Only fix the cluster-label group (not nested node/cluster labels)
        const labelGroup = Array.from(cluster.children).find(
            (ch) => ch.classList?.contains("cluster-label")
        );
        if (labelGroup) {
            applyTextColor(labelGroup, lum > 0.4 ? "#333333" : "#f0f0f0");
        }
    }
}

/** Convert raw SVG string to a data URL, optionally injecting a background rect.
 *  Ensures explicit pixel width/height from viewBox so the <img> element
 *  reports correct naturalWidth/naturalHeight (needed for fit-to-viewport). */
export function svgToDataUrl(svg: string, backgroundColor?: string, fixContrast?: boolean): string {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;

    // Extract dimensions from viewBox and set explicit pixel width/height.
    // Mermaid often uses width="100%" which makes the <img> element stretch
    // to container width instead of using intrinsic dimensions.
    const viewBox = root.getAttribute("viewBox");
    if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
            const [, , vbWidth, vbHeight] = parts;
            root.setAttribute("width", String(vbWidth));
            root.setAttribute("height", String(vbHeight));
        }
    }

    // Fix text contrast for nodes with custom fill colors (dark mode only)
    if (fixContrast) {
        fixTextContrast(doc);
    }

    if (backgroundColor) {
        const bg = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("width", "100%");
        bg.setAttribute("height", "100%");
        bg.setAttribute("fill", backgroundColor);
        root.insertBefore(bg, root.firstChild);
    }
    return `data:image/svg+xml,${encodeURIComponent(
        new XMLSerializer().serializeToString(doc)
    )}`;
}

/**
 * Render SVG from raw Mermaid markup and apply contrast fix for dark theme.
 * Returns an inline SVG string (not a data URL) for direct DOM injection,
 * or a data URL for use with <img> elements.
 */
export async function renderMermaidSvg(
    content: string,
    lightMode: boolean
): Promise<string> {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({
        startOnLoad: false,
        theme: lightMode ? "default" : "dark",
        securityLevel: "loose",
    });

    const id = `mermaid-render-${++renderCounter}`;
    const { svg } = await mermaid.render(id, content);
    return svg;
}

/**
 * Render Mermaid content to a data URL suitable for <img src>.
 * Applies text contrast fix in dark mode and optional background color.
 */
export async function renderMermaid(
    content: string,
    lightMode: boolean
): Promise<string> {
    const svg = await renderMermaidSvg(content, lightMode);
    return svgToDataUrl(svg, lightMode ? "white" : undefined, !lightMode);
}
