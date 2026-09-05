import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const USER_INTERFACE_MEMBERS: readonly IAiMember[] = [
    { name: "confirm", kind: "method", signature: "confirm(message: string, options?: IConfirmOptions)", summary: "Show a confirmation dialog and wait for the user's choice.", caution: "blocks on user input" },
    { name: "input", kind: "method", signature: "input(message: string, options?: IInputOptions)", summary: "Show an input dialog and wait for the user's response.", caution: "blocks on user input" },
    { name: "password", kind: "method", signature: "password(options?: IPasswordOptions)", summary: "Show a password dialog.", caution: "blocks on user input and handles secret text" },
    { name: "notify", kind: "method", signature: "notify(message: string, type?: NotificationType)", summary: "Show a toast notification.", caution: "visibly interrupts the user and may wait for a click" },
    { name: "textDialog", kind: "method", signature: "textDialog(options: ITextDialogOptions)", summary: "Show a Monaco text dialog.", caution: "visibly opens a dialog and waits for the user" },
    { name: "showProgress", kind: "method", signature: "showProgress<T>(promise: Promise<T>, label?: string)", summary: "Show a progress overlay while a promise is pending.", caution: "changes the visible UI" },
    { name: "createProgress", kind: "method", signature: "createProgress(label?: string)", summary: "Create a progress handle whose show method displays an overlay.", caution: "can create visible progress UI" },
    { name: "notifyProgress", kind: "method", signature: "notifyProgress(label: string, timeout?: number)", summary: "Show a centered auto-dismissing notification.", caution: "changes the visible UI" },
    { name: "addScreenLock", kind: "method", signature: "addScreenLock()", summary: "Lock the screen with a blocking overlay until released.", caution: "blocks user interaction" },
    { name: "highlightElement", kind: "method", signature: "highlightElement(selector: string, text?: string, options?: IHighlightOptions)", summary: "Draw an explanatory highlight in the app window.", caution: "changes the visible UI and waits for dismissal" },
    { name: "clearHighlights", kind: "method", signature: "clearHighlights(id?: string)", summary: "Remove one or all highlights.", caution: "changes the visible UI" },
];

export function describeUserInterface(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "UserInterface",
        summary: "Dialogs, notifications, progress overlays, screen locks, and app-window highlights.",
        members: USER_INTERFACE_MEMBERS,
        help: "Use UI methods only when the requested interaction or visible feedback is intended for the user.",
        summarize: () => ({ kind: "UserInterface" }),
    };
}
