import { pagesModel } from "../../api/pages";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { toolsTrust } from "../../api/tools/tools-trust";
import { registeredTools } from "../../api/tools/registered-tools";
import { type ToolDef, type ToolsManifest } from "../../api/tools/tools-manifest";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement, applyTextAttributes, resolveTextAttributes } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { createIconElement } from "../../uikit/shared/slots";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { ToolsetEditorState, ToolsetEditorModel } from "./ToolsetEditorModel";

interface ToolsetProjection {
    toolsetRoot?: string;
    manifest?: ToolsManifest | null;
    valid?: boolean;
    errors?: string[];
    title: string;
}

function selectToolsetState(state: ToolsetEditorState): ToolsetProjection {
    return {
        toolsetRoot: state.toolsetRoot,
        manifest: state.manifest,
        valid: state.valid,
        errors: state.errors,
        title: state.title,
    };
}

type BranchKey = "errors" | "tools";

// Read-only view of a single registered toolset (EPIC-038 / US-805): manifest info + tool list,
// with Open-Folder / Open-Log actions. Pure UIKit composition (no Emotion — editors are app code,
// outside the `ui/` chrome exception).
export class ToolsetEditorView extends VanillaView<{ model: ToolsetEditorModel }> {
    private model: ToolsetEditorModel;
    private modelSubscription: (() => void) | undefined;
    private trustSubscription: (() => void) | undefined;
    private readonly branchSwap: SubtreeSwap<BranchKey>;
    private activeBranch: ErrorBranchView | ToolListBranchView | undefined;
    private activeBranchKey: BranchKey | undefined;
    private currentRoot = "";

    private readonly titleElement: HTMLSpanElement;
    private readonly statusElement: HTMLSpanElement;
    private readonly rootElement: HTMLSpanElement;
    private readonly descriptionElement: HTMLSpanElement;
    private readonly authorElement: HTMLSpanElement;
    private readonly spacer: SpacerView;
    private readonly refreshButton: IconButtonView;
    private readonly openFolderButton: ButtonView;
    private readonly openLogButton: ButtonView;

    public constructor(props: { model: ToolsetEditorModel }) {
        const root = createPanelElement({
            name: "toolset-editor",
            direction: "column",
            width: "100%",
            height: "100%",
            minHeight: 0,
        });
        super(props, root);
        this.model = props.model;

        this.titleElement = createTextElement("", { size: "lg", bold: true });
        this.statusElement = createTextElement("", { size: "sm", color: "light" });
        this.rootElement = createTextElement("", { size: "sm", color: "light" });
        this.descriptionElement = createTextElement("");
        this.authorElement = createTextElement("", { size: "sm", color: "light" });

        this.spacer = this.child(new SpacerView({}));
        this.refreshButton = this.child(new IconButtonView({
            name: "toolset-refresh",
            size: "sm",
            title: "Refresh",
            icon: "refresh",
            onClick: () => { void this.handleRefresh(); },
        }));
        const header = createPanelElement(
            { direction: "row", align: "center", gap: "sm" },
            [
                createIconElement("tools", { width: 20, height: 20 }),
                this.titleElement,
                this.statusElement,
                this.spacer.root,
                this.refreshButton.root,
            ],
        );

        this.openFolderButton = this.child(new ButtonView({
            name: "toolset-open-folder",
            icon: "folder-open",
            onClick: () => this.handleOpenFolder(),
            children: "Open Folder",
        }));
        this.openLogButton = this.child(new ButtonView({
            name: "toolset-open-log",
            icon: "log",
            onClick: () => { void this.handleOpenLog(); },
            children: "Open Log",
        }));

        const actions = createPanelElement(
            { direction: "row", gap: "sm" },
            [this.openFolderButton.root, this.openLogButton.root],
        );
        const branchHost = createPanelElement({ direction: "column", gap: "sm", align: "stretch" });
        this.branchSwap = new SubtreeSwap<BranchKey>(branchHost);

        const content = createPanelElement(
            {
                direction: "column",
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                align: "stretch",
                gap: "lg",
                paddingX: "xl",
                paddingY: "lg",
            },
            [
                header,
                this.rootElement,
                this.descriptionElement,
                this.authorElement,
                actions,
                branchHost,
            ],
        );
        this.root.append(content);
    }

