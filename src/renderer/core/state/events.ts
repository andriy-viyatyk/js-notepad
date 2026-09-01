import { ListenerList } from "./listener-list";

export type Event<T> = (listener: (event: T) => void) => () => void;

export class Emitter<T> {
    private readonly listeners = new ListenerList<(event: T) => void>();

    readonly event: Event<T> = (listener) => this.listeners.add(listener);

    fire(event: T): void {
        this.listeners.dispatchSync(
            (listener) => { listener(event); },
            (error) => { setTimeout(() => { throw error; }, 0); },
        );
    }

    dispose(): void {
        this.listeners.dispose();
    }
}

export class Subscription<D = undefined> {
    private readonly emitter = new Emitter<D>();

    send = (data: D): void => {
        this.emitter.fire((data === undefined ? null : data) as D);
    };

    subscribe = (callback: (event: D) => void): (() => void) => this.emitter.event(callback);

    dispose(): void {
        this.emitter.dispose();
    }
}

/** Global keyboard event broadcast. Sent from MainPage's window keydown listener. */
export const globalKeyDown = new Subscription<KeyboardEvent>();

export interface BrowserUrlEvent {
    url: string;
    /** Set to `true` by the first handler that processes this URL. */
    handled?: boolean;
}

/** Fired by browser editor on every URL change (navigation, redirect). */
export const browserUrlChanged = new Subscription<BrowserUrlEvent>();

/** Fired when the renderer window is about to close. Subscribers should release resources. */
export const windowClosing = new Subscription<void>();

export interface SecondaryViewsEvent {
    pageId: string;
    isOpen: boolean;
}

/** Fired when any SecondaryViews sidebar opens or closes. */
export const secondaryViewsToggled = new Subscription<SecondaryViewsEvent>();

export interface PanelExpandedEvent {
    pageId: string;
    panelId: string;
}

/** Fired when a secondary view panel is expanded in SecondaryViews. */
export const panelExpanded = new Subscription<PanelExpandedEvent>();
