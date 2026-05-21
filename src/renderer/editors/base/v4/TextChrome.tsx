import { ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import type React from "react";
import type { EditorModel } from "./EditorModel";
import type { IContentHost } from "./IContentHost";
import type { TextFileModel } from "../../text/TextEditorModel";
import { PageToolbar } from "./PageToolbar";
import { LegacyEditorAdapter } from "./LegacyEditorAdapter";
import { EditorToolbar } from "../EditorToolbar";
import { Panel } from "../../../uikit/Panel/Panel";
import { Spacer } from "../../../uikit/Spacer/Spacer";
import { Divider } from "../../../uikit/Divider/Divider";
import { IconButton } from "../../../uikit/IconButton/IconButton";
import { Button } from "../../../uikit/Button/Button";
import { CompareIcon, RunAllIcon, RunIcon, WebScraperIcon } from "../../../theme/icons";
import { pagesModel } from "../../../api/pages";
import { ui } from "../../../api/ui";
import { isScriptLanguage } from "../../../scripting/transpile";
import { ScriptPanel } from "../../text/ScriptPanel";
import color from "../../../theme/color";

/**
 * Host-aware chrome wrapper for text-bearing editors (EPIC-028 / US-549 /
 * walkthrough 10).
 *
 * For US-549 only the `TextFileModel` branch is exercised — adapter-wrapped
 * text editors render the full chrome (top `<PageToolbar>` with Compare /
 * Run / Show-resources, body slot, ScriptPanel, footer row, overlay div).
 * The `NoteItemEditModel` branch activates during US-557 (Notebook
 * migration); per-note chrome stays in `NoteItemToolbar.tsx` until then.
 *
 * Owns focus subscription (200ms refocus on page activation) and
 * onKeyDown delegation to `host.handleKeyDown`. Replaces the
 * `TextEditorView` + `TextToolbar` + `TextFooter` triad — those files are
 * deleted by this task.
 */

interface TextChromeProps {
    model: EditorModel;
    children: ReactNode;
    /** Editor-specific toolbar buttons. Render inside `<PageToolbar>` between
     *  text-host buttons (Compare/Run) and the auto-inserted spacer. */
    toolbarContributions?: ReactNode;
    /** Right-side toolbar contributions. Forwarded to `<PageToolbar>` so they
     *  render AFTER the auto-spacer and BEFORE the switch widget — useful for
     *  controls that should sit on the right of the row (e.g. Grid's search
     *  input). */
    rightToolbarContributions?: ReactNode;
    /** Editor-specific footer status. Render in the footer row before the
     *  encoding label. Ignored in the NoteItemEditModel branch. */
    footerContributions?: ReactNode;
}

export function TextChrome({
    model,
    children,
    toolbarContributions,
    rightToolbarContributions,
    footerContributions,
}: TextChromeProps) {
    const host = model.contentHost as IContentHost | null;
    const rootRef = useRef<HTMLDivElement>(null);

    // TC8 — focus management: refocus root when this page becomes active.
    useEffect(() => {
        const subscription = pagesModel.onFocus.subscribe((pageModel) => {
            if (pageModel !== model.page) return;
            setTimeout(() => {
                const root = rootRef.current;
                if (root && !root.contains(document.activeElement)) root.focus();
                // US-551 / MO7 — let the inner editor view grab focus. Base
                // EditorModel.focus is a no-op; MonacoEditor overrides to
                // `queue.send({type:"focus"})` so MonacoBody.focus() fires.
                model.focus();
            }, 200);
        });
        return () => subscription.unsubscribe();
    }, [model]);

    if (!host) {
        // Defensive — caller should only mount <TextChrome> when there's a host.
        return <>{children}</>;
    }

    // For US-549 only the TextFileModel branch lights up. NoteItemEditModel
    // arrives with US-557. Use a duck-type check ("script" + state.encoding
    // present) so we don't need a static import of the legacy TextFileModel
    // class — that import chain bloats this module.
    const isTextFile = isTextFileHost(host);
    const textHost = isTextFile ? (host as unknown as TextFileModel) : null;

    const handleRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // US-551 / MO6 — F5 routes to model.runScript when the script panel
        // is closed AND the editor exposes a `runScript` method (MonacoEditor).
        // Otherwise fall through to host.handleKeyDown (legacy path — handles
        // F5, Ctrl+S, Ctrl+Shift+S, Ctrl+Shift+F).
        if (e.code === "F5" && !textHost?.script.state.get().open) {
            const runner = (model as unknown as { runScript?: (all?: boolean) => Promise<void> }).runScript;
            if (typeof runner === "function") {
                e.preventDefault();
                void runner.call(model);
                return;
            }
        }
        host.handleKeyDown?.(e);
    };

    return (
        <Panel
            name="text-chrome-root"
            ref={rootRef}
            direction="column"
            flex={1}
            height={0}
            position="relative"
            gap="xs"
            tabIndex={0}
            onKeyDown={handleRootKeyDown}
        >
            <PageToolbar
                name="text-chrome-top"
                model={model}
                borderBottom
                rightContributions={rightToolbarContributions}
            >
                {textHost && <CompareButton model={model} />}
                {textHost && <RunButtons model={model} host={textHost} />}
                {toolbarContributions}
                <ToolbarPortalSlots model={model} host={textHost} />
                {textHost && <ShowResourcesButton host={textHost} />}
            </PageToolbar>
            {children}
            {textHost?.script && <ScriptPanel model={textHost} />}
            {textHost && (
                <EditorToolbar name="text-chrome-footer" borderTop>
                    <ScriptToggleButton host={textHost} />
                    <Spacer />
                    <FooterContributionSlot
                        host={textHost}
                        model={model}
                        contributions={footerContributions}
                    />
                    <Divider orientation="vertical" />
                    <EncodingLabel host={textHost} />
                </EditorToolbar>
            )}
            {textHost && (
                <div
                    ref={(node) => textHost.setEditorOverlayRef(node)}
                    className="editor-overlay"
                />
            )}
        </Panel>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────

function CompareButton({ model }: { model: EditorModel }) {
    const ownerPage = model.page;
    if (!ownerPage) return null;
    // Subscribe to layout state so the button (dis)appears as grouping changes.
    pagesModel.state.use((s) => ({
        leftRight: s.leftRight,
        rightLeft: s.rightLeft,
    }));
    const leftGroupedPage = pagesModel.getLeftGroupedPage(ownerPage.id);
    if (!leftGroupedPage) return null;
    if (!pagesModel.canCompare(leftGroupedPage.id, ownerPage.id)) return null;
    return (
        <IconButton
            name="text-compare-left"
            size="sm"
            title="Compare with Left Page"
            icon={<CompareIcon />}
            onClick={() => pagesModel.enterCompareMode(ownerPage.id)}
        />
    );
}

function RunButtons({ model, host }: { model: EditorModel; host: TextFileModel }) {
    const language = host.state.use((s) => s.language);
    if (!isScriptLanguage(language)) return null;
    const hasSelection = model.hasTextSelection?.() ?? false;
    // US-551 / MO6 — when the editor exposes a queue-backed `runScript`
    // (MonacoEditor), use it so selection is materialized through the
    // ComponentQueue. Otherwise fall back to host.runScript (legacy path —
    // selection-aware via TextViewModel.getSelectedText).
    const editorRunner = (model as unknown as { runScript?: (all?: boolean) => Promise<void> }).runScript;
    const runScript = (all?: boolean) =>
        typeof editorRunner === "function"
            ? editorRunner.call(model, all)
            : host.runScript(all);
    return (
        <>
            <IconButton
                name="text-run-script"
                size="sm"
                title={hasSelection ? "Run Selected Script (F5)" : "Run Script (F5)"}
                icon={<RunIcon />}
                onClick={() => void runScript()}
            />
            {hasSelection && (
                <IconButton
                    name="text-run-all-script"
                    size="sm"
                    title="Run All Script"
                    icon={<RunAllIcon />}
                    onClick={() => void runScript(true)}
                />
            )}
        </>
    );
}

function ShowResourcesButton({ host }: { host: TextFileModel }) {
    const language = host.state.use((s) => s.language);
    if (language !== "html") return null;
    return (
        <IconButton
            name="text-show-resources"
            size="sm"
            title="Show Resources"
            icon={<WebScraperIcon />}
            onClick={() => void showHtmlResources(host)}
        />
    );
}

function ScriptToggleButton({ host }: { host: TextFileModel }) {
    if (!host.script) return null;
    const open = host.script.state.use((s) => s.open);
    return (
        <Button
            name="text-toggle-script"
            variant="ghost"
            size="sm"
            onClick={host.script.toggleOpen}
        >
            <span style={{ color: open ? color.text.default : color.text.light, fontSize: 13 }}>
                script
            </span>
        </Button>
    );
}

function EncodingLabel({ host }: { host: TextFileModel }) {
    const encoding = host.state.use((s) => s.encoding);
    return (
        <span style={{ color: color.text.light, padding: "0 4px", fontSize: 13 }}>
            {encoding || "utf-8"}
        </span>
    );
}

/**
 * Renders the two portal-target divs (`editorToolbarRefFirst` /
 * `editorToolbarRefLast`) only when an alternative (non-Monaco) editor is
 * active. Wires callback refs that forward the DOM node to the host's
 * `setEditorToolbarRefFirst` / `setEditorToolbarRefLast` setters so existing
 * `createPortal(...)` consumers in the 10 portaling editor views (Grid,
 * Markdown, Mermaid, SVG, Todo, Link, LogView, Draw, Graph, Notebook)
 * continue to work unchanged. Per-editor migrations US-551+ rewrite each
 * consumer to inline composition; US-559 deletes the refs entirely.
 */
function ToolbarPortalSlots({ model, host }: { model: EditorModel; host: TextFileModel | null }) {
    // US-552 / G8 — v4-native editors (MonacoEditor, GridEditor, …) compose
    // their toolbar contributions inline; skip the portal slots so the DOM
    // doesn't carry empty placeholder divs.
    const isLegacy = model instanceof LegacyEditorAdapter;
    // Subscribe so the slots mount when the user switches editor.
    const editor = useSyncExternalStore<string | undefined>(
        host ? (cb) => host.state.subscribe(cb) : () => () => undefined,
        host ? () => host.state.get().editor : () => undefined,
    );
    if (!isLegacy) return null;
    if (!host) return null;
    if (!editor || editor === "monaco") return null;
    return (
        <>
            <div
                ref={(node) => host.setEditorToolbarRefFirst(node)}
                style={portalSlotStyle}
            />
            <div
                ref={(node) => host.setEditorToolbarRefLast(node)}
                style={portalSlotStyle}
            />
        </>
    );
}

function FooterContributionSlot({
    host,
    model,
    contributions,
}: {
    host: TextFileModel;
    model: EditorModel;
    contributions: ReactNode;
}) {
    // Mirror today's TextFooter behavior: render the editor-portal slot only
    // when an alternative (non-Monaco) editor is active. The leading Divider
    // is hidden via the global CSS rule `[data-type="divider"]:has(+
    // .footer-portal-target:empty)` when the portal target is empty, so the
    // legacy "no visible double divider" behavior survives.
    // US-552 / G8 — only legacy adapter pages still need the portal-target
    // div; v4-native editors compose `footerContributions` inline.
    const isLegacy = model instanceof LegacyEditorAdapter;
    const editor = useSyncExternalStore<string | undefined>(
        (cb) => host.state.subscribe(cb),
        () => host.state.get().editor,
    );
    const alternative = isLegacy && editor && editor !== "monaco";
    if (!alternative && !contributions) return null;
    return (
        <>
            {contributions}
            {alternative && (
                <>
                    <Divider orientation="vertical" />
                    <div
                        ref={(node) => host.setFooterRefLast(node)}
                        className="footer-portal-target"
                        style={portalSlotStyle}
                    />
                </>
            )}
        </>
    );
}

const portalSlotStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
};

// ── Helpers ────────────────────────────────────────────────────────────

function isTextFileHost(host: IContentHost): boolean {
    // TextFileModel exposes `script`, `setEditorToolbarRefFirst`, etc. — duck
    // type against the latter to avoid a static import. NoteItemEditModel
    // (US-557) will lack `setEditorToolbarRefFirst` on the host (its toolbar
    // refs live elsewhere), so the discriminator survives the second branch.
    return typeof (host as unknown as { setEditorToolbarRefFirst?: unknown }).setEditorToolbarRefFirst === "function";
}

async function showHtmlResources(host: TextFileModel) {
    const { extractHtmlResources } = await import("../../../core/utils/html-resources");
    const { content, filePath, title } = host.state.get();
    const baseUrl = filePath
        ? "file:///" + filePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "/")
        : undefined;
    const links = extractHtmlResources(content, { baseUrl });
    if (links.length === 0) {
        ui.notify("No resources found in this HTML.", "info");
        return;
    }
    pagesModel.openLinks(links, (title || "HTML") + " — Resources");
}

