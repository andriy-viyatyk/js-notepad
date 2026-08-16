import type { MermaidEditor } from "./MermaidEditor";
import type { ImageViewportModel } from "../../uikit/ImageViewport";
import { ImageViewport } from "../../uikit/ImageViewport";
import { useEditorConfig } from "../base";
import { Panel, Text, Spinner } from "../../uikit";

interface MermaidBodyProps {
    model: MermaidEditor;
    /** Callback receiving the BaseImageView ref. The view shell holds the
     *  ref and shares it with `<MermaidToolbarBits>` (copy button). */
    imageModelSetter?: (model: ImageViewportModel | null) => void;
}

export function MermaidBody({ model, imageModelSetter }: MermaidBodyProps) {
    // Read render output reactively. svgUrl recomputes inside the editor's
    // 400 ms debounced renderDebounced on host content / lightMode change.
    const { svgUrl, error, loading } = model.state.use((s) => ({
        svgUrl: s.svgUrl,
        error: s.error,
        loading: s.loading,
    }));

    // PV8 — focus queue drain. <TextChrome>'s root-focus puts focus on
    // its outer panel, which is sufficient — BaseImageView's tabIndex={0}
    // root receives focus naturally on click. Drain events to keep the queue
    // lifecycle clean.
    model.typedQueue.use(() => {
        // no-op
    });

    const maxH = useEditorConfig().maxEditorHeight;
    const embedded = maxH !== undefined;

    return (
        <Panel
            name="mermaid-root"
            direction="column"
            flex={embedded ? undefined : true}
            overflow="hidden"
            position="relative"
            height={embedded ? maxH : 0}
        >
            {error && (
                <Panel flex align="center" justify="center" padding="xxxl">
                    <Text color="warning" preWrap>{error}</Text>
                </Panel>
            )}
            {loading && svgUrl && (
                <Panel
                    position="absolute"
                    top={0}
                    right={0}
                    bottom={0}
                    left={0}
                    zIndex={1}
                    align="center"
                    justify="center"
                >
                    <Spinner />
                </Panel>
            )}
            {loading && !svgUrl ? (
                <Panel flex align="center" justify="center" background="default">
                    <Spinner />
                </Panel>
            ) : svgUrl ? (
                <ImageViewport
                    onModel={imageModelSetter}
                    src={svgUrl}
                    alt="Mermaid Diagram"
                />
            ) : null}
        </Panel>
    );
}
