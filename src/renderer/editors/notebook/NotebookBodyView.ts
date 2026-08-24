import { errMessage } from "../../../shared/utils";
import { panelExpanded } from "../../core/state/events";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import {
    VirtualFlexGridView,
    type VirtualFlexCellFunc,
} from "../../uikit/VirtualGrid/VirtualFlexGridView";
import type { GridModelCapability, Percent } from "../../uikit/VirtualGrid";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { ExpandedNoteView, type ExpandedNoteViewProps } from "./ExpandedNoteView";
import { NoteItemView } from "./NoteItemView";
import type { NoteItem } from "./notebookTypes";
import { NotebookEditor, type NotebookEditorState } from "./NotebookEditor";

export interface NotebookBodyViewProps {
    model: NotebookEditor;
}

interface NotebookProjection {
    data: NotebookEditorState["data"];
    error: NotebookEditorState["error"];
    categories: NotebookEditorState["categories"];
    tags: NotebookEditorState["tags"];
    searchText: NotebookEditorState["searchText"];
    filteredNotes: NotebookEditorState["filteredNotes"];
    expandedNoteId: NotebookEditorState["expandedNoteId"];
}

interface CellRecord {
    cell: HTMLElement;
    kind: string;
    index: number;
    note: NoteItem;
    view: NoteItemView;
    /** Set when this cell's own subtree threw; see `renderCell`'s per-cell boundary. */
    failed?: boolean;
}

/**
 * Per-cell error boundary.
 *
 * `renderCell` runs *inside* the virtual grid's paint, so an exception raised anywhere in a note's
 * subtree — an embedded editor, a third-party grid rejecting its columns — propagates out through
 * `calcRenderInfo` and aborts the paint for **every** cell. The observed result is a blank notebook
 * with the scroll position reset, which reads as an engine failure rather than as one bad note.
 *
 * So a throw is contained to the cell that raised it: the cell is emptied, an inline message
 * replaces the note, and the surrounding rows paint normally. A failed cell's view is discarded
 * rather than reused, because a subtree that threw mid-update is in an unknown state, and reusing it
 * would carry that state into whichever note the cell is admitted for next.
 */
function renderCellFailure(cell: HTMLElement, error: unknown): void {
    cell.replaceChildren();
    const message = createTextElement(
        `This note failed to render: ${errMessage(error)}`,
        { color: "error", preWrap: true },
    );
    message.dataset.type = "note-cell-error";
    cell.append(message);
}

const columnWidth = (() => "100%" as Percent) as (value: number) => Percent;

function selectProjection(state: NotebookEditorState): NotebookProjection {
    return {
        data: state.data,
        error: state.error,
        categories: state.categories,
        tags: state.tags,
        searchText: state.searchText,
        filteredNotes: state.filteredNotes,
        expandedNoteId: state.expandedNoteId,
    };
}

function noteKind(note: NoteItem): string {
    return note.content.editor || "monaco";
}

export class NotebookBodyView extends VanillaView<NotebookBodyViewProps> {
    private readonly editor: NotebookEditor;
    private readonly notesList = createPanelElement({
        name: "notebook-notes-list",
        direction: "column",
        flex: 1,
        overflow: "hidden",
        position: "relative",
        // A flex item defaults to `min-height: auto`, which forbids shrinking below the content's
        // min-content height. On the first navigation into the notebook that measured 969px while
        // the chrome left only 962px, so the body overflowed its parent by 7px: the footer sat too
        // low and the whole editor area — toolbar and footer included — gained a stray scrollbar.
        // Re-activating the page re-laid it out and hid the bug, which is why it looked transient.
        minHeight: 0,
    });
    private readonly messageHost = document.createElement("div");
    private readonly cells = new WeakMap<HTMLElement, CellRecord>();
    private readonly cellRecords = new Set<CellRecord>();
    private readonly ownedNoteViews = new Set<NoteItemView>();
    private readonly viewStates = new Map<string, import("monaco-editor").editor.ICodeEditorViewState>();
    private readonly rowCount = (): number => this.projection.filteredNotes.length;
    private readonly getInitialRowHeight = (row: number): number | undefined => {
        const note = this.projection.filteredNotes[row];
        return note ? this.editor.getNoteHeight(note.id) : undefined;
    };
    private readonly onGridModel = (model: GridModelCapability | null): void => {
        this.gridModel = model;
    };
    private readonly renderCell: VirtualFlexCellFunc = (params) => {
        const note = this.projection.filteredNotes[params.row];
        if (!note) return undefined;

        const kind = noteKind(note);
        const previousRecord = params.previous ? this.cells.get(params.previous) : undefined;
        const previous =
            params.previous && (!previousRecord || previousRecord.kind === kind)
                ? params.previous
                : undefined;
        const cell = previous ?? params.recycle?.(kind) ?? document.createElement("div");
        params.setReuseKey?.(cell, kind);
        let record = this.cells.get(cell);

        // A cell whose subtree threw is not reused: its views are disposed and rebuilt.
        if (record?.failed) {
            this.discardRecord(record);
            record = undefined;
        }

        try {
            if (!record) {
                cell.replaceChildren();
                const view = new NoteItemView(this.noteProps(note));
                record = { cell, kind, index: params.row, note, view };
                this.cells.set(cell, record);
                this.cellRecords.add(record);
                this.ownedNoteViews.add(view);
                view.mount();
                cell.append(view.root);
            }

            record.index = params.row;
            record.note = note;
            record.kind = kind;
            record.view.update(this.noteProps(note));
            params.measure(record.view.root);
        } catch (error) {
            // Contained deliberately: see `renderCellFailure`. Reported, never silently swallowed.
            console.error(`Note "${note.id}" failed to render`, error);
            if (record) {
                record.failed = true;
                record.note = note;
                record.index = params.row;
            }
            renderCellFailure(cell, error);
            params.measure(cell);
        }
        return cell;
    };

