import React, {
    Children,
    CSSProperties,
    isValidElement,
    ReactElement,
    ReactNode,
    useEffect,
    useRef,
} from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { renderIcon } from "../shared/slots";
import type { IconName } from "../../theme/icon-registry";

// =============================================================================
// CollapsiblePanel — marker component (renders nothing on its own)
// =============================================================================

export interface CollapsiblePanelProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "title"> {
    /** Optional debug label emitted as `data-name` on this panel's wrapper element.
     *  Use to disambiguate multiple instances of this primitive in DOM inspector output. */
    name?: string;
    /** Unique panel identifier (used by `activePanel`). */
    id: string;
    /** Header title. Omit when the child portals its own header via headerRef. */
    title?: string;
    /** Panel content. */
    children: ReactNode;
    /** Optional leading icon in the header. */
    icon?: IconName;
    /** Optional trailing action buttons in the header. When present, the
     *  expand/collapse chevron is hidden — buttons imply state visibility. */
    buttons?: ReactNode;
    /** Ref callback for the header element — children can portal into it. */
    headerRef?: (el: HTMLDivElement | null) => void;
    /** Always render content even when collapsed (hidden via display:none).
     *  Useful when content portals into the header and must stay mounted. */
    alwaysRenderContent?: boolean;
}

/** Marker component — renders nothing. Its props are read by `CollapsiblePanelStack`. */
export function CollapsiblePanel(_props: CollapsiblePanelProps): ReactElement | null {
    return null;
}

// =============================================================================
// CollapsiblePanelStack — container
// =============================================================================

export interface CollapsiblePanelStackProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** ID of the currently expanded panel. Controlled. */
    activePanel: string;
    /** Called when the user toggles a panel. */
    setActivePanel: (panelId: string) => void;
    /** Panel definitions — should be `<CollapsiblePanel>` children only. */
    children: ReactNode;

    /** Fixed width — number → px, string passes through. */
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    height?: number | string;
    minHeight?: number | string;
    maxHeight?: number | string;
}

const StackRoot = styled.div(
    {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",

        '& > [data-type="collapsible-panel"]': {
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "flex 0.15s ease",
        },
        '& > [data-type="collapsible-panel"][data-state="closed"]': {
            flex: "0 0 auto",
        },
        '& > [data-type="collapsible-panel"][data-state="open"]': {
            flex: "1 1 auto",
        },

        '& [data-part="header"]': {
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 4px 2px 8px",
            minHeight: 27,
            fontSize: 12,
            fontWeight: 500,
            color: color.text.light,
            backgroundColor: color.background.dark,
            cursor: "pointer",
            userSelect: "none",
            borderBottom: `1px solid ${color.border.light}`,
            // The header lightens on hover — EXCEPT when the cursor is over the
            // right-edge "show main view" zone (SideBarPanelHeader's ShowMainZone),
            // which lights up on its own. This keeps the two regions independent:
            // only the hovered one changes. Harmless for headers without a zone
            // (`:has` matches nothing → the rule behaves as a plain `:hover`).
            '&:hover:not(:has([data-type="sidebar-show-main"]:hover))': {
                backgroundColor: color.background.light,
            },
            "& > svg": { width: 14, height: 14, flexShrink: 0 },
        },
        '& > [data-type="collapsible-panel"][data-state="open"] > [data-part="header"]': {
            boxShadow: `inset 3px 0 0 ${color.misc.blue}`,
            color: color.misc.blue,
        },
        '& [data-part="header-spacer"]': { flex: "1 1 auto" },

        // A header label portalled in via headerRef (e.g. a truncating <Text>, or a
        // repo-name <Tag> wrapped in a layout <Panel>) is an element whose React
        // fiber lives in the portal tree, not under this header div — so clicks on
        // it would bubble to the panel body, never reaching the header's
        // expand/collapse onClick. Making the non-interactive label primitives
        // click-through routes the click to the header div instead, so clicking the
        // title toggles the panel like clicking empty header space.
        '& [data-part="header"] [data-type="text"], & [data-part="header"] [data-type="tag"], & [data-part="header"] [data-type="panel"]':
            { pointerEvents: "none" },
        // Interactive controls re-assert pointer events: buttons keep their own
        // handlers + stopPropagation, and a clickable Tag fires its own onClick.
        // CONSTRAINT: the click-through rule above covers the whole `[data-type="panel"]`
        // label wrapper, so any OTHER interactive control portalled into a header Panel
        // (e.g. a Select, Input) must carry one of these re-enabled data-types or be added
        // to this list — otherwise it silently loses clicks. Current headers use
        // Text + Tag + IconButton + the right-edge show-main zone, all covered below.
        '& [data-part="header"] [data-type="button"], & [data-part="header"] [data-type="icon-button"], & [data-part="header"] [data-type="tag"][data-clickable], & [data-part="header"] [data-type="sidebar-show-main"]':
            { pointerEvents: "auto" },

        '& [data-part="content"]': {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: color.background.default,
        },
    },
    { label: "CollapsiblePanelStack" },
);

