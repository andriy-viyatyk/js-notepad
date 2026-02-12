import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BaseImageView } from "../image";
import type { BaseImageViewRef } from "../image";
import { TextFileModel } from "../text/TextPageModel";
import { Button } from "../../components/basic/Button";
import { CopyIcon, SunIcon, MoonIcon } from "../../theme/icons";
import { CircularProgress } from "../../components/basic/CircularProgress";
import { EditorError } from "../base/EditorError";
import color from "../../theme/color";

// ============================================================================
// Styled Components
// ============================================================================

const MermaidViewRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    overflow: "hidden",
    position: "relative",
    "& .mermaid-loading": {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "1 1 auto",
        backgroundColor: color.background.default,
    },
    "& .mermaid-loading-overlay": {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        zIndex: 1,
    },
});

// ============================================================================
// Mermaid rendering (dynamic import)
// ============================================================================

let renderCounter = 0;

/** Convert raw SVG string to a data URL, optionally injecting a background rect */
function svgToDataUrl(svg: string, backgroundColor?: string): string {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (backgroundColor) {
        const bg = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("width", "100%");
        bg.setAttribute("height", "100%");
        bg.setAttribute("fill", backgroundColor);
        root.insertBefore(bg, root.firstChild);
    }
    return `data:image/svg+xml,${encodeURIComponent(
        new XMLSerializer().serializeToString(doc)
    )}`;
}

async function renderMermaid(
    content: string,
    lightMode: boolean
): Promise<string> {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({
        startOnLoad: false,
        theme: lightMode ? "default" : "neutral",
        securityLevel: "loose",
    });

    const id = `mermaid-render-${++renderCounter}`;
    const { svg } = await mermaid.render(id, content);
    return svgToDataUrl(svg, lightMode ? "white" : undefined);
}

// ============================================================================
// MermaidView Component - content-view for Mermaid diagrams
// ============================================================================

interface MermaidViewProps {
    model: TextFileModel;
}

function MermaidView({ model }: MermaidViewProps) {
    const content = model.state.use((s) => s.content);
    const imageRef = useRef<BaseImageViewRef>(null);
    const [svgUrl, setSvgUrl] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [lightMode, setLightMode] = useState(false);

    useEffect(() => {
        setLoading(true);
        const timeoutId = setTimeout(() => {
            renderMermaid(content, lightMode)
                .then((url) => {
                    setSvgUrl(url);
                    setError("");
                })
                .catch((e) => {
                    setError(e.message || "Failed to render diagram");
                })
                .finally(() => {
                    setLoading(false);
                });
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [content, lightMode]);

    return (
        <MermaidViewRoot>
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <>
                        <Button
                            type="icon"
                            size="small"
                            title={lightMode ? "Switch to Dark Theme" : "Switch to Light Theme"}
                            onClick={() => setLightMode((v) => !v)}
                        >
                            {lightMode ? <MoonIcon /> : <SunIcon />}
                        </Button>
                        <Button
                            type="icon"
                            size="small"
                            title="Copy Image to Clipboard (Ctrl+C)"
                            onClick={() => imageRef.current?.copyToClipboard()}
                            disabled={!svgUrl}
                        >
                            <CopyIcon />
                        </Button>
                    </>,
                    model.editorToolbarRefLast!
                )}
            {error && <EditorError>{error}</EditorError>}
            {loading && svgUrl && (
                <div className="mermaid-loading-overlay">
                    <CircularProgress />
                </div>
            )}
            {loading && !svgUrl ? (
                <div className="mermaid-loading">
                    <CircularProgress />
                </div>
            ) : svgUrl ? (
                <BaseImageView
                    ref={imageRef}
                    src={svgUrl}
                    alt="Mermaid Diagram"
                />
            ) : null}
        </MermaidViewRoot>
    );
}

export { MermaidView };
export type { MermaidViewProps };
