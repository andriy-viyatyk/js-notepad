import color from "../../theme/color";
import type { NodeShape } from "./types";
import {
    compassPoints,
    diamondPoints,
    hexagonPoints,
    pointsToSvgString,
    starPoints,
    trianglePoints,
} from "./shapeGeometry";

interface ShapeIconProps {
    shape: NodeShape | "root" | "group";
}

function createSvg(size: number): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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

interface LevelIconProps {
    level: number | "root";
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
