import { Panel } from "../../uikit/Panel";
import { Spacer } from "../../uikit/Spacer";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { Input } from "../../uikit/Input";
import { Tag } from "../../uikit/Tag";
import { Dot } from "../../uikit/Dot";
import { ProgressBar } from "../../uikit/ProgressBar";
import { Divider } from "../../uikit/Divider";
import { MnemeConfigEditorModel } from "./MnemeConfigEditorModel";
import { WikiRootStatus, formatBytes, isReindexActive } from "./mnemeTypes";
import { TComponentModel, useComponentModel } from "../../core/state/model";

interface RootsPanelProps {
    model: MnemeConfigEditorModel;
}

interface RootRowProps {
    model: MnemeConfigEditorModel;
    root: WikiRootStatus;
}

class RootRowModel extends TComponentModel<{ expanded: boolean }, RootRowProps> {
    setExpanded = (expanded: boolean) => this.state.update((s) => { s.expanded = expanded; });
}

interface FiltersEditorProps {
    model: MnemeConfigEditorModel;
    root: string;
}

interface FiltersEditorState {
    include: string[] | null;
    ignore: string[] | null;
    includeDraft: string;
    ignoreDraft: string;
}

const defaultFiltersEditorState: FiltersEditorState = {
    include: null,
    ignore: null,
    includeDraft: "",
    ignoreDraft: "",
};

class FiltersEditorModel extends TComponentModel<FiltersEditorState, FiltersEditorProps> {
    setInclude = (include: string[] | null) => this.state.update((s) => { s.include = include; });
    setIgnore = (ignore: string[] | null) => this.state.update((s) => { s.ignore = ignore; });
    setIncludeDraft = (value: string) => this.state.update((s) => { s.includeDraft = value; });
    setIgnoreDraft = (value: string) => this.state.update((s) => { s.ignoreDraft = value; });
}

export function RootsPanel({ model }: RootsPanelProps) {
    const s = model.state.use();
    const roots = s.status?.roots ?? [];
    const connected = s.connectionStatus === "connected";

    return (
        <Panel direction="column">
            <Panel
                background="dark"
                borderBottom
                direction="row"
                align="center"
                gap="sm"
                paddingX="lg"
                paddingY="sm"
            >
                <Text size="base" bold>Roots</Text>
                <Panel flex={1} />
                <Button name="mneme-add-root" size="sm" variant="default" onClick={() => model.addRoot()}>
                    + Add root
                </Button>
                <Button
                    name="mneme-reindex-all"
                    size="sm"
                    variant="default"
                    disabled={!connected || !!s.reindexProgress["__all__"]}
                    onClick={() => model.reindex()}
                >
                    Reindex all
                </Button>
            </Panel>

            <Panel direction="column" gap="sm" padding="lg">
                {roots.length === 0 && (
                    <Text size="md" color="light">No roots configured. Add one to start indexing.</Text>
                )}

                {roots.map((root) => (
                    <RootRow key={root.name} model={model} root={root} />
                ))}
            </Panel>
        </Panel>
    );
}

