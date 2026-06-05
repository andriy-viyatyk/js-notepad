import { Panel, Text } from "../../uikit";
import { EditorError } from "../base/EditorError";
import { RestClientEditor } from "./RestClientEditor";
import { SplitDetailPanel } from "./RestClientShared";

interface RestClientBodyProps {
    model: RestClientEditor;
}

export function RestClientBody({ model: editor }: RestClientBodyProps) {
    const state = editor.state.use((s) => ({
        data: s.data,
        error: s.error,
        selectedRequestId: s.selectedRequestId,
        executing: s.executing,
        response: s.response,
        responseTime: s.responseTime,
        headersJsonInvalid: s.headersJsonInvalid,
    }));

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
            direction="column"
            flex={1}
            height={0}
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
    );
}
