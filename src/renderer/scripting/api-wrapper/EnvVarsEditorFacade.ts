import type {
    IEnvVarSnapshot,
    IEnvVarsEditor,
    IEnvVarsStatus,
} from "../../api/types/env-vars-editor";
import type { EnvVarsEditor, EnvVarsEditorState } from "../../editors/env-vars/EnvVarsEditor";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const ENV_VARS_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "env-vars-grid", purpose: "Locate the editable variable grid for the selected namespace and profile." },
    { name: "env-vars-profile-tabs", purpose: "Select the visible environment profile." },
    { name: "env-vars-add-profile", purpose: "Add a profile by name in the selected namespace." },
    { name: "env-vars-delete-profile", purpose: "Delete the selected profile through the model-owned confirmation." },
    { name: "env-vars-namespace-row", purpose: "Select a namespace; this control occurs once per namespace row." },
    { name: "env-vars-add-namespace", purpose: "Add a namespace by name." },
    { name: "env-vars-delete-namespace", purpose: "Delete a namespace and its profiles through the model-owned confirmation." },
    { name: "env-vars-unlock", purpose: "Locate the unlock control for a locked encrypted environment variables file." },
];

const ENV_VARS_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id: env-vars-view." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "status", kind: "property", summary: "The attached model status: ok, locked, or error; undefined when detached." },
    { name: "encrypted", kind: "property", summary: "Whether the attached text host uses encryption, or undefined without that host." },
    { name: "unlocked", kind: "property", summary: "Whether the attached text host is decrypted; only meaningful when encrypted is true — an unencrypted file reports false because it was never locked, not because it is. Undefined without that host." },
    { name: "errorMessage", kind: "property", summary: "The actual parse error, or undefined when there is no parse error or the page is detached." },
    { name: "namespaces", kind: "property", summary: "Copied namespace names when parsed successfully, including an empty array for a valid empty file." },
    { name: "selectedNamespace", kind: "property", summary: "The selected namespace, or undefined for an empty selection or unavailable parsed data." },
    { name: "profiles", kind: "property", summary: "Copied profiles for the selected namespace when parsed successfully." },
    { name: "selectedProfile", kind: "property", summary: "The selected profile, or undefined for an empty selection or unavailable parsed data." },
    { name: "variables", kind: "property", summary: "Copied variable name/value snapshots when parsed successfully; values are not redacted." },
    { name: "selectNamespace", kind: "method", signature: "selectNamespace(namespace: string): void", summary: "Select an existing namespace." },
    { name: "selectProfile", kind: "method", signature: "selectProfile(profile: string): void", summary: "Select an existing profile in the selected namespace." },
    { name: "addNamespace", kind: "method", signature: "addNamespace(name: string): boolean", summary: "Add a namespace by name.", caution: "changes environment-variable structure" },
    { name: "deleteNamespace", kind: "method", signature: "deleteNamespace(name: string): Promise<void>", summary: "Delete a namespace after the model-owned confirmation.", caution: "deletes environment namespaces and profiles" },
    { name: "addProfile", kind: "method", signature: "addProfile(namespace: string, name: string): boolean", summary: "Add a profile in a namespace.", caution: "changes environment-variable structure" },
    { name: "deleteProfile", kind: "method", signature: "deleteProfile(namespace: string, profile: string): Promise<void>", summary: "Delete a profile after the model-owned confirmation.", caution: "deletes an environment profile and its variables" },
    { name: "showEncryptionDialog", kind: "method", signature: "showEncryptionDialog(message?: string): Promise<void>", summary: "Open the existing button/cancel-only encryption or unlock dialog without exposing its password.", caution: "opens a button/cancel-only password dialog and can decrypt the visible file" },
];

const ENV_VARS_HELP = `Access via pages[i].editor after narrowing editor.id to "env-vars-view".
This page-scoped facade exposes the eight curated controls env-vars-grid, env-vars-profile-tabs,
env-vars-add-profile, env-vars-delete-profile, env-vars-namespace-row, env-vars-add-namespace,
env-vars-delete-namespace, and env-vars-unlock. env-vars-namespace-row occurs once per namespace
row. elements resolves selectors below this page's [data-page-id] scope, and highlight activates
the page, waits for its layout, and highlights all matching controls. For a repeated selector,
count is the total number of matching rows and highlighted is the number of rings drawn by the
overlay; a selector does not identify a namespace index.

status is "ok" when parsed data is available, "locked" when an encrypted file is awaiting the
password dialog, and "error" when parsing failed and errorMessage contains the actual failure
text. Locked and error states expose undefined parsed collections, profiles, selections, and
variables. This differs from an attached valid page whose empty collections, profiles, or variable
records are real [] values. All returned arrays and variable records are fresh copies. After
unlock, values are returned in full because page.content already contains the plaintext JSON; this
facade makes no secret-redaction claim. encrypted and unlocked report the real attached text-host
booleans.

Selection and CRUD actions are model-backed. showEncryptionDialog(message?) awaits the existing
button/cancel-only dialog and accepts or returns no password. app.boardVars remains the separate
value-capable environment store and is not duplicated here. Detached actions fail before mutating
with an unavailable-host diagnostic.`;

