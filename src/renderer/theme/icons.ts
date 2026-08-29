import type { NativeCSSProperties } from "../uikit/shared/dom-props";
import { themeState } from "./theme-state";

type NativeSVGAttributeValue = string | number | boolean | undefined;

export type NativeSVGProps = {
    viewBox?: string;
    width?: string | number;
    height?: string | number;
    className?: string;
    color?: string;
    style?: NativeCSSProperties | string;
    title?: string;
    opacity?: NativeSVGAttributeValue;
    fill?: NativeSVGAttributeValue;
    stroke?: NativeSVGAttributeValue;
    strokeWidth?: NativeSVGAttributeValue;
    strokeLinecap?: NativeSVGAttributeValue;
    strokeLinejoin?: NativeSVGAttributeValue;
    preserveAspectRatio?: NativeSVGAttributeValue;
    [key: `data-${string}`]: NativeSVGAttributeValue;
};

export type SvgIconProps = NativeSVGProps;

export type SvgIconDomBuilder = (props?: SvgIconProps) => SVGElement;

export type SvgIconComponent = {
    createElement: SvgIconDomBuilder;
    viewBox?: string;
};


/**
 * Build an icon's native DOM form for callers outside the name registry.
 * All icon contracts provide a native builder, so callers can invoke it directly.
 */
export function createIconComponentElement(icon: SvgIconComponent, props?: SvgIconProps): SVGElement {
    return icon.createElement(props);
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const svgAttributeNames: Record<string, string> = {
    className: "class",
    htmlFor: "for",
    viewBox: "viewBox",
    preserveAspectRatio: "preserveAspectRatio",
    gradientUnits: "gradientUnits",
    gradientTransform: "gradientTransform",
    patternUnits: "patternUnits",
    patternContentUnits: "patternContentUnits",
    patternTransform: "patternTransform",
    markerHeight: "markerHeight",
    markerUnits: "markerUnits",
    markerWidth: "markerWidth",
    refX: "refX",
    refY: "refY",
    textLength: "textLength",
};

function toSvgAttributeName(name: string): string {
    return svgAttributeNames[name] ?? name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function toCssPropertyName(name: string): string {
    return name.startsWith("--")
        ? name
        : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function applyStyle(element: SVGElement, style: SvgIconProps["style"]): void {
    if (!style) return;

    if (typeof style === "string") {
        element.setAttribute("style", style);
        return;
    }

    for (const [name, value] of Object.entries(style)) {
        if (value == null || typeof value === "boolean") continue;
        element.style.setProperty(toCssPropertyName(name), String(value));
    }
}

function createSvgElement(viewBox: string, body: string, props: SvgIconProps = {}): SVGElement {
    const {
        viewBox: propsViewBox,
        width = 24,
        height = 24,
        title,
        color,
        style,
        ...otherProps
    } = props;
    const element = document.createElementNS(SVG_NAMESPACE, "svg");

    element.setAttribute("viewBox", propsViewBox ?? viewBox);
    element.setAttribute("width", String(width));
    element.setAttribute("height", String(height));
    if (color != null) {
        element.setAttribute("color", String(color));
        element.style.color = String(color);
    }
    applyStyle(element, style);

    for (const [name, value] of Object.entries(otherProps)) {
        if (value == null || name === "children" || name === "ref" || /^on[A-Z]/.test(name)) {
            continue;
        }
        if (name === "style") {
            applyStyle(element, value as SvgIconProps["style"]);
            continue;
        }
        element.setAttribute(toSvgAttributeName(name), String(value));
    }

    if (title) {
        const titleElement = document.createElementNS(SVG_NAMESPACE, "title");
        titleElement.textContent = title;
        element.append(titleElement);
    }

    const group = document.createElementNS(SVG_NAMESPACE, "g");
    group.innerHTML = body;
    element.append(group);
    return element;
}

type IconBody = string;

export const createIconWithViewBox = (viewBox: string) => (icon: IconBody): SvgIconComponent => {
    return {
        viewBox,
        createElement: (props) => createSvgElement(viewBox, icon, props ? { ...props, viewBox } : { viewBox }),
    };
};

export const createIcon = (size: number | string) =>
    createIconWithViewBox(`0 0 ${size} ${size}`);

// Storybook editor icon — a book with a bookmark in the Storybook brand pink.
// Fixed colors (not currentColor) so it stays recognizable on the page tab.
export const StorybookIcon = createIconWithViewBox("0 0 32 32")(
    "<g><rect x=\"7\" y=\"3.5\" width=\"18\" height=\"25\" rx=\"2.5\" fill=\"#FF4785\" /><rect x=\"11\" y=\"3.5\" width=\"1.5\" height=\"25\" fill=\"#E8336B\" opacity=\"0.6\" /><path d=\"M13.5 3.5 h5 v8 l-2.5 -2 l-2.5 2 Z\" fill=\"#FFFFFF\" /></g>",
);

// Board editor icon — a dashboard layout (panels of varying sizes).
export const BoardIcon = createIcon(24)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M13 12C13 11.4477 13.4477 11 14 11H19C19.5523 11 20 11.4477 20 12V19C20 19.5523 19.5523 20 19 20H14C13.4477 20 13 19.5523 13 19V12Z\" /><path d=\"M4 5C4 4.44772 4.44772 4 5 4H9C9.55228 4 10 4.44772 10 5V12C10 12.5523 9.55228 13 9 13H5C4.44772 13 4 12.5523 4 12V5Z\" /><path d=\"M4 17C4 16.4477 4.44772 16 5 16H9C9.55228 16 10 16.4477 10 17V19C10 19.5523 9.55228 20 9 20H5C4.44772 20 4 19.5523 4 19V17Z\" /><path d=\"M13 5C13 4.44772 13.4477 4 14 4H19C19.5523 4 20 4.44772 20 5V7C20 7.55228 19.5523 8 19 8H14C13.4477 8 13 7.55228 13 7V5Z\" /></g>",
);

// Colored board icon for the Boards sidebar panel header — same 4-panel dashboard
// layout as BoardIcon, but each panel is filled with a distinct theme color (instead
// of a monochrome currentColor stroke) so it reads as an accent in the header.
export const BoardColorIcon = createIcon(24)(
    "<g fill=\"none\"><path d=\"M4 5C4 4.44772 4.44772 4 5 4H9C9.55228 4 10 4.44772 10 5V12C10 12.5523 9.55228 13 9 13H5C4.44772 13 4 12.5523 4 12V5Z\" fill=\"var(--color-misc-blue)\" /><path d=\"M13 5C13 4.44772 13.4477 4 14 4H19C19.5523 4 20 4.44772 20 5V7C20 7.55228 19.5523 8 19 8H14C13.4477 8 13 7.55228 13 7V5Z\" fill=\"var(--color-misc-green)\" /><path d=\"M4 17C4 16.4477 4.44772 16 5 16H9C9.55228 16 10 16.4477 10 17V19C10 19.5523 9.55228 20 9 20H5C4.44772 20 4 19.5523 4 19V17Z\" fill=\"var(--color-misc-yellow)\" /><path d=\"M13 12C13 11.4477 13.4477 11 14 11H19C19.5523 11 20 11.4477 20 12V19C20 19.5523 19.5523 20 19 20H14C13.4477 20 13 19.5523 13 19V12Z\" fill=\"var(--color-misc-red)\" /></g>",
);

// Agent-tools icon — a wrench (Material "build" glyph). Used for the registered-tools
// tree leaf, the toolset editor tab, and the "Open Toolset" affordance in Explorer.
export const ToolsIcon = createIcon(24)(
    "<path d=\"M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z\" fill=\"currentColor\" />",
);

export const WindowMaximizeIcon = createIcon(36)(
    "<path d=\"M27.89,9h-20a2,2,0,0,0-2,2V25a2,2,0,0,0,2,2h20a2,2,0,0,0,2-2V11A2,2,0,0,0,27.89,9Zm-20,16V11h20V25Z\" fill=\"currentColor\" /><rect x=\"0\" y=\"0\" width=\"36\" height=\"36\" fill-opacity=\"0\" />",
);

export const WindowRestoreIcon = createIcon(36)(
    "<path d=\"M28,8H14a2,2,0,0,0-2,2v2h2V10H28V20H26v2h2a2,2,0,0,0,2-2V10A2,2,0,0,0,28,8Z\" fill=\"currentColor\" /><path d=\"M22,14H8a2,2,0,0,0-2,2V26a2,2,0,0,0,2,2H22a2,2,0,0,0,2-2V16A2,2,0,0,0,22,14ZM8,26V16H22V26Z\" fill=\"currentColor\" /><rect x=\"0\" y=\"0\" width=\"36\" height=\"36\" fill-opacity=\"0\" />",
);

export const WindowMinimizeIcon = createIcon(36)(
    "<path d=\"M27,27H9a1,1,0,0,1,0-2H27a1,1,0,0,1,0,2Z\" fill=\"currentColor\" /><rect x=\"0\" y=\"0\" width=\"36\" height=\"36\" fill-opacity=\"0\" />",
);

// Sidebar "Open Tabs" folder — a tab strip above a content panel. Two tabs, left-aligned,
// so the empty right third of the strip reads as "more tabs" at 14px.
export const TabsIcon = createIcon(24)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M3 5.5C3 4.67157 3.67157 4 4.5 4H8.5C9.32843 4 10 4.67157 10 5.5V8H3V5.5ZM11 5.5C11 4.67157 11.6716 4 12.5 4H16.5C17.3284 4 18 4.67157 18 5.5V8H11V5.5ZM2 9H22V18.5C22 19.3284 21.3284 20 20.5 20H3.5C2.67157 20 2 19.3284 2 18.5V9ZM4 11V18H20V11H4Z\" fill=\"currentColor\" />",
);

// Sidebar "Recent Files" folder — clock ring with hands at 3 o'clock. The ring, the dial hole
// and the hands are one evenodd path: ring fills at depth 1, dial clears at 2, hands fill at 3.
export const HistoryIcon = createIcon(24)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M21 12A9 9 0 1 1 3 12A9 9 0 1 1 21 12ZM19 12A7 7 0 1 0 5 12A7 7 0 1 0 19 12ZM11.1 6.4H12.9V11.1H16.2V12.9H11.1V6.4Z\" fill=\"currentColor\" />",
);

