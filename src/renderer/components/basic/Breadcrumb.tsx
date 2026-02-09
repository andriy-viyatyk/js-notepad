import styled from "@emotion/styled";
import { useCallback, useMemo } from "react";
import { splitWithSeparators } from "../../core/utils/utils";
import color from "../../theme/color";

// =============================================================================
// Styles
// =============================================================================

const BreadcrumbRoot = styled.div({
    display: "flex",
    alignItems: "center",
    fontSize: 13,
    color: color.text.light,
    "& .breadcrumb-separator": {
        color: color.text.light,
        userSelect: "none",
        margin: "0 4px",
    },
    "& .breadcrumb-item": {
        cursor: "pointer",
        "&:hover": {
            color: color.text.default,
        },
    },
    "& .breadcrumb-current": {
        color: color.misc.blue,
    },
});

// =============================================================================
// Component
// =============================================================================

export interface BreadcrumbProps {
    /** Label for the root/home element */
    rootLabel: string;
    /** Current path value (e.g., "project/settings/dev") */
    value: string;
    /** Called when a breadcrumb segment is clicked with the new path */
    onChange: (value: string) => void;
    /** Path separators (default: "/\\") */
    separators?: string;
    className?: string;
}

export function Breadcrumb(props: BreadcrumbProps) {
    const {
        rootLabel,
        value,
        onChange,
        separators = "/\\",
        className,
    } = props;

    const segments = useMemo(() => {
        if (!value) return [];
        return splitWithSeparators(value, separators);
    }, [value, separators]);

    const handleClick = useCallback(
        (index: number) => {
            if (index < 0) {
                // Root clicked - clear selection
                onChange("");
            } else {
                // Build path up to clicked segment
                const path = segments.slice(0, index + 1).join("/");
                onChange(path);
            }
        },
        [segments, onChange]
    );

    return (
        <BreadcrumbRoot className={className}>
            <span
                className={value ? "breadcrumb-item" : undefined}
                onClick={() => handleClick(-1)}
            >
                {rootLabel}
            </span>
            {segments.map((segment, index) => (
                <span key={index}>
                    <span className="breadcrumb-separator">&gt;</span>
                    <span
                        className={
                            index === segments.length - 1
                                ? "breadcrumb-current"
                                : "breadcrumb-item"
                        }
                        onClick={() => handleClick(index)}
                    >
                        {segment}
                    </span>
                </span>
            ))}
        </BreadcrumbRoot>
    );
}
