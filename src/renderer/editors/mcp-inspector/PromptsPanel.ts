import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import { TagView } from "../../uikit/Tag/TagView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { McpInspectorEditorModel, McpPromptInfo, McpPromptMessage, McpPromptMessageContent, McpPromptsPanelState } from "./McpInspectorEditorModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Textarea/Textarea.css";
import "./mcp-inspector.css";

export interface PromptsPanelProps {
    model: McpInspectorEditorModel;
}

export class PromptsPanelView extends VanillaView<PromptsPanelProps> {
    private sidebarWidth = 220;
    private countTag: TagView | undefined;
    private list: KeyedList<McpPromptInfo, string, HTMLElement> | undefined;
    private detailSwap: SubtreeSwap<string> | undefined;
    private detailView: PromptDetailView | undefined;

    public constructor(props: PromptsPanelProps) {
        super(props, createPanelElement({ name: "mcp-prompts-panel", direction: "row", flex: true, overflow: "hidden" }));
    }

    protected onMount(): void {
        const sidebar = createPanelElement({ name: "mcp-prompts-sidebar", direction: "column", overflow: "hidden", shrink: false, width: this.sidebarWidth });
        const header = createPanelElement({ direction: "row", align: "center", justify: "between", paddingX: "lg", paddingY: "md", borderBottom: true, shrink: false });
        header.append(createTextElement("Prompts", { size: "xs", variant: "uppercased", color: "light", bold: true }));
        this.countTag = this.child(new TagView({ label: "0", size: "sm" }));
        header.append(this.countTag.root);
        this.countTag.mount();
        sidebar.append(header);

        const listHost = document.createElement("div");
        listHost.style.display = "flex";
        listHost.style.flexDirection = "column";
        listHost.style.flex = "1 1 auto";
        listHost.style.overflow = "auto";
        sidebar.append(listHost);
        this.list = new KeyedList(listHost, {
            keyOf: (prompt) => prompt.name,
            create: (prompt) => {
                const row = new PromptRowView({
                    prompt,
                    selected: prompt.name === this.props.model.promptsState.get().selectedPromptName,
                    onSelect: this.selectPrompt,
                });
                row.mount();
                return row.root;
            },
            update: (element, prompt) => {
                (element as PromptRowRoot).view?.update({
                    prompt,
                    selected: prompt.name === this.props.model.promptsState.get().selectedPromptName,
                    onSelect: this.selectPrompt,
                });
            },
            remove: (element) => (element as PromptRowRoot).view?.dispose(),
        });
        this.own(() => this.list.dispose());
        this.root.append(sidebar);

        const splitter = this.child(new SplitterView({
            name: "mcp-prompts-splitter",
            orientation: "vertical",
            value: this.sidebarWidth,
            onChange: this.setSidebarWidth,
            side: "before",
        }));
        this.root.append(splitter.root);
        splitter.mount();

        const detailHost = document.createElement("div");
        detailHost.style.display = "contents";
        this.root.append(detailHost);
        this.detailSwap = new SubtreeSwap(detailHost);
        this.own(() => this.detailSwap.dispose());

        this.bind(this.props.model.promptsState, (state) => state, this.sync);
    }

    protected onUpdate(_props: PromptsPanelProps): void {}

    private readonly sync = (state: McpPromptsPanelState): void => {
        this.countTag.update({ label: String(state.prompts.length), size: "sm" });
        this.list.update(state.prompts);
        const selected = state.prompts.find((prompt) => prompt.name === state.selectedPromptName);
        const key = selected ? `selected:${selected.name}` : "empty";
        if (this.detailView && this.detailViewKey === key) {
            this.detailView.update({ model: this.props.model, prompt: selected });
            return;
        }
        this.detailView = undefined;
        this.detailViewKey = key;
        let created: { mount: () => HTMLElement } | undefined;
        this.detailSwap.set(key, () => {
            if (!selected) { const view = new EmptyPromptView({ model: this.props.model }); created = view; return view; }
            const detail = this.detailView = new PromptDetailView({ model: this.props.model, prompt: selected });
            created = detail;
            return detail;
        });
        created?.mount();
    };

    private detailViewKey = "";

    private readonly selectPrompt = (name: string): void => {
        this.props.model.selectPrompt(name);
    };

    private readonly setSidebarWidth = (width: number): void => {
        this.sidebarWidth = width;
        const sidebar = this.root.querySelector<HTMLElement>('[data-name="mcp-prompts-sidebar"]');
        if (sidebar) sidebar.style.width = `${width}px`;
    };
}