export function CollapsiblePanelStack({
    name,
    activePanel,
    setActivePanel,
    children,
    width,
    minWidth,
    maxWidth,
    height,
    minHeight,
    maxHeight,
    ...rest
}: CollapsiblePanelStackProps) {
    const panels: CollapsiblePanelProps[] = [];
    Children.forEach(children, (child) => {
        if (isValidElement(child) && child.type === CollapsiblePanel) {
            panels.push(child.props as CollapsiblePanelProps);
        }
    });

    const previousPanelRef = useRef<string | null>(null);
    const lastActivePanelRef = useRef(activePanel);

    useEffect(() => {
        if (activePanel !== lastActivePanelRef.current) {
            previousPanelRef.current = lastActivePanelRef.current;
            lastActivePanelRef.current = activePanel;
        }
    }, [activePanel]);

    const handleToggle = (panelId: string) => {
        if (activePanel === panelId) {
            const prev = previousPanelRef.current;
            if (prev && panels.some((p) => p.id === prev)) {
                setActivePanel(prev);
            } else {
                const fallback = panels.find((p) => p.id !== panelId);
                if (fallback) setActivePanel(fallback.id);
            }
        } else {
            setActivePanel(panelId);
        }
    };

    const inlineStyle: CSSProperties = {
        width,
        minWidth,
        maxWidth,
        height,
        minHeight,
        maxHeight,
    };

    return (
        <StackRoot data-type="collapsible-panel-stack" data-name={name} {...rest} style={inlineStyle}>
            {panels.map((panel) => {
                const isOpen = activePanel === panel.id;
                return (
                    <div
                        key={panel.id}
                        data-type="collapsible-panel"
                        data-name={panel.name}
                        data-state={isOpen ? "open" : "closed"}
                    >
                        <div
                            data-part="header"
                            ref={panel.headerRef}
                            onClick={() => handleToggle(panel.id)}
                        >
                            {!panel.headerRef && !panel.buttons && (
                                renderIcon(isOpen ? "chevron-down" : "chevron-right")
                            )}
                            {renderIcon(panel.icon)}
                            {panel.title}
                            {panel.buttons && (
                                <>
                                    <span data-part="header-spacer" />
                                    <span
                                        data-part="header-buttons"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {panel.buttons}
                                    </span>
                                </>
                            )}
                        </div>
                        {panel.alwaysRenderContent ? (
                            <div
                                data-part="content"
                                style={isOpen ? undefined : { display: "none" }}
                            >
                                {panel.children}
                            </div>
                        ) : (
                            isOpen && (
                                <div data-part="content">{panel.children}</div>
                            )
                        )}
                    </div>
                );
            })}
        </StackRoot>
    );
}