// Code-branch glyph (svgrepo "code-branch-solid", CC0). Used for the repo's
// `.git` entry in the Explorer (EPIC-030 / US-612). currentColor = theme-safe.
export const GitIcon = createIcon(32)(
    "<path d=\"M 11 4 C 9.355469 4 8 5.355469 8 7 C 8 8.292969 8.84375 9.394531 10 9.8125 L 10 22.1875 C 8.84375 22.605469 8 23.707031 8 25 C 8 26.644531 9.355469 28 11 28 C 12.644531 28 14 26.644531 14 25 C 14 23.730469 13.183594 22.65625 12.0625 22.21875 C 12.207031 20.988281 12.683594 20.382813 13.4375 19.875 C 14.335938 19.269531 15.714844 18.910156 17.21875 18.5625 C 18.722656 18.214844 20.335938 17.855469 21.6875 16.90625 C 22.875 16.074219 23.773438 14.710938 23.96875 12.8125 C 25.140625 12.402344 26 11.300781 26 10 C 26 8.355469 24.644531 7 23 7 C 21.355469 7 20 8.355469 20 10 C 20 11.277344 20.832031 12.351563 21.96875 12.78125 C 21.832031 14.09375 21.324219 14.746094 20.5625 15.28125 C 19.664063 15.910156 18.277344 16.28125 16.78125 16.625 C 15.285156 16.96875 13.664063 17.273438 12.3125 18.1875 C 12.203125 18.261719 12.101563 18.355469 12 18.4375 L 12 9.8125 C 13.15625 9.394531 14 8.292969 14 7 C 14 5.355469 12.644531 4 11 4 Z M 11 6 C 11.5625 6 12 6.4375 12 7 C 12 7.5625 11.5625 8 11 8 C 10.4375 8 10 7.5625 10 7 C 10 6.4375 10.4375 6 11 6 Z M 23 9 C 23.5625 9 24 9.4375 24 10 C 24 10.5625 23.5625 11 23 11 C 22.4375 11 22 10.5625 22 10 C 22 9.4375 22.4375 9 23 9 Z M 11 24 C 11.5625 24 12 24.4375 12 25 C 12 25.5625 11.5625 26 11 26 C 10.4375 26 10 25.5625 10 25 C 10 24.4375 10.4375 24 11 24 Z\" fill=\"currentColor\" />",
);

export const CloseIcon = createIcon(24)(
    "<g id=\"Page-1\" stroke=\"none\" stroke-width=\"1\" fill=\"none\" fill-rule=\"evenodd\"><g id=\"Close\"><line x1=\"16.9999\" y1=\"7\" x2=\"7.00001\" y2=\"16.9999\" id=\"Path\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" /><line x1=\"7.00006\" y1=\"7\" x2=\"17\" y2=\"16.9999\" id=\"Path\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" /></g></g>",
);

export const ProgressIcon = createIcon(32)(
    "<path d=\"M17.4378 30.9492C17.4378 31.8057 16.794 32.5 15.9999 32.5C15.2058 32.5 14.562 31.8057 14.562 30.9492V26.6661C14.562 25.8097 15.2058 25.1154 15.9999 25.1154C16.794 25.1154 17.4378 25.8097 17.4378 26.6661V30.9492Z\" fill=\"currentColor\" fill-opacity=\"0.5\" /><path d=\"M25.8454 27.3629C26.36 28.0558 26.2564 28.9877 25.6139 29.4443C24.9715 29.9009 24.0335 29.7094 23.5188 29.0165L20.9453 25.5514C20.4307 24.8585 20.5343 23.9266 21.1768 23.47C21.8192 23.0134 22.7572 23.2049 23.2719 23.8978L25.8454 27.3629Z\" fill=\"currentColor\" fill-opacity=\"0.6\" /><path d=\"M30.4922 19.6273C31.3248 19.8919 31.8009 20.7054 31.5555 21.4442C31.3101 22.1831 30.4362 22.5674 29.6035 22.3028L25.4394 20.9792C24.6067 20.7146 24.1306 19.9011 24.376 19.1623C24.6214 18.4234 25.4954 18.0391 26.328 18.3037L30.4922 19.6273Z\" fill=\"currentColor\" fill-opacity=\"0.7\" /><path d=\"M29.6036 10.6972C30.4363 10.4325 31.3103 10.8169 31.5557 11.5557C31.8011 12.2945 31.325 13.108 30.4923 13.3727L26.3282 14.6962C25.4955 14.9609 24.6215 14.5765 24.3761 13.8377C24.1307 13.0989 24.6068 12.2854 25.4395 12.0207L29.6036 10.6972Z\" fill=\"currentColor\" fill-opacity=\"0.8\" /><path d=\"M23.5189 3.98348C24.0335 3.29059 24.9715 3.09904 25.614 3.55566C26.2564 4.01228 26.3601 4.94414 25.8454 5.63704L23.2719 9.10213C22.7573 9.79503 21.8192 9.98657 21.1768 9.52996C20.5343 9.07334 20.4307 8.14147 20.9453 7.44858L23.5189 3.98348Z\" fill=\"currentColor\" fill-opacity=\"0.9\" /><path d=\"M14.5622 2.05077C14.5622 1.1943 15.206 0.5 16.0001 0.5C16.7942 0.5 17.438 1.1943 17.438 2.05077V6.33386C17.438 7.19033 16.7942 7.88463 16.0001 7.88463C15.206 7.88463 14.5622 7.19033 14.5622 6.33386V2.05077Z\" fill=\"currentColor\" /><path d=\"M6.15458 5.63709C5.63996 4.94419 5.74359 4.01232 6.38606 3.55571C7.02853 3.09909 7.96653 3.29063 8.48116 3.98353L11.0547 7.44862C11.5693 8.14152 11.4657 9.07339 10.8232 9.53C10.1808 9.98662 9.24277 9.79507 8.72815 9.10218L6.15458 5.63709Z\" fill=\"currentColor\" fill-opacity=\"0.1\" /><path d=\"M1.50783 13.3727C0.675156 13.1081 0.199073 12.2946 0.444473 11.5558C0.689873 10.8169 1.56383 10.4326 2.39651 10.6972L6.56063 12.0208C7.3933 12.2854 7.86939 13.0989 7.62399 13.8377C7.37859 14.5766 6.50463 14.9609 5.67195 14.6963L1.50783 13.3727Z\" fill=\"currentColor\" fill-opacity=\"0.2\" /><path d=\"M2.39637 22.3028C1.56369 22.5675 0.689736 22.1831 0.444336 21.4443C0.198936 20.7055 0.675019 19.892 1.5077 19.6273L5.67182 18.3038C6.50449 18.0391 7.37845 18.4235 7.62385 19.1623C7.86925 19.9011 7.39317 20.7146 6.56049 20.9793L2.39637 22.3028Z\" fill=\"currentColor\" fill-opacity=\"0.3\" /><path d=\"M8.48113 29.0165C7.96651 29.7094 7.0285 29.901 6.38604 29.4443C5.74357 28.9877 5.63993 28.0559 6.15456 27.363L8.72812 23.8979C9.24275 23.205 10.1808 23.0134 10.8232 23.47C11.4657 23.9267 11.5693 24.8585 11.0547 25.5514L8.48113 29.0165Z\" fill=\"currentColor\" fill-opacity=\"0.4\" />",
);

const getPersephoneBody = (isDark: boolean) => `
    <circle cx="64" cy="64" r="58" fill="${isDark ? "#2c3e50" : "#c5d5e0"}" />
    <circle cx="64" cy="64" r="54" fill="none" stroke="${isDark ? "#3d566e" : "#a0b5c5"}" stroke-width="1" />
    <path d="M 64 70 Q 63 90 62 110" fill="none" stroke="#27ae60" stroke-width="3.5" stroke-linecap="round" />
    <path d="M 63 92 Q 42 82 32 68" fill="none" stroke="#27ae60" stroke-width="3" stroke-linecap="round" />
    <path d="M 63 84 Q 82 76 92 64" fill="none" stroke="#2ecc71" stroke-width="3" stroke-linecap="round" />
    <path d="M 64 68 Q 30 40 26 16 Q 40 30 64 60" fill="#ecf0f1" opacity="0.9" />
    <path d="M 64 68 Q 98 40 102 16 Q 88 30 64 60" fill="#dfe6e9" opacity="0.9" />
    <path d="M 64 66 Q 64 22 64 10 Q 65 22 65 66" fill="#f0f3f4" opacity="0.9" />
    <path d="M 64 68 Q 34 60 18 42 Q 40 52 64 62" fill="#d5dbdb" opacity="0.85" />
    <path d="M 64 68 Q 94 60 110 42 Q 88 52 64 62" fill="#ccd1d1" opacity="0.85" />
    <line x1="58" y1="62" x2="50" y2="46" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" />
    <line x1="64" y1="60" x2="64" y2="42" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" />
    <line x1="70" y1="62" x2="78" y2="46" stroke="#f1c40f" stroke-width="1.5" stroke-linecap="round" />
    <circle cx="50" cy="44" r="2.5" fill="#e67e22" />
    <circle cx="64" cy="40" r="2.5" fill="#e67e22" />
    <circle cx="78" cy="44" r="2.5" fill="#e67e22" />
`;

