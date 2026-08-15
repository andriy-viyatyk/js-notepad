import type { PagesModel } from "./PagesModel";
import type { PageModel } from "./PageModel";
import type { EditorModel, EditorOrHost } from "../../editors/base";
import type { EditorView } from "../../../shared/types";
import type { ILinkData } from "../../../shared/link-data";
import type { ILinkDiffRevision } from "../types/io.link-data";
import type { IContentPipe } from "../types/io.pipe";
import { newTextFileModel, TextFileModel } from "../../editors/text";
import { editorRegistry } from "../../editors/base/editorRegistry";
import { getLanguageByExtension } from "../../core/utils/language-mapping";
import { isFocusInSidebar } from "../../core/utils/focus-utils";
import { fpBasename, fpExtname } from "../../core/utils/file-path";
import { fs as appFs } from "../fs";
import { ui } from "../ui";
import { errMessage } from "../../../shared/utils";

// ============================================================================
// PageNavigator — navigate an existing page to a new file.
//
// The single entry point `navigatePageTo` runs these named steps in order:
//   1. confirmLeaveCurrentEditor  — "save changes?" unless the editor survives
//   2. reuseNavigationTarget      — per-page singleton promotion (Git Tree)
//   3. reuseEditorForFile         — same-file editor lingering as a panel
//   4. buildEditor                — fresh build with missing-file/error fallbacks
//   5. applyEditorSelection       — preview editor vs explicit host target
//   6. attach + post-attach       — diff revisions, fragment, reveal/highlight
//   7. finishNavigation           — show/focus-unless-sidebar/save (shared exit)
// ============================================================================

export interface NavigatePageToOptions {
    revealLine?: number;
    highlightText?: string;
    fragment?: string;
    forceTextEditor?: boolean;
    sourceLink?: ILinkData;
    pipe?: IContentPipe;
    target?: string;
    title?: string;
    diffFrom?: ILinkDiffRevision;
    diffTo?: ILinkDiffRevision;
}

/** Shared exit for every successful navigation path: repaint, focus (unless
 *  the user is working in a sidebar panel — e.g. the Explorer tree, US-808),
 *  persist. */
function finishNavigation(model: PagesModel, page: PageModel): void {
    model.onShow.send(page);
    if (!isFocusInSidebar()) model.onFocus.send(page);
    model.persistence.saveState();
}

/** Skip the "save changes?" prompt when the current main editor will survive
 *  this navigation (demote to a sidebar panel) rather than be released —
 *  nothing is being discarded. A Link editor navigating to one of its own
 *  links, or any modified Link editor, stays on the page (US-718). The prompt
 *  still fires on a genuine close (separate path).
 *  The survives check reads `mainEditorInstance` (the EditorModel subclass
 *  that carries the override); `confirmRelease` is intentionally called on
 *  the unwrapped host so it routes to the host's save dialog for text-bearing
 *  editors, matching the pre-existing pattern. */
async function confirmLeaveCurrentEditor(
    page: PageModel,
    options?: NavigatePageToOptions,
): Promise<boolean> {
    const oldEditor = page.mainEditor;
    const survives =
        page.mainEditorInstance?.survivesNavigation(options?.sourceLink) ?? false;
    if (oldEditor && !survives) {
        const released = await oldEditor.confirmRelease();
        if (!released) return false;
    }
    return true;
}

/** US-617: a Pattern B editor that survives navigation (Git Tree) is a
 *  per-page singleton. If the page already holds an instance representing
 *  this target, promote it back to main and refresh — never build a
 *  duplicate. Duplicates would accumulate as redundant surviving secondary
 *  panels (the panel "x" would then need one click per stale instance). */
async function reuseNavigationTarget(
    model: PagesModel,
    page: PageModel,
    newFilePath: string,
    options?: NavigatePageToOptions,
): Promise<boolean> {
    const navTarget = options?.target;
    if (!navTarget) return false;
    const existing = page.editors.find(
        (e) => e.matchesNavigationTarget?.(navTarget, newFilePath),
    );
    if (!existing) return false;
    if (page.mainEditorInstance !== existing) {
        await page.setMainEditor(existing);
    }
    existing.onNavigationReuse?.();
    if (options?.fragment) existing.revealFragment?.(options.fragment);
    finishNavigation(model, page);
    return true;
}

/** Reuse an editor already on this page that represents the same file,
 *  rather than building a duplicate. A modified editor that survived an
 *  earlier navigation (e.g. a Link editor with unsaved edits) lingers as
 *  a sidebar panel; re-selecting its file in the Explorer should restore
 *  that very instance — with its edits and panels — instead of spawning a
 *  second one alongside it. An explicit content-host target must still
 *  match the existing editor's type, so "open in a different view" of an
 *  already-open file is never hijacked. */
async function reuseEditorForFile(
    model: PagesModel,
    page: PageModel,
    newFilePath: string,
    options?: NavigatePageToOptions,
): Promise<boolean> {
    const navTarget = options?.target;
    const existingForFile = page.findEditorByFilePath(newFilePath);
    if (
        !existingForFile ||
        existingForFile === page.mainEditorInstance ||
        (navTarget && existingForFile.editorId !== navTarget)
    ) {
        return false;
    }
    options?.pipe?.dispose();
    await page.setMainEditor(existingForFile);
    existingForFile.onNavigationReuse?.();
    if (options?.fragment) existingForFile.revealFragment?.(options.fragment);
    finishNavigation(model, page);
    return true;
}

