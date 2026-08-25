import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
    Button,
    IconButton,
    Panel,
    SegmentedControl,
    Spacer,
    Splitter,
    Text,
    Textarea,
    WithMenu,
    Checkbox,
} from "../../uikit";
import type { MenuItem } from "../../uikit";
import { createFileTypeIconElement } from "../../components/icons/icon-elements";
import { app } from "../../api/app";
import { BodyType, RAW_LANGUAGES, RestRequest } from "./restClientTypes";
import type { RestClientSource, RestClientViewState } from "./restClientTypes";
import { HTTP_METHODS, COMMON_HEADERS, METHOD_COLORS } from "./httpConstants";
import { KeyValueEditor } from "./KeyValueEditor";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { MonacoEditorHost } from "../shared/MonacoEditorHost";
import type { MonacoEditorHostView } from "../shared/MonacoEditorHostView";

const BODY_TYPES: { type: BodyType; label: string }[] = [
    { type: "none", label: "none" },
    { type: "form-data", label: "form-data" },
    { type: "form-urlencoded", label: "x-www-form-urlencoded" },
    { type: "raw", label: "raw" },
    { type: "binary", label: "binary" },
];

const BODY_EDITOR_OPTIONS: import("monaco-editor").editor.IStandaloneEditorConstructionOptions = {
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: "off",
    scrollBeyondLastLine: false,
    wordWrap: "on",
    folding: true,
    renderLineHighlight: "none",
    overviewRulerLanes: 0,
    padding: { top: 4, bottom: 4 },
    scrollbar: { alwaysConsumeMouseWheel: false },
};

interface RequestBuilderProps {
    vm: RestClientSource;
    request: RestRequest;
    state: RestClientViewState;
}

interface RequestBuilderState {
    bodyHeight: number | null;
    headersView: "table" | "json";
    headersJson: string;
}

const defaultRequestBuilderState: RequestBuilderState = {
    bodyHeight: null,
    headersView: "table",
    headersJson: "",
};

class RequestBuilderModel extends TComponentModel<RequestBuilderState, RequestBuilderProps> {
    setBodyHeight = (bodyHeight: number | null) => {
        this.state.update((s) => { s.bodyHeight = bodyHeight; });
    };

    setHeadersView = (headersView: "table" | "json") => {
        this.state.update((s) => { s.headersView = headersView; });
    };

    setHeadersJson = (headersJson: string) => {
        this.state.update((s) => { s.headersJson = headersJson; });
    };
}