class EmptyPromptView extends VanillaView<{ model: McpInspectorEditorModel }> {
    public constructor(props: { model: McpInspectorEditorModel }) { super(props, createPanelElement({ flex: true, align: "center", justify: "center", overflow: "auto" })); }
    protected onMount(): void { const state = this.props.model.promptsState.get(); this.root.append(createTextElement(state.prompts.length === 0 ? "No prompts available on this server." : "Select a prompt from the sidebar.", { size: "md", color: "light" })); }
}

interface PromptRowProps {
    prompt: McpPromptInfo;
    selected: boolean;
    onSelect: (name: string) => void;
}

type PromptRowRoot = HTMLElement & { view?: PromptRowView };

class PromptRowView extends VanillaView<PromptRowProps> {
    private nameText: HTMLSpanElement | undefined;
    private descriptionText: HTMLSpanElement | undefined;

    public constructor(props: PromptRowProps) {
        super(props, createPanelElement({ direction: "column", paddingX: "lg", paddingY: "sm", gap: "xs", borderBottom: true }));
        (this.root as PromptRowRoot).view = this;
    }

    protected onMount(): void {
        this.listen(this.root, "click", () => this.props.onSelect(this.props.prompt.name));
        this.nameText = createTextElement("", { size: "sm", color: "default", truncate: true });
        this.root.append(this.nameText);
        this.apply(this.props);
    }

    protected onUpdate(props: PromptRowProps): void {
        this.apply(props);
    }

    protected onDispose(): void {
        delete (this.root as PromptRowRoot).view;
    }

    private apply(props: PromptRowProps): void {
        this.nameText.textContent = props.prompt.name;
        if (props.prompt.description) {
            this.descriptionText ??= createTextElement("", { size: "xs", color: "light", truncate: true });
            this.descriptionText.textContent = props.prompt.description;
            if (!this.descriptionText.parentNode) this.root.append(this.descriptionText);
        } else {
            this.descriptionText?.remove();
        }
        if (props.selected) this.root.dataset.bg = "light";
        else delete this.root.dataset.bg;
        this.root.dataset.borderColor = props.selected ? "active" : "subtle";
    }
}

interface PromptDetailProps {
    model: McpInspectorEditorModel;
    prompt: McpPromptInfo | undefined;
}

class PromptDetailView extends VanillaView<PromptDetailProps> {
    private heading: HTMLSpanElement | undefined;
    private descriptionText: HTMLSpanElement | undefined;
    private argsHost: HTMLDivElement | undefined;
    private argsList: KeyedList<McpPromptInfo["arguments"][number], string, HTMLElement> | undefined;
    private button: ButtonView | undefined;
    
    private errorText: HTMLSpanElement | undefined;
    private messagesPanel: HTMLDivElement | undefined;
    private messagesList: KeyedList<IndexedMessage, number, HTMLElement> | undefined;

    public constructor(props: PromptDetailProps) {
        super(props, createPanelElement({ direction: "column", flex: true, overflow: "hidden" }));
    }

    protected onMount(): void {
        const content = createPanelElement({ direction: "column", overflow: "auto", padding: "xl", gap: "lg", shrink: false });
        this.heading = createTextElement("", { size: "lg", color: "default", bold: true });
        content.append(this.heading);
        this.argsHost = document.createElement("div");
        this.argsHost.style.display = "contents";
        content.append(this.argsHost);
        this.argsList = new KeyedList(this.argsHost, {
            keyOf: (argument) => argument.name,
            create: (argument) => {
                const view = new PromptArgView({ argument, model: this.props.model });
                view.mount();
                return view.root;
            },
            update: (element, argument) => (element as PromptArgRoot).view?.update({ argument, model: this.props.model }),
            remove: (element) => (element as PromptArgRoot).view?.dispose(),
        });
        this.own(() => this.argsList.dispose());
        this.button = this.child(new ButtonView({ name: "mcp-get-prompt", variant: "primary", size: "sm", onClick: this.getPrompt }));
        content.append(this.button.root);
        this.button.mount();
        this.errorText = createTextElement("", { size: "sm", color: "error" });
        content.append(this.errorText);
        this.root.append(content);
        this.sync(this.props);
    }

    protected onUpdate(props: PromptDetailProps): void {
        this.sync(props);
    }

    protected onDispose(): void {
        this.messagesList?.dispose();
        this.messagesList = undefined;
        this.messagesPanel?.remove();
    }

