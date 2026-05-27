import { useMemo } from "react";
import type { HtmlEditor } from "./HtmlEditor";
import { useEditorConfig } from "../base";

/**
 * EPIC-028 / US-561 — Html preview body. Reads host content via state.use,
 * builds the srcDoc inline, and renders a sandboxed `<iframe>`. Focus events
 * drain via `model.typedQueue.use`.
 *
 * Sandbox isolation matches today's HtmlView:
 *   - `allow-scripts` enables scripts inside the iframe (and the
 *     `navigationBlockerScript` appended below).
 *   - No `allow-same-origin` — iframe runs in a unique origin.
 *   - No `allow-top-navigation` — can't escape to the app shell.
 *   - No `allow-popups` — `window.open` suppressed.
 *
 * The blocker script preventDefaults click events on any anchor with `href`,
 * blocking in-frame navigation that the sandbox alone wouldn't catch.
 */

const navigationBlockerScript = `<script>document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.href){e.preventDefault();}},true);</script>`;

interface HtmlBodyProps {
    model: HtmlEditor;
}

export function HtmlBody({ model }: HtmlBodyProps) {
    const host = model.host;

    const content = host ? host.state.use((s) => s.content) : "";

    // PV8 — focus queue drain. <TextChrome>'s root-focus (TC8) puts focus
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

    // US-579 — embedded (notebook collapsed-note) context: the iframe has no
    // flex parent, so `flex: 1` collapses to 0. Give it a definite box of
    // maxEditorHeight. At page / expanded note (no maxEditorHeight) keep flex.
    const maxH = useEditorConfig().maxEditorHeight;

    return (
        <iframe
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
