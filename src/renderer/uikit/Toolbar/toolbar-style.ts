import "./Toolbar.css";

export interface ToolbarStyleProps {
    orientation?: "horizontal" | "vertical";
    background?: "default" | "light" | "dark";
    borderTop?: boolean;
    borderBottom?: boolean;
    disabled?: boolean;
}

export function applyToolbarAttributes(
    element: HTMLElement,
    {
        orientation = "horizontal",
        background = "dark",
        borderTop,
        borderBottom,
        disabled,
    }: ToolbarStyleProps,
): void {
    element.className = "toolbar-root";
    element.setAttribute("role", "toolbar");
    element.setAttribute("aria-orientation", orientation);
    element.dataset.type = "toolbar";
    element.dataset.orientation = orientation;
    element.dataset.direction = orientation === "horizontal" ? "row" : "column";
    setPresence(element.dataset, "bg", background);
    setPresence(element.dataset, "borderTop", borderTop);
    setPresence(element.dataset, "borderBottom", borderBottom);
    setPresence(element.dataset, "disabled", disabled);
    if (disabled) element.setAttribute("aria-disabled", "true");
    else element.removeAttribute("aria-disabled");
}

export function createToolbarElement(props: ToolbarStyleProps = {}): HTMLDivElement {
    const element = document.createElement("div");
    applyToolbarAttributes(element, props);
    return element;
}

function setPresence(dataset: DOMStringMap, key: string, value: unknown): void {
    if (value === undefined || value === false) delete dataset[key];
    else dataset[key] = String(value);
}
