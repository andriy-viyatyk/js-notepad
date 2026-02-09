import styled from "@emotion/styled";
import { Children, CSSProperties, isValidElement, ReactElement, ReactNode } from "react";
import color from "../../theme/color";
import { ChevronDownIcon, ChevronRightIcon } from "../../theme/icons";

// =============================================================================
// CollapsiblePanel (child component)
// =============================================================================

export interface CollapsiblePanelProps {
    /** Unique panel identifier */
    id: string;
    /** Panel header title */
    title: string;
    /** Panel content */
    children: ReactNode;
}

/**
 * Represents a single panel within a CollapsiblePanelStack.
 * This component doesn't render anything by itself - it's used declaratively
 * to define panels, and the parent CollapsiblePanelStack handles rendering.
 */
export function CollapsiblePanel(_props: CollapsiblePanelProps): ReactElement | null {
    // This component is only used for its props - rendering is handled by CollapsiblePanelStack
    return null;
}

// =============================================================================
// CollapsiblePanelStack (parent component)
// =============================================================================

export interface CollapsiblePanelStackProps {
    /** ID of the currently active/expanded panel */
    activePanel: string;
    /** Called when a panel header is clicked to change the active panel */
    setActivePanel: (panelId: string) => void;
    /** Panel definitions as CollapsiblePanel children */
    children: ReactNode;
    /** Optional className for the root element */
    className?: string;
    /** Optional inline styles for the root element */
    style?: CSSProperties;
}

// =============================================================================
// Styles
// =============================================================================

const PanelStackRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",

    "& .collapsible-panel": {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "flex 0.15s ease",
        "&.collapsed": {
            flex: "0 0 auto",
        },
        "&.expanded": {
            flex: "1 1 auto",
        },
    },

    "& .panel-header": {
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 8px",
        fontSize: 12,
        fontWeight: 500,
        color: color.text.light,
        cursor: "pointer",
        userSelect: "none",
        borderBottom: `1px solid ${color.background.light}`,
        "&:hover": {
            backgroundColor: color.background.light,
        },
        "& svg": {
            width: 14,
            height: 14,
            flexShrink: 0,
        },
    },

    "& .panel-content": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        backgroundColor: color.background.default,
    },
});

// =============================================================================
// Component
// =============================================================================

/**
 * A stack of collapsible panels where exactly one panel is always expanded.
 * Clicking an expanded panel collapses it and expands the next one.
 * Clicking a collapsed panel expands it and collapses the current one.
 *
 * @example
 * ```tsx
 * <CollapsiblePanelStack
 *     activePanel={state.activePanel}
 *     setActivePanel={model.setActivePanel}
 * >
 *     <CollapsiblePanel id="tags" title="Tags">
 *         <TagsContent />
 *     </CollapsiblePanel>
 *     <CollapsiblePanel id="categories" title="Categories">
 *         <CategoriesContent />
 *     </CollapsiblePanel>
 * </CollapsiblePanelStack>
 * ```
 */
export function CollapsiblePanelStack({
    activePanel,
    setActivePanel,
    children,
    className,
    style,
}: CollapsiblePanelStackProps) {
    // Extract panel definitions from children
    const panels: { id: string; title: string; content: ReactNode }[] = [];

    Children.forEach(children, (child) => {
        if (isValidElement(child) && child.type === CollapsiblePanel) {
            const { id, title, children: content } = child.props as CollapsiblePanelProps;
            panels.push({ id, title, content });
        }
    });

    const handleToggle = (panelId: string) => {
        if (activePanel === panelId) {
            // If clicking the active panel, switch to the next one
            const currentIndex = panels.findIndex(p => p.id === panelId);
            const nextIndex = (currentIndex + 1) % panels.length;
            setActivePanel(panels[nextIndex].id);
        } else {
            setActivePanel(panelId);
        }
    };

    return (
        <PanelStackRoot className={className} style={style}>
            {panels.map((panel) => {
                const isExpanded = activePanel === panel.id;
                return (
                    <div
                        key={panel.id}
                        className={`collapsible-panel ${isExpanded ? "expanded" : "collapsed"}`}
                    >
                        <div
                            className="panel-header"
                            onClick={() => handleToggle(panel.id)}
                        >
                            {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                            {panel.title}
                        </div>
                        {isExpanded && (
                            <div className="panel-content">
                                {panel.content}
                            </div>
                        )}
                    </div>
                );
            })}
        </PanelStackRoot>
    );
}
