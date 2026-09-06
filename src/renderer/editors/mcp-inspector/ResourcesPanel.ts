import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import { TagView } from "../../uikit/Tag/TagView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { extractTemplateParams, type McpInspectorEditorModel, type McpResourceInfo, type McpResourceTemplateInfo, type McpResourcesPanelState } from "./McpInspectorEditorModel";
import { ResourceContentView } from "./ResourceContentView";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Textarea/Textarea.css";
import "./mcp-inspector.css";

export interface ResourcesPanelProps { model: McpInspectorEditorModel; }

type ResourceEntry =
    | { kind: "resource"; resource: McpResourceInfo }
    | { kind: "template"; template: McpResourceTemplateInfo }
    | { kind: "header" };

export class ResourcesPanelView extends VanillaView<ResourcesPanelProps> {
    private sidebarWidth = 260;
    private countTag: TagView | undefined;
    private list: KeyedList<ResourceEntry, string, HTMLElement> | undefined;
    private detailSwap: SubtreeSwap<string> | undefined;
    private detail: ResourceDetailView | undefined;
    private detailKey = "";

    public constructor(props: ResourcesPanelProps) {
        super(props, createPanelElement({ name: "mcp-resources-panel", direction: "row", flex: true, overflow: "hidden" }));
    }

    protected onMount(): void {
        const sidebar = createPanelElement({ name: "mcp-resources-sidebar", direction: "column", overflow: "hidden", shrink: false, width: this.sidebarWidth });
        const header = createPanelElement({ direction: "row", align: "center", justify: "between", paddingX: "lg", paddingY: "md", borderBottom: true, shrink: false });
        header.append(createTextElement("Resources", { size: "xs", variant: "uppercased", color: "light", bold: true }));
        this.countTag = this.child(new TagView({ label: "0", size: "sm" }));
        header.append(this.countTag.root);
        this.countTag.mount();
        sidebar.append(header);
        const listHost = document.createElement("div");
        listHost.style.display = "flex";
        listHost.style.flexDirection = "column";
        listHost.style.flex = "1 1 auto";
        listHost.style.overflow = "auto";
        listHost.tabIndex = 0;
        listHost.dataset.focusSelection = "";
        sidebar.append(listHost);
        this.list = new KeyedList(listHost, {
            keyOf: (entry) => entry.kind === "resource" ? `resource:${entry.resource.uri}` : entry.kind === "template" ? `template:${entry.template.uriTemplate}` : "header",
            create: (entry) => {
                const view = entry.kind === "header"
                    ? new ResourceHeaderView()
                    : new ResourceRowView({
                        resource: entry.kind === "resource" ? entry.resource : undefined,
                        template: entry.kind === "template" ? entry.template : undefined,
                        selectedResource: this.props.model.resourcesState.get().selectedUri,
                        selectedTemplate: this.props.model.resourcesState.get().selectedTemplateUri,
                        onSelectResource: this.selectResource,
                        onSelectTemplate: this.selectTemplate,
                    });
                view.mount();
                return view.root;
            },
            update: (element, entry) => {
                if (entry.kind === "header") return;
                (element as ResourceRowRoot).view?.update({
                    resource: entry.kind === "resource" ? entry.resource : undefined,
                    template: entry.kind === "template" ? entry.template : undefined,
                    selectedResource: this.props.model.resourcesState.get().selectedUri,
                    selectedTemplate: this.props.model.resourcesState.get().selectedTemplateUri,
                    onSelectResource: this.selectResource,
                    onSelectTemplate: this.selectTemplate,
                    });
            },
            remove: (element) => (element as ResourceRowRoot).view?.dispose(),
        });
        this.own(() => this.list.dispose());
        this.root.append(sidebar);

        const splitter = this.child(new SplitterView({ name: "mcp-resources-splitter", orientation: "vertical", value: this.sidebarWidth, onChange: this.setSidebarWidth, side: "before" }));
        this.root.append(splitter.root);
        splitter.mount();
        const detailHost = document.createElement("div"); detailHost.style.display = "contents"; this.root.append(detailHost);
        this.detailSwap = new SubtreeSwap(detailHost);
        this.own(() => this.detailSwap.dispose());
        this.bind(this.props.model.resourcesState, (state) => state, this.sync);
    }