export function RequestBuilder(props: RequestBuilderProps) {
    const { vm, request, state } = props;
    const model = useComponentModel(props, RequestBuilderModel, defaultRequestBuilderState);
    const { bodyHeight, headersView, headersJson } = model.state.use();
    const splitRef = useRef<HTMLDivElement>(null);
    const bodyPanelRef = useRef<HTMLDivElement>(null);

    // Pin bodyHeight to the actually-rendered pixel size after first layout. Until this
    // runs, the splitter would capture a stale fallback (150) as its startValue and the
    // body would jump on first drag.
    useLayoutEffect(() => {
        if (bodyHeight === null && bodyPanelRef.current) {
            model.setBodyHeight(bodyPanelRef.current.offsetHeight);
        }
    }, [bodyHeight, model]);

    const switchToJsonView = useCallback(() => {
        const obj: Record<string, string> = {};
        for (const h of request.headers) {
            if (h.enabled && h.key.trim()) obj[h.key.trim()] = h.value;
        }
        model.setHeadersJson(JSON.stringify(obj, null, 2));
        vm.setHeadersJsonInvalid(false);
        model.setHeadersView("json");
    }, [request.headers, vm, model]);

    const switchToTableView = useCallback(() => {
        try {
            const obj = JSON.parse(headersJson);
            if (typeof obj !== "object" || Array.isArray(obj)) throw new Error("not an object");
            const headers = Object.entries(obj).map(([key, value]) => ({
                key, value: String(value), enabled: true,
            }));
            vm.updateRequest(request.id, { headers });
            vm.setHeadersJsonInvalid(false);
            model.setHeadersView("table");
        } catch {
            app.ui.notify("Invalid JSON — fix errors before switching to Table view", "warning");
        }
    }, [headersJson, vm, request.id, model]);

    const handleHeadersJsonChange = useCallback((value: string) => {
        const json = value;
        model.setHeadersJson(json);
        try {
            const obj = JSON.parse(json);
            if (typeof obj !== "object" || Array.isArray(obj)) throw new Error("not an object");
            const headers = Object.entries(obj).map(([key, value]) => ({
                key, value: String(value), enabled: true,
            }));
            vm.updateRequest(request.id, { headers });
            vm.setHeadersJsonInvalid(false);
        } catch {
            vm.setHeadersJsonInvalid(true);
        }
    }, [vm, request.id, model]);

    const handleUrlChange = useCallback(
        (value: string) => {
            vm.updateRequest(request.id, { url: value });
        },
        [vm, request.id],
    );

    const methodMenuItems: MenuItem[] = useMemo(
        () => HTTP_METHODS.map((m) => ({
            label: m,
            selected: m === request.method,
            onClick: () => vm.updateRequest(request.id, { method: m }),
        })),
        [vm, request.id, request.method],
    );

    const handleUrlKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                vm.sendRequest();
            }
        },
        [vm],
    );

    const handleUrlPaste = useCallback(
        (e: ClipboardEvent) => {
            const text = e.clipboardData.getData("text");
            if (!text) return;
            const trimmed = text.trim();
            if (trimmed.startsWith("fetch(") || /^curl\s/i.test(trimmed)) {
                e.preventDefault();
                vm.pasteRequest(text);
            }
        },
        [vm],
    );

    const getClampedBodyHeight = useCallback((h: number) => {
        const container = splitRef.current;
        if (!container) return h;
        const total = container.clientHeight;
        return Math.max(total * 0.1, Math.min(total * 0.9, h));
    }, []);

    const handleBodyHeightChange = useCallback((h: number) => {
        model.setBodyHeight(getClampedBodyHeight(h));
    }, [getClampedBodyHeight, model]);

    const toggleBodyHeight = useCallback((expandedRatio: number) => {
        const container = splitRef.current;
        if (!container) return;
        const total = container.clientHeight;
        const expanded = total * expandedRatio;
        const collapsed = total * (1 - expandedRatio);
        const current = bodyHeight ?? total * 0.4;
        const isExpanded = Math.abs(current - expanded) < total * 0.05;
        model.setBodyHeight(isExpanded ? collapsed : expanded);
    }, [bodyHeight, model]);

    const handleHeadersDblClick = useCallback(() => {
        toggleBodyHeight(0.3);
    }, [toggleBodyHeight]);

    const handleBodyDblClick = useCallback(() => {
        toggleBodyHeight(0.7);
    }, [toggleBodyHeight]);

    const currentBodyHeight = bodyHeight ?? (splitRef.current?.clientHeight ?? 0) * 0.4;

    const handleBodyTypeChange = useCallback(
        (type: BodyType) => {
            vm.updateBodyType(request.id, type);
        },
        [vm, request.id],
    );

    // Menu rows append their Node values directly, so rebuild file icons per render instead
    // of memoising one array that could be reused after the menu is reopened.
    const languageMenuItems: MenuItem[] = RAW_LANGUAGES.map((l) => ({
        label: l,
        icon: createFileTypeIconElement({ language: l, width: 16, height: 16 }),
        selected: l === request.bodyLanguage,
        onClick: () => vm.updateBodyLanguage(request.id, l),
    }));

    const handleMonacoBodyChange = useCallback(
        (value: string) => {
            vm.updateRequest(request.id, { body: value });
        },
        [vm, request.id],
    );

    const handleCopyHeaders = useCallback(async () => {
        const obj: Record<string, string> = {};
        for (const h of request.headers) {
            if (h.enabled && h.key.trim()) obj[h.key.trim()] = h.value;
        }
        navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
        return new Promise((resolve) => setTimeout(resolve, 200));
    }, [request.headers]);

    const headersFlexProps: { flex?: number | string; height?: number; shrink?: boolean } =
        bodyHeight !== null
            ? { flex: "1 1 auto" }
            : { flex: "6 1 0" };

    const bodyFlexProps: { flex?: number | string; height?: number; shrink?: boolean } =
        bodyHeight !== null
            ? { flex: "0 0 auto", height: currentBodyHeight, shrink: false }
            : { flex: "4 1 0" };

    const headersViewItems = [
        { value: "table", label: "Table" },
        { value: "json", label: "JSON" },
    ];

    const bodyTypeItems = BODY_TYPES.map(({ type, label }) => ({ value: type, label }));

    return (
        <Panel
            name="request-builder"
            direction="column"
            flex={1}
            overflow="hidden"
            minHeight={0}
        >
            {/* URL bar */}
            <Panel
                name="url-bar"
                direction="row"
                align="start"
                gap="xs"
                paddingX="md"
                paddingY="xs"
                background="dark"
                shrink={false}
            >
                <WithMenu items={methodMenuItems}>
                    {(setOpen) => (
                        <Button
                            name="method-label"
                            size="sm"
                            variant="ghost"
                            background="dark"
                            onClick={(e) => setOpen(e.currentTarget)}
                        >
                            <Text bold color={METHOD_COLORS[request.method]}>{request.method}</Text>
                        </Button>
                    )}
                </WithMenu>
                <Textarea
                    name="url-input"
                    value={request.url}
                    onChange={handleUrlChange}
                    onKeyDown={handleUrlKeyDown}
                    onPaste={handleUrlPaste}
                    placeholder="Enter URL or paste cURL/fetch..."
                    flex={1}
                    minHeight={24}
                    maxHeight={54}
                />
                <Button
                    name="rest-send"
                    variant="primary"
                    onClick={vm.sendRequest}
                    disabled={state.executing || !request.url}
                >
                    {state.executing ? "Sending..." : "Send"}
                </Button>
            </Panel>

            {/* Split area: headers (top) / body (bottom) */}
            <Panel
                name="request-split"
                direction="column"
                flex={1}
                overflow="hidden"
                minHeight={0}
                ref={splitRef}
            >
                {/* Headers panel */}
                <Panel
                    name="headers-panel"
                    direction="column"
                    overflow="hidden"
                    minHeight={0}
                    {...headersFlexProps}
                >
                    <Panel
                        name="headers-section-header"
                        direction="row"
                        align="center"
                        gap="xs"
                        paddingX="md"
                        paddingY="xs"
                        background="dark"
                        shrink={false}
                        onDoubleClick={handleHeadersDblClick}
                    >
                        <Text size="xs" variant="uppercased" color="light" bold>Headers</Text>
                        <Spacer />
                        <SegmentedControl
                            name="headers-view"
                            size="sm"
                            value={headersView}
                            onChange={(v) =>
                                v === "json" ? switchToJsonView() : switchToTableView()
                            }
                            items={headersViewItems}
                        />
                        <IconButton
                            name="headers-copy"
                            size="sm"
                            icon="copy"
                            title="Copy headers as JSON"
                            onClick={handleCopyHeaders}
                        />
                    </Panel>
                    {headersView === "table" ? (
                        <Panel
                            name="headers-scroll"
                            direction="column"
                            flex={1}
                            overflowY="auto"
                            minHeight={0}
                            paddingX="md"
                            paddingBottom="sm"
                        >
                            <KeyValueEditor
                                items={request.headers}
                                onUpdate={(i, changes) => vm.updateHeader(request.id, i, changes)}
                                onDelete={(i) => vm.deleteHeader(request.id, i)}
                                onToggle={(i) => vm.toggleHeader(request.id, i)}
                                keyOptions={COMMON_HEADERS}
                                keyPlaceholder="Header name"
                                valuePlaceholder="Value"
                            />
                        </Panel>
                    ) : (
                        <Panel
                            name="headers-json"
                            flex={1}
                            overflow="hidden"
                            minHeight={0}
                        >
                            <MonacoEditorHost
                                initialValue={headersJson}
                                language="json"
                                options={BODY_EDITOR_OPTIONS}
                                onChange={handleHeadersJsonChange}
                            />
                        </Panel>
                    )}
                </Panel>

                <Splitter
                    name="request-body-splitter"
                    orientation="horizontal"
                    value={currentBodyHeight}
                    onChange={handleBodyHeightChange}
                    side="after"
                    border="before"
                />

                {/* Body panel */}
                <Panel
                    name="body-panel"
                    direction="column"
                    overflow="hidden"
                    minHeight={0}
                    ref={bodyPanelRef}
                    {...bodyFlexProps}
                >
                    <Panel
                        name="body-section-header"
                        direction="row"
                        align="center"
                        gap="xs"
                        paddingX="md"
                        paddingY="xs"
                        background="dark"
                        shrink={false}
                        onDoubleClick={handleBodyDblClick}
                    >
                        <Text size="xs" variant="uppercased" color="light" bold>Body</Text>
                        <SegmentedControl
                            name="body-type-select"
                            size="sm"
                            value={request.bodyType}
                            onChange={(v) => handleBodyTypeChange(v as BodyType)}
                            items={bodyTypeItems}
                        />
                        {request.bodyType === "raw" && (
                            <WithMenu items={languageMenuItems}>
                                {(setOpen) => (
                                    <Button
                                        name="body-language"
                                        size="sm"
                                        variant="ghost"
                                        background="dark"
                                        icon={createFileTypeIconElement({ language: request.bodyLanguage, width: 16, height: 16 })}
                                        title="Change body language"
                                        onClick={(e) => setOpen(e.currentTarget)}
                                    >
                                        {request.bodyLanguage}
                                    </Button>
                                )}
                            </WithMenu>
                        )}
                    </Panel>
                    <BodyContent
                        vm={vm}
                        request={request}
                        onMonacoChange={handleMonacoBodyChange}
                    />
                </Panel>
            </Panel>
        </Panel>
    );
}