/** Full-color Persephone lily icon with theme-aware background. */
export const PersephoneIcon: SvgIconComponent = {
    viewBox: "0 0 128 128",
    createElement: (props) =>
        createSvgElement("0 0 128 128", getPersephoneBody(themeState.get().isDark), props),
};

export const PlusIcon = createIcon(24)(
    "<path d=\"M6 12H18M12 6V18\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />",
);

export const CircleIcon = createIcon(24)(
    "<circle cx=\"12\" cy=\"12\" r=\"5\" fill=\"currentColor\" />",
);

export const FilterArrowUpIcon = createIcon(16)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M8 13.1667C8.27614 13.1667 8.5 12.9428 8.5 12.6667V3.33336C8.5 3.05722 8.27614 2.83336 8 2.83336C7.72386 2.83336 7.5 3.05722 7.5 3.33336V12.6667C7.5 12.9428 7.72386 13.1667 8 13.1667Z\" fill=\"currentColor\" /><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M2.97945 8.3535C3.17472 8.54876 3.4913 8.54876 3.68656 8.3535L7.99967 4.04039L12.3128 8.3535C12.508 8.54876 12.8246 8.54876 13.0199 8.3535C13.2152 8.15824 13.2152 7.84166 13.0199 7.6464L8.35323 2.97973C8.15797 2.78447 7.84138 2.78447 7.64612 2.97973L2.97945 7.6464C2.78419 7.84166 2.78419 8.15824 2.97945 8.3535Z\" fill=\"currentColor\" />",
);

export const FilterArrowDownIcon = createIcon(16)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M8 2.83334C8.27615 2.83334 8.5 3.0572 8.5 3.33334V12.6667C8.5 12.9428 8.27615 13.1667 8 13.1667C7.72386 13.1667 7.5 12.9428 7.5 12.6667V3.33334C7.5 3.0572 7.72386 2.83334 8 2.83334Z\" fill=\"currentColor\" /><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M2.97978 7.64646C3.17504 7.45119 3.49163 7.45119 3.68689 7.64646L8 11.9596L12.3131 7.64646C12.5084 7.45119 12.825 7.45119 13.0202 7.64646C13.2155 7.84172 13.2155 8.1583 13.0202 8.35356L8.35356 13.0202C8.15829 13.2155 7.84171 13.2155 7.64645 13.0202L2.97978 8.35356C2.78452 8.1583 2.78452 7.84172 2.97978 7.64646Z\" fill=\"currentColor\" />",
);

export const ArrowUpIcon = createIcon(24)(
    "<path d=\"M19 15L12 9L5 15\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const FolderUpIcon = createIcon(24)(
    "<path d=\"M22 19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3H9L11 5H20C21.1046 5 22 5.89543 22 7V19Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M12 16V10M9 13l3-3 3 3\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const ArrowDownIcon = createIcon(24)(
    "<path d=\"M19 9L12 15L5 9\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const ArrowRightIcon = createIcon(24)(
    "<path d=\"M9 5L15 12L9 19\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const ArrowLeftIcon = createIcon(24)(
    "<path d=\"M15 5L9 12L15 19\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const ConfirmIcon = createIcon(24)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75ZM1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 7.75C11.3787 7.75 10.875 8.25368 10.875 8.875C10.875 9.28921 10.5392 9.625 10.125 9.625C9.71079 9.625 9.375 9.28921 9.375 8.875C9.375 7.42525 10.5503 6.25 12 6.25C13.4497 6.25 14.625 7.42525 14.625 8.875C14.625 9.83834 14.1056 10.6796 13.3353 11.1354C13.1385 11.2518 12.9761 11.3789 12.8703 11.5036C12.7675 11.6246 12.75 11.7036 12.75 11.75V13C12.75 13.4142 12.4142 13.75 12 13.75C11.5858 13.75 11.25 13.4142 11.25 13V11.75C11.25 11.2441 11.4715 10.8336 11.7266 10.533C11.9786 10.236 12.2929 10.0092 12.5715 9.84439C12.9044 9.64739 13.125 9.28655 13.125 8.875C13.125 8.25368 12.6213 7.75 12 7.75ZM12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z\" fill=\"currentColor\" />",
);

export const ErrorIcon = createIcon(24)(
    "<circle cx=\"12\" cy=\"12\" r=\"10\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M12 7V13\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" /><circle cx=\"12\" cy=\"16\" r=\"1\" fill=\"currentColor\" />",
);

export const InfoIcon = createIcon(24)(
    "<circle cx=\"12\" cy=\"12\" r=\"10\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M12 17V11\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" /><circle cx=\"1\" cy=\"1\" r=\"1\" transform=\"matrix(1 0 0 -1 11 9)\" fill=\"currentColor\" />",
);

export const SuccessIcon = createIcon(24)(
    "<circle cx=\"12\" cy=\"12\" r=\"10\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M8.5 12.5L10.5 14.5L15.5 9.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />",
);

export const WarningIcon = createIcon(24)(
    "<path d=\"M5.31171 10.7615C8.23007 5.58716 9.68925 3 12 3C14.3107 3 15.7699 5.58716 18.6883 10.7615L19.0519 11.4063C21.4771 15.7061 22.6897 17.856 21.5937 19.428C20.4978 21 17.7864 21 12.3637 21H11.6363C6.21356 21 3.50217 21 2.40626 19.428C1.31034 17.856 2.52291 15.7061 4.94805 11.4063L5.31171 10.7615Z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M12 8V13\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" /><circle cx=\"12\" cy=\"16\" r=\"1\" fill=\"currentColor\" />",
);

export const DragHandleIcon = createIcon(24)(
    "<circle cx=\"9\" cy=\"6\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"15\" cy=\"6\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"9\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"15\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"9\" cy=\"18\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"15\" cy=\"18\" r=\"1.5\" fill=\"currentColor\" />",
);

export const ResizeHandleIcon = createIcon(24)(
    "<path d=\"M21 15L15 21M21 8L8 21\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />",
);

export const CopyIcon = createIcon(24)(
    "<path d=\"M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" />",
);

export const CursorIcon = createIcon(24)(
    "<path d=\"M16.5744 19.1999L12.6361 15.2616L11.4334 16.4643C10.2022 17.6955 9.58656 18.3111 8.92489 18.1658C8.26322 18.0204 7.96225 17.2035 7.3603 15.5696L5.3527 10.1205C4.15187 6.86106 3.55146 5.23136 4.39141 4.39141C5.23136 3.55146 6.86106 4.15187 10.1205 5.35271L15.5696 7.3603C17.2035 7.96225 18.0204 8.26322 18.1658 8.92489C18.3111 9.58656 17.6955 10.2022 16.4643 11.4334L15.2616 12.6361L19.1999 16.5744C19.6077 16.9821 19.8116 17.186 19.9058 17.4135C20.0314 17.7168 20.0314 18.0575 19.9058 18.3608C19.8116 18.5882 19.6077 18.7921 19.1999 19.1999C18.7921 19.6077 18.5882 19.8116 18.3608 19.9058C18.0575 20.0314 17.7168 20.0314 17.4135 19.9058C17.186 19.8116 16.9821 19.6077 16.5744 19.1999Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const EmptyIcon = createIcon(24)("");

export const CheckIcon = createIcon(16)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M13.8494 3.15816C14.0502 3.36905 14.0502 3.71095 13.8494 3.92184L6.30651 11.8418C6.10567 12.0527 5.78004 12.0527 5.5792 11.8418L2.15063 8.24184C1.94979 8.03095 1.94979 7.68905 2.15063 7.47816C2.35147 7.26728 2.6771 7.26728 2.87794 7.47816L5.94286 10.6963L13.1221 3.15816C13.3229 2.94728 13.6485 2.94728 13.8494 3.15816Z\" fill=\"currentColor\" />",
);

export const OpenFileIcon = createIcon(24)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M1 5C1 3.34315 2.34315 2 4 2H8.55848C9.84977 2 10.9962 2.82629 11.4045 4.05132L11.7208 5H20C21.1046 5 22 5.89543 22 7V9.00961C23.1475 9.12163 23.9808 10.196 23.7695 11.3578L22.1332 20.3578C21.9603 21.3087 21.132 22 20.1654 22H3C1.89543 22 1 21.1046 1 20V5ZM20 9V7H11.7208C10.8599 7 10.0956 6.44914 9.82339 5.63246L9.50716 4.68377C9.37105 4.27543 8.98891 4 8.55848 4H4C3.44772 4 3 4.44772 3 5V12.2709L3.35429 10.588C3.54913 9.66249 4.36562 9 5.31139 9H20ZM3.36634 20C3.41777 19.9109 3.4562 19.8122 3.47855 19.706L5.31139 11L21 11H21.8018L20.1654 20L3.36634 20Z\" fill=\"currentColor\" />",
);

