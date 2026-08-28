import type { ButtonProps } from "../../uikit/Button/ButtonView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { InputProps } from "../../uikit/Input/InputView";
import { InputView } from "../../uikit/Input/InputView";
import type { ISegment, SegmentedControlProps } from "../../uikit/SegmentedControl/SegmentedControlView";
import { SegmentedControlView } from "../../uikit/SegmentedControl/SegmentedControlView";
import type { SelectableRowProps } from "../../uikit/SelectableRow/SelectableRowView";
import { SelectableRowView } from "../../uikit/SelectableRow/SelectableRowView";
import { DataGridView, type AddRowsEvent, type CellEditEvent, type Column, type DataGridInstance, type DataGridProps, type DeleteRowsEvent } from "../../uikit/DataGrid";
import { createDepsGate, type DepsGate } from "../../uikit/shared/deps-gate";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { isFocusInSidebar } from "../../core/utils/focus-utils";
import { DEFAULT_PROFILE } from "../../api/board-vars/types";
import type { EditorConfig } from "../base/EditorConfig";
import type { EnvVarsEditor, EnvVarsEditorState } from "./EnvVarsEditor";
import "../../uikit/Button/Button.css";
import "../../uikit/SegmentedControl/SegmentedControl.css";

type EnvVarsBodyProps = {
    model: EnvVarsEditor;
    editorConfig?: EditorConfig;
};

type EnvVarsBodyProjection = Pick<
    EnvVarsEditorState,
    "data" | "status" | "errorMessage" | "selectedNamespace" | "selectedProfile"
>;

function selectBodyProjection(state: EnvVarsEditorState): EnvVarsBodyProjection {
    return {
        data: state.data,
        status: state.status,
        errorMessage: state.errorMessage,
        selectedNamespace: state.selectedNamespace,
        selectedProfile: state.selectedProfile,
    };
}

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

const EMPTY_PROFILE_DATA: Record<string, string> = {};

class LockedStateView extends VanillaView<{ model: EnvVarsEditor }> {
    private unlockButton: ButtonView | undefined;

    public constructor(props: { model: EnvVarsEditor }) {
        // `flex: 1` is load-bearing: EnvVarsBodyView's root is `display: contents`, so this
        // panel is a direct flex child of `text-chrome-root` and must grow to fill the space
        // between the toolbar and the footer. Without it the panel sizes to its text, the
        // footer rides up under the message and the rest of the page is empty (US-1183).
        super(props, createPanelElement({ direction: "column", justify: "center", align: "center", gap: "md", padding: "xxl", flex: 1, minHeight: 0 }));
    }

    protected onMount(): void {
        const message = createTextElement("This environment variables file is encrypted.", { color: "light" });
        this.unlockButton = this.child(new ButtonView(this.buttonProps()));
        this.root.append(message, this.unlockButton.root);
        this.unlockButton.mount();
    }

    protected onDispose(): void {
        this.unlockButton = undefined;
    }

    private buttonProps(): ButtonProps {
        return {
            name: "env-vars-unlock",
            variant: "primary",
            icon: "unlock",
            onClick: () => void this.props.model.host?.showEncryptionDialog(
                "Decrypt the environment variables file to continue.",
            ),
            children: "Unlock…",
        };
    }
}

class ErrorStateView extends VanillaView<{ message: string | undefined }> {
    private readonly messageElement: HTMLSpanElement;

    public constructor(props: { message: string | undefined }) {
        const messageElement = createTextElement("", { color: "light", size: "xs" });
        // See LockedStateView: `flex: 1` makes this branch fill the chrome body. US-1183.
        super(props, createPanelElement(
            { direction: "column", justify: "center", align: "center", gap: "sm", padding: "xxl", flex: 1, minHeight: 0 },
            [
                createTextElement("This file isn't valid Environment Variables JSON.", { color: "warning" }),
                messageElement,
                createTextElement("Use the tab's \"+\" switcher to open it as Text Editor and fix it by hand.", { color: "light", size: "xs" }),
            ],
        ));
        this.messageElement = messageElement;
    }

    protected onMount(): void {
        this.updateMessage(this.props.message);
    }

    protected onUpdate(props: { message: string | undefined }): void {
        this.updateMessage(props.message);
    }

