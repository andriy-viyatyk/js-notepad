import { SetStateAction, useEffect, useRef, useState } from "react";
import {
    Panel,
    Text,
    Button,
    Input,
    IconButton,
    SegmentedControl,
    SelectableRow,
    AVGrid,
    type AVGridModel,
    type Column,
    type CellFocus,
} from "../../uikit";
import { DeleteIcon, UnlockIcon } from "../../theme/icons";
import { useEditorConfig } from "../base";
import { isFocusInSidebar } from "../../core/utils/focus-utils";
// Direct import (not the api/board-vars barrel) — see the note in EnvVarsEditor.ts.
import { DEFAULT_PROFILE } from "../../api/board-vars/types";
import type { EnvVarsEditor } from "./EnvVarsEditor";

function LockedState({ model }: { model: EnvVarsEditor }) {
    return (
        <Panel flex direction="column" justify="center" align="center" gap="md" padding="xxl">
            <Text color="light">This environment variables file is encrypted.</Text>
            <Button
                name="env-vars-unlock"
                variant="primary"
                icon={<UnlockIcon />}
                onClick={() =>
                    void model.host?.showEncryptionDialog(
                        "Decrypt the environment variables file to continue.",
                    )
                }
            >
                Unlock…
            </Button>
        </Panel>
    );
}

function ErrorState({ message }: { message: string | undefined }) {
    return (
        <Panel flex direction="column" justify="center" align="center" gap="sm" padding="xxl">
            <Text color="warning">This file isn't valid Environment Variables JSON.</Text>
            {message && <Text color="light" size="xs">{message}</Text>}
            <Text color="light" size="xs">
                Use the tab's "+" switcher to open it as Text Editor and fix it by hand.
            </Text>
        </Panel>
    );
}

function NamespaceList({
    model,
    namespaces,
    selected,
}: {
    model: EnvVarsEditor;
    namespaces: string[];
    selected: string;
}) {
    const [newName, setNewName] = useState("");

    const commitAdd = () => {
        if (model.addNamespace(newName)) setNewName("");
    };

    return (
        <Panel direction="column" width={220} gap="xs" padding="md">
            <Panel direction="column">
                {namespaces.map((ns) => (
                    <SelectableRow
                        key={ns}
                        name="env-vars-namespace-row"
                        selected={ns === selected}
                        onClick={() => model.setSelectedNamespace(ns)}
                    >
                        <Panel direction="row" align="center" gap="xs" flex={1} paddingX="sm" paddingY="xs">
                            <Panel flex={1} minWidth={0}>
                                <Text truncate>{ns}</Text>
                            </Panel>
                            <IconButton
                                name="env-vars-delete-namespace"
                                size="sm"
                                icon={<DeleteIcon />}
                                title="Delete namespace"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void model.deleteNamespace(ns);
                                }}
                            />
                        </Panel>
                    </SelectableRow>
                ))}
            </Panel>
            <Input
                name="env-vars-add-namespace"
                placeholder="+ Add namespace"
                value={newName}
                onChange={setNewName}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commitAdd();
                }}
                onBlur={commitAdd}
            />
        </Panel>
    );
}

// ============================================================================
// Variables grid — AVGrid name/value editor for the selected namespace+profile.
//
// Edits are buffered locally (rows state), not written straight through to the
// editor model. On every grid change the buffer is validated (no empty names,
// no duplicate names); a valid buffer is immediately pushed to the model via
// `setProfileData` (replacing the whole profile record), an invalid one is
// left buffered with a warning shown below the grid and NOT applied — the
// underlying JSON is untouched until the user fixes the offending row(s).
// ============================================================================

type VarRow = { _rowKey: string; name: string; value: string };

const VAR_COLUMNS: Column<VarRow>[] = [
    { key: "name", name: "Name", width: 220, resizible: true },
    { key: "value", name: "Value", width: 400, resizible: true },
];

/** Returns a human-readable reason when `rows` can't be saved as-is, or
 *  `undefined` when the buffer is valid. */
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
            `duplicate variable name${duplicates.length > 1 ? "s" : ""}: ${duplicates.map((d) => `"${d}"`).join(", ")}`,
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

