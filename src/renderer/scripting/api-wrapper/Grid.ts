import type { LogViewEditor } from "../../editors/log-view";
import type { StyledText, GridOutputEntry } from "../../editors/log-view/logTypes";
import type { GridColumn } from "../../editors/grid/utils/grid-utils";
import { pagesModel } from "../../api/pages";

/**
 * Grid helper returned by `ui.show.grid()`.
 * Property setters update the underlying log entry.
 */
export class Grid {
    private _data: unknown[];
    private _columns?: (string | GridColumn)[];
    private _title?: StyledText;

    constructor(
        private readonly entryId: string,
        private readonly vm: LogViewEditor,
        initial: { data: unknown[]; columns?: (string | GridColumn)[]; title?: StyledText },
    ) {
        this._data = initial.data;
        this._columns = initial.columns;
        this._title = initial.title;
    }

    private update(): void {
        this.vm.updateEntryById(this.entryId, (draft) => {
            const d = draft as GridOutputEntry;
            d.data = this._data;
            d.columns = this._columns;
            d.title = this._title;
        });
    }

    get data(): unknown[] { return this._data; }
    set data(value: unknown[]) { this._data = value; this.update(); }

    get columns(): (string | GridColumn)[] | undefined { return this._columns; }
    set columns(value: (string | GridColumn)[] | undefined) { this._columns = value; this.update(); }

    get title(): StyledText | undefined { return this._title; }
    set title(value: StyledText | undefined) { this._title = value; this.update(); }

    openInEditor(pageTitle?: string): void {
        const title = pageTitle ?? (typeof this._title === "string" ? this._title : "Grid Data");
        pagesModel.addEditorPage("grid-json", "json", title, JSON.stringify(this._data, null, 2));
    }
}
