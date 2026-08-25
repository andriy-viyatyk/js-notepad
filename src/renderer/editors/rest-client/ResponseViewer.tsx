import { useCallback, useEffect, useMemo, useRef } from "react";
import { createFileTypeIconElement } from "../../components/icons/icon-elements";
import {
    Button,
    IconButton,
    Panel,
    SegmentedControl,
    Spacer,
    Text,
    WithMenu,
} from "../../uikit";
import type { MenuItem } from "../../uikit";
import { app } from "../../api/app";
import { pagesModel } from "../../api/pages";
import { RestResponse } from "./restClientTypes";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { MonacoEditorHost } from "../shared/MonacoEditorHost";
import type { MonacoEditorHostView } from "../shared/MonacoEditorHostView";

const RESPONSE_LANGUAGES = [
    "json",
    "html",
    "xml",
    "javascript",
    "css",
    "yaml",
    "plaintext",
];

const EDITOR_OPTIONS: import("monaco-editor").editor.IStandaloneEditorConstructionOptions = {
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

function detectLanguageFromHeaders(headers: { key: string; value: string }[]): string {
    const ct = headers.find((h) => h.key.toLowerCase() === "content-type")?.value || "";
    if (ct.includes("json")) return "json";
    if (ct.includes("html")) return "html";
    if (ct.includes("xml")) return "xml";
    if (ct.includes("css")) return "css";
    if (ct.includes("javascript")) return "javascript";
    return "plaintext";
}

function formatBody(body: string, language: string): string {
    if (language === "json") {
        try {
            return JSON.stringify(JSON.parse(body), null, 2);
        } catch {
            // not valid JSON
        }
    }
    return body;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtensionFromContentType(ct: string): string {
    const map: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "application/pdf": ".pdf",
        "application/zip": ".zip",
        "application/gzip": ".gz",
        "application/octet-stream": ".bin",
    };
    for (const [key, ext] of Object.entries(map)) {
        if (ct.includes(key)) return ext;
    }
    return ".bin";
}

type ResponseTab = "body" | "headers";

interface ResponseViewerProps {
    response: RestResponse | null;
    responseTime: number;
    executing: boolean;
}

interface ResponseViewerState {
    activeTab: ResponseTab;
    languageOverride: string | null;
    headersView: "table" | "json";
}

const defaultResponseViewerState: ResponseViewerState = {
    activeTab: "body",
    languageOverride: null,
    headersView: "table",
};

class ResponseViewerModel extends TComponentModel<ResponseViewerState, ResponseViewerProps> {
    setActiveTab = (activeTab: ResponseTab) => {
        this.state.update((s) => { s.activeTab = activeTab; });
    };

    setLanguageOverride = (languageOverride: string | null) => {
        this.state.update((s) => { s.languageOverride = languageOverride; });
    };

    setHeadersView = (headersView: "table" | "json") => {
        this.state.update((s) => { s.headersView = headersView; });
    };

    init() {
        this.effect(() => {
            queueMicrotask(() => {
                if (this.isLive) this.setLanguageOverride(null);
            });
        }, () => [this.props.response]);
    }
}

export function ResponseViewer(props: ResponseViewerProps) {
    const { response, responseTime, executing } = props;
    const model = useComponentModel(props, ResponseViewerModel, defaultResponseViewerState);
    const { activeTab, languageOverride, headersView } = model.state.use();

    const headersAsJson = useMemo(() => {
        if (!response) return "";
        const obj: Record<string, string> = {};
        for (const h of response.headers) obj[h.key] = h.value;
        return JSON.stringify(obj, null, 2);
    }, [response]);

    const detectedLanguage = useMemo(() => {
        return response ? detectLanguageFromHeaders(response.headers) : "plaintext";
    }, [response]);

    const language = languageOverride ?? detectedLanguage;

    const formattedBody = useMemo(
        () => response ? formatBody(response.body, language) : "",
        [response, language],
    );

    const formattedBodyHostRef = useRef<MonacoEditorHostView | null>(null);
    const headersJsonHostRef = useRef<MonacoEditorHostView | null>(null);

    useEffect(() => {
        if (executing || !response || activeTab !== "body" || response.isBinary) {
            formattedBodyHostRef.current = null;
            return;
        }

        formattedBodyHostRef.current?.setValue(formattedBody);
    }, [activeTab, executing, formattedBody, response]);

    useEffect(() => {
        if (executing || !response || activeTab !== "headers" || headersView !== "json") {
            headersJsonHostRef.current = null;
            return;
        }

        headersJsonHostRef.current?.setValue(headersAsJson);
    }, [activeTab, executing, headersAsJson, headersView, response]);

    const bodySize = useMemo(() => {
        if (!response) return "";
        if (response.isBinary) {
            return formatSize(Math.floor(response.body.length * 3 / 4));
        }
        return formatSize(new Blob([response.body]).size);
    }, [response]);

    const handleSaveBinary = useCallback(async () => {
        if (!response?.isBinary) return;
        const ext = getExtensionFromContentType(response.contentType || "");
        const savePath = await app.fs.showSaveDialog({
            defaultPath: `response${ext}`,
        });
        if (savePath) {
            const buf = Buffer.from(response.body, "base64");
            await app.fs.writeBinary(savePath, buf);
        }
    }, [response]);

    const handleOpenImage = useCallback(() => {
        if (!response?.isBinary) return;
        const buf = Buffer.from(response.body, "base64");
        const blob = new Blob([buf], { type: response.contentType || "image/png" });
        const url = URL.createObjectURL(blob);
        pagesModel.openImageInNewTab(url);
    }, [response]);

    const isImage = response?.isBinary && (response.contentType || "").startsWith("image/");

    const blobUrl = useMemo(() => {
        if (!isImage || !response?.isBinary) return "";
        const buf = Buffer.from(response.body, "base64");
        const blob = new Blob([buf], { type: response.contentType || "image/png" });
        return URL.createObjectURL(blob);
    }, [isImage, response]);

    // Build file icons with each render because menu rows append their Node values directly;
    // caching this array would reuse single-use nodes when the menu is reopened or updated.
    const languageMenuItems: MenuItem[] = RESPONSE_LANGUAGES.map((l) => ({
        label: l,
        icon: createFileTypeIconElement({ language: l, width: 16, height: 16 }),
        selected: l === language,
        onClick: () => model.setLanguageOverride(l),
    }));

    const handleOpenInTab = useCallback(() => {
        if (!response) return;
        const body = formatBody(response.body, language);
        app.pages.addEditorPage("monaco", language, "Response", body);
    }, [response, language]);

    const handleCopyHeaders = useCallback(async () => {
        if (!response) return;
        const obj: Record<string, string> = {};
        for (const h of response.headers) obj[h.key] = h.value;
        navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
        return new Promise((resolve) => setTimeout(resolve, 200));
    }, [response]);

    void responseTime;

    if (executing) {
        return (
            <Panel name="response-viewer" direction="column" flex={1} overflow="hidden">
                <Panel paddingX="md" paddingY="sm">
                    <Text color="light" italic>Sending request...</Text>
                </Panel>
            </Panel>
        );
    }

    if (!response) {
        return (
            <Panel name="response-viewer" direction="column" flex={1} overflow="hidden">
                <Panel paddingX="md" paddingY="sm">
                    <Text color="light" italic>Send a request to see the response.</Text>
                </Panel>
            </Panel>
        );
    }

    const tabItems = [
        { value: "body", label: `Body${bodySize ? ` (${bodySize})` : ""}` },
        { value: "headers", label: `Headers (${response.headers.length})` },
    ];

    const headersViewItems = [
        { value: "table", label: "Table" },
        { value: "json", label: "JSON" },
    ];

    return (
        <Panel name="response-viewer" direction="column" flex="1 1 0" overflow="hidden" minHeight={0}>
            <Panel
                name="response-tabs"
                direction="row"
                align="center"
                gap="xs"
                paddingX="sm"
                paddingY="xs"
                shrink={false}
            >
                <SegmentedControl
                    name="response-tab-select"
                    size="sm"
                    value={activeTab}
                    onChange={(v) => model.setActiveTab(v as ResponseTab)}
                    items={tabItems}
                />
                <Spacer />
                {activeTab === "body" && !response.isBinary && (
                    <>
                        <IconButton
                            name="response-open-in-tab"
                            size="sm"
                            icon="new-window"
                            title="Open in new tab"
                            onClick={handleOpenInTab}
                        />
                        <WithMenu items={languageMenuItems}>
                            {(setOpen) => (
                                <Button
                                    name="response-language"
                                    size="sm"
                                    variant="ghost"
                                    icon={createFileTypeIconElement({ language, width: 16, height: 16 })}
                                    title="Change response language"
                                    onClick={(e) => setOpen(e.currentTarget)}
                                >
                                    {language}
                                </Button>
                            )}
                        </WithMenu>
                    </>
                )}
                {activeTab === "headers" && (
                    <>
                        <SegmentedControl
                            name="response-headers-view"
                            size="sm"
                            value={headersView}
                            onChange={(v) => model.setHeadersView(v as "table" | "json")}
                            items={headersViewItems}
                        />
                        <IconButton
                            name="response-copy-headers"
                            size="sm"
                            icon="copy"
                            title="Copy headers as JSON"
                            onClick={handleCopyHeaders}
                        />
                    </>
                )}
            </Panel>
            <Panel
                name="response-tab-body"
                direction="column"
                flex="1 1 0"
                overflowX="hidden"
                overflowY="auto"
                minHeight={0}
            >
                {activeTab === "body" ? (
                    response.isBinary ? (
                        <Panel
                            name="response-binary"
                            direction="column"
                            align="center"
                            justify="center"
                            gap="md"
                            padding="lg"
                            flex={1}
                            overflowY="auto"
                        >
                            <Text color="light" italic align="center">
                                Binary response — {response.contentType || "unknown type"} ({bodySize})
                            </Text>
                            {isImage && blobUrl && (
                                <img
                                    src={blobUrl}
                                    alt="Response"
                                    style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain" }}
                                />
                            )}
                            <Panel name="response-binary-actions" direction="row" gap="sm">
                                <Button icon="save" onClick={handleSaveBinary}>Save to File</Button>
                                {isImage && (
                                    <Button icon="new-window" onClick={handleOpenImage}>
                                        Open in Image Viewer
                                    </Button>
                                )}
                            </Panel>
                        </Panel>
                    ) : (
                        <MonacoEditorHost
                            initialValue={formattedBody}
                            language={language}
                            options={EDITOR_OPTIONS}
                            onMount={(host) => { formattedBodyHostRef.current = host; }}
                        />
                    )
                ) : headersView === "table" ? (
                    <Panel
                        name="response-headers-list"
                        direction="column"
                        paddingX="md"
                        paddingY="xs"
                        gap="xs"
                    >
                        {response.headers.map((h, i) => (
                            <Panel key={i} direction="row" gap="md" align="start" shrink={false}>
                                <Text color="light" size="sm" nowrap>{h.key}</Text>
                                <Panel flex="1 1 0" minWidth={0} wordBreak="break-all">
                                    <Text color="default" size="sm">{h.value}</Text>
                                </Panel>
                            </Panel>
                        ))}
                    </Panel>
                ) : (
                    <MonacoEditorHost
                        initialValue={headersAsJson}
                        language="json"
                        options={{ ...EDITOR_OPTIONS, readOnly: true }}
                        onMount={(host) => { headersJsonHostRef.current = host; }}
                    />
                )}
            </Panel>
        </Panel>
    );
}

/** Get response body size string for display in parent panel header. */
export function getResponseSize(response: RestResponse | null): string {
    if (!response) return "";
    return formatSize(new Blob([response.body]).size);
}
