import { useEffect, useMemo, useRef } from "react";
import type { HtmlEditor } from "./HtmlEditor";
import { useEditorConfig } from "../base";

// Injected into the previewed HTML. Two capture-phase listeners:
//  1. Block <a> navigation inside the preview.
//  2. On any pointerdown, ping the host (`html:interact`) so it can dismiss open
//     menus / popovers. The iframe is sandboxed (opaque origin) so its clicks
//     don't bubble to the host document — this mirrors the Browser/Board
//     overlay-dismissal. targetOrigin "*" is safe: the host validates the
//     message source against this iframe's contentWindow.
const injectedScript = `<script>document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.href){e.preventDefault();}},true);document.addEventListener("pointerdown",function(){try{window.parent.postMessage({__persephone:"html:interact"},"*");}catch(e){}},true);</script>`;

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
        () => content + injectedScript,
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

    // Dismiss host overlays (context menus, popovers) on a click inside the
    // preview: the sandboxed iframe's clicks don't bubble to the host, so the
    // injected shim posts `html:interact`, which we turn into the same
    // `document` mousedown the host uses to tear down open menus.
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.source !== iframeRef.current?.contentWindow) return;
            const d = e.data as { __persephone?: string } | undefined;
            if (d?.__persephone === "html:interact") {
                document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

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