export const NewWindowIcon = createIconWithViewBox("-2 0 16 16")(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\" d=\"M14.267 3.793v7.996a.477.477 0 0 1-.475.475h-2.356v2.472a.476.476 0 0 1-.475.475H1.208a.476.476 0 0 1-.475-.475V6.74a.476.476 0 0 1 .475-.475h2.356V3.793a.476.476 0 0 1 .475-.475h9.753a.476.476 0 0 1 .475.475zm-3.94 8.471H4.04a.477.477 0 0 1-.475-.475V8.626H1.84v5.476h8.487zm2.832-6.585H4.672v5.476h8.487z\" />",
);

export const GroupIcon = createIcon(24)(
    "<g fill=\"currentColor\"><path d=\"M21,18.3v-6.6c0.6-0.3,1-1,1-1.7c0-1.1-0.9-2-2-2c-0.7,0-1.4,0.4-1.7,1H15V5.7c0.6-0.3,1-1,1-1.7c0-1.1-0.9-2-2-2c-0.7,0-1.4-0.4-1.7,1H5.7C5.4,2.4,4.7,2,4,2C2.9,2,2,2.9,2,4c0,0.7,0.4,1.4,1,1.7v6.6c-0.6,0.3-1,1-1,1.7c0,1.1,0.9,2,2,2c0.7,0,1.4-0.4,1.7-1H9v3.3c-0.6,0.3-1,1-1,1.7c0,1.1,0.9,2,2,2c0.7,0,1.4-0.4,1.7-1h6.6c0.3,0.6,1,1,1.7,1c1.1,0,2-0.9,2-2C22,19.3,21.6,18.6,21,18.3z M5.7,13c-0.2-0.3-0.4-0.5-0.7-0.7V5.7C5.3,5.5,5.5,5.3,5.7,5h6.6c0.2,0.3,0.4,0.5,0.7,0.7V9h-1.3c-0.3-0.6-1-1-1.7-1c-1.1,0-2,0.9-2,2c0,0.7,0.4,1.4,1,1.7V13H5.7z M13,12.3c-0.3,0.2-0.5,0.4-0.7,0.7H11v-1.3c0.3-0.2,0.5-0.4,0.7-0.7H13V12.3z M12.3,15c0.3,0.6,1,1,1.7,1c1.1,0,2-0.9,2-2c0-0.7-0.4-1.4-1-1.7V11h3.3c0.2,0.3,0.4,0.5,0.7,0.7v6.6c-0.3,0.2-0.5,0.4-0.7,0.7h-6.6c-0.2-0.3-0.4-0.5-0.7-0.7V15H12.3z\" /></g>",
);

export const GraphGroupIcon = createIcon(24)(
    "<g><circle cx=\"12\" cy=\"12\" r=\"5\" fill=\"#9966cc\" /><circle cx=\"12\" cy=\"12\" r=\"9\" fill=\"none\" stroke=\"#9966cc\" stroke-width=\"1.5\" /></g>",
);

export const RunIcon = createIcon(16)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\" d=\"M4.25 3l1.166-.624 8 5.333v1.248l-8 5.334-1.166-.624V3zm1.5 1.401v7.864l5.898-3.932L5.75 4.401z\" />",
);

export const RunAllIcon = createIcon(16)(
    "<g fill=\"currentColor\"><path d=\"M2.78 2L2 2.41v12l.78.42 9-6V8l-9-6zM3 13.48V3.35l7.6 5.07L3 13.48z\" /><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M6 14.683l8.78-5.853V8L6 2.147V3.35l7.6 5.07L6 13.48v1.203z\" /></g>",
);

export const SettingsIcon = createIcon(24)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M12 8.25C9.92894 8.25 8.25 9.92893 8.25 12C8.25 14.0711 9.92894 15.75 12 15.75C14.0711 15.75 15.75 14.0711 15.75 12C15.75 9.92893 14.0711 8.25 12 8.25ZM9.75 12C9.75 10.7574 10.7574 9.75 12 9.75C13.2426 9.75 14.25 10.7574 14.25 12C14.25 13.2426 13.2426 14.25 12 14.25C10.7574 14.25 9.75 13.2426 9.75 12Z\" fill=\"currentColor\" /><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M11.9747 1.25C11.5303 1.24999 11.1592 1.24999 10.8546 1.27077C10.5375 1.29241 10.238 1.33905 9.94761 1.45933C9.27379 1.73844 8.73843 2.27379 8.45932 2.94762C8.31402 3.29842 8.27467 3.66812 8.25964 4.06996C8.24756 4.39299 8.08454 4.66251 7.84395 4.80141C7.60337 4.94031 7.28845 4.94673 7.00266 4.79568C6.64714 4.60777 6.30729 4.45699 5.93083 4.40743C5.20773 4.31223 4.47642 4.50819 3.89779 4.95219C3.64843 5.14353 3.45827 5.3796 3.28099 5.6434C3.11068 5.89681 2.92517 6.21815 2.70294 6.60307L2.67769 6.64681C2.45545 7.03172 2.26993 7.35304 2.13562 7.62723C1.99581 7.91267 1.88644 8.19539 1.84541 8.50701C1.75021 9.23012 1.94617 9.96142 2.39016 10.5401C2.62128 10.8412 2.92173 11.0602 3.26217 11.2741C3.53595 11.4461 3.68788 11.7221 3.68786 12C3.68785 12.2778 3.53592 12.5538 3.26217 12.7258C2.92169 12.9397 2.62121 13.1587 2.39007 13.4599C1.94607 14.0385 1.75012 14.7698 1.84531 15.4929C1.88634 15.8045 1.99571 16.0873 2.13552 16.3727C2.26983 16.6469 2.45535 16.9682 2.67758 17.3531L2.70284 17.3969C2.92507 17.7818 3.11058 18.1031 3.28089 18.3565C3.45817 18.6203 3.64833 18.8564 3.89769 19.0477C4.47632 19.4917 5.20763 19.6877 5.93073 19.5925C6.30717 19.5429 6.647 19.3922 7.0025 19.2043C7.28833 19.0532 7.60329 19.0596 7.8439 19.1986C8.08452 19.3375 8.24756 19.607 8.25964 19.9301C8.27467 20.3319 8.31403 20.7016 8.45932 21.0524C8.73843 21.7262 9.27379 22.2616 9.94761 22.5407C10.238 22.661 10.5375 22.7076 10.8546 22.7292C11.1592 22.75 11.5303 22.75 11.9747 22.75H12.0252C12.4697 22.75 12.8407 22.75 13.1454 22.7292C13.4625 22.7076 13.762 22.661 14.0524 22.5407C14.7262 22.2616 15.2616 21.7262 15.5407 21.0524C15.686 20.7016 15.7253 20.3319 15.7403 19.93C15.7524 19.607 15.9154 19.3375 16.156 19.1985C16.3966 19.0596 16.7116 19.0532 16.9974 19.2042C17.3529 19.3921 17.6927 19.5429 18.0692 19.5924C18.7923 19.6876 19.5236 19.4917 20.1022 19.0477C20.3516 18.8563 20.5417 18.6203 20.719 18.3565C20.8893 18.1031 21.0748 17.7818 21.297 17.3969L21.3223 17.3531C21.5445 16.9682 21.7301 16.6468 21.8644 16.3726C22.0042 16.0872 22.1135 15.8045 22.1546 15.4929C22.2498 14.7697 22.0538 14.0384 21.6098 13.4598C21.3787 13.1586 21.0782 12.9397 20.7378 12.7258C20.464 12.5538 20.3121 12.2778 20.3121 11.9999C20.3121 11.7221 20.464 11.4462 20.7377 11.2742C21.0783 11.0603 21.3788 10.8414 21.6099 10.5401C22.0539 9.96149 22.2499 9.23019 22.1547 8.50708C22.1136 8.19546 22.0043 7.91274 21.8645 7.6273C21.7302 7.35313 21.5447 7.03183 21.3224 6.64695L21.2972 6.60318C21.0749 6.21825 20.8894 5.89688 20.7191 5.64347C20.5418 5.37967 20.3517 5.1436 20.1023 4.95225C19.5237 4.50826 18.7924 4.3123 18.0692 4.4075C17.6928 4.45706 17.353 4.60782 16.9975 4.79572C16.7117 4.94679 16.3967 4.94036 16.1561 4.80144C15.9155 4.66253 15.7524 4.39297 15.7403 4.06991C15.7253 3.66808 15.686 3.2984 15.5407 2.94762C15.2616 2.27379 14.7262 1.73844 14.0524 1.45933C13.762 1.33905 13.4625 1.29241 13.1454 1.27077C12.8407 1.24999 12.4697 1.24999 12.0252 1.25H11.9747ZM10.5216 2.84515C10.5988 2.81319 10.716 2.78372 10.9567 2.76729C11.2042 2.75041 11.5238 2.75 12 2.75C12.4762 2.75 12.7958 2.75041 13.0432 2.76729C13.284 2.78372 13.4012 2.81319 13.4783 2.84515C13.7846 2.97202 14.028 3.21536 14.1548 3.52165C14.1949 3.61826 14.228 3.76887 14.2414 4.12597C14.271 4.91835 14.68 5.68129 15.4061 6.10048C16.1321 6.51968 16.9974 6.4924 17.6984 6.12188C18.0143 5.9549 18.1614 5.90832 18.265 5.89467C18.5937 5.8514 18.9261 5.94047 19.1891 6.14228C19.2554 6.19312 19.3395 6.27989 19.4741 6.48016C19.6125 6.68603 19.7726 6.9626 20.0107 7.375C20.2488 7.78741 20.4083 8.06438 20.5174 8.28713C20.6235 8.50382 20.6566 8.62007 20.6675 8.70287C20.7108 9.03155 20.6217 9.36397 20.4199 9.62698C20.3562 9.70995 20.2424 9.81399 19.9397 10.0041C19.2684 10.426 18.8122 11.1616 18.8121 11.9999C18.8121 12.8383 19.2683 13.574 19.9397 13.9959C20.2423 14.186 20.3561 14.29 20.4198 14.373C20.6216 14.636 20.7107 14.9684 20.6674 15.2971C20.6565 15.3799 20.6234 15.4961 20.5173 15.7128C20.4082 15.9355 20.2487 16.2125 20.0106 16.6249C19.7725 17.0373 19.6124 17.3139 19.474 17.5198C19.3394 17.72 19.2553 17.8068 19.189 17.8576C18.926 18.0595 18.5936 18.1485 18.2649 18.1053C18.1613 18.0916 18.0142 18.045 17.6983 17.8781C16.9973 17.5075 16.132 17.4803 15.4059 17.8995C14.68 18.3187 14.271 19.0816 14.2414 19.874C14.228 20.2311 14.1949 20.3817 14.1548 20.4784C14.028 20.7846 13.7846 21.028 13.4783 21.1549C13.4012 21.1868 13.284 21.2163 13.0432 21.2327C12.7958 21.2496 12.4762 21.25 12 21.25C11.5238 21.25 11.2042 21.2496 10.9567 21.2327C10.716 21.2163 10.5988 21.1868 10.5216 21.1549C10.2154 21.028 9.97201 20.7846 9.84514 20.4784C9.80512 20.3817 9.77195 20.2311 9.75859 19.874C9.72896 19.0817 9.31997 18.3187 8.5939 17.8995C7.86784 17.4803 7.00262 17.5076 6.30158 17.8781C5.98565 18.0451 5.83863 18.0917 5.73495 18.1053C5.40626 18.1486 5.07385 18.0595 4.81084 17.8577C4.74458 17.8069 4.66045 17.7201 4.52586 17.5198C4.38751 17.314 4.22736 17.0374 3.98926 16.625C3.75115 16.2126 3.59171 15.9356 3.4826 15.7129C3.37646 15.4962 3.34338 15.3799 3.33248 15.2971C3.28921 14.9684 3.37828 14.636 3.5801 14.373C3.64376 14.2901 3.75761 14.186 4.0602 13.9959C4.73158 13.5741 5.18782 12.8384 5.18786 12.0001C5.18791 11.1616 4.73165 10.4259 4.06021 10.004C3.75769 9.81389 3.64385 9.70987 3.58019 9.62691C3.37838 9.3639 3.28931 9.03149 3.33258 8.7028C3.34348 8.62001 3.37656 8.50375 3.4827 8.28707C3.59181 8.06431 3.75125 7.78734 3.98935 7.37493C4.22746 6.96253 4.3876 6.68596 4.52596 6.48009C4.66055 6.27983 4.74468 6.19305 4.81093 6.14222C5.07395 5.9404 5.40636 5.85133 5.73504 5.8946C5.83873 5.90825 5.98576 5.95483 6.30173 6.12184C7.00273 6.49235 7.86791 6.51962 8.59394 6.10045C9.31998 5.68128 9.72896 4.91837 9.75859 4.12602C9.77195 3.76889 9.80512 3.61827 9.84514 3.52165C9.97201 3.21536 10.2154 2.97202 10.5216 2.84515Z\" fill=\"currentColor\" />",
);

