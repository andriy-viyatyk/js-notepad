/**
 * Performance-timeline janitor (US-806).
 *
 * Verified against the installed React 19 development client: it still emits ~100
 * `performance.measure()` entries ("Components ⚛" DevTools tracks, with per-render
 * "Changed Props" detail payloads) while the live Excalidraw React island renders, and the
 * performance timeline buffers measures unboundedly — nothing in the platform ever clears them.
 * Multi-hour dev sessions accumulate millions of entries, growing the app
 * renderer by gigabytes of native (malloc/PartitionAlloc/Oilpan) memory.
 *
 * The janitor clears the buffer whenever it grows past a threshold. It is
 * self-gating: production React builds emit no component-track measures, so the threshold is
 * never reached and this is a no-op in release builds. The janitor remains because the
 * development producer is still present in the sanctioned island.
 * The threshold (rather than an unconditional clear) keeps recent entries
 * available for DevTools Performance-panel work between clears.
 */

const MEASURE_THRESHOLD = 10_000;
const SWEEP_INTERVAL_MS = 60_000;

export function startPerformanceJanitor() {
    setInterval(() => {
        if (performance.getEntriesByType("measure").length > MEASURE_THRESHOLD) {
            performance.clearMeasures();
            performance.clearMarks();
        }
    }, SWEEP_INTERVAL_MS);
}
