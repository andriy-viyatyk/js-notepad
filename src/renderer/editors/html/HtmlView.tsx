import styled from "@emotion/styled";
import { TextFileModel } from "../text/TextPageModel";

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

    return (
        <HtmlViewRoot>
            <iframe
                className="html-preview-iframe"
                srcDoc={content}
                sandbox="allow-scripts"
                title="HTML Preview"
            />
        </HtmlViewRoot>
    );
}

export { HtmlView };
export type { HtmlViewProps };
