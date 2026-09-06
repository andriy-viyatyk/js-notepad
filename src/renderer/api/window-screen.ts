import type { IWindowScreen } from "./types/window";
import type {
    IBrowserElementLocator,
    IBrowserNetworkRequest,
    IBrowserScreenshot,
} from "./types/browser-editor";
import { appTarget } from "../automation/AppTargetModel";
import {
    clickElement,
    ensureTargetReady,
    evaluateInTarget,
    hoverElement,
    networkRequests,
    pressKeyOnTarget,
    resolveElementLocator,
    selectOption,
    snapshot,
    takeScreenshot,
    typeTextInto,
    waitFor,
} from "../automation/operations";
import type { WaitMode } from "../automation/operations";

interface TabOption {
    tabId?: string;
}

interface TypeOption extends TabOption {
    slowly?: boolean;
    submit?: boolean;
}

interface WaitForOption extends TabOption {
    selector?: string;
    text?: string;
    textGone?: string;
    time?: number;
    timeout?: number;
}

/** Thin Object Model adapter over the existing app-window automation target. */
export class WindowScreen implements IWindowScreen {
    async snapshot(options?: TabOption): Promise<string> {
        await ensureTargetReady(appTarget, options?.tabId);
        return snapshot(appTarget, options?.tabId, { overlayHint: true });
    }

    async click(locator: IBrowserElementLocator, options?: TabOption): Promise<void> {
        await ensureTargetReady(appTarget, options?.tabId);
        await clickElement(appTarget, resolveElementLocator(locator), options?.tabId);
    }

    async hover(locator: IBrowserElementLocator, options?: TabOption): Promise<void> {
        await ensureTargetReady(appTarget, options?.tabId);
        await hoverElement(appTarget, resolveElementLocator(locator), options?.tabId);
    }

    async type(locator: IBrowserElementLocator, text: string, options?: TypeOption): Promise<void> {
        await ensureTargetReady(appTarget, options?.tabId);
        await typeTextInto(appTarget, resolveElementLocator(locator), text, {
            tabId: options?.tabId,
            slowly: options?.slowly,
            submit: options?.submit,
        });
    }

    async select(locator: IBrowserElementLocator, values: string | string[], options?: TabOption): Promise<void> {
        await ensureTargetReady(appTarget, options?.tabId);
        await selectOption(appTarget, resolveElementLocator(locator), values, options?.tabId);
    }

    async pressKey(key: string, options?: TabOption): Promise<void> {
        await ensureTargetReady(appTarget, options?.tabId);
        await pressKeyOnTarget(appTarget, key, options?.tabId);
    }

    async evaluate(expression: string, options?: TabOption): Promise<unknown> {
        await ensureTargetReady(appTarget, options?.tabId);
        return evaluateInTarget(appTarget, expression, options?.tabId);
    }

    async waitFor(options: WaitForOption): Promise<void> {
        const modes = [options.selector, options.text, options.textGone, options.time]
            .filter(value => value !== undefined);
        if (modes.length !== 1) {
            throw new Error("Expected exactly one of 'selector', 'text', 'textGone', or 'time'.");
        }
        let mode: WaitMode;
        if (options.time !== undefined) {
            mode = { kind: "time", seconds: options.time };
        } else if (options.selector !== undefined) {
            mode = { kind: "selector", selector: options.selector };
        } else if (options.text !== undefined) {
            mode = { kind: "text", text: options.text };
        } else {
            mode = { kind: "textGone", text: options.textGone! };
        }
        await ensureTargetReady(appTarget, options.tabId);
        await waitFor(appTarget, { mode, timeout: options.timeout, tabId: options.tabId });
    }

    async screenshot(options?: TabOption): Promise<IBrowserScreenshot | undefined> {
        await ensureTargetReady(appTarget, options?.tabId);
        return takeScreenshot(appTarget, options?.tabId, { returnUndefinedIfUnavailable: true });
    }

    async networkRequests(options?: TabOption): Promise<IBrowserNetworkRequest[]> {
        await ensureTargetReady(appTarget, options?.tabId);
        return networkRequests(appTarget, options?.tabId);
    }
}
