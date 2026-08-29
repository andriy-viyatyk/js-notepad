import type { Subscription } from "../core/state/events";
import type { IDisposable, IEvent } from "./types/common";

/**
 * Collects multiple disposables and disposes them all at once.
 * Use in interface implementations to track subscriptions and resources.
 *
 * @example
 * const disposables = new DisposableCollection();
 * disposables.add(event.subscribe(handler));
 * disposables.add(new FileWatcher(path));
 * // Later: disposables.dispose(); — cleans up everything
 */
export class DisposableCollection implements IDisposable {
    private items: IDisposable[] = [];

    /** Track a disposable. Returns it for inline use. */
    add<T extends IDisposable>(disposable: T): T {
        this.items.push(disposable);
        return disposable;
    }

    /** Dispose all tracked items and clear the list. */
    dispose(): void {
        for (const item of this.items) {
            item.dispose();
        }
        this.items = [];
    }
}

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