function BodyContent({ vm, request, onMonacoChange }: {
    vm: RestClientSource;
    request: RestRequest;
    onMonacoChange: (value: string) => void;
}) {
    const bodyHostRef = useRef<MonacoEditorHostView | null>(null);

    useEffect(() => {
        if (request.bodyType !== "raw") {
            bodyHostRef.current = null;
            return;
        }

        bodyHostRef.current?.setValue(request.body);
    }, [request.body, request.bodyType]);

    const handleSelectFile = useCallback(async () => {
        const result = await app.fs.showOpenDialog();
        if (result?.[0]) {
            vm.updateRequest(request.id, { binaryFilePath: result[0] });
        }
    }, [vm, request.id]);

    if (request.bodyType === "none") {
        return (
            <Panel name="body-content" direction="column" flex={1} overflow="hidden" minHeight={0}>
                <Panel paddingX="md" paddingY="sm">
                    <Text color="light" italic>This request has no body.</Text>
                </Panel>
            </Panel>
        );
    }

    if (request.bodyType === "binary") {
        return (
            <Panel name="body-content" direction="column" flex={1} overflow="hidden" minHeight={0}>
                <Panel
                    name="binary-body"
                    direction="column"
                    gap="sm"
                    paddingX="md"
                    paddingY="sm"
                >
                    <Panel direction="row" align="center" gap="sm">
                        <Button size="sm" title="Select file" onClick={handleSelectFile} icon="folder-open">
                            Select File
                        </Button>
                        <Panel flex={1} minWidth={0}>
                            <Text
                                size="sm"
                                truncate
                                color={request.binaryFilePath ? "default" : "light"}
                                italic={!request.binaryFilePath}
                            >
                                {request.binaryFilePath || "No file selected"}
                            </Text>
                        </Panel>
                    </Panel>
                </Panel>
            </Panel>
        );
    }

    if (request.bodyType === "form-data") {
        return (
            <Panel name="body-content" direction="column" flex={1} overflow="hidden" minHeight={0}>
                <Panel
                    name="body-content-scroll"
                    direction="column"
                    flex={1}
                    overflowY="auto"
                    minHeight={0}
                    paddingX="md"
                    paddingBottom="sm"
                >
                    <FormDataEditor vm={vm} request={request} />
                </Panel>
            </Panel>
        );
    }

    if (request.bodyType === "form-urlencoded") {
        return (
            <Panel name="body-content" direction="column" flex={1} overflow="hidden" minHeight={0}>
                <Panel
                    name="body-content-scroll"
                    direction="column"
                    flex={1}
                    overflowY="auto"
                    minHeight={0}
                    paddingX="md"
                    paddingBottom="sm"
                >
                    <KeyValueEditor
                        items={request.formData}
                        onUpdate={(i, changes) => vm.updateFormData(request.id, i, changes)}
                        onDelete={(i) => vm.deleteFormData(request.id, i)}
                        onToggle={(i) => vm.toggleFormData(request.id, i)}
                        keyPlaceholder="Key"
                        valuePlaceholder="Value"
                    />
                </Panel>
            </Panel>
        );
    }

    // raw
    return (
        <Panel name="body-content" direction="column" flex={1} overflow="hidden" minHeight={0}>
            <MonacoEditorHost
                initialValue={request.body}
                language={request.bodyLanguage}
                options={BODY_EDITOR_OPTIONS}
                onMount={(host) => { bodyHostRef.current = host; }}
                onChange={onMonacoChange}
            />
        </Panel>
    );
}