function RootRow({ model, root }: RootRowProps) {
    const s = model.state.use();
    const rowModel = useComponentModel({ model, root }, RootRowModel, { expanded: false });
    const expanded = rowModel.state.use((state) => state.expanded);
    // Two progress sources: a user-triggered reindex (cancellable, via the
    // reindexProgress map) and a background pass surfaced on status
    // (add-root / watcher, US-669). Manual takes precedence when both exist.
    const manual = s.reindexProgress[root.name];
    const bg = root.reindex;
    const bgActive = isReindexActive(bg);
    const progress = manual ?? (bgActive ? bg : undefined);
    const reindexing = !!manual; // only the manual reindex is cancellable
    const busy = reindexing || bgActive;
    const errored = !manual && bg?.phase === "error";
    // Extra index DBs left on disk from a previous model/schema (rare — after a
    // model change). The active one is shown inline above; offer Delete for the rest.
    const staleEntries = (s.staleIndexes[root.name] ?? []).filter((e) => !e.active);

    const toggleFilters = () => {
        const next = !expanded;
        rowModel.setExpanded(next);
        if (next && !s.rootConfigs[root.name]) void model.getRootConfig(root.name);
    };

    return (
        <Panel direction="column" gap="xs" paddingY="sm" border rounded="md" paddingX="md">
            <Panel direction="row" align="center" gap="md">
                <Text size="md" bold variant="link" onClick={() => model.openRoot(root.folder)}>{root.name}</Text>
                <Text
                    size="md"
                    color="light"
                    truncate
                    hoverUnderline
                    title={`Open in Explorer: ${root.folder}`}
                    onClick={() => model.showRootInExplorer(root.folder)}
                >
                    {root.folder}
                </Text>
                <Spacer />
                <Text size="md" color="light">{root.docCount} docs</Text>
                <Text size="md" color="light">{formatBytes(root.indexBytes)}</Text>
            </Panel>

            <Panel direction="row" align="center" gap="sm">
                <Text size="xs" color="light">
                    index: {root.model}-{root.precision} · v{root.schemaVer}
                </Text>
                <Dot size="xs" color="success" />
                <Text size="xs" color="success">active</Text>
                <Panel flex={1} />
                <Button name={`mneme-filters-${root.name}`} size="sm" variant="link" onClick={toggleFilters}>
                    {expanded ? "Hide filters" : "Filters"}
                </Button>
                {reindexing ? (
                    <Button
                        name={`mneme-cancel-${root.name}`}
                        size="sm"
                        variant="danger"
                        onClick={() => model.cancelReindex(root.name)}
                    >
                        Cancel
                    </Button>
                ) : (
                    <Button
                        name={`mneme-reindex-${root.name}`}
                        size="sm"
                        variant="default"
                        disabled={bgActive}
                        onClick={() => model.reindex(root.name)}
                    >
                        {bgActive ? "Indexing…" : "Reindex"}
                    </Button>
                )}
                <Button
                    name={`mneme-remove-${root.name}`}
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => model.removeRoot(root.name)}
                >
                    Remove
                </Button>
            </Panel>

            {progress && (
                <Panel direction="row" align="center" gap="sm">
                    <Panel flex={1}>
                        <ProgressBar
                            value={progress.total > 0 ? progress.processed : undefined}
                            max={progress.total > 0 ? progress.total : undefined}
                        />
                    </Panel>
                    <Text size="xs" color="light">
                        {progress.phase}
                        {progress.total > 0 ? ` ${progress.processed}/${progress.total}` : ""}
                    </Text>
                </Panel>
            )}

            {errored && (
                <Text size="xs" color="error">
                    Background indexing failed — check the Mneme log; try Reindex.
                </Text>
            )}

            {staleEntries.length > 0 && (
                <Panel direction="column" gap="xs" paddingTop="xs">
                    {staleEntries.map((e) => (
                        <Panel key={e.path} direction="row" align="center" gap="sm">
                            <Text size="xs" color="light">
                                stale: {e.modelId} / v{e.schemaVer}
                            </Text>
                            <Text size="xs" color="light">{formatBytes(e.bytes)}</Text>
                            <Panel flex={1} />
                            <Button
                                name={`mneme-delidx-${root.name}-${e.modelId}-${e.schemaVer}`}
                                size="sm"
                                variant="danger"
                                onClick={() => model.deleteIndex(root.name, e.modelId, e.schemaVer)}
                            >
                                Delete
                            </Button>
                        </Panel>
                    ))}
                </Panel>
            )}

            {expanded && <FiltersEditor model={model} root={root.name} />}
        </Panel>
    );
}

