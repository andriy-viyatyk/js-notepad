import React from "react";
import { mountReactHandle, MountedReactRoot } from "./mount";

/** A temporary subtree slot used while a component still has React callers. */
export type SlotContent = string | Node | React.ReactNode;

interface ActiveReactSlot {
    kind: "react";
    /**
     * Layout-transparent element that owns the React root. The root is never
     * mounted on the host itself: `root.unmount()` clears its container, and a
     * deferred unmount would then wipe whatever the next `fillSlot` call wrote.
     * Detaching this element first makes that impossible.
     */
    container: HTMLElement;
    handle: MountedReactRoot;
    generation: number;
}

interface ActiveNodeSlot {
    kind: "node";
    generation: number;
}

interface ActiveTextSlot {
    kind: "text";
    generation: number;
}

interface ActiveEmptySlot {
    kind: "empty";
    generation: number;
}

type ActiveSlot = ActiveReactSlot | ActiveNodeSlot | ActiveTextSlot | ActiveEmptySlot;

const activeSlots = new WeakMap<HTMLElement, ActiveSlot>();

function isReactEmpty(slot: SlotContent): boolean {
    return slot == null || slot === false;
}

/** True when the slot needs a React root rather than a plain DOM write. */
function needsReactRoot(slot: SlotContent): slot is Exclude<SlotContent, string | Node> {
    return !isReactEmpty(slot) && typeof slot !== "string" && !(slot instanceof Node);
}

function asReactElement(slot: React.ReactNode): React.ReactElement {
    return React.createElement(React.Fragment, null, slot);
}

/**
 * `display: contents` keeps the wrapper out of layout, so React-rendered
 * children remain flex/grid items of the host exactly as they were before the
 * wrapper existed (Button's `gap` between icon and label depends on this).
 */
function createReactContainer(): HTMLElement {
    const container = document.createElement("span");
    container.dataset.part = "react-slot";
    container.style.display = "contents";
    return container;
}

/**
 * Detach the React container immediately and unmount after the current commit.
 * React's later deletions target the detached container, which still parents
 * its own nodes, so the unmount cannot touch the host.
 */
function releaseReactSlot(slot: ActiveReactSlot): void {
    slot.container.remove();
    queueMicrotask(() => slot.handle.dispose());
}

/**
 * Fill a view-owned DOM region with text, a native node, or a temporary React
 * subtree. React-to-React changes reuse the same root; any other change
 * releases the root before the new content is written.
 *
 * Callers must NOT run the previous cleanup before calling again — this
 * function owns the transition, and pre-clearing it discards the state that
 * makes root reuse possible. Superseded cleanups become no-ops on their own.
 */
export function fillSlot(host: HTMLElement, slot: SlotContent): () => void {
    const previous = activeSlots.get(host);
    const generation = (previous?.generation ?? 0) + 1;

    if (needsReactRoot(slot)) {
        const element = asReactElement(slot);

        if (previous?.kind === "react") {
            previous.generation = generation;
            previous.handle.render(element);
            return () => {
                if (
                    activeSlots.get(host) !== previous
                    || previous.generation !== generation
                ) return;
                activeSlots.delete(host);
                releaseReactSlot(previous);
                host.replaceChildren();
            };
        }

        host.replaceChildren();
        const container = createReactContainer();
        host.append(container);
        const active: ActiveReactSlot = {
            kind: "react",
            container,
            handle: mountReactHandle(container, element),
            generation,
        };
        activeSlots.set(host, active);
        return () => {
            if (
                activeSlots.get(host) !== active
                || active.generation !== generation
            ) return;
            activeSlots.delete(host);
            releaseReactSlot(active);
            host.replaceChildren();
        };
    }

    if (previous?.kind === "react") {
        releaseReactSlot(previous);
    }
    host.replaceChildren();

    let active: ActiveSlot;
    if (isReactEmpty(slot)) {
        active = { kind: "empty", generation };
    } else if (typeof slot === "string") {
        host.textContent = slot;
        active = { kind: "text", generation };
    } else {
        host.append(slot as Node);
        active = { kind: "node", generation };
    }
    activeSlots.set(host, active);

    if (isReactEmpty(slot)) {
        return () => undefined;
    }

    return () => {
        if (
            activeSlots.get(host) !== active
            || active.generation !== generation
        ) return;
        activeSlots.delete(host);
        host.replaceChildren();
    };
}