export const CheckedIcon = createIcon(16)(
    "<rect x=\"0.75\" y=\"0.75\" width=\"14.5\" height=\"14.5\" rx=\"3.25\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" /><path d=\"M3.75 7.75L6.75 10.75L12.25 5.25\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const UncheckedIcon = createIcon(16)(
    "<rect x=\"0.75\" y=\"0.75\" width=\"14.5\" height=\"14.5\" rx=\"3.25\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" />",
);

export const IndeterminateIcon = createIcon(16)(
    "<rect width=\"16\" height=\"16\" rx=\"4\" fill=\"none\" stroke=\"currentColor\" /><line x1=\"5\" y1=\"8\" x2=\"11\" y2=\"8\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" />",
);

export const RadioCheckedIcon = createIcon(16)(
    "<circle cx=\"8\" cy=\"8\" r=\"7\" fill=\"none\" stroke=\"currentColor\" /><circle cx=\"8\" cy=\"8\" r=\"3\" fill=\"currentColor\" />",
);

export const RadioUncheckedIcon = createIcon(16)(
    "<circle cx=\"8\" cy=\"8\" r=\"7\" fill=\"none\" stroke=\"currentColor\" />",
);

export const FilterTableIcon = createIcon(24)(
    "<path d=\"M4 7H20\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M7 12L17 12\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M11 17H13\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

// The dot is a real filled circle rather than the zero-length `M12 19V18.99` stroke
// segment this icon used to carry. That idiom draws a dot of radius strokeWidth/2 — 0.75
// here — which at the 16px the Tor toolbar button renders at collapses to a ~1px speck
// that antialiases away, leaving a question mark that reads as cut off at the bottom.
// WarningIcon and InfoIcon already use `<circle r="1">` for the same feature; this goes
// slightly larger because those render at dialog size while this one lives in a toolbar.
export const QuestionIcon = createIcon(24)(
    "<path d=\"M8.5 8.75C8.5 6.817 10.067 5 12 5C13.933 5 15.5 6.817 15.5 8.75C15.5 11.2 12 12.3 12 14.8\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><circle cx=\"12\" cy=\"18.5\" r=\"1.25\" fill=\"currentColor\" />",
);

export const DeleteIcon = createIcon(24)(
    "<path d=\"M20.5001 6H3.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" /><path d=\"M18.8332 8.5L18.3732 15.3991C18.1962 18.054 18.1077 19.3815 17.2427 20.1907C16.3777 21 15.0473 21 12.3865 21H11.6132C8.95235 21 7.62195 21 6.75694 20.1907C5.89194 19.3815 5.80344 18.054 5.62644 15.3991L5.1665 8.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" /><path d=\"M9.1709 4C9.58273 2.83481 10.694 2 12.0002 2C13.3064 2 14.4177 2.83481 14.8295 4\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

export const PasteIcon = createIcon(24)(
    "<path d=\"M13.7778 5H14.6667C15.5047 5 15.9237 5 16.1841 5.2636C16.4444 5.52721 16.4444 5.95147 16.4444 6.8V10M13.7778 5V5.8C13.7778 6.22426 13.7778 6.4364 13.6476 6.5682C13.5174 6.7 13.3079 6.7 12.8889 6.7H7.55556C7.13653 6.7 6.92702 6.7 6.79684 6.5682C6.66667 6.4364 6.66667 6.22426 6.66667 5.8V5M13.7778 5C13.7778 4.57574 13.7778 4.2636 13.6476 4.1318C13.5174 4 13.3079 4 12.8889 4H7.55556C7.13653 4 6.92702 4 6.79684 4.1318C6.66667 4.2636 6.66667 4.57574 6.66667 5M6.66667 5H5.77778C4.93973 5 4.5207 5 4.26035 5.2636C4 5.52721 4 5.95147 4 6.8V17.1959C4 18.0445 4 18.4687 4.26035 18.7323C4.5207 18.9959 4.93973 18.9959 5.77778 18.9959H9.77778M14 20H18C18.9428 20 19.4142 20 19.7071 19.7071C20 19.4142 20 18.9428 20 18V14C20 13.0572 20 12.5858 19.7071 12.2929C19.4142 12 18.9428 12 18 12H14C13.0572 12 12.5858 12 12.2929 12.2929C12 12.5858 12 13.0572 12 14V18C12 18.9428 12 19.4142 12.2929 19.7071C12.5858 20 13.0572 20 14 20Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const CutIcon = createIcon(24)(
    "<path d=\"M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12M8.5 6.5C8.5 7.60457 7.60457 8.5 6.5 8.5C5.39543 8.5 4.5 7.60457 4.5 6.5C4.5 5.39543 5.39543 4.5 6.5 4.5C7.60457 4.5 8.5 5.39543 8.5 6.5ZM8.5 17.5C8.5 18.6046 7.60457 19.5 6.5 19.5C5.39543 19.5 4.5 18.6046 4.5 17.5C4.5 16.3954 5.39543 15.5 6.5 15.5C7.60457 15.5 8.5 16.3954 8.5 17.5Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const ChevronUpIcon = createIcon(16)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M12.8373 10.8243C12.6203 11.0586 12.2686 11.0586 12.0516 10.8243L8 6.44853L3.94839 10.8243C3.73143 11.0586 3.37968 11.0586 3.16272 10.8243C2.94576 10.59 2.94576 10.2101 3.16272 9.97574L7.60716 5.17574C7.82412 4.94142 8.17588 4.94142 8.39284 5.17574L12.8373 9.97574C13.0542 10.2101 13.0542 10.59 12.8373 10.8243Z\" fill=\"currentColor\" />",
);

export const ChevronDownIcon = createIcon(16)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M3.16272 5.17574C3.37968 4.94142 3.73143 4.94142 3.94839 5.17574L8 9.55147L12.0516 5.17574C12.2686 4.94142 12.6203 4.94142 12.8373 5.17574C13.0542 5.41005 13.0542 5.78995 12.8373 6.02426L8.39284 10.8243C8.17588 11.0586 7.82412 11.0586 7.60716 10.8243L3.16272 6.02426C2.94576 5.78995 2.94576 5.41005 3.16272 5.17574Z\" fill=\"currentColor\" />",
);

export const ChevronRightIcon = createIcon(16)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M5.17574 12.8373C4.94142 12.6203 4.94142 12.2686 5.17574 12.0516L9.55147 8L5.17574 3.94839C4.94142 3.73143 4.94142 3.37968 5.17574 3.16272C5.41005 2.94576 5.78995 2.94576 6.02426 3.16272L10.8243 7.60716C11.0586 7.82412 11.0586 8.17588 10.8243 8.39284L6.02426 12.8373C5.78995 13.0542 5.41005 13.0542 5.17574 12.8373Z\" fill=\"currentColor\" />",
);

