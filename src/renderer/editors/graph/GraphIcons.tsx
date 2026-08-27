import type { NodeShape } from "./types";
import { starPoints, hexagonPoints, compassPoints, diamondPoints, trianglePoints, pointsToSvgString } from "./shapeGeometry";
import color from "../../theme/color";
import type { SvgIconComponent } from "../../theme/icons";

/**
 * Shared SVG icon components for shape and level visualization.
 * Used by GraphDetailPanel (size=16) and GraphLegendPanel (size=14).
 */

interface ShapeIconProps {
    shape: NodeShape | "root" | "group";
    size?: number;
}

export function ShapeIcon({ shape, size = 16 }: ShapeIconProps) {
    const c = size / 2;
    const r = size * 0.375; // 6/16 = 0.375, scales proportionally

    if (shape === "root") {
        return (
            <svg className="legend-shape-icon" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <polygon points={pointsToSvgString(compassPoints(c, c, r * 1.1, r * 0.35))} fill="currentColor" />
            </svg>
        );
    }

    if (shape === "group") {
        return (
            <svg className="legend-shape-icon" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={c} cy={c} r={r * 0.65} fill="currentColor" />
                <circle cx={c} cy={c} r={r} fill="none" stroke={color.graph.groupBorder} strokeWidth={1.5} />
            </svg>
        );
    }

    return (
        <svg className="legend-shape-icon" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {shape === "circle" && <circle cx={c} cy={c} r={r} fill="currentColor" />}
            {shape === "square" && <rect x={c - r} y={c - r} width={r * 2} height={r * 2} fill="currentColor" />}
            {shape === "diamond" && (
                <polygon points={pointsToSvgString(diamondPoints(c, c, r))} fill="currentColor" />
            )}
            {shape === "triangle" && (
                <polygon points={pointsToSvgString(trianglePoints(c, c, r))} fill="currentColor" />
            )}
            {shape === "star" && (
                <polygon points={pointsToSvgString(starPoints(c, c, r * 1.1, r * 0.5, 5))} fill="currentColor" />
            )}
            {shape === "hexagon" && (
                <polygon points={pointsToSvgString(hexagonPoints(c, c, r))} fill="currentColor" />
            )}
        </svg>
    );
}

function createSvg(size: number): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // Keep the class, dimensions, and viewBox identical to the React form: the legend's
    // CSS targets the class and the fixed box keeps native icon hosts aligned with labels.
    svg.setAttribute("class", "legend-shape-icon");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    return svg;
}

function appendSvgChild(
    parent: SVGSVGElement,
    tagName: "circle" | "polygon" | "rect",
    attributes: Record<string, number | string>,
): void {
    const child = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, String(value));
    parent.append(child);
}

export function createShapeIconElement(shape: ShapeIconProps["shape"], size = 16): SVGSVGElement {
    const c = size / 2;
    const r = size * 0.375;
    const svg = createSvg(size);

    if (shape === "root") {
        appendSvgChild(svg, "polygon", {
            points: pointsToSvgString(compassPoints(c, c, r * 1.1, r * 0.35)),
            fill: "currentColor",
        });
        return svg;
    }

    if (shape === "group") {
        appendSvgChild(svg, "circle", { cx: c, cy: c, r: r * 0.65, fill: "currentColor" });
        appendSvgChild(svg, "circle", {
            cx: c,
            cy: c,
            r,
            fill: "none",
            stroke: color.graph.groupBorder,
            // SVG attribute names are case-sensitive: `strokeWidth` is silently ignored.
            "stroke-width": 1.5,
        });
        return svg;
    }

    if (shape === "circle") appendSvgChild(svg, "circle", { cx: c, cy: c, r, fill: "currentColor" });
    if (shape === "square") appendSvgChild(svg, "rect", { x: c - r, y: c - r, width: r * 2, height: r * 2, fill: "currentColor" });
    if (shape === "diamond") appendSvgChild(svg, "polygon", { points: pointsToSvgString(diamondPoints(c, c, r)), fill: "currentColor" });
    if (shape === "triangle") appendSvgChild(svg, "polygon", { points: pointsToSvgString(trianglePoints(c, c, r)), fill: "currentColor" });
    if (shape === "star") appendSvgChild(svg, "polygon", { points: pointsToSvgString(starPoints(c, c, r * 1.1, r * 0.5, 5)), fill: "currentColor" });
    if (shape === "hexagon") appendSvgChild(svg, "polygon", { points: pointsToSvgString(hexagonPoints(c, c, r)), fill: "currentColor" });
    return svg;
}

export function createShapeIconComponent(shape: ShapeIconProps["shape"], size = 16): SvgIconComponent {
    return {
        viewBox: `0 0 ${size} ${size}`,
        createElement: () => createShapeIconElement(shape, size),
    };
}

interface LevelIconProps {
    level: number | "root";
    size?: number;
}

export function LevelIcon({ level, size = 16 }: LevelIconProps) {
    const c = size / 2;

    if (level === "root") {
        const r = size * 0.375;
        return (
            <svg className="legend-shape-icon" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <polygon points={pointsToSvgString(compassPoints(c, c, r * 1.1, r * 0.35))} fill="currentColor" />
            </svg>
        );
    }

    // Scale radius proportionally: for size=16 → 8-level (7,6,5,4,3), for size=14 → 7-level (6,5,4,3,2)
    const r = (size / 2) - level;
    return (
        <svg className="legend-shape-icon" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={c} cy={c} r={r} fill="currentColor" />
        </svg>
    );
}

export function createLevelIconElement(level: LevelIconProps["level"], size = 16): SVGSVGElement {
    const c = size / 2;
    const svg = createSvg(size);

    if (level === "root") {
        const r = size * 0.375;
        appendSvgChild(svg, "polygon", {
            points: pointsToSvgString(compassPoints(c, c, r * 1.1, r * 0.35)),
            fill: "currentColor",
        });
        return svg;
    }

    const r = (size / 2) - level;
    appendSvgChild(svg, "circle", { cx: c, cy: c, r, fill: "currentColor" });
    return svg;
}

export function createLevelIconComponent(level: LevelIconProps["level"], size = 16): SvgIconComponent {
    return {
        viewBox: `0 0 ${size} ${size}`,
        createElement: () => createLevelIconElement(level, size),
    };
}
