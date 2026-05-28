import { TComponentState } from "../../core/state/state";
import { MarkdownEditor, defaultMarkdownEditorState } from "./MarkdownEditor";
import { MarkdownBody } from "./MarkdownBody";
import { TextChrome } from "../base/TextChrome";
import { IconButton } from "../../uikit";
import { CompactViewIcon, NormalViewIcon } from "../../theme/icons";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-554 — native Markdown preview editor module. Registered with
 * the v4 `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorInstance` is a v4-native MarkdownEditor instance.
 */

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

function MarkdownEditorView({ model }: { model: EditorModel }) {
    const md = model as MarkdownEditor;
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<MarkdownToolbarBits model={md} />}
        >
            <MarkdownBody model={md} />
        </TextChrome>
    );
}

// US-579 — chrome-free Body for notebook per-note embedding.
function MarkdownEmbeddedBody({ model }: { model: EditorModel }) {
    return <MarkdownBody model={model as MarkdownEditor} />;
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
export type { MarkdownBlockProps, MarkdownBlockHandle } from "./MarkdownBlock";
