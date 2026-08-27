import type React from "react";

export interface BreadcrumbProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    name?: string;
    rootLabel: string;
    value: string;
    onChange: (value: string) => void;
    separators?: string;
    trailingParentSeparator?: boolean;
    separatorContent?: string;
    size?: "sm" | "md";
    clipStart?: boolean;
}
