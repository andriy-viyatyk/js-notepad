import { TComponentState, useOptionalState } from "../../core/state/state";
import { MarkdownEditor, defaultMarkdownEditorState } from "./MarkdownEditor";
import { MarkdownBody } from "./MarkdownBody";
import { TextChrome } from "../base/TextChrome";
import { Button, IconButton } from "../../uikit";
import { ArrowLeftIcon, CompactViewIcon, NormalViewIcon } from "../../theme/icons";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function MarkdownToolbarBits({ model }: { model: MarkdownEditor }) {
    const compactMode = model.state.use((s) => s.compactMode);
    return (
        <IconButton
            name="markdown-compact-toggle"
            size="sm"
            active={compactMode}
            title={compactMode ? "Normal View" : "Compact View"}
            icon={compactMode ? <NormalViewIcon /> : <CompactViewIcon />}
            onClick={model.toggleCompact}
        />
    );
}

function MarkdownBackButton({ model }: { model: MarkdownEditor }) {
    // US-784 — show a Back button while the page has Markdown back-history.
    // `navBackCount` lives on the page (survives the editor swaps each in-page
    // navigation creates); read it optionally so a page-less editor is safe.
    const navBackCount = useOptionalState(model.page?.state, (s) => s.navBackCount, 0);
    if (navBackCount <= 0) return null;
    return (
        <Button
            name="markdown-back"
            variant="ghost"
            size="sm"
            title="Back"
            icon={<ArrowLeftIcon />}
            onClick={() => void model.navigateBack()}
        >
            Back
        </Button>
    );
}

function MarkdownEditorView({ model }: { model: EditorModel }) {
    const md = model as MarkdownEditor;
    return (
        <TextChrome
            model={model}
            toolbarContributions={<MarkdownBackButton model={md} />}
            rightToolbarContributions={<MarkdownToolbarBits model={md} />}
        >
            <MarkdownBody model={md} />
        </TextChrome>
    );
}

function MarkdownEmbeddedBody({ model, editorConfig }: { model: EditorModel; editorConfig?: import("../base/EditorConfig").EditorConfig }) {
    return <MarkdownBody model={model as MarkdownEditor} editorConfig={editorConfig} />;
}

export const markdownModule: EditorModule = {
    createEditor: () =>
        new MarkdownEditor(new TComponentState({ ...defaultMarkdownEditorState })),
    Component: MarkdownEditorView,
    Body: MarkdownEmbeddedBody,
};

export { MarkdownEditor, defaultMarkdownEditorState };
export type { MarkdownEditorState, MarkdownQueueEvent } from "./MarkdownEditor";
// Re-exports preserved for the three sites that still consume MarkdownBlock
// (mcp-inspector/McpInspectorView, mcp-inspector/ResourceContentView,
// log-view/items/MarkdownOutputView).
export { MarkdownBlock } from "./MarkdownBlock";
export type { MarkdownBlockProps } from "./MarkdownBlock";