    private updateMessage(message: string | undefined): void {
        this.messageElement.textContent = message ?? "";
        this.messageElement.hidden = !message;
    }
}

type NamespaceRowProps = {
    model: EnvVarsEditor;
    namespace: string;
    selected: boolean;
};

class NamespaceRowView extends VanillaView<NamespaceRowProps> {
    private selectableRow: SelectableRowView | undefined;
    private deleteButton: IconButtonView | undefined;
    private rowContent: Node | undefined;
    private appliedSelected = false;

    public constructor(props: NamespaceRowProps) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const deleteButton = this.child(new IconButtonView(this.deleteButtonProps()));
        const content = createPanelElement({ direction: "row", align: "center", gap: "xs", flex: 1, paddingX: "sm", paddingY: "xs" });
        const namePanel = createPanelElement({ flex: 1, minWidth: 0 }, [
            createTextElement(this.props.namespace, { truncate: true }),
        ]);
        content.append(namePanel, deleteButton.root);

        const selectableRow = this.child(new SelectableRowView(this.selectableRowProps(content)));
        this.selectableRow = selectableRow;
        this.deleteButton = deleteButton;
        this.rowContent = content;
        this.appliedSelected = this.props.selected;
        this.root.append(selectableRow.root);
        deleteButton.mount();
        selectableRow.mount();
        this.listen(selectableRow.root, "click", this.handleRowClick);
    }

    protected onUpdate(props: NamespaceRowProps): void {
        if (props.selected === this.appliedSelected) return;
        this.appliedSelected = props.selected;
        if (this.rowContent) this.selectableRow?.update(this.selectableRowProps(this.rowContent));
    }

    protected onDispose(): void {
        this.selectableRow = undefined;
        this.deleteButton = undefined;
        this.rowContent = undefined;
    }

    private selectableRowProps(content: Node): SelectableRowProps {
        return {
            name: "env-vars-namespace-row",
            selected: this.props.selected,
            children: content,
        };
    }

    private deleteButtonProps(): IconButtonProps {
        return {
            name: "env-vars-delete-namespace",
            size: "sm",
            icon: "delete",
            title: "Delete namespace",
            onClick: (event) => {
                event.stopPropagation();
                void this.props.model.deleteNamespace(this.props.namespace);
            },
        };
    }

    private readonly handleRowClick = (): void => {
        this.props.model.setSelectedNamespace(this.props.namespace);
    };
}

class NamespaceListView extends VanillaView<{
    model: EnvVarsEditor;
    namespaces: string[];
    selected: string;
}> {
    private readonly rowsHost = createPanelElement({ direction: "column" });
    private readonly rows = new KeyedList<string, string, HTMLElement>(this.rowsHost, {
        keyOf: (namespace) => namespace,
        create: (namespace) => {
            const view = this.child(new NamespaceRowView(this.rowProps(namespace)));
            view.mount();
            this.rowViews.set(view.root, view);
            return view.root;
        },
        update: (element, namespace) => {
            this.rowViews.get(element)?.update(this.rowProps(namespace));
        },
        remove: (element) => {
            this.rowViews.get(element)?.dispose();
            this.rowViews.delete(element);
        },
    });
    private readonly rowViews = new WeakMap<HTMLElement, NamespaceRowView>();
    private input: InputView | undefined;
    private newName = "";

    public constructor(props: { model: EnvVarsEditor; namespaces: string[]; selected: string }) {
        super(props, createPanelElement({ direction: "column", width: 220, gap: "xs", padding: "md" }));
    }

    protected onMount(): void {
        this.input = this.child(new InputView(this.inputProps()));
        this.root.append(this.rowsHost, this.input.root);
        this.input.mount();
        this.own(() => this.rows.dispose());
        this.rows.update(this.props.namespaces);
    }

    protected onUpdate(props: { model: EnvVarsEditor; namespaces: string[]; selected: string }): void {
        this.rows.update(props.namespaces);
        this.input?.update(this.inputProps());
    }

    protected onDispose(): void {
        this.input = undefined;
    }

    private rowProps(namespace: string): NamespaceRowProps {
        return {
            model: this.props.model,
            namespace,
            selected: namespace === this.props.selected,
        };
    }

    private inputProps(): InputProps {
        return {
            name: "env-vars-add-namespace",
            placeholder: "+ Add namespace",
            value: this.newName,
            onChange: (value) => {
                this.newName = value;
                this.input?.update(this.inputProps());
            },
            onKeyDown: (event) => {
                if (event.key === "Enter") this.commitAdd();
            },
            onBlur: this.commitAdd,
        };
    }

    private readonly commitAdd = (): void => {
        if (this.props.model.addNamespace(this.newName)) {
            this.newName = "";
            this.input?.update(this.inputProps());
        }
    };
}