    /** Drop a record's owned views so a poisoned subtree is never handed to another note. */
    private discardRecord(record: CellRecord): void {
        this.cells.delete(record.cell);
        this.cellRecords.delete(record);
        this.ownedNoteViews.delete(record.view);
        try {
            record.view.dispose();
        } catch (error) {
            console.error("Disposing a failed note cell threw", error);
        }
    }
    private projection: NotebookProjection;
    private previousProjection: NotebookProjection | undefined;
    private grid: VirtualFlexGridView | undefined;
    private gridModel: GridModelCapability | null = null;
    private expandedView: ExpandedNoteView | undefined;
    private expandedNoteId: string | undefined;
    private expandedTarget: HTMLElement | null = null;
    private stateUnsubscribe: (() => void) | undefined;
    private queueUnsubscribe: (() => void) | undefined;
    private panelUnsubscribe: { unsubscribe: () => void } | undefined;

    public constructor(props: NotebookBodyViewProps) {
        const editor = props.model;
        super(props, createPanelElement({
            name: "notebook-body", direction: "column", flex: 1, overflow: "hidden",
            minHeight: 0,
        }));
        this.editor = editor;
        this.projection = selectProjection(editor.state.get());
    }

    protected onMount(): void {
        this.root.append(this.notesList);
        this.stateUnsubscribe = this.editor.state.subscribe(
            this.handleState,
            selectProjection,
        );
        this.queueUnsubscribe = this.editor.typedQueue.subscribe(() => undefined);
        this.panelUnsubscribe = panelExpanded.subscribe((event) => {
            if (event?.pageId !== this.editor.page?.id) return;
            const panel = {
                "notebook-categories": "categories",
                "notebook-tags": "tags",
            }[event.panelId];
            if (panel) this.editor.setExpandedPanel(panel);
        });
        this.own(() => this.stateUnsubscribe?.());
        this.own(() => this.queueUnsubscribe?.());
        this.own(() => this.panelUnsubscribe?.unsubscribe());
        this.applyProjection(this.projection);
        queueMicrotask(() => this.syncExpandedOverlay());
    }

    protected onUpdate(props: NotebookBodyViewProps): void {
        if (props.model !== this.editor) return;
        this.handleState(selectProjection(this.editor.state.get()));
        this.syncExpandedOverlay();
    }

    protected onDispose(): void {
        this.disposeExpandedView();
        this.leaveGrid();
    }

    private readonly handleState = (next: NotebookProjection): void => {
        const previous = this.projection;
        this.projection = next;
        this.applyProjection(next);
        const cellsChanged = !previous
            || previous.data !== next.data
            || previous.categories !== next.categories
            || previous.tags !== next.tags
            || previous.searchText !== next.searchText
            || previous.filteredNotes !== next.filteredNotes;
        if (cellsChanged) this.gridModel?.update({ all: true });
        this.previousProjection = previous;
        this.syncExpandedOverlay();
    };

    private applyProjection(projection: NotebookProjection): void {
        if (projection.error) {
            this.leaveGrid();
            this.notesList.replaceChildren(this.errorPanel(projection.error));
            return;
        }
        if (projection.data.notes.length === 0) {
            this.leaveGrid();
            this.notesList.replaceChildren(this.emptyPanel());
            return;
        }
        if (projection.filteredNotes.length === 0) {
            this.leaveGrid();
            this.notesList.replaceChildren(this.filterEmptyPanel());
            return;
        }
        this.messageHost.remove();
        this.enterGrid();
    }

