import type { LogViewEditor } from "../../editors/log-view";
import type { StyledText, MermaidOutputEntry } from "../../editors/log-view/logTypes";
import { pagesModel } from "../../api/pages";

/**
 * Mermaid helper returned by `ui.show.mermaid()`.
 * Property setters update the underlying log entry.
 */
export class Mermaid {
    private _text: string;
    private _title?: StyledText;

    constructor(
        private readonly entryId: string,
        private readonly vm: LogViewEditor,
        initial: { text: string; title?: StyledText },
    ) {
        this._text = initial.text;
        this._title = initial.title;
    }

    private update(): void {
        this.vm.updateEntryById(this.entryId, (draft) => {
            const d = draft as MermaidOutputEntry;
            d.text = this._text;
            d.title = this._title;
        });
    }

    get text(): string { return this._text; }
    set text(value: string) { this._text = value; this.update(); }

    get title(): StyledText | undefined { return this._title; }
    set title(value: StyledText | undefined) { this._title = value; this.update(); }

    openInEditor(pageTitle?: string): void {
        const title = pageTitle ?? (typeof this._title === "string" ? this._title : "Mermaid Diagram");
        pagesModel.addEditorPage("mermaid-view", "mermaid", title, this._text);
    }
}
