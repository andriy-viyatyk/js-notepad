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
import { renderMermaid } from "./render-mermaid";

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
