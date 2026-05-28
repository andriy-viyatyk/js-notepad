import { ReactNode, useEffect, useRef } from "react";
import type React from "react";
import type { EditorModel } from "./EditorModel";
import type { IContentHost } from "./IContentHost";
import type { TextFileModel } from "../text/TextEditorModel";
import { PageToolbar } from "./PageToolbar";
import { EditorToolbar } from "./EditorToolbar";
import { Panel } from "../../uikit/Panel/Panel";
import { Spacer } from "../../uikit/Spacer/Spacer";
import { Divider } from "../../uikit/Divider/Divider";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { Button } from "../../uikit/Button/Button";
import { CompareIcon, RunAllIcon, RunIcon, WebScraperIcon } from "../../theme/icons";
import { pagesModel } from "../../api/pages";
import { ui } from "../../api/ui";
import { isScriptLanguage } from "../../scripting/transpile";
import { ScriptPanel } from "../text/ScriptPanel";
import color from "../../theme/color";

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
                model.focus();
            }, 200);
        });
        return () => subscription.unsubscribe();
    }, [model]);

    if (!host) {
        // Defensive — caller should only mount <TextChrome> when there's a host.
        return <>{children}</>;
    }

    const isTextFile = isTextFileHost(host);
    const textHost = isTextFile ? (host as unknown as TextFileModel) : null;

    const handleRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
                rightContributions={
                    <>
                        {textHost && <ShowResourcesButton host={textHost} />}
                        {rightToolbarContributions}
                    </>
                }
            >
                {textHost && <CompareButton model={model} />}
                {textHost && <RunButtons model={model} host={textHost} />}
                {toolbarContributions}
            </PageToolbar>
            {children}
            {textHost?.script && <ScriptPanel model={textHost} />}
            {textHost && (
                <EditorToolbar name="text-chrome-footer" borderTop>
                    <ScriptToggleButton host={textHost} />
                    <Spacer />
                    {footerContributions}
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

// ── Helpers ────────────────────────────────────────────────────────────

function isTextFileHost(host: IContentHost): boolean {
    return typeof (host as unknown as { setEditorToolbarRefFirst?: unknown }).setEditorToolbarRefFirst === "function";
}

async function showHtmlResources(host: TextFileModel) {
    const { extractHtmlResources } = await import("../../core/utils/html-resources");
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

