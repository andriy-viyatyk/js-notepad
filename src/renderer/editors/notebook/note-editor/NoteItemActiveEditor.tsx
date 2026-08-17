import { ComponentType, useEffect, useState } from "react";
import { NoteItemEditModel } from "./NoteItemEditModel";
import { MiniTextEditor } from "./MiniTextEditor";
import { editorRegistry } from "../../base/editorRegistry";
import { CONTENT_HOST_TRAIT } from "../../base/editor-traits";
import type { EditorModel } from "../../base/EditorModel";
import { EditorView } from "../../../../shared/types";
import type { EditorConfig } from "../../base/EditorConfig";


interface NoteItemActiveEditorProps {
    model: NoteItemEditModel;
    editorConfig?: EditorConfig;
}

/**
 * Renders the active editor for a note item.
 *  - `monaco` → `MiniTextEditor` (note-specific content-sized Monaco; IPM6 A1).
 *  - any language-gated editor (grid-json / grid-csv / grid-jsonl / md-view /
 *    svg-view / html-view / mermaid-view) → an embedded `EditorModel`
 *    wrapping this `NoteItemEditModel` as its content host, rendered chrome-free
 *    via the module's `Body` slot.
 *
 * Extension-gated editors (Todo / Link / RestClient / Graph / Draw / Log /
 * Notebook) never reach here — the toolbar's `getSwitchOptions(language,
 * undefined)` only offers language-gated editors.
 */
export function NoteItemActiveEditor({ model, editorConfig = {} }: NoteItemActiveEditorProps) {
    const { editor } = model.state.use((s) => ({ editor: s.editor }));

    if (!editor || editor === "monaco") {
        return <MiniTextEditor model={model} editorConfig={editorConfig} />;
    }

    // `key={editor}` remounts on view switch — old editor disposes (host
    // detached) in cleanup, new editor adopts the same host fresh.
    return <EmbeddedNoteEditor host={model} editorId={editor} editorConfig={editorConfig} key={editor} />;
}

// Minimal structural type for the host-adopting editors. Each subclass
// declares `adoptHost(host: TextFileModel)`; the base does not, and the note
// host is a TextFileModel-duck-type (passed structurally).
type AdoptingEditor = EditorModel & { adoptHost(host: unknown): void };

/** Detach the note host from the editor (so `editor.dispose()` won't dispose
 *  the host — the note view owns the host lifecycle), then dispose the editor. */
function detachAndDispose(editor: EditorModel): void {
    try {
        editor.traits.get(CONTENT_HOST_TRAIT)?.extractContentHost();
    } catch {
        // Already extracted (or never adopted) — ignore.
    }
    void editor.dispose();
}

interface EmbeddedNoteEditorProps {
    host: NoteItemEditModel;
    editorId: EditorView;
    editorConfig: EditorConfig;
}

function EmbeddedNoteEditor({ host, editorId, editorConfig }: EmbeddedNoteEditorProps) {
    const [entry, setEntry] = useState<{
        editor: EditorModel;
        Body: ComponentType<{ model: EditorModel; editorConfig?: EditorConfig }>;
    } | null>(null);

    useEffect(() => {
        let alive = true;
        let created: EditorModel | null = null;
        (async () => {
            const module = await editorRegistry.getModule(editorId);
            if (!module.Body) {
                throw new Error(`Editor "${editorId}" is not embeddable (no Body slot)`);
            }
            const editor = module.createEditor();
            // Inject the note host, then realize. `restore()` skips host
            // construction (host already set) and host.restore() (the note
            // host's state.restored is true), running only adopt + initial
            // content parse.
            (editor as AdoptingEditor).adoptHost(host);
            await editor.restore();
            created = editor;
            if (alive) {
                setEntry({ editor, Body: module.Body });
            } else {
                detachAndDispose(editor);
            }
        })();
        return () => {
            alive = false;
            setEntry(null);
            if (created) detachAndDispose(created);
        };
    }, [editorId, host]);

    if (!entry) return null;
    const { editor, Body } = entry;
    return <Body model={editor} editorConfig={editorConfig} />;
}
