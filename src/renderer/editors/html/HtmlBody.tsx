import { useEffect, useMemo, useRef } from "react";
import type { HtmlEditor } from "./HtmlEditor";
import { useEditorConfig } from "../base";

const navigationBlockerScript = `<script>document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.href){e.preventDefault();}},true);</script>`;

interface HtmlBodyProps {
    model: HtmlEditor;
}

export function HtmlBody({ model }: HtmlBodyProps) {
    const host = model.host;

    const content = host ? host.state.use((s) => s.content) : "";

    // PV8 — focus queue drain. <TextChrome>'s root-focus puts focus
    // on its outer panel, which is sufficient — the iframe takes keyboard
    // focus on click via the browser's default tab order. Drain events to
    // keep the queue lifecycle clean.
    model.typedQueue.use(() => {
        // no-op
    });

    const safeSrcDoc = useMemo(
        () => content + navigationBlockerScript,
        [content],
    );

    const maxH = useEditorConfig().maxEditorHeight;

    // Report the live iframe to the model so its image-export actions can capture
    // the on-screen region (HC1). Cleared on unmount to avoid a stale ref.
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    useEffect(() => {
        model.setCaptureElement(iframeRef.current);
        return () => model.setCaptureElement(null);
    }, [model]);

    return (
        <iframe
            ref={iframeRef}
            srcDoc={safeSrcDoc}
            sandbox="allow-scripts"
            title="HTML Preview"
            style={
                maxH !== undefined
                    ? { height: maxH, width: "100%", border: "none" }
                    : { flex: 1, border: "none" }
            }
        />
    );
}
