import { BaseImageView } from "../image";
import { TextFileModel } from "../text/TextPageModel";

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

    // Build data URL from SVG content
    const src = `data:image/svg+xml,${encodeURIComponent(content)}`;

    return <BaseImageView src={src} alt="SVG Preview" />;
}

export { SvgView };
export type { SvgViewProps };
