import { ReactNode } from "react";
import type { EditorModel } from "./EditorModel";
import { EditorToolbar } from "./EditorToolbar";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { SegmentedControl, type ISegment } from "../../uikit/SegmentedControl/SegmentedControl";
import { Spacer } from "../../uikit/Spacer/Spacer";
import { NavPanelIcon } from "../../theme/icons";
import { editorRegistry } from "./editorRegistry";

interface PageToolbarProps {
    name?: string;
    model: EditorModel;
    children?: ReactNode;
    /** Contributions rendered AFTER the auto-inserted spacer and BEFORE the
     *  switch widget. Useful for editors whose action buttons sit on the
     *  right side of the row (e.g. ImageViewer's Save / Copy / Draw). */
    rightContributions?: ReactNode;
    /** Suppress the auto-inserted `<Spacer />`. For editors whose children
     *  should fill the row (e.g. Video's flex URL/cURL textarea — /
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
    // Sidebar is mandatory-open (a Link/Archive/etc. panel is present) — the
    // toggle would be a no-op, so don't render it.
    if (model.page?.sidebarMandatory) return null;
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
        label: editorRegistry.getById(id)?.name ?? id,
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
    void model.page?.switchMainEditor?.(newEditorId);
}
