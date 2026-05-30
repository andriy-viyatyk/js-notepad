// =============================================================================
// ClaudeSession — conversation helper wrapping @anthropic-ai/sdk
// =============================================================================

// Lazy-loaded SDK — only loaded when ClaudeSession is instantiated.
// Uses require() to bypass Vite bundling (same pattern as McpConnectionManager).
/* eslint-disable @typescript-eslint/no-require-imports */
let Anthropic: any;
function loadSdk(): void {
    if (Anthropic) return;
    Anthropic = require("@anthropic-ai/sdk").default;
}
/* eslint-enable @typescript-eslint/no-require-imports */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ClaudeToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    tool: (input: any) => any | Promise<any>;
}

export type ClaudeSessionEvent =
    | "message"
    | "user-message"
    | "assistant-message"
    | "tool-call"
    | "tool-result"
    | "error";

export interface ClaudeSessionConfig {
    apiKey: string;
    modelId?: string;
    maxTokens?: number;
    temperature?: number;
    maxToolRounds?: number;
    system?: string;
    stopSequences?: string[];
}

export interface ClaudeSendOptions {
    toolChoice?: "auto" | "any" | string;
}

type EventCallback = (...args: any[]) => void;

// -----------------------------------------------------------------------------
// ClaudeSession
// -----------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOOL_ROUNDS = 20;

export class ClaudeSession {
    private client: any;
    private _messages: Array<{ role: string; content: any }> = [];
    private _systemMessage: string | undefined;
    private _tools: ClaudeToolDef[] = [];
    private _listeners = new Map<ClaudeSessionEvent, Set<EventCallback>>();

    readonly modelId: string;
    readonly maxTokens: number;
    readonly temperature: number | undefined;
    readonly maxToolRounds: number;
    readonly stopSequences: string[] | undefined;

    constructor(config: ClaudeSessionConfig) {
        loadSdk();
        if (!config.apiKey) {
            throw new Error("Anthropic API key is required. Pass apiKey in the constructor config.");
        }
        this.client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });
        this.modelId = config.modelId || DEFAULT_MODEL;
        this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
        this.temperature = config.temperature;
        this.maxToolRounds = config.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
        this.stopSequences = config.stopSequences;
        if (config.system) this._systemMessage = config.system;
    }

    // -------------------------------------------------------------------------
    // Messages
    // -------------------------------------------------------------------------

    get messages(): Array<{ role: string; content: any }> {
        return [...this._messages];
    }

    systemMessage(text: string): void {
        this._systemMessage = text;
    }

    userMessage(text: string): void {
        this._messages.push({ role: "user", content: text });
        this.emit("user-message", text);
        this.emit("message", { role: "user", content: text });
    }

    // -------------------------------------------------------------------------
    // Tools
    // -------------------------------------------------------------------------

    set tools(defs: ClaudeToolDef[]) { this._tools = defs; }
    get tools(): ClaudeToolDef[] { return this._tools; }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    on(event: ClaudeSessionEvent, callback: EventCallback): () => void {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(callback);
        return () => { this._listeners.get(event)?.delete(callback); };
    }

    private emit(event: ClaudeSessionEvent, ...args: any[]): void {
        this._listeners.get(event)?.forEach(cb => {
            try { cb(...args); } catch (e) { console.error("ClaudeSession event error:", e); }
        });
    }

    // -------------------------------------------------------------------------
    // Send
    // -------------------------------------------------------------------------

    async send(options?: ClaudeSendOptions): Promise<string> {
        const apiTools = this._tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
        }));

        const reqOptions: any = {
            model: this.modelId,
            max_tokens: this.maxTokens,
            messages: this._messages,
        };
        if (this._systemMessage) reqOptions.system = this._systemMessage;
        if (this.temperature !== undefined) reqOptions.temperature = this.temperature;
        if (this.stopSequences?.length) reqOptions.stop_sequences = this.stopSequences;
        if (apiTools.length > 0) {
            reqOptions.tools = apiTools;
            if (options?.toolChoice) {
                reqOptions.tool_choice = resolveToolChoice(options.toolChoice);
            }
        }

        let rounds = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const response = await this.client.messages.create(reqOptions);

            this._messages.push({ role: "assistant", content: response.content });
            this.emit("assistant-message", response);
            this.emit("message", { role: "assistant", content: response.content });

            if (response.stop_reason !== "tool_use") {
                const textBlocks = response.content.filter((b: any) => b.type === "text");
                return textBlocks.map((b: any) => b.text).join("");
            }

            // Safety limit
            rounds++;
            if (rounds >= this.maxToolRounds) {
                const textBlocks = response.content.filter((b: any) => b.type === "text");
                const text = textBlocks.map((b: any) => b.text).join("");
                this.emit("error", new Error(`Max tool rounds (${this.maxToolRounds}) reached`));
                return text;
            }

            // Execute tool calls
            const toolResults: any[] = [];
            for (const block of response.content) {
                if (block.type !== "tool_use") continue;

                const toolDef = this._tools.find(t => t.name === block.name);
                this.emit("tool-call", block.name, block.input);

                let result: any;
                let isError = false;
                try {
                    if (toolDef) {
                        result = await toolDef.tool(block.input);
                    } else {
                        result = `Unknown tool: ${block.name}`;
                        isError = true;
                    }
                } catch (err: any) {
                    result = err.message || String(err);
                    isError = true;
                }

                const resultStr = typeof result === "string" ? result : JSON.stringify(result);
                this.emit("tool-result", block.name, block.input, resultStr, isError);

                toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: resultStr,
                    ...(isError ? { is_error: true } : {}),
                });
            }

            this._messages.push({ role: "user", content: toolResults });
            reqOptions.messages = this._messages;
        }
    }

    // -------------------------------------------------------------------------
    // Convenience
    // -------------------------------------------------------------------------

    clear(): void {
        this._messages = [];
    }

    get lastResponse(): string | undefined {
        for (let i = this._messages.length - 1; i >= 0; i--) {
            const msg = this._messages[i];
            if (msg.role === "assistant" && Array.isArray(msg.content)) {
                const text = msg.content
                    .filter((b: any) => b.type === "text")
                    .map((b: any) => b.text)
                    .join("");
                if (text) return text;
            }
        }
        return undefined;
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function resolveToolChoice(choice: string): { type: string; name?: string } {
    if (choice === "auto") return { type: "auto" };
    if (choice === "any") return { type: "any" };
    return { type: "tool", name: choice };
}