function FiltersEditor({ model, root }: FiltersEditorProps) {
    const s = model.state.use();
    const cfg = s.rootConfigs[root];
    const filterModel = useComponentModel({ model, root }, FiltersEditorModel, defaultFiltersEditorState);
    const include = filterModel.state.use((state) => state.include);
    const ignore = filterModel.state.use((state) => state.ignore);
    const includeDraft = filterModel.state.use((state) => state.includeDraft);
    const ignoreDraft = filterModel.state.use((state) => state.ignoreDraft);
    const setInclude = filterModel.setInclude;
    const setIgnore = filterModel.setIgnore;
    const setIncludeDraft = filterModel.setIncludeDraft;
    const setIgnoreDraft = filterModel.setIgnoreDraft;

    // Seed local edit state from the loaded config (first time it arrives).
    const effInclude = include ?? cfg?.include ?? [];
    const effIgnore = ignore ?? cfg?.ignore ?? [];

    if (!cfg) {
        return (
            <Panel paddingY="sm">
                <Text size="xs" color="light">Loading filters…</Text>
            </Panel>
        );
    }

    const addGlob = (kind: "include" | "ignore") => {
        if (kind === "include") {
            const v = includeDraft.trim();
            if (!v) return;
            setInclude([...effInclude, v]);
            setIncludeDraft("");
        } else {
            const v = ignoreDraft.trim();
            if (!v) return;
            setIgnore([...effIgnore, v]);
            setIgnoreDraft("");
        }
    };

    const removeGlob = (kind: "include" | "ignore", glob: string) => {
        if (kind === "include") setInclude(effInclude.filter((g) => g !== glob));
        else setIgnore(effIgnore.filter((g) => g !== glob));
    };

    const dirty =
        JSON.stringify(effInclude) !== JSON.stringify(cfg.include) ||
        JSON.stringify(effIgnore) !== JSON.stringify(cfg.ignore);

    const apply = async () => {
        await model.setRootConfig(root, effInclude, effIgnore);
        setInclude(null);
        setIgnore(null);
    };

    const reset = () => {
        setInclude(null);
        setIgnore(null);
        setIncludeDraft("");
        setIgnoreDraft("");
    };

    return (
        <Panel direction="column" gap="sm" paddingY="sm">
            <Divider />
            <Text size="xs" color="light">Include (empty → defaults to <code>*.md</code>)</Text>
            <Panel direction="row" wrap gap="xs" align="center">
                {effInclude.map((g) => (
                    <Tag key={g} label={g} onRemove={() => removeGlob("include", g)} size="sm" />
                ))}
            </Panel>
            <Panel direction="row" gap="xs" align="center">
                <Input
                    name={`mneme-include-add-${root}`}
                    size="sm"
                    placeholder="add include glob (e.g. **/*.md)"
                    value={includeDraft}
                    onChange={setIncludeDraft}
                    onKeyDown={(e) => { if (e.key === "Enter") addGlob("include"); }}
                    width={260}
                />
                <Button name={`mneme-include-addbtn-${root}`} size="sm" variant="default" onClick={() => addGlob("include")}>Add</Button>
            </Panel>

            <Text size="xs" color="light">Ignore (gitignore-style)</Text>
            <Panel direction="row" wrap gap="xs" align="center">
                {effIgnore.map((g) => (
                    <Tag key={g} label={g} onRemove={() => removeGlob("ignore", g)} size="sm" />
                ))}
            </Panel>
            <Panel direction="row" gap="xs" align="center">
                <Input
                    name={`mneme-ignore-add-${root}`}
                    size="sm"
                    placeholder="add ignore glob (e.g. drafts/**)"
                    value={ignoreDraft}
                    onChange={setIgnoreDraft}
                    onKeyDown={(e) => { if (e.key === "Enter") addGlob("ignore"); }}
                    width={260}
                />
                <Button name={`mneme-ignore-addbtn-${root}`} size="sm" variant="default" onClick={() => addGlob("ignore")}>Add</Button>
            </Panel>

            <Panel direction="row" gap="sm" justify="end">
                <Button name={`mneme-filters-reset-${root}`} size="sm" variant="ghost" disabled={!dirty} onClick={reset}>
                    Reset
                </Button>
                <Button name={`mneme-filters-apply-${root}`} size="sm" variant="primary" disabled={!dirty} onClick={apply}>
                    Apply & reindex
                </Button>
            </Panel>
        </Panel>
    );
}
