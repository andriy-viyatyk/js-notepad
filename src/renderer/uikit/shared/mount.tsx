import React, { useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { VanillaView } from "./vanilla-view";

export type VanillaViewCtor<P> = new (props: P) => VanillaView<P>;

interface VanillaHostProps<P> {
    ctor: VanillaViewCtor<P>;
    props: P;
}

/**
 * React host for a vanilla view.
 *
 * This component must remain at module scope. Defining it inside mountVanilla
 * would create a new component type for every call and make React replace the
 * vanilla view on every parent render.
 */
function VanillaHost<P>({ ctor, props }: VanillaHostProps<P>): React.ReactElement {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<VanillaView<P> | undefined>(undefined);
    const propsRef = useRef(props);
    const mountedOnThisCommitRef = useRef(false);
    propsRef.current = props;

    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) {
            throw new Error("VanillaHost could not find its host element.");
        }

        const view = new ctor(propsRef.current);
        viewRef.current = view;
        host.append(view.root);

        try {
            view.mount();
            mountedOnThisCommitRef.current = true;
        } catch (mountError) {
            try {
                view.dispose();
            } catch {
                // Preserve the mount error as the first failure.
            } finally {
                view.root.remove();
                if (viewRef.current === view) {
                    viewRef.current = undefined;
                }
            }

            throw mountError;
        }

        return () => {
            if (viewRef.current !== view) {
                return;
            }

            let firstError: unknown;
            let hasError = false;
            try {
                view.dispose();
            } catch (error) {
                hasError = true;
                firstError = error;
            } finally {
                view.root.remove();
                viewRef.current = undefined;
            }

            if (hasError) {
                throw firstError;
            }
        };
    }, [ctor]);

    useLayoutEffect(() => {
        if (mountedOnThisCommitRef.current) {
            mountedOnThisCommitRef.current = false;
            return;
        }

        viewRef.current?.update(props);
    }, [ctor, props]);

    return <div ref={hostRef} />;
}

/**
 * Host a vanilla view in a React tree.
 *
 * Concrete views must declare a public constructor, even when that constructor
 * only forwards props to VanillaView's protected constructor.
 */
export function mountVanilla<P>(
    ctor: VanillaViewCtor<P>,
    props: P,
): React.ReactElement {
    return React.createElement(
        VanillaHost as React.ComponentType<VanillaHostProps<P>>,
        { ctor, props },
    );
}

/**
 * Mount a React subtree in a host owned by a vanilla view.
 *
 * The caller owns the host element. This function only owns the React root and
 * therefore never removes or otherwise changes the host itself.
 */
export function mountReact(
    host: HTMLElement,
    element: React.ReactElement,
): () => void {
    const root = createRoot(host);
    root.render(element);

    let disposed = false;
    return () => {
        if (disposed) {
            return;
        }

        disposed = true;
        root.unmount();
    };
}
