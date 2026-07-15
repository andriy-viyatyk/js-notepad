import { ReactNode } from "react";
import type { EditorModel } from "./EditorModel";
import { EditorToolbar } from "./EditorToolbar";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { SegmentedControl, type ISegment } from "../../uikit/SegmentedControl/SegmentedControl";
import { Spacer } from "../../uikit/Spacer/Spacer";
import { NavPanelIcon } from "../../theme/icons";
import { editorRegistry } from "./editorRegistry";
import { customEditorRegistry } from "../board/custom-editor-registry";
import { isPlainLocalPath } from "../../core/utils/file-path";

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

export function SwitchWidget({ model }: { model: EditorModel }) {
    // Subscribe to state so the widget re-renders when language/filePath
    // changes alter the legacy registry's switch options. For adapter-wrapped
    // editors `findCompatibleEditors()` reads the legacy state.
    model.state.use((s) => ({
        language: (s as { language?: string }).language,
        filePath: (s as { filePath?: string }).filePath,
        editor: (s as { editor?: string }).editor,
    }));
    // Re-render when async git detection lands on the shared host (EPIC-030):
    // `gitRepo` lives on host state, not the editor's own state. Inert until the
    // File Diff editor (US-613) registers a host-aware `accepts`.
    model.contentHost?.state.use((s) => (s as { gitRepo?: unknown }).gitRepo);
    const options = model.findCompatibleEditors();
    // Append trusted file-associated boards for the current file (EPIC-042 — the single
    // merge point for the switch; the 16 text editors delegate here via the widget rather
    // than each appending). Reactive so a trust / mask change updates the widget live.
    const filePath = (model.contentHost as { filePath?: string } | null)?.filePath ?? model.filePath;
    const local = !!filePath && isPlainLocalPath(filePath);
    // Simple boards need a local file; content-host boards also handle https/archive (CH4).
    const boardMatchesAll = customEditorRegistry.useBoardsForFile(filePath ?? "");
    const boardMatches = local
        ? boardMatchesAll
        : boardMatchesAll.filter((b) => b.editorKind === "content-host");
    const merged = [...options];
    for (const b of boardMatches) if (!merged.includes(b.editorId)) merged.push(b.editorId);
    if (merged.length < 2 || !merged.includes(model.editorId)) return null;
    const boardNameById = new Map(boardMatches.map((b) => [b.editorId, b.name]));
    const items: ISegment[] = merged.map((id) => ({
        value: id,
        label: boardNameById.get(id) ?? editorRegistry.getById(id)?.name ?? id,
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
