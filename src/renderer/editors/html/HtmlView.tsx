import styled from "@emotion/styled";
import { useMemo } from "react";
import { TextFileModel } from "../text/TextPageModel";

const navigationBlockerScript = `<script>document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.href){e.preventDefault();}},true);</script>`;

// ============================================================================
// HtmlView Component - content-view for HTML files
// ============================================================================

interface HtmlViewProps {
    model: TextFileModel;
}

const HtmlViewRoot = styled.div({
    width: "100%",
    height: "100%",
    overflow: "hidden",

    "& .html-preview-iframe": {
        width: "100%",
        height: "100%",
        border: "none",
        backgroundColor: "#fff",
    },
});

/**
 * HTML Preview component that renders HTML content in a sandboxed iframe.
 * Uses srcdoc to pass content directly — no size limits, reactive to state changes.
 * Sandbox ensures isolation: no same-origin access, no popups, no storage.
 */
function HtmlView({ model }: HtmlViewProps) {
    const content = model.state.use((s) => s.content);
    const safeSrcDoc = useMemo(
        () => content + navigationBlockerScript,
        [content],
    );

    return (
        <HtmlViewRoot>
            <iframe
                className="html-preview-iframe"
                srcDoc={safeSrcDoc}
                sandbox="allow-scripts"
                title="HTML Preview"
            />
        </HtmlViewRoot>
    );
}

export { HtmlView };
export type { HtmlViewProps };
