/**
 * One registration. `active` is what makes a listener retired *during* a dispatch skippable: every
 * dispatch walks a snapshot, so removal alone cannot stop an already-running pass from reaching a
 * listener that has since been disposed.
 *
 * The bug that forced this, found when switching editors: `attach` bumps `page.state.version`, an
 * earlier subscriber rebuilt the toolbar and disposed the old `NavPanelButtonView`, and that view's
 * own subscription then ran anyway — reaching `own()`/`ownSubscription()`, which throw when a
 * resource is registered on a disposed view.
 *
 * Do not "simplify" dispatch to iterate the live array, and do not drop the `active` check on the
 * assumption that removal is enough. See `TOneState.stateChanged` in `./state.ts`.
 */
interface ListenerRegistration<TListener> {
    readonly listener: TListener;
    active: boolean;
}

interface AsyncDispatchOptions {
    reverse?: boolean;
    afterInvocation?: () => boolean;
}

/**
 * The one listener-registration core behind `TOneState`, `Emitter`, and `EventChannel`.
 *
 * It owns registration identity, the `active` lifetime flag, snapshot traversal, idempotent
 * disposal, and per-listener error isolation. It deliberately owns **no** dispatch policy: ordering,
 * event freezing, short-circuit rules, and error escalation stay with each surface, because the
 * three differ on all four.
 */
export class ListenerList<TListener> {
    private registrations: ListenerRegistration<TListener>[] = [];

    add(listener: TListener): () => void {
        const registration: ListenerRegistration<TListener> = { listener, active: true };
        this.registrations.push(registration);

        return () => {
            if (!registration.active) return;
            registration.active = false;
            const index = this.registrations.indexOf(registration);
            if (index >= 0) this.registrations.splice(index, 1);
        };
    }

    /** One listener's failure must not cancel the rest — errors go to `onError`, dispatch continues. */
    dispatchSync(invoke: (listener: TListener) => void, onError: (error: unknown) => void): void {
        for (const registration of [...this.registrations]) {
            if (!registration.active) continue;
            try {
                invoke(registration.listener);
            } catch (error) {
                onError(error);
            }
        }
    }

    /**
     * Sequential dispatch that awaits each thenable result. The `active` re-check inside the loop is
     * load-bearing: because this awaits between listeners, the unsubscribe window is asynchronous and
     * arbitrarily wide, so a listener disposed while an earlier one awaits must still be skipped.
     */
    async dispatchAsync(
        invoke: (listener: TListener) => void | Promise<void>,
        onError: (error: unknown) => void,
        options?: AsyncDispatchOptions,
    ): Promise<void> {
        const snapshot = [...this.registrations];
        if (options?.reverse) snapshot.reverse();

        for (const registration of snapshot) {
            if (!registration.active) continue;
            try {
                const result = invoke(registration.listener);
                if (result && typeof result.then === "function") {
                    await result;
                }
            } catch (error) {
                onError(error);
            }
            if (options?.afterInvocation?.()) return;
        }
    }

    get size(): number {
        return this.registrations.length;
    }

    /** Deactivates before clearing, so a dispatch already walking a snapshot skips these too. */
    dispose(): void {
        for (const registration of this.registrations) {
            registration.active = false;
        }
        this.registrations = [];
    }
}
