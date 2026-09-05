import { app } from "../../api/app";
import { PageCollectionWrapper } from "./PageCollectionWrapper";
import type { EventChannel, EventHandler } from "../../api/events/EventChannel";
import type { IApp } from "../../api/types/app";

/**
 * Wrap an EventChannel to auto-track subscriptions in the releaseList.
 * When the script scope is disposed, all subscriptions are unsubscribed.
 */
function wrapEventChannel<TEvent extends { handled?: boolean }>(
    channel: EventChannel<TEvent>,
    releaseList: Array<() => void>,
) {
    return {
        subscribe(handler: EventHandler<TEvent>) {
            const sub = channel.subscribe(handler);
            releaseList.push(sub);
            return sub;
        },
        send(event: TEvent) {
            return channel.send(event);
        },
        sendAsync(event: TEvent) {
            return channel.sendAsync(event);
        },
    };
}

/**
 * Recursively wrap app.events namespace. Intercepts subscribe() on
 * EventChannel leaves, passes through namespace objects. The proxy returns
 * a structurally-identical shape to the input, so we type the return as T.
 */
function createEventsProxy<T extends object>(target: T, releaseList: Array<() => void>): T {
    return new Proxy(target, {
        get(obj, prop) {
            const value = (obj as Record<PropertyKey, unknown>)[prop];
            if (value && typeof value === "object") {
                // EventChannel leaf — has subscribe method
                if (typeof (value as { subscribe?: unknown }).subscribe === "function") {
                    return wrapEventChannel(value as EventChannel<{ handled?: boolean }>, releaseList);
                }
                // Namespace object — recurse
                return createEventsProxy(value as object, releaseList);
            }
            return value;
        },
    });
}

/**
 * Safe wrapper around App for script access.
 * Mirrors the IApp interface from api/types/app.d.ts — every member IApp declares must
 * have a getter here, enforced by the compile-time check at the bottom of this file.
 *
 * - Most sub-interfaces (settings, fs, ui, etc.) pass through directly —
 *   they expose only the safe public .d.ts surface.
 * - `pages` is wrapped to return PageWrapper instances.
 * - `events` is wrapped to auto-track subscriptions for cleanup.
 */
export class AppWrapper {
    private readonly _pages: PageCollectionWrapper;
    private _events: unknown;
    private readonly releaseList: Array<() => void>;

    /** @param openedByAgent true for MCP-originated contexts — browser pages they open are the agent's own. */
    constructor(releaseList: Array<() => void>, openedByAgent = false) {
        this.releaseList = releaseList;
        this._pages = new PageCollectionWrapper(app.pages, releaseList, openedByAgent);
    }

    get version() {
        return app.version;
    }

    get settings() {
        return app.settings;
    }

    get editors() {
        return app.editors;
    }

    get recent() {
        return app.recent;
    }

    get fs() {
        return app.fs;
    }

    get window() {
        return app.window;
    }

    get shell() {
        return app.shell;
    }

    get ui() {
        return app.ui;
    }

    get downloads() {
        return app.downloads;
    }

    get menuFolders() {
        return app.menuFolders;
    }

    get proc() {
        return app.proc;
    }

    get boards() {
        return app.boards;
    }

    get boardVars() {
        return app.boardVars;
    }

    get pages(): PageCollectionWrapper {
        return this._pages;
    }

    get events() {
        if (!this._events) {
            this._events = createEventsProxy(app.events, this.releaseList);
        }
        return this._events;
    }

    fetch = app.fetch;

    openRawLink = app.openRawLink;

    runAsync = async <TData, TProxy, TResult>(
        fn: (data: TData, proxy: TProxy) => Promise<TResult>,
        data: TData,
        proxyObj?: TProxy
    ): Promise<TResult> => {
        const { runAsync: workerRunAsync } = await import("../worker/WorkerRunner");
        return workerRunAsync(fn, data, proxyObj);
    };
}

/**
 * Compile-time guard: every member IApp declares must have a getter/property on AppWrapper.
 *
 * `implements IApp` is not usable here. The wrapper deliberately returns richer concrete types
 * than the script-facing interfaces — `pages` yields `PageCollectionWrapper` (whose `PageWrapper`
 * facades are structurally narrower than `IPage`'s), and `events` is an `unknown`-typed lazy
 * proxy — so a structural assertion fails on types that are intentionally mismatched.
 *
 * This checks member *names* only, which is the failure this guards against: a namespace can be
 * added to `App` and `IApp` yet silently omitted here, leaving it `undefined` for every script
 * (which is how `app.boardVars` shipped unreachable for a release). If the facade types are ever
 * reconciled with their interfaces, replace this with `implements IApp` and delete it.
 *
 * On failure tsc names the offender:
 *   Type '"boardVars"' does not satisfy the constraint 'never'.
 */
type AssertNever<T extends never> = T;
type _AppWrapperCoversIApp = AssertNever<Exclude<keyof IApp, keyof AppWrapper>>;
