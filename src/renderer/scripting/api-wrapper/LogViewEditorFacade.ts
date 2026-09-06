import type {
    ILogDialogResult,
    ILogEntrySnapshot,
    ILogPushEntry,
    ILogPushResult,
} from "../../api/types/log-view-editor";
import type { LogViewEditor } from "../../editors/log-view/LogViewEditor";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { DIALOG_SPECS, normalizeUiPushEntry } from "../../api/mcp/ui-push-validation";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";

const LOG_VIEW_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "log-clear", purpose: "Clear all Log View entries after confirmation." },
    { name: "log-toggle-timestamps", purpose: "Toggle timestamps in Log View entries." },
    { name: "log-grid-open-in-editor", purpose: "Open a displayed grid output in a dedicated editor." },
    { name: "log-markdown-open-in-editor", purpose: "Open a displayed Markdown output in a dedicated editor." },
    { name: "log-mermaid-open-in-editor", purpose: "Open a displayed Mermaid output in a dedicated editor." },
    { name: "log-mermaid-copy", purpose: "Copy a displayed Mermaid output from the Log View." },
    { name: "log-text-open-in-editor", purpose: "Open displayed text output in a dedicated editor." },
    { name: "log-radio-group", purpose: "Locate every mounted radio-button dialog group." },
    { name: "log-select", purpose: "Locate every mounted select dialog control." },
    { name: "log-text-input", purpose: "Locate every mounted text-input dialog control." },
    { name: "log-dialog-button", purpose: "Locate every mounted Log View dialog answer button." , selector: '[data-name^="log-button-"]' },
    { name: "log-dialog-checkbox", purpose: "Locate every mounted Log View dialog checkbox." , selector: '[data-name^="log-checkbox-"]' },
];

const LOG_VIEW_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete editor id: log-view." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "entries", kind: "property", summary: "Fresh copied Log View entry snapshots, or undefined without an attached host." },
    { name: "entryCount", kind: "property", summary: "The number of parsed entries, including zero, or undefined when detached." },
    { name: "error", kind: "property", summary: "The actual JSONL parse error, or undefined for a valid parse or detached editor." },
    { name: "showTimestamps", kind: "property", summary: "The real timestamp visibility boolean, or undefined when detached." },
    { name: "push", kind: "method", signature: "push(entries): ILogPushResult", summary: "Append or upsert Log View entries and return their ids immediately.", caution: "writes Log View JSONL content; inline dialogs wait for the user in the Log View page" },
    { name: "dialogResult", kind: "method", signature: "dialogResult(id: string): ILogDialogResult | undefined", summary: "Read a copied resolved or unresolved inline dialog entry." },
    { name: "clear", kind: "method", signature: "clear(): void", summary: "Remove all Log View entries.", caution: "deletes the page's JSONL content" },
    { name: "toggleTimestamps", kind: "method", signature: "toggleTimestamps(): void", summary: "Toggle persisted Log View timestamps.", caution: "changes persisted Log View settings" },
];

const LOG_VIEW_HELP = `Access via pages[i].editor after narrowing editor.id to "log-view", or read pages.logView for the fixed MCP Log View writer.
The facade is model-backed: entries are fresh deep-copied snapshots, actions do not inspect views, DOM controls, clipboard state, or live model arrays, and pages[i].content remains the raw JSONL content because Log View has a content host.
When attached, entries is [] for a valid empty Log View, entryCount is its real count including 0, error is the actual parse error or undefined for a valid parse, and showTimestamps is the real boolean including false. Detached host-backed state is undefined; false, 0, "", null, and [] are never used as absence markers.
push validates and normalizes the same entries as ui_push, returns immediately with fresh entryIds and dialogIds arrays (including [] for empty input), and supports string shorthand, log levels, text/Markdown/Mermaid, JSON/CSV grids, progress, and all six input dialog types. These exact dialog examples are:
${Object.values(DIALOG_SPECS).map((spec) => spec.usage).join("\n")}
Log View dialogs are inline entries, not renderer dialogs: they do not appear in dialogs[0], the agent cannot answer them, and the user must answer them in the Log View page. Read dialogResult(id): it is undefined only when that entry no longer exists, { id, status: "unresolved" } while button is undefined, or { id, status: "resolved", entry } once button exists, including falsy button and answer fields. Unresolved dialogs raise attention on call results until answered.
The curated elements are page-scoped. Prefix selectors log-dialog-button and log-dialog-checkbox locate control families; highlight passes highlightOptions: { all: true }. A highlight result's count is total matches and highlighted is the number actually ringed or capped by the overlay. Output open/copy controls are locations only because their handlers remain view-owned; use entries or push for model-backed data.
`;

export class LogViewEditorFacade implements IAiVisible {
    constructor(
        private readonly editor: LogViewEditor,
        readonly id: "log-view",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(LOG_VIEW_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId
                ? () => activatePageAndWaitForLayout(pageId)
                : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "LogViewEditor",
            summary: "Log View entries, inline dialog read-back, and cautious model-backed actions.",
            members: [...LOG_VIEW_MEMBERS, ...elements.members],
            help: LOG_VIEW_HELP,
            elements: LOG_VIEW_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "LogViewEditor",
                id: this.id,
                name: this.name,
                entryCount: this.entryCount,
                error: this.error,
                hasUnresolvedDialogs: this.editor.hasUnresolvedDialogs(),
            }),
        };
    }

    get entries(): ILogEntrySnapshot[] | undefined {
        return this.isAttached() ? this.editor.getEntriesSnapshot() : undefined;
    }

    get entryCount(): number | undefined {
        return this.isAttached() ? this.editor.entryCount : undefined;
    }

    get error(): string | undefined {
        return this.isAttached() ? this.editor.state.get().error : undefined;
    }

    get showTimestamps(): boolean | undefined {
        return this.isAttached() ? this.editor.state.get().showTimestamps : undefined;
    }

    push(entries: ILogPushEntry[]): ILogPushResult {
        this.requireAttached("push");
        const entryIds: string[] = [];
        const dialogIds: string[] = [];

        for (const raw of entries) {
            // strictTypes: reject a guessed entry type instead of rendering a blank entry and
            // reporting success. The ui_push tool keeps its lenient behaviour unchanged.
            const normalized = normalizeUiPushEntry(raw, { strictTypes: true });
            if (!normalized) continue;
            if (normalized.isDialog) {
                const entryId = this.editor.addDialogEntryNonBlocking(
                    normalized.type,
                    normalized.fields as Record<string, unknown>,
                );
                entryIds.push(entryId);
                dialogIds.push(entryId);
            } else {
                entryIds.push(this.editor.addEntry(normalized.type, normalized.fields).id);
            }
        }

        return { entryIds: [...entryIds], dialogIds: [...dialogIds] };
    }

    dialogResult(id: string): ILogDialogResult | undefined {
        if (!this.isAttached()) return undefined;
        const entry = this.editor.getEntrySnapshotById(id);
        if (!entry) return undefined;
        if (entry.button === undefined) return { id, status: "unresolved" };
        return { id, status: "resolved", entry };
    }

    clear(): void {
        this.requireAttached("clear");
        this.editor.clear();
    }

    toggleTimestamps(): void {
        this.requireAttached("toggleTimestamps");
        this.editor.toggleTimestamps();
    }

    private isAttached(): boolean {
        return this.editor.page !== null;
    }

    private requireAttached(action: string): void {
        if (!this.isAttached()) {
            throw new Error(`Log View ${action} unavailable: no page host attached.`);
        }
    }
}
