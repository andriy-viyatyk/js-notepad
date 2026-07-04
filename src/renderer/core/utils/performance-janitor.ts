/**
 * Performance-timeline janitor (US-806).
 *
 * React 19 DEVELOPMENT builds emit ~100 `performance.measure()` entries
 * ("Components ⚛" DevTools tracks, with per-render "Changed Props" detail
 * payloads) for every large-tree re-render, and the performance timeline
 * buffers measures unboundedly — nothing in the platform ever clears them.
 * Multi-hour dev sessions accumulate millions of entries, growing the app
 * renderer by gigabytes of native (malloc/PartitionAlloc/Oilpan) memory.
 *
 * The janitor clears the buffer whenever it grows past a threshold. It is
 * self-gating: production React emits no component-track measures, so the
 * threshold is never reached and this is a no-op in release builds.
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
