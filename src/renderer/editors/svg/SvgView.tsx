import { useRef } from "react";
import { createPortal } from "react-dom";
import { BaseImageView } from "../image";
import type { BaseImageViewRef } from "../image";
import { TextFileModel } from "../text/TextPageModel";
import { Button } from "../../components/basic/Button";
import { CopyIcon } from "../../theme/icons";

// ============================================================================
// SvgView Component - content-view for SVG files
// ============================================================================

interface SvgViewProps {
    model: TextFileModel;
}

/**
 * SVG Preview component that renders SVG content as an image.
 * Uses BaseImageView for zoom/pan functionality.
 * Reads from page.content (not file) so it shows unsaved changes.
 */
function SvgView({ model }: SvgViewProps) {
    const content = model.state.use((s) => s.content);
    const imageRef = useRef<BaseImageViewRef>(null);

    // Build data URL from SVG content
    const src = `data:image/svg+xml,${encodeURIComponent(content)}`;

    return (
        <>
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <Button
                        type="icon"
                        size="small"
                        title="Copy Image to Clipboard (Ctrl+C)"
                        onClick={() => imageRef.current?.copyToClipboard()}
                    >
                        <CopyIcon />
                    </Button>,
                    model.editorToolbarRefLast!
                )}
            <BaseImageView ref={imageRef} src={src} alt="SVG Preview" />
        </>
    );
}

export { SvgView };
export type { SvgViewProps };
