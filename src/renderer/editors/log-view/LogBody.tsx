import { useCallback, useEffect, useRef } from "react";
import type { LogViewEditor } from "./LogViewEditor";
import { LogViewProvider } from "./LogViewContext";
import { LogEntryWrapper } from "./LogEntryWrapper";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderFlexCellParams, Percent } from "../../uikit/RenderGrid";
import { Panel, Text } from "../../uikit";
import { EditorError } from "../base/EditorError";

/**
 * EPIC-028 / US-553 — Log View body. Drains the editor's `ComponentQueue`
 * for focus / scrollToBottom events; owns the auto-scroll machinery
 * (iterative scroll-to-bottom that settles after RenderFlexGrid row-height
 * measurements). Renders the virtual grid of log entries.
 */

const RIGHT_GUTTER = 40;
const getColumnWidth = (col: number) => (col === 0 ? ("100%" as Percent) : RIGHT_GUTTER);
const AUTO_SCROLL_THRESHOLD = 50;

export function LogBody({ model }: { model: LogViewEditor }) {
    const state = model.state.use((s) => ({
        entries: s.entries,
        entryCount: s.entryCount,
        error: s.error,
        showTimestamps: s.showTimestamps,
    }));

    const gridModelRef = useRef<RenderGridModel | null>(null);
    const isAtBottom = useRef(true);
    const prevEntryCount = useRef(0);
    const scrollTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const setGridModel = useCallback((m: RenderGridModel | null) => {
        gridModelRef.current = m;
    }, []);

    const handleScroll = useCallback(() => {
        const container = gridModelRef.current?.containerRef?.current;
        if (!container) return;
        isAtBottom.current =
            container.scrollTop + container.clientHeight >=
            container.scrollHeight - AUTO_SCROLL_THRESHOLD;
    }, []);

    useEffect(() => {
        const container = gridModelRef.current?.containerRef?.current;
        if (!container) return;
        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => container.removeEventListener("scroll", handleScroll);
    }, [state.entryCount, handleScroll]);

    // Iterative auto-scroll: RenderFlexGrid renders new rows at minRowHeight,
    // then ResizeObserver measures actual content and grows rows asynchronously.
    // We scroll multiple times with increasing delays to settle after each
    // measurement pass.
    const scheduleScrollToBottom = useCallback(() => {
        for (const t of scrollTimers.current) clearTimeout(t);
        const count = prevEntryCount.current;
        if (count <= 0) return;
        const scrollToEnd = () => gridModelRef.current?.scrollToRow(count - 1, "bottom");
        scrollToEnd();
        scrollTimers.current = [
            setTimeout(scrollToEnd, 50),
            setTimeout(scrollToEnd, 150),
            setTimeout(scrollToEnd, 300),
        ];
    }, []);

    // LV5 — queue-driven scroll + focus (replaces today's forceScrollVersion useEffect).
    model.typedQueue.use((ev) => {
        if (ev.type === "focus") {
            gridModelRef.current?.containerRef?.current?.focus();
        } else if (ev.type === "scrollToBottom") {
            scheduleScrollToBottom();
        }
    });

    useEffect(() => {
        const count = state.entryCount;
        for (const t of scrollTimers.current) clearTimeout(t);
        scrollTimers.current = [];
        gridModelRef.current?.update({ all: true });
        if (count > prevEntryCount.current && isAtBottom.current && count > 0) {
            prevEntryCount.current = count;
            scheduleScrollToBottom();
        } else {
            prevEntryCount.current = count;
        }
        return () => {
            for (const t of scrollTimers.current) clearTimeout(t);
            scrollTimers.current = [];
        };
    }, [state.entryCount, scheduleScrollToBottom]);

    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [state.showTimestamps]);

    const renderLogEntry = useCallback(
        (p: RenderFlexCellParams) => {
            if (p.col === 1) return null;
            return (
                <LogEntryWrapper
                    vm={model}
                    index={p.row}
                    cellRef={p.ref}
                    showTimestamp={state.showTimestamps}
                />
            );
        },
        [model, state.showTimestamps],
    );

    const getInitialRowHeight = useCallback(
        (row: number) => {
            const entry = model.state.get().entries[row];
            return entry ? model.getEntryHeight(entry.id) : undefined;
        },
        [model],
    );

    if (state.error) return <EditorError>{state.error}</EditorError>;
    if (state.entryCount === 0) {
        return (
            <Panel name="log-view-placeholder" flex={1} align="center" justify="center">
                <Text size="base" color="light">
                    No log entries
                </Text>
            </Panel>
        );
    }

    return (
        <LogViewProvider value={model}>
            <Panel name="log-view-root" direction="column" flex={1} overflow="hidden">
                <RenderFlexGrid
                    ref={setGridModel}
                    columnCount={2}
                    rowCount={state.entryCount}
                    columnWidth={getColumnWidth}
                    renderCell={renderLogEntry}
                    fitToWidth
                    minRowHeight={18}
                    getInitialRowHeight={getInitialRowHeight}
                    preferMinHeightForNewRows
                />
            </Panel>
        </LogViewProvider>
    );
}