function VariablesGrid({
    model,
    namespace,
    profile,
    data,
}: {
    model: EnvVarsEditor;
    namespace: string;
    profile: string;
    data: Record<string, string>;
}) {
    const rowCounterRef = useRef(0);
    // Reference to the last record object this component itself pushed via
    // setProfileData — lets the reseed effect ignore its own echo while still
    // reacting to a genuinely external change (e.g. a board's var.set()).
    const appliedRef = useRef<Record<string, string> | null>(null);
    const gridRef = useRef<AVGridModel<VarRow> | null>(null);
    const editorConfig = useEditorConfig();
    const [rows, setRows] = useState<VarRow[]>([]);
    const [columns, setColumns] = useState<Column<VarRow>[]>(VAR_COLUMNS);
    const [focus, setFocus] = useState<CellFocus<VarRow> | undefined>();
    const [warning, setWarning] = useState<string | undefined>();

    // Mount-time autofocus so keyboard editing (Enter/F2/Delete) works immediately —
    // AVGrid's focus-trap div only receives real DOM focus via an explicit focusGrid()
    // call (mirrors GridBody's identical autofocus effect).
    useEffect(() => {
        if (!editorConfig.disableAutoFocus && !isFocusInSidebar()) {
            gridRef.current?.focusGrid();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only autofocus
    }, []);

    useEffect(() => {
        if (data === appliedRef.current) return;
        const seeded = Object.keys(data).sort().map((name) => ({
            _rowKey: `var-${++rowCounterRef.current}`,
            name,
            value: data[name],
        }));
        setRows(seeded);
        setWarning(undefined);
        appliedRef.current = data;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed only on namespace/profile/data identity change; the row-key counter ref must not retrigger this
    }, [namespace, profile, data]);

    const applyIfValid = (nextRows: VarRow[]) => {
        const reason = validateRows(nextRows);
        setWarning(reason);
        if (reason) return;
        const record = rowsToRecord(nextRows);
        appliedRef.current = record;
        model.setProfileData(namespace, profile, record);
    };

    const editRow = (columnKey: string, rowKey: string, value: unknown) => {
        setRows((prev) => {
            const next = prev.map((r) =>
                r._rowKey === rowKey ? { ...r, [columnKey]: String(value ?? "") } : r,
            );
            applyIfValid(next);
            return next;
        });
    };

    const onAddRows = (count: number, insertIndex?: number): VarRow[] => {
        const newRows: VarRow[] = Array.from({ length: count }, () => ({
            _rowKey: `var-${++rowCounterRef.current}`,
            name: "",
            value: "",
        }));
        setRows((prev) => {
            const next = insertIndex !== undefined
                ? [...prev.slice(0, insertIndex), ...newRows, ...prev.slice(insertIndex)]
                : [...prev, ...newRows];
            applyIfValid(next);
            return next;
        });
        return newRows;
    };

    const onDeleteRows = (rowKeys: string[]) => {
        setRows((prev) => {
            const next = prev.filter((r) => !rowKeys.includes(r._rowKey));
            applyIfValid(next);
            return next;
        });
    };

    const getRowKey = (r: VarRow) => r._rowKey;

    return (
        <Panel direction="column" flex={1} minWidth={0}>
            <Panel direction="column" flex={1} minWidth={0}>
                <AVGrid
                    ref={gridRef}
                    name="env-vars-grid"
                    columns={columns}
                    setColumns={setColumns}
                    rows={rows}
                    getRowKey={getRowKey}
                    focus={focus}
                    setFocus={setFocus as (value: SetStateAction<CellFocus<VarRow> | undefined>) => void}
                    editRow={editRow}
                    onAddRows={onAddRows}
                    onDeleteRows={onDeleteRows}
                    entity="variable"
                    disableFiltering
                    disableSorting
                    rowHeight={28}
                    fitToWidth
                />
            </Panel>
            {warning && (
                <Panel paddingTop="xs">
                    <Text color="warning" size="xs">{warning}</Text>
                </Panel>
            )}
        </Panel>
    );
}

function ProfilePane({
    model,
    namespace,
    profile,
    profiles,
    data,
}: {
    model: EnvVarsEditor;
    namespace: string;
    profile: string;
    profiles: string[];
    data: Record<string, string>;
}) {
    const [newProfile, setNewProfile] = useState("");

    const commitAddProfile = () => {
        if (model.addProfile(namespace, newProfile)) setNewProfile("");
    };

    return (
        <Panel direction="column" flex={1} minWidth={0} gap="md" padding="md">
            <Panel direction="row" align="center" gap="sm">
                <SegmentedControl
                    name="env-vars-profile-tabs"
                    items={profiles.map((p) => ({ value: p, label: p }))}
                    value={profile}
                    onChange={(p) => model.setSelectedProfile(p)}
                />
                <Panel width={140}>
                    <Input
                        name="env-vars-add-profile"
                        placeholder="+ Add profile"
                        value={newProfile}
                        onChange={setNewProfile}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitAddProfile();
                        }}
                        onBlur={commitAddProfile}
                    />
                </Panel>
                {profile && (
                    <IconButton
                        name="env-vars-delete-profile"
                        size="sm"
                        icon={<DeleteIcon />}
                        title="Delete profile"
                        onClick={() => void model.deleteProfile(namespace, profile)}
                    />
                )}
            </Panel>

            {profile ? (
                <VariablesGrid model={model} namespace={namespace} profile={profile} data={data} />
            ) : (
                <Panel flex direction="column" justify="center" align="center" padding="xxl">
                    <Text color="light" size="xs">Add or select a profile to edit variables.</Text>
                </Panel>
            )}
        </Panel>
    );
}

export function EnvVarsBody({ model }: { model: EnvVarsEditor }) {
    const { data, status, errorMessage, selectedNamespace, selectedProfile } = model.state.use(
        (s) => ({
            data: s.data,
            status: s.status,
            errorMessage: s.errorMessage,
            selectedNamespace: s.selectedNamespace,
            selectedProfile: s.selectedProfile,
        }),
    );

    if (status === "locked") return <LockedState model={model} />;
    if (status === "error") return <ErrorState message={errorMessage} />;

    const namespaces = Object.keys(data).sort();
    const profiles = Object.keys(data[selectedNamespace] ?? {}).sort();
    const profileData = data[selectedNamespace]?.[selectedProfile || DEFAULT_PROFILE] ?? {};

    return (
        <Panel direction="row" flex={1} minWidth={0}>
            <NamespaceList model={model} namespaces={namespaces} selected={selectedNamespace} />
            {selectedNamespace ? (
                <ProfilePane
                    model={model}
                    namespace={selectedNamespace}
                    profile={selectedProfile}
                    profiles={profiles}
                    data={profileData}
                />
            ) : (
                <Panel flex direction="column" justify="center" align="center" padding="xxl">
                    <Text color="light">No namespaces yet — add one on the left.</Text>
                </Panel>
            )}
        </Panel>
    );
}
