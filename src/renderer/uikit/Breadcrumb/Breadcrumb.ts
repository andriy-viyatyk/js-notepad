import type { NativeHTMLAttributes } from "../shared/dom-props";

export interface BreadcrumbProps
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
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