    protected onUpdate(_props: ResourcesPanelProps): void {}

    private readonly sync = (state: McpResourcesPanelState): void => {
        this.countTag.update({ label: String(state.resources.length + state.templates.length), size: "sm" });
        const entries: ResourceEntry[] = state.resources.map((resource) => ({ kind: "resource", resource }));
        if (state.templates.length > 0) entries.push({ kind: "header" });
        entries.push(...state.templates.map((template) => ({ kind: "template" as const, template })));
        this.list.update(entries);
        const resource = state.resources.find((item) => item.uri === state.selectedUri);
        const template = state.templates.find((item) => item.uriTemplate === state.selectedTemplateUri);
        const key = resource ? `resource:${resource.uri}` : template ? `template:${template.uriTemplate}` : "empty";
        if (this.detail && this.detailKey === key) {
            this.detail.update({ model: this.props.model, resource, template });
            return;
        }
        this.detail = undefined;
        this.detailKey = key;
        let created: { mount: () => HTMLElement } | undefined;
        this.detailSwap.set(key, () => {
            if (!resource && !template) { const view = new EmptyResourceView({ model: this.props.model }); created = view; return view; }
            const view = this.detail = new ResourceDetailView({ model: this.props.model, resource, template });
            created = view;
            return view;
        });
        created?.mount();
    };

    private readonly selectResource = (uri: string): void => this.props.model.selectResource(uri);
    private readonly selectTemplate = (uriTemplate: string): void => this.props.model.selectTemplate(uriTemplate);
    private readonly setSidebarWidth = (width: number): void => {
        this.sidebarWidth = width;
        const sidebar = this.root.querySelector<HTMLElement>('[data-name="mcp-resources-sidebar"]');
        if (sidebar) sidebar.style.width = `${width}px`;
    };
}

class ResourceHeaderView extends VanillaView<Record<string, never>> {
    public constructor() { super({}, createPanelElement({ paddingX: "lg", paddingY: "sm", borderBottom: true, background: "dark", shrink: false }, [createTextElement("Templates", { size: "xs", variant: "uppercased", color: "light", bold: true })])); }
}

class EmptyResourceView extends VanillaView<{ model: McpInspectorEditorModel }> {
    public constructor(props: { model: McpInspectorEditorModel }) { super(props, createPanelElement({ flex: true, align: "center", justify: "center", overflow: "auto" })); }
    protected onMount(): void { const state = this.props.model.resourcesState.get(); this.root.append(createTextElement(state.resources.length + state.templates.length === 0 ? "No resources available on this server." : "Select a resource from the sidebar.", { size: "md", color: "light" })); }
}