export const ChevronLeftIcon = createIcon(16)(
    "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M10.8243 3.16272C11.0586 3.37968 11.0586 3.73143 10.8243 3.94839L6.44853 8L10.8243 12.0516C11.0586 12.2686 11.0586 12.6203 10.8243 12.8373C10.59 13.0542 10.2101 13.0542 9.97574 12.8373L5.17574 8.39284C4.94142 8.17588 4.94142 7.82412 5.17574 7.60716L9.97574 3.16272C10.2101 2.94576 10.59 2.94576 10.8243 3.16272Z\" fill=\"currentColor\" />",
);

export const RefreshIcon = createIcon(24)(
    "<path d=\"M3.67981 11.3333H2.92981H3.67981ZM3.67981 13L3.15157 13.5324C3.44398 13.8225 3.91565 13.8225 4.20805 13.5324L3.67981 13ZM5.88787 11.8657C6.18191 11.574 6.18377 11.0991 5.89203 10.8051C5.60029 10.511 5.12542 10.5092 4.83138 10.8009L5.88787 11.8657ZM2.52824 10.8009C2.2342 10.5092 1.75933 10.511 1.46759 10.8051C1.17585 11.0991 1.17772 11.574 1.47176 11.8657L2.52824 10.8009ZM18.6156 7.39279C18.8325 7.74565 19.2944 7.85585 19.6473 7.63892C20.0001 7.42199 20.1103 6.96007 19.8934 6.60721L18.6156 7.39279ZM12.0789 2.25C7.03155 2.25 2.92981 6.3112 2.92981 11.3333H4.42981C4.42981 7.15072 7.84884 3.75 12.0789 3.75V2.25ZM2.92981 11.3333L2.92981 13H4.42981L4.42981 11.3333H2.92981ZM4.20805 13.5324L5.88787 11.8657L4.83138 10.8009L3.15157 12.4676L4.20805 13.5324ZM4.20805 12.4676L2.52824 10.8009L1.47176 11.8657L3.15157 13.5324L4.20805 12.4676ZM19.8934 6.60721C18.287 3.99427 15.3873 2.25 12.0789 2.25V3.75C14.8484 3.75 17.2727 5.20845 18.6156 7.39279L19.8934 6.60721Z\" fill=\"currentColor\" /><path d=\"M20.3139 11L20.8411 10.4666C20.549 10.1778 20.0788 10.1778 19.7867 10.4666L20.3139 11ZM18.1004 12.1333C17.8058 12.4244 17.8031 12.8993 18.0942 13.1939C18.3854 13.4885 18.8603 13.4913 19.1549 13.2001L18.1004 12.1333ZM21.4729 13.2001C21.7675 13.4913 22.2424 13.4885 22.5335 13.1939C22.8247 12.8993 22.822 12.4244 22.5274 12.1332L21.4729 13.2001ZM5.31794 16.6061C5.1004 16.2536 4.6383 16.1442 4.28581 16.3618C3.93331 16.5793 3.82391 17.0414 4.04144 17.3939L5.31794 16.6061ZM11.8827 21.75C16.9451 21.75 21.0639 17.6915 21.0639 12.6667H19.5639C19.5639 16.8466 16.1332 20.25 11.8827 20.25V21.75ZM21.0639 12.6667V11H19.5639V12.6667H21.0639ZM19.7867 10.4666L18.1004 12.1333L19.1549 13.2001L20.8411 11.5334L19.7867 10.4666ZM19.7867 11.5334L21.4729 13.2001L22.5274 12.1332L20.8411 10.4666L19.7867 11.5334ZM4.04144 17.3939C5.65405 20.007 8.56403 21.75 11.8827 21.75V20.25C9.10023 20.25 6.66584 18.7903 5.31794 16.6061L4.04144 17.3939Z\" fill=\"currentColor\" />",
);

export const ColumnsIcon = createIcon(24)(
    "<path d=\"M7.5 7C6.56538 7 6.09808 7 5.75 7.20096C5.52197 7.33261 5.33261 7.52197 5.20096 7.75C5 8.09808 5 8.56538 5 9.5L5 18.5C5 19.4346 5 19.9019 5.20096 20.25C5.33261 20.478 5.52197 20.6674 5.75 20.799C6.09808 21 6.56538 21 7.5 21C8.43462 21 8.90192 21 9.25 20.799C9.47803 20.6674 9.66739 20.478 9.79904 20.25C10 19.9019 10 19.4346 10 18.5L10 9.5C10 8.56538 10 8.09808 9.79904 7.75C9.66739 7.52197 9.47803 7.33261 9.25 7.20096C8.90192 7 8.43462 7 7.5 7Z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M16.5 7C15.5654 7 15.0981 7 14.75 7.20096C14.522 7.33261 14.3326 7.52197 14.201 7.75C14 8.09808 14 8.56538 14 9.5L14 15.5C14 16.4346 14 16.9019 14.201 17.25C14.3326 17.478 14.522 17.6674 14.75 17.799C15.0981 18 15.5654 18 16.5 18C17.4346 18 17.9019 18 18.25 17.799C18.478 17.6674 18.6674 17.478 18.799 17.25C19 16.9019 19 16.4346 19 15.5L19 9.5C19 8.56538 19 8.09808 18.799 7.75C18.6674 7.52197 18.478 7.33261 18.25 7.20096C17.9019 7 17.4346 7 16.5 7Z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" />",
);

export const SunIcon = createIcon(24)(
    "<path fill=\"currentColor\" d=\"M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z\" />",
);

export const MoonIcon = createIcon(24)(
    "<path fill=\"currentColor\" d=\"M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z\" />",
);

export const CompareIcon = createIcon(32)(
    "<g fill=\"currentColor\"><path d=\"M28,6H18V4a2,2,0,0,0-2-2H4A2,2,0,0,0,2,4V24a2,2,0,0,0,2,2H14v2a2,2,0,0,0,2,2H28a2,2,0,0,0,2-2V8A2,2,0,0,0,28,6ZM4,15h6.17L7.59,17.59,9,19l5-5L9,9,7.59,10.41,10.17,13H4V4H16V24H4ZM16,28V26a2,2,0,0,0,2-2V8H28v9H21.83l2.58-2.59L23,13l-5,5,5,5,1.41-1.41L21.83,19H28v9Z\" /><rect fill=\"none\" width=\"32\" height=\"32\" /></g>",
);

export const SaveIcon = createIcon(24)(
    "<path d=\"M4 5C4 3.89543 4.89543 3 6 3H16L20 7V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V5Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M7 3V8H15V3\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" fill=\"none\" /><rect x=\"7\" y=\"13\" width=\"10\" height=\"5\" rx=\"0.5\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" />",
);

export const DuplicateIcon = createIcon(24)(
    "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M16 8V6C16 4.89543 15.1046 4 14 4H6C4.89543 4 4 4.89543 4 6V14C4 15.1046 4.89543 16 6 16H8\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" />",
);

export const RenameIcon = createIcon(24)(
    "<path d=\"M17 3L21 7L8 20H4V16L17 3Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const FolderOpenIcon = createIcon(24)(
    "<path d=\"M2 7V5C2 3.89543 2.89543 3 4 3H9L11 5H20C21.1046 5 22 5.89543 22 7V9\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M2 10H20C21.1046 10 22 10.8954 22 12V19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V10Z\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" />",
);