    private enterGrid(): void {
        if (this.grid) {
            // Do NOT re-run `replaceChildren` for a root that is already the only child. Passing the
            // same node still detaches and re-inserts it, which re-parents an ancestor of the
            // grid's scroll container — and Blink rebuilds a re-parented scroller's layout object,
            // resetting `scrollTop` to 0. Every note-state update reaches here, so the visible
            // effect was the list jumping to the top mid-scroll with no scroll write anywhere in
            // our code and no change to the scroll geometry.
            this.attachGridRoot();
            this.grid.update(this.gridProps());
            return;
        }
        this.grid = this.child(new VirtualFlexGridView(this.gridProps()));
        this.attachGridRoot();
        this.grid.mount();
    }

    /** Idempotent: never re-inserts a root that is already the notes list's only child. */
    private attachGridRoot(): void {
        const root = this.grid?.root;
        if (!root) return;
        if (this.notesList.childElementCount === 1 && this.notesList.firstElementChild === root) {
            return;
        }
        this.notesList.replaceChildren(root);
    }

    private leaveGrid(): void {
        if (this.grid) {
            this.releaseChild(this.grid);
            this.grid = undefined;
            this.gridModel = null;
        }
        this.cellRecords.clear();
        for (const view of this.ownedNoteViews) view.dispose();
        this.ownedNoteViews.clear();
        if (this.notesList.contains(this.messageHost)) this.messageHost.remove();
    }

    private gridProps() {
        return {
            name: "notebook-flex-grid",
            rowCount: this.rowCount,
            columnCount: 1,
            columnWidth,
            renderCell: this.renderCell,
            fitToWidth: true,
            minRowHeight: 100,
            maxRowHeight: 800,
            getInitialRowHeight: this.getInitialRowHeight,
            onModel: this.onGridModel,
        };
    }

    private noteProps(note: NoteItem) {
        return {
            note,
            notebookModel: this.editor,
            categories: this.projection.categories,
            tags: this.projection.tags,
            searchText: this.projection.searchText,
            viewStates: this.viewStates,
            onDelete: this.editor.deleteNote,
            onExpand: this.editor.expandNote,
            onAddComment: this.editor.addComment,
            onCommentChange: this.editor.updateNoteComment,
            onTitleChange: this.editor.updateNoteTitle,
            onCategoryChange: this.editor.updateNoteCategory,
            onTagAdd: this.editor.addNoteTag,
            onTagRemove: this.editor.removeNoteTag,
            onTagUpdate: this.editor.updateNoteTag,
        };
    }

    private syncExpandedOverlay(): void {
        const note = this.projection.expandedNoteId
            ? this.projection.data.notes.find((item) => item.id === this.projection.expandedNoteId)
            : undefined;
        const target = this.editor.host?.editorOverlayRef ?? null;
        if (!note || !target) {
            this.disposeExpandedView();
            return;
        }
        const props: ExpandedNoteViewProps = {
            note,
            notebookModel: this.editor,
            categories: this.projection.categories,
            tags: this.projection.tags,
            searchText: this.projection.searchText,
            onCollapse: this.editor.collapseNote,
            viewStates: this.viewStates,
        };
        if (this.expandedView && this.expandedTarget === target && this.expandedNoteId === note.id) {
            this.expandedView.update(props);
            return;
        }
        this.disposeExpandedView();
        const view = new ExpandedNoteView(props);
        this.expandedView = view;
        this.expandedTarget = target;
        this.expandedNoteId = note.id;
        target.append(view.root);
        view.mount();
    }

    private disposeExpandedView(): void {
        this.expandedView?.dispose();
        this.expandedView?.root.remove();
        this.expandedView = undefined;
        this.expandedTarget = null;
        this.expandedNoteId = undefined;
    }

    private errorPanel(message: string): HTMLDivElement {
        const text = createTextElement(message, { color: "warning", preWrap: true });
        return createPanelElement({ flex: true, justify: "center", align: "center", padding: "xxl" }, [text]);
    }

    private emptyPanel(): HTMLDivElement {
        return createPanelElement({ direction: "column", flex: true, align: "center", justify: "center", gap: "xl", padding: "xl" }, [
            createTextElement("Notes", { size: "xxl" }),
            createTextElement("No notes yet", { color: "light" }),
            createTextElement('Click "Add Note" to create your first note', { color: "light" }),
        ]);
    }

    private filterEmptyPanel(): HTMLDivElement {
        return createPanelElement({ direction: "column", flex: true, align: "center", justify: "center", padding: "xl" }, [
            createTextElement("No notes match the current filter", { color: "light" }),
        ]);
    }
}