/** Build the new editor, falling back to an empty text page on a missing
 *  file or a build failure (with a toast either way). */
async function buildEditor(
    model: PagesModel,
    newFilePath: string,
    options?: NavigatePageToOptions,
): Promise<EditorOrHost> {
    const isVirtualPath =
        newFilePath.includes("://") || newFilePath.startsWith("data:");
    if (!isVirtualPath && !(await appFs.exists(newFilePath))) {
        ui.notify(`File not found: ${fpBasename(newFilePath)}`, "error");
        const legacy = newTextFileModel("");
        legacy.state.update((s) => {
            s.title = fpBasename(newFilePath);
        });
        await legacy.restore();
        return legacy;
    }
    try {
        return await model.lifecycle.createEditorFromFile(
            newFilePath,
            options?.pipe,
            options?.target,
            options?.title,
        );
    } catch (err) {
        ui.notify(
            `Failed to open ${fpBasename(newFilePath)}: ${errMessage(err)}`,
            "error",
        );
        const legacy = newTextFileModel("");
        await legacy.restore();
        return legacy;
    }
}

/** Choose the editor a fresh text-host build opens in: an explicit,
 *  non-default content-host target (e.g. "file-diff", which is never the
 *  natural default for a file) must win over the language preview editor.
 *  Normal opens carry target === resolveId, so they fall through to the
 *  preview editor exactly as before (EPIC-031 / US-616). */
function applyEditorSelection(
    legacy: EditorOrHost,
    newFilePath: string,
    options?: NavigatePageToOptions,
): void {
    const ext = fpExtname(newFilePath).toLowerCase();
    const lang = getLanguageByExtension(ext);
    const languageId = lang?.id || "plaintext";
    const explicitTarget = options?.target;
    const isExplicitHostTarget =
        !!explicitTarget &&
        explicitTarget !== editorRegistry.resolveId(newFilePath) &&
        !!editorRegistry.getById(explicitTarget)?.hasContentHost;
    if (isExplicitHostTarget) {
        legacy.state.update((s) => {
            s.editor = explicitTarget as EditorView;
        });
    } else {
        const previewEditor = editorRegistry.getPreviewEditor(
            languageId,
            newFilePath,
        );
        if (previewEditor) {
            legacy.state.update((s) => {
                s.editor = previewEditor as EditorView;
            });
        }
    }
}

export async function navigatePageTo(
    model: PagesModel,
    pageId: string,
    newFilePath: string,
    options?: NavigatePageToOptions,
): Promise<boolean> {
    const page = model.query.findPage(pageId);
    if (!page) return false;

    if (!(await confirmLeaveCurrentEditor(page, options))) return false;

    if (await reuseNavigationTarget(model, page, newFilePath, options)) {
        return true;
    }
    if (await reuseEditorForFile(model, page, newFilePath, options)) {
        return true;
    }

    // Build legacy editor (with adapter wrap deferred until after the
    // post-restore mutations that need the underlying TextFileModel API).
    const legacy = await buildEditor(model, newFilePath, options);

    if (options?.sourceLink || options?.title) {
        legacy.state.update((s) => {
            if (options.sourceLink) s.sourceLink = options.sourceLink;
            if (options.title) s.title = options.title;
        });
    }

    const isTextFile = legacy.state.get().type === "textFile";
    const skipPreview = !!(
        options?.forceTextEditor ||
        options?.revealLine ||
        options?.highlightText
    );
    if (isTextFile && !skipPreview) {
        applyEditorSelection(legacy, newFilePath, options);
    }

    // Dynamic import mirrors PageModel's usage — attachEditorToPage lives in
    // PagesLifecycleModel, which statically imports this module.
    const { attachEditorToPage } = await import("./PagesLifecycleModel");
    const adapter = attachEditorToPage(legacy);
    await page.setMainEditor(adapter);

    // Apply caller-chosen diff revisions to the freshly-built File Diff editor
    // (no-op for any other editor type / when no revisions given). The
    // reuseNavigationTarget path returned earlier, so this only ever runs on
    // a fresh build (US-637).
    (adapter as EditorModel as {
        applyDiffRevisions?: (f?: ILinkDiffRevision, t?: ILinkDiffRevision) => void;
    }).applyDiffRevisions?.(options?.diffFrom, options?.diffTo);

    // Anchor target from the opening link. Deliberately NOT part of skipPreview
    // above: revealLine / highlightText force the Monaco text editor, while a
    // fragment must keep the language preview editor (e.g. md-view) (US-901).
    if (options?.fragment) adapter.revealFragment?.(options.fragment);

    // revealLine / highlightText apply after the editor has mounted.
    if (isTextFile && skipPreview) {
        const tfm = legacy as unknown as TextFileModel;
        if (options?.revealLine) {
            tfm.revealLine(options.revealLine);
        }
        if (options?.highlightText) {
            tfm.setHighlightText(options.highlightText);
        }
    }

    finishNavigation(model, page);
    return true;
}