interface ResourceRowProps {
    resource: McpResourceInfo | undefined;
    template: McpResourceTemplateInfo | undefined;
    selectedResource: string;
    selectedTemplate: string;
    onSelectResource: (uri: string) => void;
    onSelectTemplate: (uri: string) => void;
}
type ResourceRowRoot = HTMLElement & { view?: ResourceRowView };
class ResourceRowView extends VanillaView<ResourceRowProps> {
    private nameText: HTMLSpanElement | undefined;
    private uriText: HTMLSpanElement | undefined;
    public constructor(props: ResourceRowProps) { super(props, createPanelElement({ direction: "column", paddingX: "lg", paddingY: "sm", gap: "xs", borderBottom: true })); (this.root as ResourceRowRoot).view = this; }
    protected onMount(): void {
        this.listen(this.root, "click", () => this.props.resource ? this.props.onSelectResource(this.props.resource.uri) : this.props.template && this.props.onSelectTemplate(this.props.template.uriTemplate));
        this.nameText = createTextElement("", { size: "sm", color: "default", truncate: true });
        this.uriText = createTextElement("", { size: "xs", color: "primary", truncate: true });
        this.root.append(this.nameText, this.uriText);
        this.apply(this.props);
    }
    protected onUpdate(props: ResourceRowProps): void { this.apply(props); }
    protected onDispose(): void { delete (this.root as ResourceRowRoot).view; }
    private apply(props: ResourceRowProps): void {
        const item = props.resource || props.template;
        if (!item) return;
        this.nameText.textContent = item.name;
        this.uriText.textContent = props.resource ? props.resource.uri : (props.template as McpResourceTemplateInfo).uriTemplate;
        const selected = props.resource ? props.selectedResource === props.resource.uri : props.selectedTemplate === (props.template as McpResourceTemplateInfo).uriTemplate;
        if (selected) this.root.dataset.selected = ""; else delete this.root.dataset.selected;
        if (selected) this.root.dataset.bg = "light"; else delete this.root.dataset.bg;
    }
}

interface ResourceDetailProps { model: McpInspectorEditorModel; resource: McpResourceInfo | undefined; template: McpResourceTemplateInfo | undefined; }
class ResourceDetailView extends VanillaView<ResourceDetailProps> {
    private title: HTMLSpanElement | undefined;
    private uri: HTMLSpanElement | undefined;
    private description: HTMLSpanElement | undefined;
    private mimeTag: TagView | undefined;
    private button: ButtonView | undefined;
    private errorText: HTMLSpanElement | undefined;
    private argsList: KeyedList<string, string, HTMLElement> | undefined;
    private argsHost: HTMLDivElement | undefined;
    private contentSwap: SubtreeSwap<string> | undefined;
    private contentView: ResourceContentView | undefined;
    private contentKey = "";

