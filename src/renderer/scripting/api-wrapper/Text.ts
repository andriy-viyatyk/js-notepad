import type { LogViewEditor } from "../../editors/log-view";
import type { StyledText, TextOutputEntry } from "../../editors/log-view/logTypes";
import { pagesModel } from "../../api/pages";

/**
 * Text helper returned by `ui.show.text()`.
 * Property setters update the underlying log entry.
 */
export class Text {
    private _text: string;
    private _language?: string;
    private _title?: StyledText;
    private _wordWrap?: boolean;
    private _lineNumbers?: boolean;
    private _minimap?: boolean;

    constructor(
        private readonly entryId: string,
        private readonly vm: LogViewEditor,
        initial: { text: string; language?: string; title?: StyledText; wordWrap?: boolean; lineNumbers?: boolean; minimap?: boolean },
    ) {
        this._text = initial.text;
        this._language = initial.language;
        this._title = initial.title;
        this._wordWrap = initial.wordWrap;
        this._lineNumbers = initial.lineNumbers;
        this._minimap = initial.minimap;
    }

    private update(): void {
        this.vm.updateEntryById(this.entryId, (draft) => {
            const d = draft as TextOutputEntry;
            d.text = this._text;
            d.language = this._language;
            d.title = this._title;
            d.wordWrap = this._wordWrap;
            d.lineNumbers = this._lineNumbers;
            d.minimap = this._minimap;
        });
    }

    get text(): string { return this._text; }
    set text(value: string) { this._text = value; this.update(); }

    get language(): string | undefined { return this._language; }
    set language(value: string | undefined) { this._language = value; this.update(); }

    get title(): StyledText | undefined { return this._title; }
    set title(value: StyledText | undefined) { this._title = value; this.update(); }

    get wordWrap(): boolean | undefined { return this._wordWrap; }
    set wordWrap(value: boolean | undefined) { this._wordWrap = value; this.update(); }

    get lineNumbers(): boolean | undefined { return this._lineNumbers; }
    set lineNumbers(value: boolean | undefined) { this._lineNumbers = value; this.update(); }

    get minimap(): boolean | undefined { return this._minimap; }
    set minimap(value: boolean | undefined) { this._minimap = value; this.update(); }

    openInEditor(pageTitle?: string): void {
        const title = pageTitle ?? (typeof this._title === "string" ? this._title : "Text");
        pagesModel.addEditorPage("monaco", this._language || "plaintext", title, this._text);
    }
}