    private sync(props: PromptDetailProps): void {
        const state = props.model.promptsState.get();
        const prompt = props.prompt;
        if (!prompt) {
            this.root.replaceChildren(createPanelElement({ flex: true, align: "center", justify: "center" }, [
                createTextElement(state.prompts.length === 0 ? "No prompts available on this server." : "Select a prompt from the sidebar.", { size: "md", color: "light" }),
            ]));
            return;
        }
        this.heading.textContent = prompt.name;
        if (prompt.description) {
            this.descriptionText ??= createTextElement("", { size: "sm", color: "light" });
            this.descriptionText.textContent = prompt.description;
            if (!this.descriptionText.parentNode) this.root.firstElementChild?.insertBefore(this.descriptionText, this.argsHost);
        } else this.descriptionText?.remove();
        this.argsList.update(prompt.arguments);
        this.button.update({ name: "mcp-get-prompt", variant: "primary", size: "sm", onClick: this.getPrompt, disabled: state.getPromptLoading, children: state.getPromptLoading ? "Loading…" : "Get Prompt" });
        if (this.errorText) this.errorText.textContent = state.promptError;
        this.syncMessages(state.promptMessages);
    }

    private syncMessages(messages: McpPromptMessage[] | null): void {
        if (!messages || messages.length === 0) {
            this.messagesList?.dispose();
            this.messagesList = undefined;
            this.messagesPanel?.remove();
            this.messagesPanel = undefined;
            return;
        }
        if (!this.messagesPanel) {
            this.messagesPanel = createPanelElement({ direction: "column", flex: true, overflow: "auto", paddingX: "xl", paddingBottom: "xl", gap: "md", height: 0 });
            this.messagesPanel.append(createTextElement("Messages", { size: "xs", variant: "uppercased", color: "light", bold: true }));
            const messageHost = document.createElement("div");
            messageHost.style.display = "contents";
            this.messagesPanel.append(messageHost);
            this.messagesList = new KeyedList(messageHost, {
                keyOf: (entry) => entry.key,
                create: (entry) => {
                    const view = new MessageView({ message: entry.message });
                    view.mount();
                    return view.root;
                },
                update: (element, entry) => (element as MessageRoot).view?.update({ message: entry.message }),
                remove: (element) => (element as MessageRoot).view?.dispose(),
            });
            this.own(() => this.messagesList?.dispose());
            this.root.append(this.messagesPanel);
        }
        this.messagesList?.update(messages.map((message, key) => ({ message, key })));
    }

    private readonly getPrompt = (): void => { void this.props.model.getPrompt(); };
}

interface PromptArgProps { argument: McpPromptInfo["arguments"][number]; model: McpInspectorEditorModel; }
type PromptArgRoot = HTMLElement & { view?: PromptArgView };
class PromptArgView extends VanillaView<PromptArgProps> {
    private input: TextareaView | undefined;
    public constructor(props: PromptArgProps) { super(props, createPanelElement({ direction: "column", gap: "xs" })); (this.root as PromptArgRoot).view = this; }
    protected onMount(): void {
        const row = createPanelElement({ direction: "row", gap: "md", align: "center" }, [createTextElement(this.props.argument.name, { size: "sm", color: "default" })]);
        if (this.props.argument.required) row.append(createTextElement("required", { size: "xs", color: "error" }));
        this.input = this.child(new TextareaView({ value: "", onChange: (value) => this.props.model.setPromptArg(this.props.argument.name, value), placeholder: this.props.argument.description, readOnly: false, size: "sm" }));
        this.root.append(row, this.input.root);
        this.input.mount();
        if (this.props.argument.description) this.root.append(createTextElement(this.props.argument.description, { size: "xs", color: "light" }));
        this.sync(this.props);
    }
    protected onUpdate(props: PromptArgProps): void { this.sync(props); }
    protected onDispose(): void { delete (this.root as PromptArgRoot).view; }
    private sync(props: PromptArgProps): void { const state = props.model.promptsState.get(); this.input?.update({ value: state.promptArgs[props.argument.name] || "", onChange: (value) => props.model.setPromptArg(props.argument.name, value), placeholder: props.argument.description, readOnly: state.getPromptLoading, size: "sm" }); }
}