    protected onMount(): void {
        this.spacer.mount();
        this.refreshButton.mount();
        this.openFolderButton.mount();
        this.openLogButton.mount();

        this.applyProjection(selectToolsetState(this.model.state.get()));
        this.modelSubscription = this.model.state.subscribe(
            (next) => this.applyProjection(next),
            selectToolsetState,
        );
        this.own(() => this.modelSubscription?.());

        this.trustSubscription = toolsTrust.subscribePaths(() => this.applyTrustState());
        this.applyTrustState();
        this.own(() => this.trustSubscription?.());
        this.own(() => this.branchSwap.dispose());
    }

    protected onUpdate(props: { model: ToolsetEditorModel }): void {
        const previousModel = this.model;
        if (previousModel === props.model) return;

        this.modelSubscription?.();
        this.model = props.model;
        this.applyProjection(selectToolsetState(props.model.state.get()));
        this.modelSubscription = props.model.state.subscribe(
            (next) => this.applyProjection(next),
            selectToolsetState,
        );
    }

    private applyProjection(projection: ToolsetProjection): void {
        this.currentRoot = projection.toolsetRoot ?? "";
        this.titleElement.textContent = projection.title;
        this.rootElement.textContent = this.currentRoot;
        this.descriptionElement.textContent = projection.manifest?.description ?? "";
        this.descriptionElement.hidden = !projection.manifest?.description;
        this.authorElement.textContent = projection.manifest?.author
            ? `Author: ${projection.manifest.author}`
            : "";
        this.authorElement.hidden = !projection.manifest?.author;
        this.applyTrustState();

        const errors = projection.errors ?? [];
        if (projection.valid !== true && errors.length > 0) {
            this.syncErrorBranch(errors.map((text, key) => ({ key, text })));
        } else {
            this.syncToolBranch(projection.manifest?.tools ?? []);
        }
    }

    private applyTrustState(): void {
        const registered = toolsTrust.isTrusted(this.currentRoot);
        applyTextAttributes(this.statusElement, resolveTextAttributes({
            size: "sm",
            color: registered ? "success" : "light",
        }));
        this.statusElement.textContent = registered ? "Registered" : "Not registered";
    }

    private syncErrorBranch(errors: ErrorEntry[]): void {
        if (this.activeBranchKey !== "errors") {
            this.branchSwap.set("errors", () => {
                const branch = new ErrorBranchView({ errors });
                branch.mount();
                this.activeBranch = branch;
                return branch;
            });
            this.activeBranchKey = "errors";
            return;
        }
        if (this.activeBranch instanceof ErrorBranchView) this.activeBranch.update({ errors });
    }

    private syncToolBranch(tools: ToolDef[]): void {
        if (this.activeBranchKey !== "tools") {
            this.branchSwap.set("tools", () => {
                const branch = new ToolListBranchView({ tools });
                branch.mount();
                this.activeBranch = branch;
                return branch;
            });
            this.activeBranchKey = "tools";
            return;
        }
        if (this.activeBranch instanceof ToolListBranchView) this.activeBranch.update({ tools });
    }

    private async handleRefresh(): Promise<void> {
        await registeredTools.refresh();
        await this.model.reload();
    }

    private handleOpenFolder(): void {
        if (this.currentRoot) void pagesModel.addEmptyPageWithNavPanel(this.currentRoot);
    }

    private async handleOpenLog(): Promise<void> {
        const logPath = this.model.getLogPath();
        if (!logPath) return;
        if (!(await fs.exists(logPath))) {
            ui.notify("No execution log yet — run a tool first.", "info");
            return;
        }
        void pagesModel.openFile(logPath);
    }
}

interface ErrorEntry { key: number; text: string; }
interface ErrorBranchProps { errors: ErrorEntry[]; }

class ErrorBranchView extends VanillaView<ErrorBranchProps> {
    private readonly errorList: KeyedList<ErrorEntry, number, HTMLSpanElement>;

