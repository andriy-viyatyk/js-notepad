import { ListenerList } from "../../core/state/listener-list";

export type EventHandler<TEvent> = (event: TEvent) => void | Promise<void>;

export interface EventChannelOptions {
    /** Optional name for debugging/error messages. */
    name?: string;
    /** Optional error handler. Called when a subscriber throws. Defaults to console.error. */
    onError?: (error: unknown, channelName: string) => void;
}

/**
 * A typed event channel that supports both fire-and-forget and async pipeline patterns.
 *
 * - `send(event)` — sync, freezes the event, all subscribers run in FIFO order (observe-only)
 * - `sendAsync(event)` — async pipeline, subscribers run in LIFO order (newest first),
 *   subscribers can modify the event, short-circuits on `event.handled === true`
 * - `subscribe(handler)` — register a handler (sync or async)
 */
export class EventChannel<TEvent extends { handled?: boolean }> {
    private readonly listeners = new ListenerList<EventHandler<TEvent>>();
    private readonly channelName: string;
    private readonly errorHandler: (error: unknown, channelName: string) => void;

    constructor(options?: EventChannelOptions) {
        this.channelName = options?.name ?? "EventChannel";
        this.errorHandler = options?.onError ?? ((error, name) => {
            console.error(`[${name}] Subscriber error:`, error);
        });
    }

    /** Whether any handlers are registered. */
    get hasSubscribers(): boolean {
        return this.listeners.size > 0;
    }

    /**
     * Register a handler. Accepts sync or async functions.
     * Returns a disposer to remove the handler.
     */
    subscribe = (handler: EventHandler<TEvent>): (() => void) => {
        return this.listeners.add(handler);
    };

    dispose(): void {
        this.listeners.dispose();
    }

    /**
     * Fire-and-forget: freezes the event and calls all subscribers in FIFO order.
     * Subscribers cannot modify the event. Errors are caught and logged.
     */
    send = (event: TEvent): void => {
        const frozen = Object.freeze(event);
        this.listeners.dispatchSync(
            (handler) => { handler(frozen); },
            (error) => { this.errorHandler(error, this.channelName); },
        );
    };

    /**
     * Async pipeline: calls subscribers in LIFO order (newest first), awaiting async handlers.
     * Subscribers can modify the event. Short-circuits if `event.handled` becomes true.
     *
     * @returns `true` if completed normally, `false` if cancelled (future).
     */
    sendAsync = async (event: TEvent): Promise<boolean> => {
        await this.listeners.dispatchAsync(
            (handler) => handler(event),
            (error) => { this.errorHandler(error, this.channelName); },
            { reverse: true, afterInvocation: () => event.handled === true },
        );
        return true;
    };
}
