import { errMessage } from "../../../shared/utils";
import type { ICallRequest, ICallResult } from "../../../shared/ai-vision/resolver";
import { pagesModel } from "../../api/pages";
import { LogViewEditor } from "../../editors/log-view";
import { isDialogEntry } from "../../editors/log-view/logTypes";
import { dialogsState } from "../../ui/dialogs/DialogsView";
import { getVisibleAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import { DialogsNode, type DialogAdapter } from "./dialogs";
import { MenusNode, type MenuItemInfo } from "./menus";

export const PENDING_DIALOG_GRACE_MS = 250;

export const DIALOG_FALLBACK_TEXT =
    "A blocking dialog is open, but the dialogs node is not available yet; use window.screen.snapshot() and window.screen.click(...) to inspect and answer it.";

interface PendingSignal {
    pending: true;
}

interface DialogWatcher {
    readonly pending: Promise<PendingSignal>;
    dispose(): void;
}

/** Watch only for dialogs that were opened by the action being resolved. */
function watchForPendingDialog(): DialogWatcher {
    const initialDialogs = dialogsState.get();
    let candidate = initialDialogs[0] as typeof initialDialogs[number] | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolvePending: ((signal: PendingSignal) => void) | undefined;
    const pending = new Promise<PendingSignal>((resolve) => {
        resolvePending = resolve;
    });

    const clearCandidate = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        candidate = undefined;
    };

    const inspect = () => {
        const current = dialogsState.get();
        const currentCandidate = current.find((dialog) => !initialDialogs.includes(dialog));
        if (!currentCandidate) {
            clearCandidate();
            return;
        }
        if (candidate !== currentCandidate) {
            if (timer !== undefined) clearTimeout(timer);
            candidate = currentCandidate;
            timer = undefined;
        }
        if (timer !== undefined) return;

        // The grace filters dialogs that open and close immediately before reporting a pending call.
        timer = setTimeout(() => {
            timer = undefined;
            if (candidate && dialogsState.get().includes(candidate)) {
                resolvePending?.({ pending: true });
            }
        }, PENDING_DIALOG_GRACE_MS);
    };

    const unsubscribe = dialogsState.subscribe(inspect);
    return {
        pending,
        dispose: () => {
            unsubscribe();
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
            resolvePending = undefined;
        },
    };
}

/** Resolve an MCP call while observing renderer UI that may block the action. */
export async function resolveWithAttention(
    request: ICallRequest,
    resolve: () => Promise<ICallResult>,
): Promise<ICallResult> {
    const watcher = watchForPendingDialog();
    try {
        const original = resolve();
        // A pending response returns before the action's promise settles; prevent a later rejection
        // from becoming unhandled while the original action remains alive in the renderer.
        void original.catch((): undefined => undefined);
        const raced = await Promise.race([original, watcher.pending]);
        if ("pending" in raced && raced.pending === true) {
            return {
                path: request.path,
                pending: true,
                attention: collectAttention() ?? { text: DIALOG_FALLBACK_TEXT },
            };
        }
        return withAttention(raced);
    } finally {
        watcher.dispose();
    }
}

function withAttention(result: ICallResult): ICallResult {
    const attention = collectAttention();
    return attention ? { ...result, attention } : result;
}

/** Collect a JSON-safe snapshot of blocking dialogs and the visible application popup. */
export function collectAttention(): { text: string } | undefined {
    try {
        const dialogsNode = new DialogsNode();
        const menusNode = new MenusNode();
        const sections = dialogsState.get().map((_, index) => formatDialog(dialogsNode, index));
        const popup = getVisibleAppPopupMenu();
        if (popup) sections.push(formatPopup(menusNode));
        sections.push(...collectLogViewAttention());
        return sections.length ? { text: sections.join("\n\n") } : undefined;
    } catch (error) {
        return { text: `Attention is required, but the visible UI could not be inspected: ${errMessage(error, "unknown inspection error")}.` };
    }
}

/** Scan parsed Log View model state; inline dialogs are not entries in dialogsState. */
function collectLogViewAttention(): string[] {
    const sections: string[] = [];
    for (const page of pagesModel.pages) {
        const editor = page.mainEditorInstance;
        if (!(editor instanceof LogViewEditor) || !editor.hasUnresolvedDialogs()) continue;
        for (const entry of editor.getEntriesSnapshot()) {
            if (!isDialogEntry(entry) || entry.button !== undefined) continue;
            sections.push([
                `An inline Log View dialog is unanswered on page ${JSON.stringify(page.title)} (id ${JSON.stringify(page.id)}): dialog ${JSON.stringify(entry.id)} of type ${JSON.stringify(entry.type)}.`,
                `Wait for the user in the Log View page, then read pages.logView.dialogResult(${JSON.stringify(entry.id)}). The agent cannot answer this dialog.`,
            ].join(" "));
        }
    }
    return sections;
}

function formatDialog(dialogsNode: DialogsNode, index: number): string {
    try {
        const adapter = dialogsNode.index(index);
        if (!adapter) return DIALOG_FALLBACK_TEXT;
        return formatResolvedDialog(adapter, index);
    } catch (error) {
        return `${DIALOG_FALLBACK_TEXT} (${errMessage(error, "dialog descriptor unavailable")})`;
    }
}

function formatResolvedDialog(adapter: DialogAdapter, index: number): string {
    const title = adapter.title ? ` \"${adapter.title}\"` : "";
    const message = adapter.message ? `: ${adapter.message}` : ".";
    const actions = adapter.buttons.map((button) =>
        `dialogs[${index}].click(${JSON.stringify(button)})`,
    );
    actions.push(`dialogs[${index}].cancel()`);
    return [
        `Attention: dialog${title} is open${message}`,
        `Buttons: ${adapter.buttons.join(", ") || "(none)"}`,
        // Ordering is deliberate: this line sits ABOVE "Resolve it with", because a QA run
        // (Haiku, call-only) acted on the first actionable line it read and answered an Unsaved
        // Changes prompt with "Don't Save" on a bare "close the page" instruction — discarding
        // the user's work. The dialog layer cannot know which button is destructive, so the
        // caution has to be unconditional and has to come first.
        "This is the app asking the USER a question, and only one of these buttons may be what"
        + " they want. If they did not say which, do NOT choose one that discards work or data —"
        + " report the question and its options and let them decide.",
        `Resolve it with ${actions.join(" or ")}.`,
    ].join("\n");
}

function formatPopup(menusNode: MenusNode): string {
    try {
        const adapter = menusNode.index(0);
        if (!adapter) return "Attention: a popup menu is open, but its menu node is no longer available.";
        const items = adapter.items;
        const labels = items.map((item) => `${item.label}${item.enabled ? "" : " (disabled)"}`);
        const actions = items
            .filter((item): item is MenuItemInfo & { hasSubmenu: false } => !item.hasSubmenu && item.enabled)
            .map((item) => `menus[0].click(${JSON.stringify(item.label)})`);
        actions.push("menus[0].close()");
        return [
            "Attention: a popup menu is open.",
            `Items: ${labels.length ? labels.join(", ") : "(none)"}`,
            `Resolve it with ${actions.join(" or ")}.`,
        ].join("\n");
    } catch (error) {
        return `Attention: a popup menu is open, but its items could not be inspected: ${errMessage(error, "unknown menu inspection error")}.`;
    }
}
