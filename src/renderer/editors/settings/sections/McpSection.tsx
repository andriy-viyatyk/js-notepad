import { settings } from "../../../api/settings";
import { useComponentModel } from "../../../core/state/model";
import { ColorizedCode } from "../../shared/ColorizedCode";
import { Button } from "../../../uikit/Button";
import { Checkbox } from "../../../uikit/Checkbox";
import { Dot } from "../../../uikit/Dot";
import { Input } from "../../../uikit/Input";
import { Panel } from "../../../uikit/Panel";
import { Text } from "../../../uikit/Text";
import color from "../../../theme/color";
import { McpSectionModel, defaultMcpSectionState } from "./McpSectionModel";

const codeStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: "monospace",
    lineHeight: 1.5,
    padding: "8px 12px",
    backgroundColor: color.background.dark,
    borderRadius: 4,
    border: `1px solid ${color.border.default}`,
    color: color.text.default,
    overflow: "auto",
    margin: 0,
};

const urlStyle: React.CSSProperties = {
    fontSize: 12, fontFamily: "monospace", padding: "4px 8px",
    backgroundColor: color.background.dark, borderRadius: 4,
    border: `1px solid ${color.border.default}`, color: color.text.default, userSelect: "all",
};

export function McpSection() {
    const mcpEnabled = settings.use("mcp.enabled");
    const mcpPort = settings.use("mcp.port");
    const browserToolsEnabled = settings.use("mcp.browser-tools.enabled");
    const mnemeEnabled = settings.use("mneme.enabled");
    const mnemePort = settings.use("mneme.port");
    const model = useComponentModel(
        { mcpEnabled, mcpPort, browserToolsEnabled, mnemeEnabled, mnemePort },
        McpSectionModel,
        defaultMcpSectionState,
    );
    const { status, mnemeStatus, portValue, mnemePortValue, copied } = model.state.use((state) => ({
        status: state.status,
        mnemeStatus: state.mnemeStatus,
        portValue: state.portValue,
        mnemePortValue: state.mnemePortValue,
        copied: state.copied,
    }));
    // Use IPv4 loopback because both servers bind it and IPv6-first localhost clients can stall.
    const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
    const mnemeUrl = `http://127.0.0.1:${mnemePort}/mcp`;
    const mcpServers: Record<string, { type: string; url: string }> = {
        persephone: { type: "http", url: mcpUrl },
    };
    if (mnemeEnabled) mcpServers.mneme = { type: "http", url: mnemeUrl };
    const configJson = JSON.stringify({ mcpServers }, null, 2);

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">MCP Server</Text></Panel>
            <Panel paddingBottom="md"><Text color="light" size="xs">AI agents (Claude, ChatGPT, Gemini) can control Persephone via MCP</Text></Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Checkbox checked={mcpEnabled} onChange={model.handleToggle}>Enable MCP server</Checkbox>
            </Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Checkbox checked={!!browserToolsEnabled} disabled={!!mcpEnabled} onChange={model.handleBrowserToolsToggle}>Enable browser interaction</Checkbox>
            </Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Text size="sm">Port:</Text>
                <Input size="sm" width={72} type="text" value={portValue} onChange={model.setPortValue} onBlur={model.handlePortBlur} onKeyDown={model.handlePortKeyDown} disabled={mcpEnabled} />
            </Panel>
            {mcpEnabled && status && <>
                <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                    <Dot size="sm" color={status.running ? "success" : "neutral"} />
                    <Text size="sm" color="light">{status.running ? `Running${status.clientCount > 0 ? ` — ${status.clientCount} client${status.clientCount !== 1 ? "s" : ""} connected` : ""}` : "Stopped"}</Text>
                </Panel>
                <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                    <span style={urlStyle}>{status.url}</span><Button variant="default" size="sm" background="light" onClick={() => model.handleCopy(status.url, "url")}>{copied === "url" ? "Copied!" : "Copy URL"}</Button>
                </Panel>
            </>}
            <Panel paddingTop="sm" paddingBottom="lg"><Text bold size="sm">Mneme (vector memory)</Text></Panel>
            <Panel paddingBottom="md"><Text color="light" size="xs">Local knowledge-base / memory service. Persephone launches it as a sidecar and serves it over loopback HTTP.</Text></Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="lg"><Checkbox checked={mnemeEnabled} onChange={model.handleMnemeToggle}>Enable Mneme</Checkbox></Panel>
            <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                <Text size="sm">Port:</Text><Input size="sm" width={72} type="text" value={mnemePortValue} onChange={model.setMnemePortValue} onBlur={model.handleMnemePortBlur} onKeyDown={model.handlePortKeyDown} disabled={mnemeEnabled} />
            </Panel>
            {mnemeEnabled && mnemeStatus && <>
                <Panel direction="row" align="center" gap="md" paddingBottom="lg"><Dot size="sm" color={mnemeStatus.running ? "success" : "neutral"} /><Text size="sm" color="light">{mnemeStatus.running ? "Running" : "Stopped"}</Text></Panel>
                <Panel direction="row" align="center" gap="md" paddingBottom="lg"><span style={urlStyle}>{mnemeStatus.url}</span><Button variant="default" size="sm" background="light" onClick={() => model.handleCopy(mnemeStatus.url, "mneme-url")}>{copied === "mneme-url" ? "Copied!" : "Copy URL"}</Button></Panel>
            </>}
            <Panel paddingTop="sm" paddingBottom="md"><Text color="light" size="xs">AI client configuration:</Text></Panel>
            <pre style={codeStyle}><ColorizedCode code={configJson} language="json" /></pre>
            <Panel paddingTop="md"><Button variant="default" size="sm" background="light" onClick={() => model.handleCopy(configJson, "config")}>{copied === "config" ? "Copied!" : "Copy"}</Button></Panel>
        </>
    );
}
