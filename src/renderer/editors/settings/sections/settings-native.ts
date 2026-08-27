import { createPanelElement, type PanelStyleProps } from "../../../uikit/Panel/panel-style";
import { createTextElement, type TextStyleProps } from "../../../uikit/Text/text-style";
import "../settings.css";

export type EmptyProps = Record<string, never>;

export function createSectionRoot(type: string): HTMLDivElement {
    const root = document.createElement("div");
    root.dataset.type = type;
    return root;
}

export function panel(props: PanelStyleProps, ...children: Node[]): HTMLDivElement {
    return createPanelElement(props, children);
}

export function text(value: string, props: TextStyleProps = {}): HTMLSpanElement {
    return createTextElement(value, props);
}

export function settingsLabel(value: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.type = "settings-label";
    element.textContent = value;
    return element;
}

export function settingsFieldLabel(value: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.type = "settings-field-label";
    element.textContent = value;
    return element;
}

export function settingsPath(value: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.type = "settings-path";
    element.title = value;
    element.textContent = value;
    return element;
}

export function settingsLink(value: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.type = "settings-link";
    element.textContent = value;
    return element;
}

export function settingsPlaceholder(value: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.type = "settings-placeholder";
    element.textContent = value;
    return element;
}