function FormDataEditor({ vm, request }: { vm: RestClientSource; request: RestRequest }) {
    const handleBrowse = useCallback(async (index: number) => {
        const result = await app.fs.showOpenDialog();
        if (result?.[0]) {
            vm.updateFormDataEntry(request.id, index, { value: result[0] });
        }
    }, [vm, request.id]);

    return (
        <Panel name="form-data-editor" direction="column" gap="xs">
            {request.formDataEntries.map((entry, index) => {
                const isEmpty = !entry.key && !entry.value;
                const isLast = index === request.formDataEntries.length - 1;
                return (
                    <Panel
                        key={index}
                        name="form-data-row"
                        direction="row"
                        align="start"
                        gap="xs"
                        paddingTop="xs"
                        dimmed={!entry.enabled}
                    >
                        <Panel name="form-data-check-slot" paddingTop="sm" shrink={false}>
                            <Checkbox
                                checked={entry.enabled}
                                onChange={() => vm.toggleFormDataEntry(request.id, index)}
                            />
                        </Panel>
                        <Button
                            name="form-data-type-toggle"
                            size="sm"
                            variant="ghost"
                            title="Toggle text/file"
                            onClick={() => vm.updateFormDataEntry(request.id, index, {
                                type: entry.type === "text" ? "file" : "text",
                                value: "",
                            })}
                        >
                            {entry.type === "file" ? "File" : "Text"}
                        </Button>
                        <Panel
                            name="form-data-key-slot"
                            width="30%"
                            minWidth={80}
                            shrink={false}
                        >
                            <Textarea
                                name="form-data-key"
                                variant="ghost"
                                singleLine
                                value={entry.key}
                                onChange={(v) =>
                                    vm.updateFormDataEntry(request.id, index, { key: v })
                                }
                                placeholder="Key"
                                flex="1 1 0"
                                minWidth={0}
                                minHeight={24}
                            />
                        </Panel>
                        {entry.type === "file" ? (
                            <Panel direction="row" align="center" gap="xs" flex="1 1 0" minWidth={0}>
                                <IconButton
                                    name="form-data-browse"
                                    size="sm"
                                    icon="folder-open"
                                    title="Browse"
                                    onClick={() => handleBrowse(index)}
                                />
                                <Panel flex="1 1 0" minWidth={0}>
                                    <Text
                                        size="sm"
                                        truncate
                                        color={entry.value ? "default" : "light"}
                                        italic={!entry.value}
                                    >
                                        {entry.value || "No file selected"}
                                    </Text>
                                </Panel>
                            </Panel>
                        ) : (
                            <Textarea
                                name="form-data-value"
                                variant="ghost"
                                singleLine
                                value={entry.value}
                                onChange={(v) =>
                                    vm.updateFormDataEntry(request.id, index, { value: v })
                                }
                                placeholder="Value"
                                flex="1 1 0"
                                minWidth={0}
                                minHeight={24}
                            />
                        )}
                        {isLast && isEmpty ? (
                            <Panel width={24} shrink={false} />
                        ) : (
                            <IconButton
                                name="form-data-delete"
                                size="sm"
                                icon="close"
                                title="Delete"
                                onClick={() => vm.deleteFormDataEntry(request.id, index)}
                            />
                        )}
                    </Panel>
                );
            })}
        </Panel>
    );
}
