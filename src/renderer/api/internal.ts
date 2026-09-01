import type { Subscription } from "../core/state/events";
import type { IEvent } from "./types/common";

/**
 * Adapts an existing Subscription<T> to the IEvent<T> interface.
 * The returned IEvent.subscribe() exposes the underlying disposer.
 */
export function wrapSubscription<T>(subscription: Subscription<T>): IEvent<T> {
    return {
        subscribe(handler: (data: T) => void): () => void {
            return subscription.subscribe(handler);
        },
    };
}
