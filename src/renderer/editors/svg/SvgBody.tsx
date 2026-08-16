import type { SvgEditor } from "./SvgEditor";
import type { ImageViewportRef } from "../../uikit/ImageViewport";
import { ImageViewport } from "../../uikit/ImageViewport";
import { useEditorConfig } from "../base";

interface SvgBodyProps {
    model: SvgEditor;
    /** Callback receiving the BaseImageView ref. The view shell holds the
     *  ref and shares it with `<SvgToolbarBits>` (copy button). */
    imageRefSetter?: (ref: ImageViewportRef | null) => void;
}

export function SvgBody({ model, imageRefSetter }: SvgBodyProps) {
    const host = model.host;

    // Read content directly off the host. BaseImageView re-renders on src
    // prop change; the data URL is recomputed inline on every host content
    // change.
    const content = host ? host.state.use((s) => s.content) : "";

    // PV8 — focus queue subscriber. <TextChrome>'s root-focus puts
    // focus on its outer panel, which is sufficient — BaseImageView's
    // tabIndex={0} root receives focus naturally on click, after which its
    // own onKeyDown handler picks up keyboard zoom (+/-/0/Ctrl+C). Drain
    // events to keep the queue lifecycle clean.
    model.typedQueue.use(() => {
        // no-op
    });

    // Build data URL from SVG content (matches today's SvgView.tsx behavior).
    const src = `data:image/svg+xml,${encodeURIComponent(content)}`;

    const image = <ImageViewport ref={imageRefSetter} src={src} alt="SVG Preview" />;

    const maxH = useEditorConfig().maxEditorHeight;
    if (maxH !== undefined) {
        return <div style={{ height: maxH }}>{image}</div>;
    }
    return image;
}
