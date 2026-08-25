import React, { useMemo, useState } from "react";
import { Autocomplete } from "./Autocomplete";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { Button } from "../Button/Button";
import { IListBoxItem } from "../ListBox";
import { Story } from "../../editors/storybook/storyTypes";

const COMMON_HEADERS = [
    "Accept",
    "Accept-Charset",
    "Accept-Encoding",
    "Accept-Language",
    "Authorization",
    "Cache-Control",
    "Content-Encoding",
    "Content-Language",
    "Content-Length",
    "Content-Type",
    "Cookie",
    "Host",
    "If-Match",
    "If-Modified-Since",
    "If-None-Match",
    "Origin",
    "Pragma",
    "Range",
    "Referer",
    "User-Agent",
    "X-Forwarded-For",
    "X-Requested-With",
];

const HISTORY_SAMPLE = [
    "react hooks tutorial",
    "react server components",
    "rust async runtime",
    "rust borrow checker",
    "typescript narrowing",
    "typescript template literal types",
    "vite plugin api",
    "monaco editor api",
];

interface DemoProps {
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    size?: "sm" | "md";
    filterMode?: "contains" | "startsWith" | "off";
    itemsMode?: "common-headers" | "with-icons" | "history-prefiltered";
    openOnFocus?: boolean;
    withOnSubmit?: boolean;
    withHeader?: boolean;
    withHeaderAction?: boolean;
    withEmptyMessage?: boolean;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
}

function buildIconItems(): IListBoxItem[] {
    return COMMON_HEADERS.map((h) => ({
        value: h,
        label: h,
        icon: "globe",
    }));
}

function AutocompleteDemo({
    placeholder = "Type a header name…",
    disabled = false,
    readOnly = false,
    size = "md",
    filterMode = "contains",
    itemsMode = "common-headers",
    openOnFocus = false,
    withOnSubmit = false,
    withHeader = false,
    withHeaderAction = false,
    withEmptyMessage = false,
    width,
    minWidth,
    maxWidth,
}: DemoProps) {
    const [value, setValue] = useState("");
    const [lastSubmit, setLastSubmit] = useState<string | null>(null);
    const [lastEscape, setLastEscape] = useState<string | null>(null);

    const items = useMemo<string[] | IListBoxItem[]>(() => {
        if (itemsMode === "with-icons") return buildIconItems();
        if (itemsMode === "history-prefiltered") {
            // Pre-filter to demo filterMode="off". Words from the typed value
            // intersect against entries.
            const words = value.toLowerCase().split(/\s+/).filter((w) => w);
            if (!words.length) return HISTORY_SAMPLE;
            return HISTORY_SAMPLE.filter((entry) => {
                const lower = entry.toLowerCase();
                return words.every((w) => lower.includes(w));
            });
        }
        return COMMON_HEADERS;
    }, [itemsMode, value]);

    const effectiveFilterMode = itemsMode === "history-prefiltered" ? "off" : filterMode;

    return (
        <Panel direction="column" gap="md" width={600}>
            <Autocomplete
                name="demo-autocomplete"
                items={items}
                value={value}
                onChange={setValue}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                size={size}
                filterMode={effectiveFilterMode}
                openOnFocus={openOnFocus}
                onSubmit={withOnSubmit ? (v) => setLastSubmit(v) : undefined}
                onEscape={(v) => setLastEscape(v)}
                header={withHeader
                    ? <Text size="xs" color="light">Search History</Text>
                    : undefined}
                headerAction={withHeader && withHeaderAction
                    ? <Button size="sm" variant="ghost" onClick={() => setValue("")}>Clear</Button>
                    : undefined}
                emptyMessage={withEmptyMessage
                    ? <Text size="xs" color="light">No matching entries</Text>
                    : undefined}
                width={width || undefined}
                minWidth={minWidth || undefined}
                maxWidth={maxWidth || undefined}
                aria-label="Demo autocomplete"
            />
            <Text size="xs" color="light">
                value: {JSON.stringify(value)}
            </Text>
            {withOnSubmit && (
                <Text size="xs" color="light">
                    last onSubmit: {lastSubmit == null ? "—" : JSON.stringify(lastSubmit)}
                </Text>
            )}
            <Text size="xs" color="light">
                last onEscape: {lastEscape == null ? "—" : JSON.stringify(lastEscape)}
            </Text>
        </Panel>
    );
}

export const autocompleteStory: Story = {
    id: "autocomplete",
    name: "Autocomplete",
    section: "Lists",
    component: AutocompleteDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "placeholder",      type: "string",  default: "Type a header name…" },
        { name: "disabled",         type: "boolean", default: false },
        { name: "readOnly",         type: "boolean", default: false },
        { name: "size",             type: "enum",    options: ["sm", "md"], default: "md" },
        { name: "filterMode",       type: "enum",    options: ["contains", "startsWith", "off"], default: "contains", label: "Filter mode" },
        {
            name: "itemsMode",
            type: "enum",
            options: ["common-headers", "with-icons", "history-prefiltered"],
            default: "common-headers",
            label: "Items mode",
        },
        { name: "openOnFocus",      type: "boolean", default: false, label: "Open on focus" },
        { name: "withOnSubmit",     type: "boolean", default: false, label: "Enable onSubmit (Browser URL bar style)" },
        { name: "withHeader",       type: "boolean", default: false, label: "Show dropdown header" },
        { name: "withHeaderAction", type: "boolean", default: false, label: "Show 'Clear' header action" },
        { name: "withEmptyMessage", type: "boolean", default: false, label: "Show empty-message when no match" },
        { name: "width",            type: "number",  default: 0, min: 0, max: 600, step: 20, label: "Width (0 = unset)" },
        { name: "minWidth",         type: "number",  default: 0, min: 0, max: 400, step: 20, label: "Min width (0 = unset)" },
        { name: "maxWidth",         type: "number",  default: 0, min: 0, max: 600, step: 20, label: "Max width (0 = unset)" },
    ],
};
