import { claimViewOwnership, type IOwnedView } from "./vanilla-view";

interface ActiveBranch<K extends PropertyKey> {
    key: K;
    view: IOwnedView;
}

/** Owns one conditional view root inside a dedicated DOM container. */
export class SubtreeSwap<K extends PropertyKey> {
    private active: ActiveBranch<K> | undefined;
    private disposed = false;

    constructor(private readonly parent: Node) {}

    set(key: K | null, create: (key: K) => IOwnedView): void {
        if (this.disposed) {
            return;
        }

        if (key === null) {
            this.clear();
            return;
        }

        if (this.active?.key === key) {
            return;
        }

        const view = create(key);
        if (view.root.parentNode !== null) {
            throw new Error("SubtreeSwap factory must return a detached view root.");
        }
        claimViewOwnership(view);

        const previous = this.active;
        if (previous) {
            this.parent.insertBefore(view.root, previous.view.root);
        } else {
            this.parent.appendChild(view.root);
        }
        this.active = { key, view };

        if (previous) {
            this.disposeBranch(previous);
        }
    }

    clear(): void {
        if (this.disposed || !this.active) {
            return;
        }

        const previous = this.active;
        this.active = undefined;
        this.disposeBranch(previous);
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        const previous = this.active;
        this.active = undefined;
        if (previous) {
            this.disposeBranch(previous);
        }
    }

    private disposeBranch(branch: ActiveBranch<K>): void {
        let firstError: unknown;
        let hasError = false;
        try {
            branch.view.dispose();
        } catch (error) {
            hasError = true;
            firstError = error;
        } finally {
            // SubtreeSwap owns the managed root's DOM attachment; VanillaView
            // releases behavior, while its container removes the root afterward.
            branch.view.root.parentNode?.removeChild(branch.view.root);
        }

        if (hasError) {
            throw firstError;
        }
    }
}
