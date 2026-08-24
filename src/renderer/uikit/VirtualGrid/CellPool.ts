/**
 * A recycling bin for cell elements.
 *
 * Virtualization means a fixed number of cells serve an unbounded dataset — scrolling
 * 100,000 rows past a 20-row viewport evicts and admits cells continuously. Creating a fresh
 * element for every admission is where a naive DOM port loses the performance the engine was
 * written to preserve: `document.createElement` plus building the cell's inner structure,
 * dozens of times per frame.
 *
 * So evicted elements come here instead of being discarded, and the next admission takes one
 * back. At steady state the pool holds roughly one frame's worth of evictions and no new
 * element is ever allocated.
 *
 * ## The reuse contract
 *
 * `release()` does **not** reset the element. It arrives at its next occupant with the same
 * children, classes, attributes and event listeners it had before. Wiping it would throw away
 * the inner structure, which is most of what makes reuse worth doing — so a cell renderer
 * that recycles is responsible for overwriting everything it sets.
 *
 * ## Ordering
 *
 * Acquisition happens during `calcRenderInfo` (frame N) and release happens during the paint
 * (frame N). So a frame draws from what the *previous* frame released, which is exactly the
 * set of elements that just scrolled out. The pool never needs to be large.
 */

import type { CellReuseKey } from "./types";

interface CellPoolEntry {
    element: HTMLElement;
    reuseKey?: CellReuseKey;
}

export interface CellPoolStats {
    /** Acquisitions served from the pool. */
    hits: number;
    /** Acquisitions that found the pool empty — each one costs a `createElement`. */
    misses: number;
    /** Elements released and kept. */
    released: number;
    /** Elements released and dropped because the pool was full. */
    discarded: number;
}

export class CellPool {
    private elements: CellPoolEntry[] = [];
    private retained = new Set<HTMLElement>();
    private reuseKeys = new WeakMap<HTMLElement, CellReuseKey | undefined>();
    private _stats: CellPoolStats = { hits: 0, misses: 0, released: 0, discarded: 0 };

    /**
     * Cap on retained elements. A grid holds at most a viewport's worth of cells, so a pool
     * larger than that is memory kept for no reason — the default is generous enough that a
     * legitimate viewport never overflows it.
     */
    constructor(private readonly maxSize = 2000) {}

    /**
     * Take an element from the pool, or `undefined` if it is empty.
     *
     * Bound as a field so it can be handed to the geometry as a bare function.
     */
    acquire = (reuseKey?: CellReuseKey): HTMLElement | undefined => {
        let index = this.elements.length - 1;
        if (reuseKey !== undefined) {
            while (index >= 0 && !Object.is(this.elements[index].reuseKey, reuseKey)) index--;
        }
        if (index < 0) {
            this._stats.misses++;
            return undefined;
        }

        const [{ element }] = this.elements.splice(index, 1);
        this.retained.delete(element);
        if (reuseKey !== undefined) this.reuseKeys.set(element, reuseKey);
        this._stats.hits++;
        return element;
    };

    /** Associate a consumer-owned compatibility key with an admitted cell. */
    setReuseKey = (element: HTMLElement, reuseKey?: CellReuseKey): void => {
        this.reuseKeys.set(element, reuseKey);
    };

    /**
     * Return an element for reuse. The caller may keep it attached but hidden; the return value
     * tells the caller whether the bounded pool retained it or it should release its DOM node.
     */
    release = (el: HTMLElement): boolean => {
        if (this.elements.length >= this.maxSize) {
            this._stats.discarded++;
            return false;
        }
        this._stats.released++;
        this.elements.push({ element: el, reuseKey: this.reuseKeys.get(el) });
        this.retained.add(el);
        return true;
    };

    has(el: HTMLElement): boolean {
        return this.retained.has(el);
    }

    get size(): number {
        return this.elements.length;
    }

    get stats(): Readonly<CellPoolStats> {
        return this._stats;
    }

    resetStats(): void {
        this._stats = { hits: 0, misses: 0, released: 0, discarded: 0 };
    }

    clear(): void {
        this.elements = [];
        this.retained.clear();
    }
}
