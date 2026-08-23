import "./Text.css";

export type TextVariant = "default" | "uppercased" | "link";
export type TextColor =
    | "inherit"
    | "default"
    | "light"
    | "dark"
    | "error"
    | "warning"
    | "success"
    | "primary";
export type TextSize = "xs" | "sm" | "md" | "base" | "lg" | "xl" | "xxl";

export interface TextStyleProps {
    variant?: TextVariant;
    color?: TextColor | (string & {});
    size?: TextSize;
    italic?: boolean;
    bold?: boolean;
    nowrap?: boolean;
    preWrap?: boolean;
    truncate?: boolean;
    align?: "left" | "center" | "right";
    hoverUnderline?: boolean;
}

export interface TextElementAttributes {
    variant: TextVariant;
    color?: TextColor;
    size: TextSize;
    bold?: true;
    italic?: true;
    nowrap?: true;
    preWrap?: true;
    truncate?: true;
    align?: "left" | "center" | "right";
    hoverUnderline?: true;
    freeformColor?: string;
}

const NAMED_COLORS: ReadonlySet<string> = new Set<TextColor>([
    "inherit", "default", "light", "dark",
    "error", "warning", "success", "primary",
]);

function isNamedColor(value: string): value is TextColor {
    return NAMED_COLORS.has(value);
}

export function resolveTextAttributes({
    variant = "default",
    color: colorProp = "default",
    size = "base",
    italic,
    bold,
    nowrap,
    preWrap,
    truncate,
    align,
    hoverUnderline,
}: TextStyleProps): TextElementAttributes {
    const named = isNamedColor(colorProp);
    return {
        variant,
        color: named ? colorProp : undefined,
        size,
        bold: bold || undefined,
        italic: italic || undefined,
        nowrap: nowrap || undefined,
        preWrap: preWrap || undefined,
        truncate: truncate || undefined,
        align,
        hoverUnderline: hoverUnderline || undefined,
        freeformColor: named ? undefined : colorProp,
    };
}

export function applyTextAttributes(element: HTMLElement, attributes: TextElementAttributes): void {
    const data: Record<string, string | undefined> = {
        type: "text",
        variant: attributes.variant,
        color: attributes.color,
        size: attributes.size,
        bold: attributes.bold === true ? "" : undefined,
        italic: attributes.italic === true ? "" : undefined,
        nowrap: attributes.nowrap === true ? "" : undefined,
        preWrap: attributes.preWrap === true ? "" : undefined,
        truncate: attributes.truncate === true ? "" : undefined,
        align: attributes.align,
        hoverUnderline: attributes.hoverUnderline === true ? "" : undefined,
    };
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined) delete element.dataset[key];
        else element.dataset[key] = value;
    }
    element.style.color = attributes.freeformColor ?? "";
}

export function createTextElement(
    value: string,
    props: TextStyleProps = {},
): HTMLSpanElement {
    const element = document.createElement("span");
    applyTextAttributes(element, resolveTextAttributes(props));
    element.textContent = value;
    return element;
}
