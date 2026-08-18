import { useCallback, useRef } from "react";
import { MermaidOutputEntry } from "../logTypes";
import { DialogHeader } from "./DialogHeader";
import { IconButton, Panel, Text } from "../../../uikit";
import { CopyIcon, OpenLinkIcon } from "../../../theme/icons";
import { pagesModel } from "../../../api/pages";
import { renderMermaidSvg, svgToDataUrl } from "../../mermaid/render-mermaid";
import { themeState } from "../../../theme/theme-state";
import { TComponentModel, useComponentModel } from "../../../core/state/model";

// =============================================================================
// Helpers
// =============================================================================

async function copyImageToClipboard(img: HTMLImageElement) {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return;
    await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
    ]);
}

// =============================================================================
// Component
// =============================================================================

interface MermaidOutputViewProps {
    entry: MermaidOutputEntry;
}

interface MermaidOutputState {
    svgUrl: string | null;
    error: string;
}

class MermaidOutputModel extends TComponentModel<MermaidOutputState, MermaidOutputViewProps> {
    setSvgUrl = (svgUrl: string | null) => {
        this.state.update((s) => { s.svgUrl = svgUrl; });
    };

    setError = (error: string) => {
        this.state.update((s) => { s.error = error; });
    };

    init() {
        this.effect(() => {
            let cancelled = false;
            const lightMode = !themeState.get().isDark;
            queueMicrotask(() => {
                if (!this.isLive || cancelled) return;
                this.setSvgUrl(null);
                this.setError("");
                void renderMermaidSvg(this.props.entry.text, lightMode)
                    .then((svg) => {
                        if (!cancelled) {
                            this.setSvgUrl(svgToDataUrl(svg, undefined, !lightMode));
                            this.setError("");
                        }
                    })
                    .catch((e) => {
                        if (!cancelled) {
                            this.setError(e.message || "Failed to render diagram");
                            this.setSvgUrl(null);
                        }
                    });
            });
            return () => { cancelled = true; };
        }, () => [this.props.entry.text, themeState.get().isDark]);
    }
}

export function MermaidOutputView(props: MermaidOutputViewProps) {
    const { entry } = props;
    const model = useComponentModel(props, MermaidOutputModel, { svgUrl: null, error: "" });
    const { svgUrl, error } = model.state.use();
    const imgRef = useRef<HTMLImageElement>(null);

    themeState.use((s) => s.isDark);
    const handleCopy = useCallback(() => {
        if (!imgRef.current) return;
        copyImageToClipboard(imgRef.current);
    }, []);

    const handleOpenInEditor = useCallback(() => {
        const title = typeof entry.title === "string" ? entry.title : "Mermaid Diagram";
        pagesModel.addEditorPage("mermaid-view", "mermaid", title, entry.text);
    }, [entry.text, entry.title]);

    return (
        <Panel
            name="log-mermaid-output"
            direction="column"
            position="relative"
            width="100%"
            revealChildrenOnHover
        >
            <DialogHeader title={entry.title} />
            <Panel
                name="log-mermaid-content"
                paddingY="sm"
                justify="center"
                align="center"
            >
                {error ? (
                    <Panel paddingX="xl" paddingY="xl">
                        <Text size="md" color="error">{error}</Text>
                    </Panel>
                ) : !svgUrl ? (
                    <Panel paddingX="xxl" paddingY="xxl">
                        <Text size="md" color="light">Rendering...</Text>
                    </Panel>
                ) : (
                    <img
                        ref={imgRef}
                        src={svgUrl}
                        alt="Mermaid Diagram"
                        style={{ maxWidth: "100%", height: "auto" }}
                    />
                )}
            </Panel>
            <Panel
                name="log-mermaid-hover-actions"
                position="absolute"
                top={4}
                right={4}
                direction="row"
                gap="sm"
                zIndex={1}
            >
                <IconButton
                    name="log-mermaid-open-in-editor"
                    hideUntilParentHover
                    size="sm"
                    icon={<OpenLinkIcon />}
                    title="Open in Mermaid editor"
                    onClick={handleOpenInEditor}
                />
                <IconButton
                    name="log-mermaid-copy"
                    hideUntilParentHover
                    size="sm"
                    icon={<CopyIcon />}
                    title="Copy image to clipboard"
                    disabled={!svgUrl}
                    onClick={handleCopy}
                />
            </Panel>
        </Panel>
    );
}