    public constructor(props: ResourceDetailProps) { super(props, createPanelElement({ direction: "column", flex: true, overflow: "hidden" })); }
    protected onMount(): void {
        const top = createPanelElement({ direction: "column", padding: "xl", gap: "md", shrink: false });
        this.title = createTextElement("", { size: "lg", color: "default", bold: true });
        this.uri = createTextElement("", { size: "sm", color: "primary" });
        top.append(this.title, this.uri);
        this.button = this.child(new ButtonView({ name: "mcp-read-resource", variant: "primary", size: "sm", onClick: this.read }));
        top.append(this.button.root); this.button.mount();
        this.errorText = createTextElement("", { size: "sm", color: "error" }); top.append(this.errorText);
        this.root.append(top);
        const contentHost = document.createElement("div"); contentHost.style.display = "contents"; this.root.append(contentHost);
        this.contentSwap = new SubtreeSwap(contentHost); this.own(() => this.contentSwap.dispose());
        this.sync(this.props);
    }
    protected onUpdate(props: ResourceDetailProps): void { this.sync(props); }
    protected onDispose(): void { this.argsList?.dispose(); this.argsList = undefined; this.argsHost?.remove(); this.argsHost = undefined; this.contentView = undefined; }
    private sync(props: ResourceDetailProps): void {
        const state = props.model.resourcesState.get();
        const item = props.resource || props.template;
        if (!item) { this.root.replaceChildren(createPanelElement({ flex: true, align: "center", justify: "center" }, [createTextElement(state.resources.length + state.templates.length === 0 ? "No resources available on this server." : "Select a resource from the sidebar.", { size: "md", color: "light" })])); return; }
        this.title.textContent = item.name;
        this.uri.textContent = props.resource ? props.resource.uri : (props.template as McpResourceTemplateInfo).uriTemplate;
        this.syncOptional(item.description, item.mimeType);
        if (props.resource) {
            this.argsList?.dispose(); this.argsList = undefined; this.argsHost?.remove(); this.argsHost = undefined;
            this.button.update({ name: "mcp-read-resource", variant: "primary", size: "sm", onClick: this.read, disabled: state.readLoading, children: state.readLoading ? "Reading…" : "▶ Read Resource" });
            this.errorText.textContent = state.readError;
            this.syncContent(state.readContent);
        } else {
            const params = extractTemplateParams((props.template as McpResourceTemplateInfo).uriTemplate);
            if (!this.argsList) {
                const host = document.createElement("div"); host.style.display = "contents"; this.argsHost = host;
                const marker = this.uri.nextSibling; this.root.firstElementChild?.insertBefore(host, marker);
            this.argsList = new KeyedList(host, { keyOf: (param) => param, create: (param) => { const view = new TemplateArgView({ param, model: props.model }); view.mount(); return view.root; }, update: (element, param) => (element as TemplateArgRoot).view?.update({ param, model: props.model }), remove: (element) => (element as TemplateArgRoot).view?.dispose() });
            }
            this.argsList.update(params);
            this.button.update({ name: "mcp-read-resource", variant: "primary", size: "sm", onClick: this.readTemplate, disabled: state.templateReadLoading, children: state.templateReadLoading ? "Reading…" : "▶ Read Resource" });
            this.errorText.textContent = state.templateReadError;
            this.syncContent(state.templateReadContent);
        }
    }
    private syncOptional(description: string, mimeType: string): void {
        if (description) { this.description ??= createTextElement("", { size: "sm", color: "light" }); this.description.textContent = description; if (!this.description.parentNode) this.root.firstElementChild?.insertBefore(this.description, this.button.root); } else this.description?.remove();
        if (mimeType) { this.mimeTag ??= this.child(new TagView({ label: mimeType, size: "sm" })); if (!this.mimeTag.root.parentNode) this.root.firstElementChild?.insertBefore(this.mimeTag.root, this.button.root); this.mimeTag.update({ label: mimeType, size: "sm" }); this.mimeTag.mount(); } else if (this.mimeTag) { this.releaseChild(this.mimeTag); this.mimeTag = undefined; }
    }
    private syncContent(content: McpResourcesPanelState["readContent"]): void {
        if (!content) { this.contentView = undefined; this.contentSwap.clear(); return; }
        if (this.contentView && this.contentKey === "content") { this.contentView.update({ content }); return; }
        this.contentKey = "content";
        let created: ResourceContentView | undefined;
        this.contentSwap.set("content", () => { const view = this.contentView = new ResourceContentView({ content }); created = view; return view; });
        created?.mount();
    }
    private readonly read = (): void => { void this.props.model.readResource(); };
    private readonly readTemplate = (): void => { void this.props.model.readTemplateResource(); };
}

interface TemplateArgProps { param: string; model: McpInspectorEditorModel; }
type TemplateArgRoot = HTMLElement & { view?: TemplateArgView };
class TemplateArgView extends VanillaView<TemplateArgProps> {
    private input: TextareaView | undefined;
    public constructor(props: TemplateArgProps) { super(props, createPanelElement({ direction: "column", gap: "xs" })); (this.root as TemplateArgRoot).view = this; }
    protected onMount(): void { this.root.append(createTextElement(this.props.param, { size: "sm", color: "default" })); this.input = new TextareaView({ value: "", onChange: (value) => this.props.model.setTemplateArg(this.props.param, value), placeholder: this.props.param, size: "sm" }); this.root.append(this.input.root); this.input.mount(); this.sync(this.props); }
    protected onUpdate(props: TemplateArgProps): void { this.sync(props); }
    protected onDispose(): void { this.input.dispose(); delete (this.root as TemplateArgRoot).view; }
    private sync(props: TemplateArgProps): void { const state = props.model.resourcesState.get(); this.input?.update({ value: state.templateArgs[props.param] || "", onChange: (value) => props.model.setTemplateArg(props.param, value), placeholder: props.param, readOnly: state.templateReadLoading, size: "sm" }); }
}