export const LockIcon = createIcon(24)(
    "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

export const UnlockIcon = createIcon(24)(
    "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

export const KeyOffIcon = createIcon(24)(
    "<circle cx=\"8\" cy=\"15\" r=\"5\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M12 11L21 4M18 3L21 4L20 7\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><line x1=\"3\" y1=\"3\" x2=\"21\" y2=\"21\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" />",
);

export const NewFileIcon = createIcon(24)(
    "<path d=\"M14 3H7C5.89543 3 5 3.89543 5 5V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V8L14 3Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M12 10V16M9 13H15\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" />",
);

export const NewFolderIcon = createIcon(24)(
    "<path d=\"M22 19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3H9L11 5H20C21.1046 5 22 5.89543 22 7V19Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M12 10V16M9 13H15\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" />",
);

export const FolderPlusIcon = createIcon(24)(
    "<path d=\"M22 19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3H9L11 5H20C21.1046 5 22 5.89543 22 7V19Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const RemoveIcon = createIcon(24)(
    "<path d=\"M18 6L6 18M6 6L18 18\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />",
);

export const ClearListIcon = createIcon(24)(
    "<path d=\"M4 6H20M4 12H14M4 18H10\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" /><path d=\"M21 15L15 21M15 15L21 21\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" />",
);

export const CollapseAllIcon = createIcon(16)(
    "<path d=\"M3 1.5L6.5 4.5L3 7.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M7 4.5H14\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" /><path d=\"M3 8.5L6.5 11.5L3 14.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M7 11.5H14\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

export const ExpandAllIcon = createIcon(16)(
    "<path d=\"M6.5 1.5L3 4.5L6.5 7.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M7 4.5H14\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" /><path d=\"M6.5 8.5L3 11.5L6.5 14.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" /><path d=\"M7 11.5H14\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

export const CompactViewIcon = createIcon(24)(
    "<path d=\"M4,7 h16 M4,11 h16 M4,15 h16 M4,19 h16\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

export const NormalViewIcon = createIcon(24)(
    "<path d=\"M4,4 h16 M4,10 h16 M4,16 h16 M4,22 h16\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

export const NavPanelIcon = createIcon(24)(
    "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><line x1=\"9\" y1=\"3\" x2=\"9\" y2=\"21\" stroke=\"currentColor\" stroke-width=\"1.5\" /><path d=\"M12 8H18M13 12H18M13 16H17\" stroke=\"currentColor\" stroke-width=\"1.2\" stroke-linecap=\"round\" />",
);

export const SearchIcon = createIcon(16)(
    "<circle cx=\"7\" cy=\"7\" r=\"4.5\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M10.5 10.5L14 14\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" />",
);

export const GlobeIcon = createIcon(24)(
    "<circle cx=\"12\" cy=\"12\" r=\"9\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><ellipse cx=\"12\" cy=\"12\" rx=\"4\" ry=\"9\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M3.5 9H20.5M3.5 15H20.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

export const OpenLinkIcon = createIcon(24)(
    "<path d=\"M14 4l6 5-6 5V10c-5 0-9 2-11 7 1-7 5-11 11-12V4z\" fill=\"currentColor\" />",
);

// View mode icons for Link Editor
export const ViewListIcon = createIcon(24)(
    "<path d=\"M3,5h18 M3,9h18 M3,13h18 M3,17h18 M3,21h18\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" fill=\"none\" />",
);

// "log" in a bordered box — used for the Open-Log toolbar action. Sized to fill
// the viewBox so it reads clearly at small toolbar sizes.
export const LogIcon = createIcon(24)(
    "<rect x=\"1\" y=\"4\" width=\"22\" height=\"16\" rx=\"3\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><text x=\"12\" y=\"12.7\" text-anchor=\"middle\" dominant-baseline=\"central\" font-size=\"11.5\" font-weight=\"700\" font-family=\"inherit\" fill=\"currentColor\">log</text>",
);

export const TerminalIcon = createIcon(24)(
    "<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" /><path d=\"M6 9l3 3-3 3\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\" /><path d=\"M12 15h5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" />",
);

export const ViewLandscapeIcon = createIcon(24)(
    "<rect x=\"2\" y=\"3\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" /><rect x=\"9\" y=\"3\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" /><rect x=\"16\" y=\"3\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" /><rect x=\"2\" y=\"9\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" /><rect x=\"9\" y=\"9\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" /><rect x=\"16\" y=\"9\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" /><rect x=\"2\" y=\"15\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" /><rect x=\"9\" y=\"15\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" /><rect x=\"16\" y=\"15\" width=\"6\" height=\"4\" rx=\"1\" fill=\"currentColor\" />",
);

export const ViewLandscapeBigIcon = createIcon(24)(
    "<rect x=\"2\" y=\"3\" width=\"9\" height=\"7\" rx=\"1\" fill=\"currentColor\" /><rect x=\"13\" y=\"3\" width=\"9\" height=\"7\" rx=\"1\" fill=\"currentColor\" /><rect x=\"2\" y=\"12\" width=\"9\" height=\"7\" rx=\"1\" fill=\"currentColor\" /><rect x=\"13\" y=\"12\" width=\"9\" height=\"7\" rx=\"1\" fill=\"currentColor\" />",
);

export const ViewPortraitIcon = createIcon(24)(
    "<rect x=\"2\" y=\"2\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"7.5\" y=\"2\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"13\" y=\"2\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"18\" y=\"2\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"2\" y=\"10\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"7.5\" y=\"10\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"13\" y=\"10\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"18\" y=\"10\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"2\" y=\"18\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"7.5\" y=\"18\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"13\" y=\"18\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" /><rect x=\"18\" y=\"18\" width=\"4\" height=\"6\" rx=\"1\" fill=\"currentColor\" />",
);

export const ViewPortraitBigIcon = createIcon(24)(
    "<rect x=\"2\" y=\"2\" width=\"6\" height=\"9\" rx=\"1\" fill=\"currentColor\" /><rect x=\"10\" y=\"2\" width=\"6\" height=\"9\" rx=\"1\" fill=\"currentColor\" /><rect x=\"18\" y=\"2\" width=\"6\" height=\"9\" rx=\"1\" fill=\"currentColor\" /><rect x=\"2\" y=\"13\" width=\"6\" height=\"9\" rx=\"1\" fill=\"currentColor\" /><rect x=\"10\" y=\"13\" width=\"6\" height=\"9\" rx=\"1\" fill=\"currentColor\" /><rect x=\"18\" y=\"13\" width=\"6\" height=\"9\" rx=\"1\" fill=\"currentColor\" />",
);

export const StopIcon = createIcon(24)(
    "<path d=\"M6 6H18V18H6V6Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" fill=\"currentColor\" />",
);

export const PlayIcon = createIcon(24)(
    "<path d=\"M8 5v14l11-7L8 5z\" fill=\"currentColor\" />",
);

export const PauseIcon = createIcon(24)(
    "<g fill=\"currentColor\"><rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\" /><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\" /></g>",
);

export const NextTrackIcon = createIcon(24)(
    "<g fill=\"currentColor\"><path d=\"M6 5v14l10-7L6 5z\" /><rect x=\"17\" y=\"5\" width=\"2.5\" height=\"14\" rx=\"0.5\" /></g>",
);

export const ShuffleIcon = createIcon(24)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 3h5v5\" /><path d=\"M4 20L21 3\" /><path d=\"M21 16v5h-5\" /><path d=\"M15 15l6 6\" /><path d=\"M4 4l5 5\" /></g>",
);

export const CaseSensitiveIcon = createIcon(16)(
    "<text x=\"8\" y=\"12\" text-anchor=\"middle\" fill=\"currentColor\" font-size=\"12\" font-weight=\"bold\" font-family=\"monospace\">Aa</text>",
);

export const HomeIcon = createIcon(24)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 10.5L12 3l9 7.5\" /><path d=\"M5 9.5V19a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1V9.5\" /></g>",
);

export const VolumeIcon = createIcon(24)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 5L6 9H2v6h4l5 4V5z\" fill=\"currentColor\" stroke=\"none\" /><path d=\"M15.54 8.46a5 5 0 0 1 0 7.07\" /><path d=\"M19.07 4.93a10 10 0 0 1 0 14.14\" /></g>",
);

export const VolumeMutedIcon = createIcon(24)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 5L6 9H2v6h4l5 4V5z\" fill=\"currentColor\" stroke=\"none\" /><line x1=\"22\" y1=\"9\" x2=\"16\" y2=\"15\" /><line x1=\"16\" y1=\"9\" x2=\"22\" y2=\"15\" /></g>",
);

export const BookmarkIcon = createIcon(24)(
    "<path d=\"M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" />",
);

export const BookmarkFilledIcon = createIcon(24)(
    "<path d=\"M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" />",
);

export const StarIcon = createIcon(24)(
    "<path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86L12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" />",
);

export const StarFilledIcon = createIcon(24)(
    "<path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86L12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" />",
);

export const PinIcon = createIcon(24)(
    "<path d=\"M16 3l-4 4-4-1-4 4 5 5-4 5h2l3-3 5 5 4-4-1-4 4-4z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" />",
);

export const PinFilledIcon = createIcon(24)(
    "<path d=\"M16 3l-4 4-4-1-4 4 5 5-4 5h2l3-3 5 5 4-4-1-4 4-4z\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\" />",
);

export const ScriptLibraryIcon = createIcon(16)(
    "<rect x=\"1\" y=\"2\" width=\"14\" height=\"12\" rx=\"1.5\" stroke=\"currentColor\" stroke-width=\"1.3\" fill=\"none\" /><path d=\"M5 2V14\" stroke=\"currentColor\" stroke-width=\"1.3\" /><path d=\"M8 6.5L10.5 8.5L8 10.5\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\" />",
);

export const SnipIcon = createIcon(24)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"6\" cy=\"17\" r=\"3\" /><circle cx=\"6\" cy=\"7\" r=\"3\" /><line x1=\"8.5\" y1=\"15\" x2=\"18\" y2=\"5\" /><line x1=\"8.5\" y1=\"9\" x2=\"18\" y2=\"19\" /></g>",
);

export const DownloadIcon = createIcon(24)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3v12\" /><path d=\"M8 11l4 4 4-4\" /><path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2\" /></g>",
);

/** Upload — vertical mirror of {@link DownloadIcon} (arrow out of a tray).
 *  Used for the Git "Push" action so it reads as the counterpart of "Fetch". */
export const UploadIcon = createIcon(24)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 15V3\" /><path d=\"M8 7l4-4 4 4\" /><path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2\" /></g>",
);

