import React from "react";
import { mountReactHandle, MountedReactRoot } from "./mount";

/** A temporary subtree slot used while a component still has React callers. */
export type SlotContent = string | Node | React.ReactNode;

interface ActiveReactSlot {
    kind: "react";
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

function asReactElement(slot: React.ReactNode): React.ReactElement {
    return React.createElement(React.Fragment, null, slot);
}

function deferDispose(handle: MountedReactRoot): void {
    queueMicrotask(() => handle.dispose());
}

/**
 * Fill a view-owned DOM region with text, a native node, or a temporary React
 * subtree. React-to-React changes reuse the same root; arm changes clear the
 * host immediately and defer the old root's unmount until the current commit
 * has finished.
 */
export function fillSlot(host: HTMLElement, slot: SlotContent): () => void {
    const previous = activeSlots.get(host);
    const generation = (previous?.generation ?? 0) + 1;

    if (!isReactEmpty(slot) && typeof slot !== "string" && !(slot instanceof Node)) {
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
                host.replaceChildren();
                deferDispose(previous.handle);
            };
        }

        host.replaceChildren();
        const active: ActiveReactSlot = {
            kind: "react",
            handle: mountReactHandle(host, element),
            generation,
        };
        activeSlots.set(host, active);
        return () => {
            if (
                activeSlots.get(host) !== active
                || active.generation !== generation
            ) return;
            activeSlots.delete(host);
            host.replaceChildren();
            deferDispose(active.handle);
        };
    }

    if (previous?.kind === "react") {
        deferDispose(previous.handle);
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
