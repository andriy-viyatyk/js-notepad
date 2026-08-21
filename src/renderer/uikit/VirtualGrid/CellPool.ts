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
    private elements: HTMLElement[] = [];
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
    acquire = (): HTMLElement | undefined => {
        const el = this.elements.pop();
        if (el) {
            this._stats.hits++;
        } else {
            this._stats.misses++;
        }
        return el;
    };

    /**
     * Return a detached element for reuse. The caller must have removed it from the DOM
     * first — a pooled element that is still attached would be handed out while visible.
     */
    release = (el: HTMLElement): void => {
        if (this.elements.length >= this.maxSize) {
            this._stats.discarded++;
            return;
        }
        this._stats.released++;
        this.elements.push(el);
    };

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
    }
}
