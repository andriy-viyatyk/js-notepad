import { useMemo, useState } from "react";
import { Panel, Splitter, Text } from "../../uikit";
import { EditorError } from "../base/EditorError";
import { traited } from "../../core/traits/traits";
import { RestClientEditor } from "./RestClientEditor";
import {
    RequestTree,
    SplitDetailPanel,
    buildGroupedTree,
    requestTreeItemTraits,
    type RequestTreeItem,
} from "./RestClientShared";

interface RestClientBodyProps {
    model: RestClientEditor;
}

/**
 * EPIC-028 / US-563 — v4 Rest Client body. Reactive over `editor.state.use`;
 * composes shared `RequestTree` + `SplitDetailPanel` from `RestClientShared.tsx`
 * (Phase 5b extraction). No portal toolbar/footer (RC17 — per-request toolbar
 * lives inline in SplitDetailPanel; predates the portal toolbar pattern).
 */
export function RestClientBody({ model: editor }: RestClientBodyProps) {
    const state = editor.state.use((s) => ({
        data: s.data,
        error: s.error,
        selectedRequestId: s.selectedRequestId,
        leftPanelWidth: s.leftPanelWidth,
        executing: s.executing,
        response: s.response,
        responseTime: s.responseTime,
        headersJsonInvalid: s.headersJsonInvalid,
    }));

    // Local mirror for splitter smoothness (today's pattern, preserved).
    const [leftPanelWidth, setLeftPanelWidth] = useState(state.leftPanelWidth);
    const handleLeftPanelWidthChange = useMemo(() => (width: number) => {
        const clamped = Math.max(150, Math.min(500, width));
        setLeftPanelWidth(clamped);
        editor.setLeftPanelWidth(clamped);
    }, [editor]);

    const rootItem = useMemo<RequestTreeItem>(
        () => ({
            id: "__root__",
            isRoot: true,
            items: buildGroupedTree(state.data.requests),
        }),
        [state.data.requests],
    );

    const tItems = useMemo(
        () => traited([rootItem], requestTreeItemTraits),
        [rootItem],
    );

    // Queue focus handler — kept for Tier-5 symmetry; harmless no-op.
    editor.queue.use((ev) => {
        if (ev.type === "focus") {
            // No explicit refocus today; intentional no-op.
        }
    });

    if (state.error) return <EditorError>{state.error}</EditorError>;

    const selectedRequest = editor.selectedRequest;

    return (
        <Panel
            name="rest-client-root"
            direction="row"
            flex={1}
            height={0}
            overflow="hidden"
        >
            <Panel
                name="rest-left-panel"
                direction="column"
                overflow="hidden"
                background="default"
                width={leftPanelWidth}
                minWidth={150}
                maxWidth="80%"
                shrink={false}
            >
                <Panel
                    name="rest-left-tree"
                    flex={1}
                    overflow="auto"
                    minHeight={0}
                    minWidth={0}
                >
                    <RequestTree vm={editor} items={tItems} selectedId={state.selectedRequestId} />
                </Panel>
            </Panel>
            <Splitter
                name="rest-left-splitter"
                orientation="vertical"
                value={leftPanelWidth}
                onChange={handleLeftPanelWidthChange}
                side="before"
                border="after"
                min={150}
                max={500}
            />
            <Panel
                name="rest-right-panel"
                direction="column"
                flex={1}
                width={0}
                overflow="hidden"
            >
                {selectedRequest ? (
                    <SplitDetailPanel vm={editor} request={selectedRequest} state={state} />
                ) : (
                    <Panel
                        name="rest-empty"
                        flex={1}
                        align="center"
                        justify="center"
                        padding="lg"
                    >
                        <Text color="light" italic align="center">
                            {state.data.requests.length === 0
                                ? "No requests yet. Click + to add one."
                                : "Select a request from the list."}
                        </Text>
                    </Panel>
                )}
            </Panel>
        </Panel>
    );
}
