import { useCallback, useRef, useState } from "react";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { CopyIcon, OpenLinkIcon } from "../../theme/icons";
import { copyImageToClipboard } from "./CodeBlock";

interface MarkdownImageProps {
    /** Already-resolved image source (passed through resolveRelatedLink). */
    src?: string;
    [key: string]: unknown;
}

// Rendered markdown image with a hover toolbar (Copy + Open in new tab),
// mirroring the Mermaid diagram toolbar for visual consistency. The wrapper is
// inline-block because markdown images are inline-level content.
export function MarkdownImage({ src, ...props }: MarkdownImageProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [copied, setCopied] = useState(false);

    // data:/blob: sources can't resolve to the image-view editor, so the Open
    // button is hidden for them — only Copy is offered.
    const canOpen = !!src && !/^(data:|blob:)/i.test(src);

    const handleCopy = useCallback(() => {
        if (!imgRef.current) return;
        copyImageToClipboard(imgRef.current);
        setCopied(true);
        setTimeout(() => setCopied(false), 750);
    }, []);

    const handleOpen = useCallback(() => {
        if (!src) return;
        void app.events.openRawLink.sendAsync(createLinkData(src));
    }, [src]);

    return (
        <span className="md-image">
            <img ref={imgRef} src={src} {...props} />
            <div className="diagram-toolbar">
                {canOpen && (
                    <button className="toolbar-btn" onClick={handleOpen} title="Open in new tab">
                        <OpenLinkIcon width={14} height={14} />
                    </button>
                )}
                <button
                    className={`toolbar-btn ${copied ? "copied" : ""}`}
                    onClick={handleCopy}
                    title="Copy"
                >
                    <CopyIcon width={14} height={14} />
                </button>
            </div>
        </span>
    );
}
