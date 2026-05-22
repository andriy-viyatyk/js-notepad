import type { MermaidEditor } from "./MermaidEditor";
import type { BaseImageViewRef } from "../shared/BaseImageView";
import { BaseImageView } from "../shared/BaseImageView";
import { Panel, Text, Spinner } from "../../uikit";

/**
 * EPIC-028 / US-562 — Mermaid preview body. Reads svgUrl/error/loading from
 * editor.state (the render pipeline lives on the editor per PV5). Renders the
 * loading overlay + error message + BaseImageView, mirroring today's
 * MermaidView.tsx output byte-for-byte. The imperative BaseImageViewRef is
 * forwarded via a callback prop so the toolbar's copy button can reach it
 * (MR2 — view-local bridge, no model surface; mirrors Svg's SV2 resolution).
 */

interface MermaidBodyProps {
    model: MermaidEditor;
    /** Callback receiving the BaseImageView ref. The view shell holds the
     *  ref and shares it with `<MermaidToolbarBits>` (copy button). */
    imageRefSetter?: (ref: BaseImageViewRef | null) => void;
}

export function MermaidBody({ model, imageRefSetter }: MermaidBodyProps) {
    // Read render output reactively. svgUrl recomputes inside the editor's
    // 400 ms debounced renderDebounced on host content / lightMode change.
    const { svgUrl, error, loading } = model.state.use((s) => ({
        svgUrl: s.svgUrl,
        error: s.error,
        loading: s.loading,
    }));

    // PV8 — focus queue drain. <TextChrome>'s root-focus (TC8) puts focus on
    // its outer panel, which is sufficient — BaseImageView's tabIndex={0}
    // root receives focus naturally on click. Drain events to keep the queue
    // lifecycle clean.
    model.typedQueue.use(() => {
        // no-op
    });

    return (
        <Panel
            name="mermaid-root"
            direction="column"
            flex
            overflow="hidden"
            position="relative"
            height={0}
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
                <BaseImageView
                    ref={imageRefSetter}
                    src={svgUrl}
                    alt="Mermaid Diagram"
                />
            ) : null}
        </Panel>
    );
}
