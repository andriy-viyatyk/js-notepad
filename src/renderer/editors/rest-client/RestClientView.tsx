import { useMemo, useState, useSyncExternalStore } from "react";
import { Panel, Splitter, Text } from "../../uikit";
import { EditorError } from "../base/EditorError";
import { useContentViewModel } from "../base/useContentViewModel";
import { RestClientViewModel, RestClientEditorState, defaultRestClientEditorState } from "./RestClientViewModel";
import { traited } from "../../core/traits/traits";
import { IContentHost } from "../base/IContentHost";
import {
    RequestTree,
    SplitDetailPanel,
    buildGroupedTree,
    requestTreeItemTraits,
    type RequestTreeItem,
} from "./RestClientShared";

const noopUnsubscribe = () => () => {};
const getDefaultState = () => defaultRestClientEditorState;

/**
 * Legacy view path — kept alive under US-563 for future notebook-embed parity
 * with US-554 / US-555 / US-556 / US-560 / US-561 / US-562 / US-564 / US-565
 * preservation pattern (RC11 / RC12). Page-level pages take the v4 path via
 * `wrapLegacyForPage` in `PagesLifecycleModel.ts`; this file is reached only
 * through the legacy `editorRegistry.getById("rest-client").loadModule()`
 * returning `{Editor: RestClientEditor, createViewModel: createRestClientViewModel, …}`
 * which a future notebook implementation would consume via
 * `NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`.
 */
export function RestClientEditor({ model }: { model: IContentHost }) {
    const vm = useContentViewModel<RestClientViewModel>(model, "rest-client");

    const state: RestClientEditorState = useSyncExternalStore(
        vm ? (cb) => vm.state.subscribe(cb) : noopUnsubscribe,
        vm ? () => vm.state.get() : getDefaultState,
    );

    const [leftPanelWidth, setLeftPanelWidth] = useState(state.leftPanelWidth);
    const handleLeftPanelWidthChange = useMemo(() => (width: number) => {
        const clamped = Math.max(150, Math.min(500, width));
        setLeftPanelWidth(clamped);
        vm?.setLeftPanelWidth(clamped);
    }, [vm]);

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

    if (!vm) return null;

    if (state.error) {
        return <EditorError>{state.error}</EditorError>;
    }

    const selectedRequest = vm.selectedRequest;

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
                    <RequestTree vm={vm} items={tItems} selectedId={state.selectedRequestId} />
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
                    <SplitDetailPanel vm={vm} request={selectedRequest} state={state} />
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