export const McpIcon = createIcon(24)(
    "<circle cx=\"12\" cy=\"12\" r=\"7\" fill=\"none\" stroke=\"#4ec964\" stroke-width=\"2.5\" />",
);

// Memory chip — used for the Mneme knowledge-base editor (tab + sidebar +
// header indicator). currentColor so it adapts to the active theme.
export const MemoryIcon = createIconWithViewBox("0 0 48 48")(
    "<g fill=\"currentColor\"><path d=\"M32,16H16V32H32ZM28,28H20V20h8Z\" /><path d=\"M44,28H40V20h4a2,2,0,0,0,0-4H40V10a2,2,0,0,0-2-2H32V4a2,2,0,0,0-4,0V8H20V4a2,2,0,0,0-4,0V8H10a2,2,0,0,0-2,2v6H4a2,2,0,0,0,0,4H8v8H4a2,2,0,0,0,0,4H8v6a2,2,0,0,0,2,2h6v4a2,2,0,0,0,4,0V40h8v4a2,2,0,0,0,4,0V40h6a2,2,0,0,0,2-2V32h4a2,2,0,0,0,0-4Zm-8,8H12V12H36Z\" /></g>",
);

export const ArchiveIcon = createIcon(24)(
    "<rect x=\"3\" y=\"3\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#e53935\" /><rect x=\"9.25\" y=\"3\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#43a047\" /><rect x=\"15.5\" y=\"3\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#1e88e5\" /><rect x=\"3\" y=\"9.25\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#fdd835\" /><rect x=\"9.25\" y=\"9.25\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#8e24aa\" /><rect x=\"15.5\" y=\"9.25\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#00acc1\" /><rect x=\"3\" y=\"15.5\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#fb8c00\" /><rect x=\"9.25\" y=\"15.5\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#3949ab\" /><rect x=\"15.5\" y=\"15.5\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#e53935\" />",
);

/** Tag / label icon — a rectangle with the two bottom corners cut to a downward
 *  point, and a small hole above the center. Used for git tag refs (US-634). */
export const TagIcon = createIcon(24)(
    "<path d=\"M5 4 H19 V14 L12 21 L5 14 Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\" /><circle cx=\"12\" cy=\"8.5\" r=\"1.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" />",
);

/** "AZ" glyph — alphabetical-sort toggle (Git "Branches & Tags" panel). */
export const SortAlphaIcon = createIcon(24)(
    "<text x=\"12\" y=\"18\" font-size=\"18\" font-weight=\"700\" letter-spacing=\"-1\" text-anchor=\"middle\" font-family=\"sans-serif\" fill=\"currentColor\">AZ</text>",
);

/** Web scraper / resource extraction icon — spider with radiating web lines. */
export const WebScraperIcon = createIcon(24)(
    "<line x1=\"12\" y1=\"12\" x2=\"4\" y2=\"4\" stroke=\"currentColor\" stroke-width=\"1\" opacity=\"0.5\" /><line x1=\"12\" y1=\"12\" x2=\"20\" y2=\"4\" stroke=\"currentColor\" stroke-width=\"1\" opacity=\"0.5\" /><line x1=\"12\" y1=\"12\" x2=\"4\" y2=\"20\" stroke=\"currentColor\" stroke-width=\"1\" opacity=\"0.5\" /><line x1=\"12\" y1=\"12\" x2=\"20\" y2=\"20\" stroke=\"currentColor\" stroke-width=\"1\" opacity=\"0.5\" /><line x1=\"12\" y1=\"12\" x2=\"12\" y2=\"3\" stroke=\"currentColor\" stroke-width=\"1\" opacity=\"0.5\" /><line x1=\"12\" y1=\"12\" x2=\"12\" y2=\"21\" stroke=\"currentColor\" stroke-width=\"1\" opacity=\"0.5\" /><path d=\"M7 7 A7 7 0 0 1 17 7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" opacity=\"0.4\" /><path d=\"M7 17 A7 7 0 0 0 17 17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" opacity=\"0.4\" /><circle cx=\"4\" cy=\"4\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"20\" cy=\"4\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"4\" cy=\"20\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"20\" cy=\"20\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"12\" cy=\"3\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"12\" cy=\"21\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"12\" cy=\"12\" r=\"2.5\" fill=\"currentColor\" />",
);

export const SwapIcon = createIcon(24)(
    "<g stroke=\"currentColor\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 9h12l-3.5-3.5\" /><path d=\"M19 15H7l3.5 3.5\" /></g>",
);

export const MoreVertIcon = createIcon(24)(
    "<circle cx=\"12\" cy=\"6\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"12\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"12\" cy=\"18\" r=\"1.5\" fill=\"currentColor\" />",
);

export const MoreHorizIcon = createIcon(24)(
    "<circle cx=\"6\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"12\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" /><circle cx=\"18\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" />",
);

export const VlcIcon = createIcon(24)(
    "<g fill=\"none\"><path stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m22.43 21.63 -1.9 -5.58c-0.0826 -0.2337 -0.2357 -0.4361 -0.438 -0.5794 -0.2023 -0.1433 -0.4441 -0.2203 -0.692 -0.2206h-1.54l0.48 1.48c0.053 0.1737 0.0578 0.3585 0.0138 0.5347 -0.0441 0.1762 -0.1353 0.337 -0.2638 0.4653 -0.73 0.73 -2.51 2 -6.09 2 -3.58001 0 -5.36001 -1.28 -6.09001 -2 -0.12854 -0.1283 -0.21973 -0.2891 -0.26377 -0.4653 -0.04405 -0.1762 -0.03928 -0.361 0.01377 -0.5347l0.48 -1.48h-1.54c-0.24792 0.0003 -0.48967 0.0773 -0.69201 0.2206 -0.20234 0.1433 -0.35535 0.3457 -0.43799 0.5794l-1.9 5.58c-0.06322 0.1845 -0.08169 0.3813 -0.05387 0.5743 0.02782 0.193 0.10113 0.3766 0.21387 0.5357 0.11248 0.1601 0.26239 0.2902 0.43669 0.3791 0.17429 0.0889 0.36768 0.1339 0.56331 0.1309H21.28c0.1956 0.003 0.389 -0.042 0.5633 -0.1309 0.1743 -0.0889 0.3242 -0.219 0.4367 -0.3791 0.1111 -0.1599 0.1826 -0.344 0.2087 -0.5369 0.026 -0.193 0.0059 -0.3894 -0.0587 -0.5731Z\" stroke-width=\"1.5\" /><path stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m14.34 4.19003 -0.71 -2.25c-0.1098 -0.34619 -0.3269 -0.64843 -0.62 -0.86294 -0.2931 -0.21451 -0.6468 -0.330142 -1.01 -0.330142 -0.3632 0 -0.7169 0.115632 -1.01 0.330142 -0.2931 0.21451 -0.5102 0.51675 -0.62 0.86294l-0.71 2.25c0.7252 0.36775 1.5269 0.55959 2.34 0.56 0.8131 -0.00041 1.6148 -0.19225 2.34 -0.56Z\" stroke-width=\"1.5\" /><path stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15.59 8.10999c-1.05 0.74212 -2.3042 1.1406 -3.59 1.1406s-2.54 -0.39848 -3.59001 -1.1406l-1.51 4.74001c1.52893 0.9498 3.30041 1.4361 5.10001 1.4 1.7996 0.0361 3.5711 -0.4502 5.1 -1.4l-1.51 -4.74001Z\" stroke-width=\"1.5\" /><path stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m6.13998 15.2501 3.52 -11.06004\" stroke-width=\"1.5\" /><path stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M17.86 15.2501 14.34 4.19006\" stroke-width=\"1.5\" /></g>",
);

export const PlayerIcon = createIcon(32)(
    "<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-miterlimit=\"10\"><path d=\"M26,22H6c-2.2,0-4-1.8-4-4V8c0-2.2,1.8-4,4-4h20c2.2,0,4,1.8,4,4v10C30,20.2,28.2,22,26,22z\" /><line x1=\"3\" y1=\"27\" x2=\"7\" y2=\"27\" /><line x1=\"11\" y1=\"27\" x2=\"29\" y2=\"27\" /><circle cx=\"9\" cy=\"27\" r=\"2\" /><path d=\"M13,10V16c0,0.7,0.9,1.2,1.5,0.8l5-3c0.6-0.4,0.6-1.2,0-1.6l-5-3C13.9,8.7,13,9.2,13,10z\" /></g>",
);
