import { errMessage } from "../../../shared/utils";
import type { ICallRequest, ICallResult } from "../../../shared/ai-vision/resolver";
import { dialogsState } from "../../ui/dialogs/DialogsView";
import { getVisibleAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import type { MenuItem } from "../../core/events/context-menu";
import { DialogsNode, type DialogAdapter } from "./dialogs";

export const PENDING_DIALOG_GRACE_MS = 250;

export const DIALOG_FALLBACK_TEXT =
    "A blocking dialog is open, but the dialogs node is not available yet; use browser_snapshot/browser_click on pageId \"app\" to inspect and answer it.";

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
        const sections = dialogsState.get().map((_, index) => formatDialog(dialogsNode, index));
        const popup = getVisibleAppPopupMenu();
        if (popup) sections.push(formatPopup(popup.model.state.get().items));
        return sections.length ? { text: sections.join("\n\n") } : undefined;
    } catch (error) {
        return { text: `Attention is required, but the visible UI could not be inspected: ${errMessage(error, "unknown inspection error")}.` };
    }
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
        `Resolve it with ${actions.join(" or ")}.`,
    ].join("\n");
}

function formatPopup(items: readonly MenuItem[]): string {
    const labels = flattenVisibleLabels(items);
    return `A popup menu is open with items: ${labels.length ? labels.join(", ") : "(none)"}. The menus node coming in US-1299; use browser_snapshot/browser_click on pageId "app" to inspect or choose an item.`;
}

function flattenVisibleLabels(items: readonly MenuItem[], prefix = ""): string[] {
    const labels: string[] = [];
    for (const item of items) {
        if (item.invisible) continue;
        const label = prefix ? `${prefix} > ${item.label}` : item.label;
        labels.push(label);
        if (item.items) labels.push(...flattenVisibleLabels(item.items, label));
    }
    return labels;
}