export class EnvVarsEditorFacade implements IAiVisible, IEnvVarsEditor {
    constructor(
        private readonly editor: EnvVarsEditor,
        readonly id: "env-vars-view",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(ENV_VARS_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "EnvVarsEditor",
            summary: "Environment variables page facade with parsed state and model-backed actions.",
            members: [...ENV_VARS_MEMBERS, ...elements.members],
            help: ENV_VARS_HELP,
            elements: ENV_VARS_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "EnvVarsEditor",
                id: this.id,
                name: this.name,
                status: this.status,
                encrypted: this.encrypted,
                unlocked: this.unlocked,
                namespaceCount: this.namespaces?.length,
                profileCount: this.profiles?.length,
                variableCount: this.variables?.length,
                errorMessage: this.errorMessage,
            }),
        };
    }

    get status(): IEnvVarsStatus | undefined {
        return this.isAttached() ? this.editor.state.get().status : undefined;
    }

    get encrypted(): boolean | undefined {
        return this.isAttached() ? this.editor.host?.encrypted : undefined;
    }

    get unlocked(): boolean | undefined {
        return this.isAttached() ? this.editor.host?.decrypted : undefined;
    }

    get errorMessage(): string | undefined {
        return this.isAttached() ? this.editor.state.get().errorMessage : undefined;
    }

    get namespaces(): string[] | undefined {
        const state = this.parsedState();
        return state ? Object.keys(state.data).sort() : undefined;
    }

    get selectedNamespace(): string | undefined {
        const state = this.parsedState();
        return state?.selectedNamespace || undefined;
    }

    get profiles(): string[] | undefined {
        const state = this.parsedState();
        if (!state) return undefined;
        return Object.keys(state.data[state.selectedNamespace] ?? {});
    }

    get selectedProfile(): string | undefined {
        const state = this.parsedState();
        return state?.selectedProfile || undefined;
    }

    get variables(): IEnvVarSnapshot[] | undefined {
        const state = this.parsedState();
        if (!state) return undefined;
        const record = state.data[state.selectedNamespace]?.[state.selectedProfile] ?? {};
        return Object.entries(record).map(([name, value]) => ({ name, value }));
    }

    selectNamespace(namespace: string): void {
        this.requireNamespace(namespace);
        this.editor.setSelectedNamespace(namespace);
    }

    selectProfile(profile: string): void {
        this.requireAttached();
        const state = this.editor.state.get();
        if (state.status !== "ok" || !state.data[state.selectedNamespace]
            || !Object.prototype.hasOwnProperty.call(state.data[state.selectedNamespace], profile)) {
            throw new Error(`Environment variables profile unavailable: no profile with name ${JSON.stringify(profile)}.`);
        }
        this.editor.setSelectedProfile(profile);
    }

    addNamespace(name: string): boolean {
        this.requireAttached();
        return this.editor.addNamespace(name);
    }

    deleteNamespace(name: string): Promise<void> {
        this.requireAttached();
        return this.editor.deleteNamespace(name);
    }

    addProfile(namespace: string, name: string): boolean {
        this.requireAttached();
        return this.editor.addProfile(namespace, name);
    }

    deleteProfile(namespace: string, profile: string): Promise<void> {
        this.requireAttached();
        return this.editor.deleteProfile(namespace, profile);
    }

    async showEncryptionDialog(message?: string): Promise<void> {
        this.requireAttached();
        const host = this.editor.host;
        if (!host) throw new Error("Environment variables action unavailable: no page host attached.");
        if (!host.encrypted || host.decrypted) {
            throw new Error("Environment variables action unavailable: the file is not locked.");
        }
        await host.showEncryptionDialog(message);
    }

    private isAttached(): boolean {
        return this.editor.page !== null;
    }

    private requireAttached(): void {
        if (!this.isAttached()) {
            throw new Error("Environment variables action unavailable: no page host attached.");
        }
    }

    private requireNamespace(namespace: string): void {
        this.requireAttached();
        const state = this.editor.state.get();
        if (state.status !== "ok" || !Object.prototype.hasOwnProperty.call(state.data, namespace)) {
            throw new Error(`Environment variables namespace unavailable: no namespace with name ${JSON.stringify(namespace)}.`);
        }
    }

    private parsedState(): EnvVarsEditorState | undefined {
        if (!this.isAttached()) return undefined;
        const state = this.editor.state.get();
        return state.status === "ok" ? state : undefined;
    }
}
