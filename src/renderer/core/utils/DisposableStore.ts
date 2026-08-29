type Cleanup = () => void;

/**
 * Tracks synchronous cleanup functions and releases them as a group.
 *
 * `closeAndTake()` is exposed for owners such as `VanillaView` that need to
 * close and snapshot their disposers before running another cleanup phase. A
 * child can call a release handle belonging to its parent, so the parent's
 * list must already be closed and cleared before any child runs. This preserves
 * child-before-disposer ordering; it is not an invitation to run disposers early.
 */
export class DisposableStore {
    private disposables: Cleanup[] = [];
    private closed = false;

    add(cleanup: Cleanup): Cleanup {
        if (this.closed) {
            throw new Error("Cannot register a cleanup on a disposed DisposableStore.");
        }

        let released = false;
        const release: Cleanup = () => {
            if (released) return;
            released = true;
            const index = this.disposables.indexOf(release);
            if (index !== -1) this.disposables.splice(index, 1);
            cleanup();
        };
        this.disposables.push(release);
        return release;
    }

    dispose(): void {
        const disposables = this.closeAndTake();
        let firstError: unknown;
        let hasError = false;

        disposables.forEach((cleanup) => {
            try {
                cleanup();
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        });

        if (hasError) {
            throw firstError;
        }
    }

    closeAndTake(): Cleanup[] {
        if (this.closed) {
            return [];
        }

        this.closed = true;
        const disposables = this.disposables;
        this.disposables = [];
        return disposables;
    }
}