interface IndexedMessage { message: McpPromptMessage; key: number; }
interface MessageProps { message: McpPromptMessage; }
type MessageRoot = HTMLElement & { view?: MessageView };
class MessageView extends VanillaView<MessageProps> {
    private tag: TagView | undefined;
    private list: KeyedList<IndexedBlock, number, HTMLElement> | undefined;
    public constructor(props: MessageProps) { super(props, createPanelElement({ direction: "column", paddingY: "md", borderBottom: true, gap: "sm" })); (this.root as MessageRoot).view = this; }
    protected onMount(): void {
        this.tag = this.child(new TagView({ size: "sm", label: this.props.message.role.toUpperCase(), tone: this.props.message.role === "assistant" ? "success" : "default" }));
        this.root.append(createPanelElement({ direction: "row" }, [this.tag.root]));
        this.tag.mount();
        const host = document.createElement("div"); host.style.display = "contents"; this.root.append(host);
        this.list = new KeyedList(host, { keyOf: (entry) => entry.key, create: (entry) => { const view = new MessageContentBlockView({ block: entry.block }); view.mount(); return view.root; }, update: (element, entry) => (element as MessageBlockRoot).view?.update({ block: entry.block }), remove: (element) => (element as MessageBlockRoot).view?.dispose() });
        this.own(() => this.list.dispose());
        this.list.update(this.props.message.content.map((block, key) => ({ block, key })));
    }
    protected onUpdate(props: MessageProps): void {
        this.tag.update({ size: "sm", label: props.message.role.toUpperCase(), tone: props.message.role === "assistant" ? "success" : "default" });
        this.list.update(props.message.content.map((block, key) => ({ block, key })));
    }
    protected onDispose(): void { delete (this.root as MessageRoot).view; }
}

interface IndexedBlock { block: McpPromptMessageContent; key: number; }
interface MessageBlockProps { block: McpPromptMessageContent; }
type MessageBlockSignature =
    | { type: "text"; text: string }
    | { type: "image"; mimeType: string; data: string }
    | { type: "resource"; uri: string; text: string | null }
    | { type: "resource_link"; name: string; uri: string };

function messageBlockSignature(block: McpPromptMessageContent): MessageBlockSignature {
    switch (block.type) {
        case "text": {
            const { type, text } = block;
            return { type, text };
        }
        case "image": {
            const { type, mimeType, data } = block;
            return { type, mimeType, data };
        }
        case "resource": {
            const { type, resource: { uri, text } } = block;
            return { type, uri, text: text ?? null };
        }
        case "resource_link": {
            const { type, name, uri } = block;
            return { type, name, uri };
        }
    }
    const exhaustive: never = block;
    throw new Error(`Unhandled message content variant: ${exhaustive}`);
}

function sameMessageBlockSignature(
    a: MessageBlockSignature | undefined,
    b: MessageBlockSignature,
): boolean {
    if (!a || a.type !== b.type) return false;
    switch (a.type) {
        case "text": return b.type === "text" && a.text === b.text;
        case "image": return b.type === "image" && a.mimeType === b.mimeType && a.data === b.data;
        case "resource": return b.type === "resource" && a.uri === b.uri && a.text === b.text;
        case "resource_link": return b.type === "resource_link" && a.name === b.name && a.uri === b.uri;
    }
    const exhaustive: never = a;
    throw new Error(`Unhandled message signature variant: ${exhaustive}`);
}

type MessageBlockRoot = HTMLElement & { view?: MessageContentBlockView };
class MessageContentBlockView extends VanillaView<MessageBlockProps> {
    private blockSignature: MessageBlockSignature | undefined;
    public constructor(props: MessageBlockProps) { super(props, createPanelElement({})); this.root.dataset.type = "mcp-message-content"; (this.root as MessageBlockRoot).view = this; }
    protected onMount(): void {
        this.blockSignature = messageBlockSignature(this.props.block);
        this.renderBlock(this.props.block);
    }
    protected onUpdate(props: MessageBlockProps): void {
        const nextSignature = messageBlockSignature(props.block);
        if (sameMessageBlockSignature(this.blockSignature, nextSignature)) return;
        this.blockSignature = nextSignature;
        this.root.replaceChildren();
        this.renderBlock(props.block);
    }
    protected onDispose(): void { delete (this.root as MessageBlockRoot).view; }
    private renderBlock(block: McpPromptMessageContent): void {
        if (block.type === "text") this.root.append(createTextElement(block.text, { size: "sm", color: "default", preWrap: true }));
        else if (block.type === "image") { const panel = createPanelElement({ border: true, rounded: "md", overflow: "hidden" }); const image = document.createElement("img"); image.className = "mcp-content-image"; image.src = `data:${block.mimeType};base64,${block.data}`; image.alt = "Prompt content"; panel.append(image); this.root.append(panel); }
        else if (block.type === "resource") { const panel = createPanelElement({ direction: "column", gap: "xs" }, [createTextElement(block.resource.uri, { size: "xs", color: "primary" })]); if (block.resource.text) panel.append(createTextElement(block.resource.text, { size: "sm", color: "default", preWrap: true })); this.root.append(panel); }
        else if (block.type === "resource_link") this.root.append(createTextElement(block.name || block.uri, { size: "xs", color: "primary" }));
    }
}
