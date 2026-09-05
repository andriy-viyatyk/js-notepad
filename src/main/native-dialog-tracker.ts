import { BrowserWindow } from "electron";

export type NativeDialogKind = "file" | "folder" | "messageBox";

interface NativeDialogState {
    activeKinds: Map<NativeDialogKind, number>;
}

const activeDialogs = new WeakMap<BrowserWindow, NativeDialogState>();

function beginNativeDialog(
    browserWindow: BrowserWindow | undefined,
    kind: NativeDialogKind,
): () => void {
    if (!browserWindow) return () => undefined;

    let state = activeDialogs.get(browserWindow);
    if (!state) {
        state = { activeKinds: new Map() };
        activeDialogs.set(browserWindow, state);
        browserWindow.once("closed", () => {
            activeDialogs.delete(browserWindow);
        });
    }

    state.activeKinds.set(kind, (state.activeKinds.get(kind) ?? 0) + 1);
    let ended = false;
    return () => {
        if (ended) return;
        ended = true;

        const currentState = activeDialogs.get(browserWindow);
        if (!currentState) return;
        const count = currentState.activeKinds.get(kind) ?? 0;
        if (count <= 1) {
            currentState.activeKinds.delete(kind);
        } else {
            currentState.activeKinds.set(kind, count - 1);
        }
        if (currentState.activeKinds.size === 0) activeDialogs.delete(browserWindow);
    };
}

export async function withNativeDialog<T>(
    browserWindow: BrowserWindow | undefined,
    kind: NativeDialogKind,
    operation: () => Promise<T>,
): Promise<T> {
    const end = beginNativeDialog(browserWindow, kind);
    try {
        return await operation();
    } finally {
        end();
    }
}

export function withNativeDialogSync<T>(
    browserWindow: BrowserWindow | undefined,
    kind: NativeDialogKind,
    operation: () => T,
): T {
    const end = beginNativeDialog(browserWindow, kind);
    try {
        return operation();
    } finally {
        end();
    }
}

function attentionText(kind: NativeDialogKind, windowIndex: number | undefined, multipleWindows: boolean): string {
    const dialogName = kind === "messageBox" ? "message box" : "file dialog";
    const windowDescription = multipleWindows && windowIndex !== undefined
        ? ` in window ${windowIndex}`
        : "";
    return `Attention: a native ${dialogName} is open${windowDescription}; only the user can answer it — it cannot be answered by an agent.`;
}

export function getNativeDialogAttention(
    browserWindow: BrowserWindow | undefined,
    windowIndex?: number,
    multipleWindows = false,
): { text: string } | undefined {
    if (!browserWindow) return undefined;
    const state = activeDialogs.get(browserWindow);
    const activeKind = state?.activeKinds.keys().next().value as NativeDialogKind | undefined;
    if (!activeKind) return undefined;
    return { text: attentionText(activeKind, windowIndex, multipleWindows) };
}
