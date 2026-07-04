/**
 * In-memory per-tool call statistics (EPIC-038 / US-802). Reactive counters — which tool was
 * run, how many times, how many failed — consumed by the US-805 management UI. Deliberately
 * holds NO logs or output (that goes to the per-toolset `tools-execution.log`, see `tool-log.ts`)
 * and is NOT persisted: it resets on app restart. `tool-executor` calls `record()` after every
 * run (success or failure).
 */
import { TModel } from "../../core/state/model";
import { TGlobalState } from "../../core/state/state";

export interface ToolStat {
    toolId: string;
    /** Total runs (success + failure). */
    calls: number;
    /** Runs that ended `ok:false`. */
    failures: number;
    /** `Date.now()` of the most recent run. */
    lastCalledAt: number;
    /** Duration (ms) of the most recent run. */
    lastDurationMs: number;
}

interface ToolStatsState {
    byId: Record<string, ToolStat>;
}

const defaultState: ToolStatsState = { byId: {} };

class ToolStats extends TModel<ToolStatsState> {
    constructor() {
        super(new TGlobalState(defaultState));
    }

    /** Bump the counter for a tool after a run. `ok:false` also increments `failures`. */
    record(toolId: string, ok: boolean, durationMs: number): void {
        this.state.update((s) => {
            const prev = s.byId[toolId];
            s.byId[toolId] = {
                toolId,
                calls: (prev?.calls ?? 0) + 1,
                failures: (prev?.failures ?? 0) + (ok ? 0 : 1),
                lastCalledAt: Date.now(),
                lastDurationMs: durationMs,
            };
        });
    }

    /** All stats, most-called first. */
    get all(): ToolStat[] {
        return Object.values(this.state.get().byId).sort((a, b) => b.calls - a.calls);
    }

    /** Reactive `all` (re-renders on record). */
    useAll(): ToolStat[] {
        return this.state.use((s) =>
            Object.values(s.byId).sort((a, b) => b.calls - a.calls),
        );
    }

    get(toolId: string): ToolStat | undefined {
        return this.state.get().byId[toolId];
    }

    clear(): void {
        this.state.update((s) => {
            s.byId = {};
        });
    }
}

export const toolStats = new ToolStats();
