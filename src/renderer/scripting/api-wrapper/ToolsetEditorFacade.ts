import type { IToolsetEditor } from "../../api/types/toolset-editor";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { fpNormalizeForCompare } from "../../core/utils/file-path";
import { toolsTrust } from "../../api/tools/tools-trust";
import { registeredTools } from "../../api/tools/registered-tools";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { ToolsetEditorModel } from "../../editors/toolset/ToolsetEditorModel";

const TOOLSET_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "toolset-refresh", purpose: "Locate the control that refreshes the registry and this toolset's manifest." },
    { name: "toolset-open-folder", purpose: "Locate the control that opens the toolset root in an Explorer page." },
    { name: "toolset-open-log", purpose: "Locate the control that opens the tool execution log when one exists." },
];

const TOOLSET_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete editor id: toolset-view." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "toolsetRoot", kind: "property", summary: "The absolute root of this one toolset, or undefined before it is resolved." },
    { name: "toolsetName", kind: "property", summary: "The authoritative toolset name used to reach tools.toolsets[toolsetName], or undefined when no root is resolved." },
    { name: "registered", kind: "property", summary: "Whether this root is registered, or undefined when no root is resolved." },
    { name: "valid", kind: "property", summary: "Whether the model-resolved manifest is valid, or undefined before resolution." },
    { name: "errors", kind: "property", summary: "Copied manifest validation errors, including an empty array for a valid manifest." },
    { name: "refresh", kind: "method", signature: "refresh(): Promise<void>", summary: "Refresh the whole registered-tool registry and this toolset's manifest." },
    { name: "openFolder", kind: "method", signature: "openFolder(): Promise<void>", summary: "Open this toolset root in an Explorer page.", caution: "navigates to another page" },
    { name: "openLog", kind: "method", signature: "openLog(): Promise<void>", summary: "Open this toolset's execution log when one exists.", caution: "opens another page" },
];

const TOOLSET_HELP = `Access via pages[i].editor after narrowing editor.id to "toolset-view".
This facade identifies exactly one toolset by toolsetRoot, the absolute root used by its
persephone-toolset:// page identity. toolsetName is the canonical lookup name when the registry
has a record; use tools.toolsets[toolsetName] for the manifest and declared-tool projection,
including invalid and shadowed records. The facade deliberately does not duplicate manifest or
tool data, command text, or a tools registry projection.

registered is read-only status from the existing tools trust state. No facade action registers,
trusts, or untrusts a toolset, and no member accepts or returns a trust decision or secret.
Environment values from .env never appear; env is names only in the canonical tools projection.
The existing RegisterToolsetDialog consent path through dialogs[i] remains the only registration
path.

refresh(), openFolder(), and openLog() use the model-owned paths and expose no secret argument.
elements is the curated, page-scoped list of three stable controls; repeated matches use
{ all: true }. Sidebar, overlay, menu, pinned-rail, and tree controls are not part of this editor
list. Explorer/sidebar tool trees belong to page.panels; the canonical tools data path remains
tools.toolsets[toolsetName].`;

export class ToolsetEditorFacade implements IAiVisible, IToolsetEditor {
    constructor(
        private readonly editor: ToolsetEditorModel,
        readonly id: "toolset-view",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(TOOLSET_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "ToolsetEditor",
            summary: "Model-backed toolset identity, validation status, actions, and curated controls.",
            members: [...TOOLSET_MEMBERS, ...elements.members],
            help: TOOLSET_HELP,
            elements: TOOLSET_ELEMENTS,
            provide: elements.provide,
            summarize: () => this.aiSummary(),
        };
    }

    get toolsetRoot(): string | undefined {
        return this.editor.state.get().toolsetRoot;
    }

    get toolsetName(): string | undefined {
        const state = this.editor.state.get();
        if (!state.toolsetRoot) return undefined;
        return canonicalToolsetName(state.toolsetRoot) ?? (state.title || undefined);
    }

    get registered(): boolean | undefined {
        const root = this.toolsetRoot;
        return root ? toolsTrust.isTrusted(root) : undefined;
    }

    get valid(): boolean | undefined {
        return this.toolsetRoot ? this.editor.state.get().valid : undefined;
    }

    get errors(): readonly string[] | undefined {
        const state = this.editor.state.get();
        return state.toolsetRoot && state.errors !== undefined ? [...state.errors] : undefined;
    }

    refresh(): Promise<void> {
        return this.editor.refresh();
    }

    openFolder(): Promise<void> {
        return this.editor.openFolder();
    }

    openLog(): Promise<void> {
        return this.editor.openLog();
    }

    private aiSummary(): Record<string, unknown> {
        const summary: Record<string, unknown> = {
            kind: "ToolsetEditor",
            id: this.id,
            name: this.name,
        };
        if (this.toolsetRoot !== undefined) summary.toolsetRoot = this.toolsetRoot;
        if (this.toolsetName !== undefined) summary.toolsetName = this.toolsetName;
        if (this.registered !== undefined) summary.registered = this.registered;
        if (this.valid !== undefined) summary.valid = this.valid;
        if (this.errors !== undefined) summary.errors = this.errors;
        return summary;
    }
}

function canonicalToolsetName(root: string): string | undefined {
    if (!registeredTools.isInitialized) return undefined;
    const rootKey = fpNormalizeForCompare(root);
    return registeredTools.toolsets.find((toolset) => fpNormalizeForCompare(toolset.root) === rootKey)?.name;
}