type VarRow = { _rowKey: string; name: string; value: string };

const VAR_COLUMNS: Column<VarRow>[] = [
    { key: "name", name: "Name", width: 220, resizable: true },
    { key: "value", name: "Value", width: 400, resizable: true },
];

function validateRows(rows: VarRow[]): string | undefined {
    const counts = new Map<string, number>();
    let hasEmpty = false;
    for (const row of rows) {
        const name = row.name.trim();
        if (!name) {
            hasEmpty = true;
            continue;
        }
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    const reasons: string[] = [];
    if (hasEmpty) reasons.push("one or more variable names are empty");
    if (duplicates.length) {
        reasons.push(
            `duplicate variable name${duplicates.length > 1 ? "s" : ""}: ${duplicates.map((name) => `"${name}"`).join(", ")}`,
        );
    }
    if (!reasons.length) return undefined;
    return `Not saved — ${reasons.join("; ")}. Fix to apply changes.`;
}

function rowsToRecord(rows: VarRow[]): Record<string, string> {
    const record: Record<string, string> = {};
    for (const row of rows) record[row.name.trim()] = row.value;
    return record;
}

class VariablesGridView extends VanillaView<{
    model: EnvVarsEditor;
    namespace: string;
    profile: string;
    data: Record<string, string>;
    editorConfig?: EditorConfig;
}> {
    private readonly depsGate: DepsGate = createDepsGate();
    private rowCounter = 0;
    private appliedData: Record<string, string> | null = null;
    private seedRows: VarRow[] = [];
    private grid: DataGridInstance<VarRow> | undefined;
    private applyQueued = false;
    private live = false;
    private dataGridView: DataGridView<VarRow> | undefined;
    private contentPanel: HTMLDivElement | undefined;
    private warningPanel: HTMLDivElement | undefined;
    private warningText: HTMLSpanElement | undefined;

    public constructor(props: {
        model: EnvVarsEditor;
        namespace: string;
        profile: string;
        data: Record<string, string>;
        editorConfig?: EditorConfig;
    }) {
        super(props, createPanelElement({ direction: "column", flex: 1, minWidth: 0 }));
    }

    protected onMount(): void {
        this.live = true;
        this.own(() => {
            this.live = false;
            this.grid = undefined;
        });

        const contentPanel = createPanelElement({ direction: "column", flex: 1, minWidth: 0 });
        const warningText = createTextElement("", { color: "warning", size: "xs" });
        const warningPanel = createPanelElement({ paddingTop: "xs" }, [warningText]);
        warningPanel.hidden = true;
        this.contentPanel = contentPanel;
        this.warningPanel = warningPanel;
        this.warningText = warningText;
        this.root.append(contentPanel, warningPanel);

        const seeded = this.syncSeed(this.props);
        const dataGridView = this.child(new DataGridView<VarRow>(this.gridProps(seeded ? this.seedRows : this.rowsForGrid())));
        this.dataGridView = dataGridView;
        contentPanel.append(dataGridView.root);
        dataGridView.mount();

        if (!this.props.editorConfig?.disableAutoFocus && !isFocusInSidebar()) {
            this.grid?.focus();
        }
        this.depsGate.prime(this.dependencies(this.props));
    }

    protected onUpdate(props: {
        model: EnvVarsEditor;
        namespace: string;
        profile: string;
        data: Record<string, string>;
        editorConfig?: EditorConfig;
    }): void {
        const seeded = this.syncSeed(props);
        this.dataGridView?.update(this.gridProps(seeded ? this.seedRows : this.rowsForGrid()));
    }

    protected onDispose(): void {
        this.live = false;
        this.grid = undefined;
        this.dataGridView = undefined;
        this.contentPanel = undefined;
        this.warningPanel = undefined;
        this.warningText = undefined;
    }

    private dependencies(props: { namespace: string; profile: string; data: Record<string, string> }): readonly unknown[] {
        return [props.namespace, props.profile, props.data];
    }

    private syncSeed(props: { namespace: string; profile: string; data: Record<string, string> }): boolean {
        if (!this.depsGate.changed(this.dependencies(props))) return false;
        if (props.data === this.appliedData) return false;

        this.appliedData = props.data;
        this.seedRows = Object.keys(props.data).sort().map((name) => ({
            _rowKey: this.nextRowKey(),
            name,
            value: props.data[name],
        }));
        this.setWarning(undefined);
        return true;
    }

    private gridProps(rows: readonly VarRow[]): DataGridProps<VarRow> {
        return {
            name: "env-vars-grid",
            columns: VAR_COLUMNS,
            rows,
            getRowKey: (row) => row._rowKey,
            onGrid: this.handleGrid,
            editable: true,
            canAddRows: true,
            canDeleteRows: true,
            newRow: () => ({ _rowKey: this.nextRowKey(), name: "", value: "" }),
            onEdit: this.handleEdit,
            onAddRows: this.handleAddRows,
            onDeleteRows: this.handleDeleteRows,
            rowNoun: "variable",
            disableFiltering: true,
            disableSorting: true,
            rowHeight: 28,
            fitToWidth: true,
        };
    }

    private readonly handleGrid = (grid: DataGridInstance<VarRow> | null): void => {
        this.grid = grid ?? undefined;
    };

    private readonly handleEdit = (_event: CellEditEvent<VarRow>): void => {
        this.scheduleApply();
    };

    private readonly handleAddRows = (event: AddRowsEvent<VarRow>): void => {
        event.rows.forEach((row) => { row._rowKey = this.nextRowKey(); });
        this.scheduleApply();
    };

    private readonly handleDeleteRows = (_event: DeleteRowsEvent<VarRow>): void => {
        this.scheduleApply();
    };

    private scheduleApply(): void {
        if (this.applyQueued) return;
        this.applyQueued = true;
        queueMicrotask(() => {
            this.applyQueued = false;
            if (!this.live || !this.grid || this.grid.isDestroyed()) return;

            const rows = this.grid.getRows() as VarRow[];
            const reason = validateRows(rows);
            this.setWarning(reason);
            if (!reason) {
                const record = rowsToRecord(rows);
                this.appliedData = record;
                this.props.model.setProfileData(this.props.namespace, this.props.profile, record);
            }
        });
    }

    private setWarning(warning: string | undefined): void {
        if (this.warningText) this.warningText.textContent = warning ?? "";
        if (this.warningPanel) this.warningPanel.hidden = !warning;
    }

    private nextRowKey(): string {
        return `var-${++this.rowCounter}`;
    }

    private rowsForGrid(): readonly VarRow[] {
        return this.grid?.getRows() ?? this.seedRows;
    }
}

type ProfilePaneProps = {
    model: EnvVarsEditor;
    namespace: string;
    profile: string;
    profiles: string[];
    data: Record<string, string>;
    editorConfig?: EditorConfig;
};

class ProfilePaneView extends VanillaView<ProfilePaneProps> {
    private readonly contentRegion = createContentsRoot();
    private segmentedControl: SegmentedControlView | undefined;
    private input: InputView | undefined;
    private deleteButton: IconButtonView | undefined;
    private variablesGrid: VariablesGridView | undefined;
    private newProfile = "";

    public constructor(props: ProfilePaneProps) {
        super(props, createPanelElement({ direction: "column", flex: 1, minWidth: 0, gap: "md", padding: "md" }));
    }

    protected onMount(): void {
        const controls = createPanelElement({ direction: "row", align: "center", gap: "sm" });
        const segmentedControl = this.child(new SegmentedControlView(this.segmentedProps()));
        const input = this.child(new InputView(this.inputProps()));
        const inputPanel = createPanelElement({ width: 140 }, [input.root]);
        controls.append(segmentedControl.root, inputPanel);
        this.segmentedControl = segmentedControl;
        this.input = input;

        this.root.append(controls, this.contentRegion);
        segmentedControl.mount();
        input.mount();
        this.syncDeleteButton();
        this.syncContent();
    }

    protected onUpdate(_props: ProfilePaneProps): void {
        this.segmentedControl?.update(this.segmentedProps());
        this.input?.update(this.inputProps());
        this.syncDeleteButton();
        this.syncContent();
    }

    protected onDispose(): void {
        this.segmentedControl = undefined;
        this.input = undefined;
        this.deleteButton = undefined;
        this.variablesGrid = undefined;
    }

    private segmentedProps(): SegmentedControlProps {
        const items: ISegment[] = this.props.profiles.map((profile) => ({ value: profile, label: profile }));
        return {
            name: "env-vars-profile-tabs",
            items,
            value: this.props.profile,
            onChange: this.props.model.setSelectedProfile,
        };
    }

    private inputProps(): InputProps {
        return {
            name: "env-vars-add-profile",
            placeholder: "+ Add profile",
            value: this.newProfile,
            onChange: (value) => {
                this.newProfile = value;
                this.input?.update(this.inputProps());
            },
            onKeyDown: (event) => {
                if (event.key === "Enter") this.commitAddProfile();
            },
            onBlur: this.commitAddProfile,
        };
    }

    private syncDeleteButton(): void {
        if (this.props.profile && !this.deleteButton) {
            const deleteButton = this.child(new IconButtonView(this.deleteProfileProps()));
            this.deleteButton = deleteButton;
            this.root.firstElementChild?.append(deleteButton.root);
            deleteButton.mount();
        } else if (!this.props.profile && this.deleteButton) {
            this.releaseChild(this.deleteButton);
            this.deleteButton = undefined;
        }
    }

    private syncContent(): void {
        if (this.props.profile) {
            if (!this.variablesGrid) {
                const variablesGrid = this.child(new VariablesGridView({
                    model: this.props.model,
                    namespace: this.props.namespace,
                    profile: this.props.profile,
                    data: this.props.data,
                    editorConfig: this.props.editorConfig,
                }));
                this.variablesGrid = variablesGrid;
                this.contentRegion.append(variablesGrid.root);
                variablesGrid.mount();
            } else {
                this.variablesGrid.update(this.variablesGridProps());
            }
            return;
        }

        if (this.variablesGrid) {
            this.releaseChild(this.variablesGrid);
            this.variablesGrid = undefined;
        }
        this.contentRegion.replaceChildren(createPanelElement(
            { direction: "column", flex: true, justify: "center", align: "center", padding: "xxl" },
            [createTextElement("Add or select a profile to edit variables.", { color: "light", size: "xs" })],
        ));
    }

    private variablesGridProps(): ConstructorParameters<typeof VariablesGridView>[0] {
        return {
            model: this.props.model,
            namespace: this.props.namespace,
            profile: this.props.profile,
            data: this.props.data,
            editorConfig: this.props.editorConfig,
        };
    }

    private deleteProfileProps(): IconButtonProps {
        return {
            name: "env-vars-delete-profile",
            size: "sm",
            icon: "delete",
            title: "Delete profile",
            onClick: () => void this.props.model.deleteProfile(this.props.namespace, this.props.profile),
        };
    }

    private readonly commitAddProfile = (): void => {
        if (this.props.model.addProfile(this.props.namespace, this.newProfile)) {
            this.newProfile = "";
            this.input?.update(this.inputProps());
        }
    };
}

type NormalStateProps = EnvVarsBodyProjection & {
    model: EnvVarsEditor;
    editorConfig?: EditorConfig;
};

class NormalStateView extends VanillaView<NormalStateProps> {
    private readonly contentRegion = createContentsRoot();
    private namespaceList: NamespaceListView | undefined;
    private profilePane: ProfilePaneView | undefined;

    public constructor(props: NormalStateProps) {
        super(props, createPanelElement({ direction: "row", flex: 1, minWidth: 0 }));
    }

    protected onMount(): void {
        const namespaceList = this.child(new NamespaceListView(this.namespaceProps()));
        this.namespaceList = namespaceList;
        this.root.append(namespaceList.root, this.contentRegion);
        namespaceList.mount();
        this.syncContent();
    }

    protected onUpdate(_props: NormalStateProps): void {
        this.namespaceList?.update(this.namespaceProps());
        this.syncContent();
    }

    protected onDispose(): void {
        this.namespaceList = undefined;
        this.profilePane = undefined;
    }

    private namespaceProps(): ConstructorParameters<typeof NamespaceListView>[0] {
        return {
            model: this.props.model,
            namespaces: Object.keys(this.props.data).sort(),
            selected: this.props.selectedNamespace,
        };
    }

    private profileProps(): ProfilePaneProps {
        const namespaceData = this.props.data[this.props.selectedNamespace];
        const profiles = Object.keys(namespaceData ?? {}).sort();
        const profile = this.props.selectedProfile || DEFAULT_PROFILE;
        const data = namespaceData?.[profile] ?? EMPTY_PROFILE_DATA;
        return {
            model: this.props.model,
            namespace: this.props.selectedNamespace,
            profile: this.props.selectedProfile,
            profiles,
            data,
            editorConfig: this.props.editorConfig,
        };
    }

    private syncContent(): void {
        if (this.props.selectedNamespace) {
            if (!this.profilePane) {
                const profilePane = this.child(new ProfilePaneView(this.profileProps()));
                this.profilePane = profilePane;
                this.contentRegion.append(profilePane.root);
                profilePane.mount();
            } else {
                this.profilePane.update(this.profileProps());
            }
            return;
        }

        if (this.profilePane) {
            this.releaseChild(this.profilePane);
            this.profilePane = undefined;
        }
        this.contentRegion.replaceChildren(createPanelElement(
            { flex: true, direction: "column", justify: "center", align: "center", padding: "xxl" },
            [createTextElement("No namespaces yet — add one on the left.", { color: "light" })],
        ));
    }
}

export class EnvVarsBodyView extends VanillaView<EnvVarsBodyProps> {
    private readonly model: EnvVarsEditor;
    private readonly branchRegion = createContentsRoot();
    private activeBranch: LockedStateView | ErrorStateView | NormalStateView | undefined;
    private activeKind: "locked" | "error" | "normal" | undefined;

    public constructor(props: EnvVarsBodyProps) {
        super(props, createContentsRoot());
        this.model = props.model;
        this.root.dataset.type = "env-vars-body";
        this.root.append(this.branchRegion);
    }

    protected onMount(): void {
        this.bind(this.model.state, selectBodyProjection, this.syncBody);
    }

    protected onUpdate(props: EnvVarsBodyProps): void {
        if (props.model !== this.model) {
            throw new Error("Env Vars body received a different model instance.");
        }
    }

    protected onDispose(): void {
        this.activeBranch = undefined;
        this.activeKind = undefined;
    }

    private readonly syncBody = (projection: EnvVarsBodyProjection): void => {
        const kind = projection.status === "locked"
            ? "locked"
            : projection.status === "error" ? "error" : "normal";

        if (kind === this.activeKind && this.activeBranch) {
            if (kind === "locked") {
                (this.activeBranch as LockedStateView).update({ model: this.model });
            } else if (kind === "error") {
                (this.activeBranch as ErrorStateView).update({ message: projection.errorMessage });
            } else {
                (this.activeBranch as NormalStateView).update(this.branchProps(projection));
            }
            return;
        }

        if (this.activeBranch) {
            const previous = this.activeBranch;
            this.activeBranch = undefined;
            this.activeKind = undefined;
            this.releaseChild(previous);
        }

        const branch = this.createBranch(kind, projection);
        this.activeBranch = this.child(branch);
        this.activeKind = kind;
        this.branchRegion.append(branch.root);
        branch.mount();
    };

    private branchProps(projection: EnvVarsBodyProjection | EnvVarsBodyProps): EnvVarsBodyProjection & { model: EnvVarsEditor; editorConfig?: EditorConfig } {
        const current = "status" in projection ? projection : selectBodyProjection(projection.model.state.get());
        return { ...current, model: this.model, editorConfig: this.props.editorConfig };
    }

    private createBranch(
        kind: "locked" | "error" | "normal",
        projection: EnvVarsBodyProjection,
    ): LockedStateView | ErrorStateView | NormalStateView {
        if (kind === "locked") return new LockedStateView({ model: this.model });
        if (kind === "error") return new ErrorStateView({ message: projection.errorMessage });
        return new NormalStateView(this.branchProps(projection));
    }
}
