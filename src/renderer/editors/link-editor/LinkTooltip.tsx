import { useCallback, useMemo, useState } from "react";

import { Input, Panel, Tag } from "../../uikit";
import color from "../../theme/color";
import { CopyIcon } from "../../theme/icons";
import type { ILink } from "../../api/types/io.tree";
import { resolveTorSrc, type TorProxyInfo } from "./tor-src";

interface LinkTooltipContentProps {
    link: ILink;
    allTags?: string[];
    onToggleTag?: (link: ILink, tag: string) => void;
    /** Show "Copy link as JSON" affordance next to the title. Default: false. */
    showCopyJson?: boolean;
    /** US-896 — Tor session to fetch the preview image through, on a Tor page. */
    imageProxy?: TorProxyInfo | null;
}

/**
 * Tooltip body for a link row. Consumers wrap their trigger with UIKit
 * `<Tooltip content={<LinkTooltipContent ... />}>`. The legacy id-anchored
 * Tooltip wrapper is gone (replaced by per-trigger inline Tooltip wrapping).
 */
export function LinkTooltipContent({ link, allTags, onToggleTag, showCopyJson, imageProxy }: Readonly<LinkTooltipContentProps>) {
    const [newTag, setNewTag] = useState("");
    // US-896 — null when the preview must not be loaded (Tor page, Tor not up).
    const imageSrc = resolveTorSrc(link.imgSrc, imageProxy);

    const commitNewTag = useCallback((value: string) => {
        const trimmed = value.trim().replace(/:$/, "");
        if (trimmed && onToggleTag && !link.tags?.includes(trimmed)) {
            onToggleTag(link, trimmed);
        }
        setNewTag("");
    }, [link, onToggleTag]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitNewTag((e.target as HTMLInputElement).value);
        }
    }, [commitNewTag]);

    const showTags = !!(allTags && allTags.length > 0 && onToggleTag);
    const sortedTags = useMemo(() => allTags ? [...allTags].sort() : [], [allTags]);
    const linkTags = link.tags ?? [];

    return (
        <Panel name="link-tooltip-body" direction="column" gap="xs" maxWidth={360}>
            <Panel direction="row" align="start" gap="xs">
                <span
                    style={{
                        flex: 1,
                        fontWeight: 600,
                        color: color.text.strong,
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                    }}
                >
                    {link.title || "Untitled"}
                </span>
                {showCopyJson && (
                    <span
                        style={{
                            cursor: "pointer",
                            color: color.text.light,
                            flexShrink: 0,
                            marginTop: 1,
                        }}
                        title="Copy link as JSON"
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(link, null, 4))}
                    >
                        <CopyIcon width={14} height={14} />
                    </span>
                )}
            </Panel>
            {link.href && (
                <span
                    style={{
                        fontSize: 12,
                        color: color.text.light,
                        whiteSpace: "normal",
                        wordBreak: "break-all",
                        userSelect: "text",
                    }}
                >
                    {link.href}
                </span>
            )}
            {imageSrc && (
                <img
                    style={{
                        marginTop: 4,
                        maxWidth: "100%",
                        maxHeight: 200,
                        objectFit: "contain",
                        borderRadius: 4,
                        border: `1px solid ${color.border.default}`,
                    }}
                    src={imageSrc}
                    alt=""
                />
            )}
            {showTags && (
                <Panel
                    name="link-tooltip-tags"
                    direction="column"
                    gap="xs"
                    paddingTop="sm"
                    borderTop
                >
                    <Panel
                        direction="row"
                        wrap
                        gap="xs"
                        maxHeight={120}
                        overflowY="auto"
                    >
                        {sortedTags.map((tag) => (
                            <Tag
                                key={tag}
                                label={tag}
                                size="sm"
                                variant="outlined"
                                selected={linkTags.includes(tag)}
                                onClick={() => onToggleTag?.(link, tag)}
                            />
                        ))}
                        <Input
                            name="link-tooltip-new-tag"
                            size="sm"
                            variant="ghost"
                            minWidth={60}
                            maxWidth={120}
                            placeholder="+ tag (Enter)"
                            value={newTag}
                            onChange={setNewTag}
                            onKeyDown={handleKeyDown}
                        />
                    </Panel>
                </Panel>
            )}
        </Panel>
    );
}
