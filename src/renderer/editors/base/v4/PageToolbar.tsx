import { ReactNode } from "react";
import type { EditorModel } from "./EditorModel";
import { EditorToolbar } from "../EditorToolbar";
import { IconButton } from "../../../uikit/IconButton/IconButton";
import { SegmentedControl, type ISegment } from "../../../uikit/SegmentedControl/SegmentedControl";
import { Spacer } from "../../../uikit/Spacer/Spacer";
import { NavPanelIcon } from "../../../theme/icons";
import { editorRegistry as legacyRegistry } from "../../registry";
import type { EditorView } from "../../../../shared/types";
import { LegacyEditorAdapter } from "./LegacyEditorAdapter";

/**
 * Page-level toolbar host (EPIC-028 / US-549 / walkthrough 09).
 *
 * Wraps the styled `EditorToolbar` row container with two auto-rendered
 * page-level affordances:
 *
 *   - NavPanel button (left of children) — when `editor.getNavigatorTarget()`
 *     returns non-null AND the page agrees the navigator can open.
 *   - Switch widget (right, after `<Spacer />`) — when
 *     `editor.findCompatibleEditors().length >= 2` AND the current editor is
 *     in the list.
 *
 * Editor-specific contributions sit as children between the two slots.
 */
interface PageToolbarProps {
    name?: string;
    model: EditorModel;
    children?: ReactNode;
    /** Contributions rendered AFTER the auto-inserted spacer and BEFORE the
     *  switch widget. Useful for editors whose action buttons sit on the
     *  right side of the row (e.g. ImageViewer's Save / Copy / Draw). */
    rightContributions?: ReactNode;
    /** Suppress the auto-inserted `<Spacer />`. For editors whose children
     *  should fill the row (e.g. Video's flex URL/cURL textarea — US-571 /
     *  VD-IMPL4). Default false — the spacer pushes `rightContributions` + the
     *  switch widget to the right edge. */
    noSpacer?: boolean;
    borderTop?: boolean;
    borderBottom?: boolean;
}

export function PageToolbar({ name, model, children, rightContributions, noSpacer, borderTop, borderBottom }: PageToolbarProps) {
    return (
        <EditorToolbar name={name} borderTop={borderTop} borderBottom={borderBottom}>
            <NavPanelButton model={model} />
            {children}
            {!noSpacer && <Spacer />}
            {rightContributions}
            <SwitchWidget model={model} />
        </EditorToolbar>
    );
}

function NavPanelButton({ model }: { model: EditorModel }) {
    const target = model.getNavigatorTarget();
    if (target === null) return null;
    // Empty target `{}` — always render (Archive / Category: panel already attached).
    // Non-empty target — gate on page.canOpenNavigator(pipe, filePath).
    const empty = target.pipe === undefined && target.filePath === undefined;
    if (!empty && !model.page?.canOpenNavigator(target.pipe, target.filePath)) return null;
    return (
        <IconButton
            name="page-nav-panel"
            size="sm"
            title="File Explorer"
            icon={<NavPanelIcon />}
            onClick={() => model.page?.toggleNavigator(target.pipe, target.filePath)}
        />
    );
}

function SwitchWidget({ model }: { model: EditorModel }) {
    // Subscribe to state so the widget re-renders when language/filePath
    // changes alter the legacy registry's switch options. For adapter-wrapped
    // editors `findCompatibleEditors()` reads the legacy state.
    model.state.use((s) => ({
        language: (s as { language?: string }).language,
        filePath: (s as { filePath?: string }).filePath,
        editor: (s as { editor?: string }).editor,
    }));
    const options = model.findCompatibleEditors();
    if (options.length < 2 || !options.includes(model.editorId)) return null;
    const items: ISegment[] = options.map((id) => ({
        value: id,
        label: legacyRegistry.getById(id as EditorView)?.name ?? id,
    }));
    return (
        <SegmentedControl
            name="page-editor-switch"
            items={items}
            value={model.editorId}
            onChange={(v) => onSwitch(model, v)}
            size="sm"
        />
    );
}

function onSwitch(model: EditorModel, newEditorId: string) {
    // EPIC-028 / US-551 switch routing:
    //   - legacy adapter → monaco (native v4): page.switchMainEditor creates
    //     a MonacoEditor and extracts the legacy TextFileModel as its host.
    //   - legacy adapter → other content-view (still legacy): keep today's
    //     host-preserving in-place `legacy.changeEditor(view)` path — no
    //     editor swap, just `state.editor` mutation.
    //   - v4-native (MonacoEditor) → any target: always route through
    //     page.switchMainEditor. The bare-adapter factory in
    //     register-editors.ts wraps the extracted host in a LegacyEditorAdapter
    //     when the target is still a legacy content-view.
    if (model instanceof LegacyEditorAdapter) {
        if (newEditorId === "monaco") {
            void model.page?.switchMainEditor(newEditorId);
            return;
        }
        const legacy = model.legacy as unknown as { changeEditor?: (v: string) => void };
        legacy.changeEditor?.(newEditorId);
        return;
    }
    void model.page?.switchMainEditor(newEditorId);
}
