export type Event<T> = (listener: (event: T) => void) => () => void;

interface EmitterRegistration<T> {
    listener: (event: T) => void;
    active: boolean;
}

export class Emitter<T> {
    private registrations: EmitterRegistration<T>[] = [];

    readonly event: Event<T> = (listener) => {
        const registration: EmitterRegistration<T> = { listener, active: true };
        this.registrations.push(registration);
        return () => {
            if (!registration.active) return;
            registration.active = false;
            const index = this.registrations.indexOf(registration);
            if (index >= 0) this.registrations.splice(index, 1);
        };
    };

    fire(event: T): void {
        for (const registration of [...this.registrations]) {
            if (!registration.active) continue;
            try {
                registration.listener(event);
            } catch (error) {
                setTimeout(() => { throw error; }, 0);
            }
        }
    }
}

export class Subscription<D = undefined> {
    private readonly emitter = new Emitter<D>();

    send = (data: D): void => {
        this.emitter.fire((data === undefined ? null : data) as D);
    };

    subscribe = (callback: (event: D) => void): (() => void) => this.emitter.event(callback);
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