    public constructor(props: ErrorBranchProps) {
        const errorListHost = createPanelElement({ direction: "column", gap: "xs", align: "stretch" });
        super(
            props,
            createPanelElement(
                { direction: "column", gap: "sm", align: "stretch" },
                [
                    createTextElement("This toolset's manifest has problems:", { color: "warning", bold: true }),
                    errorListHost,
                ],
            ),
        );
        this.errorList = new KeyedList(errorListHost, {
            keyOf: (error) => error.key,
            create: (error) => createTextElement(`• ${error.text}`, { size: "sm", color: "warning" }),
            update: (element, error) => { element.textContent = `• ${error.text}`; },
        });
    }

    protected onMount(): void {
        this.errorList.update(this.props.errors);
        this.own(() => this.errorList.dispose());
    }

    protected onUpdate(props: ErrorBranchProps): void {
        this.errorList.update(props.errors);
    }
}

interface ToolListBranchProps { tools: ToolDef[]; }

interface ToolItemElements {
    name: HTMLSpanElement;
    description: HTMLSpanElement;
    command: HTMLSpanElement;
    requirements: HTMLSpanElement;
    env: HTMLSpanElement;
    timeout: HTMLSpanElement;
}

class ToolListBranchView extends VanillaView<ToolListBranchProps> {
    private readonly titleElement: HTMLSpanElement;
    private readonly emptyElement: HTMLSpanElement;
    private readonly toolList: KeyedList<ToolDef, string, HTMLDivElement>;
    private readonly itemElements = new Map<HTMLDivElement, ToolItemElements>();

    public constructor(props: ToolListBranchProps) {
        const toolListHost = createPanelElement({ direction: "column", gap: "xs", align: "stretch" });
        const titleElement = createTextElement("", { bold: true });
        const emptyElement = createTextElement("This toolset declares no tools yet.", { size: "sm", color: "light" });
        super(
            props,
            createPanelElement(
                { direction: "column", gap: "sm", align: "stretch" },
                [titleElement, emptyElement, toolListHost],
            ),
        );
        this.titleElement = titleElement;
        this.emptyElement = emptyElement;
        this.toolList = new KeyedList(toolListHost, {
            keyOf: (tool) => tool.name,
            create: (tool) => this.createToolElement(tool),
            update: (element, tool) => this.updateToolElement(element, tool),
            remove: (element) => { this.itemElements.delete(element); },
        });
    }

    protected onMount(): void {
        this.updateTools(this.props.tools);
        this.own(() => this.toolList.dispose());
    }

    protected onUpdate(props: ToolListBranchProps): void {
        this.updateTools(props.tools);
    }

    private updateTools(tools: ToolDef[]): void {
        this.titleElement.textContent = `Tools (${tools.length})`;
        this.emptyElement.hidden = tools.length !== 0;
        this.toolList.update(tools);
    }

    private createToolElement(tool: ToolDef): HTMLDivElement {
        const elements: ToolItemElements = {
            name: createTextElement("", { bold: true }),
            description: createTextElement("", { size: "sm" }),
            command: createTextElement("", { size: "sm", color: "light" }),
            requirements: createTextElement("", { size: "sm", color: "light" }),
            env: createTextElement("", { size: "sm", color: "light" }),
            timeout: createTextElement("", { size: "sm", color: "light" }),
        };
        const element = createPanelElement(
            {
                direction: "column",
                gap: "xs",
                align: "stretch",
                border: true,
                borderColor: "default",
                rounded: "sm",
                padding: "md",
            },
            Object.values(elements),
        );
        this.itemElements.set(element, elements);
        this.updateToolElement(element, tool);
        return element;
    }

    private updateToolElement(element: HTMLDivElement, tool: ToolDef): void {
        const fields = this.itemElements.get(element);
        if (!fields) return;
        fields.name.textContent = tool.name;
        fields.description.textContent = tool.description ?? "";
        fields.command.textContent = `Command: ${tool.command}`;
        fields.requirements.textContent = tool.requirements ? `Requires: ${tool.requirements}` : "";
        fields.requirements.hidden = !tool.requirements;
        fields.env.textContent = tool.env?.length ? `Env: ${tool.env.join(", ")}` : "";
        fields.env.hidden = !tool.env?.length;
        fields.timeout.textContent = tool.timeoutMs != null ? `Timeout: ${tool.timeoutMs} ms` : "";
        fields.timeout.hidden = tool.timeoutMs == null;
    }
}
