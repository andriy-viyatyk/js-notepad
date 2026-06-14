import { useState } from "react";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { Input } from "../../uikit/Input";
import { Tag } from "../../uikit/Tag";
import { ProgressBar } from "../../uikit/ProgressBar";
import { Divider } from "../../uikit/Divider";
import { MnemeConfigEditorModel } from "./MnemeConfigEditorModel";
import { WikiRootStatus, formatBytes, isReindexActive } from "./mnemeTypes";

interface RootsPanelProps {
    model: MnemeConfigEditorModel;
}

export function RootsPanel({ model }: RootsPanelProps) {
    const s = model.state.use();
    const roots = s.status?.roots ?? [];

    return (
        <Panel direction="column" gap="sm" padding="lg">
            <Panel direction="row" align="center">
                <Text size="base" bold>Roots</Text>
                <Panel flex={1} />
                <Button name="mneme-add-root" size="sm" variant="default" onClick={() => model.addRoot()}>
                    + Add root
                </Button>
            </Panel>

            {roots.length === 0 && (
                <Text size="md" color="light">No roots configured. Add one to start indexing.</Text>
            )}

            {roots.map((root) => (
                <RootRow key={root.name} model={model} root={root} />
            ))}
        </Panel>
    );
}

interface RootRowProps {
    model: MnemeConfigEditorModel;
    root: WikiRootStatus;
}

function RootRow({ model, root }: RootRowProps) {
    const s = model.state.use();
    const [expanded, setExpanded] = useState(false);
    // Two progress sources: a user-triggered reindex (cancellable, via the
    // reindexProgress map) and a background pass surfaced on wiki_status
    // (add-root / watcher, US-669). Manual takes precedence when both exist.
    const manual = s.reindexProgress[root.name];
    const bg = root.reindex;
    const bgActive = isReindexActive(bg);
    const progress = manual ?? (bgActive ? bg : undefined);
    const reindexing = !!manual; // only the manual reindex is cancellable
    const busy = reindexing || bgActive;
    const errored = !manual && bg?.phase === "error";

    const toggleFilters = () => {
        const next = !expanded;
        setExpanded(next);
        if (next && !s.rootConfigs[root.name]) void model.getRootConfig(root.name);
    };

    return (
        <Panel direction="column" gap="xs" paddingY="sm" border rounded="md" paddingX="md">
            <Panel direction="row" align="center" gap="md">
                <Text size="md" bold>{root.name}</Text>
                <Text size="md" color="light" truncate>{root.folder}</Text>
                <Panel flex={1} />
                <Text size="md" color="light">{root.docCount} docs</Text>
                <Text size="md" color="light">{formatBytes(root.indexBytes)}</Text>
            </Panel>

            <Panel direction="row" align="center" gap="sm">
                <Text size="xs" color="light">
                    index: {root.model}-{root.precision} · v{root.schemaVer}
                </Text>
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

            {expanded && <FiltersEditor model={model} root={root.name} />}
        </Panel>
    );
}

interface FiltersEditorProps {
    model: MnemeConfigEditorModel;
    root: string;
}

function FiltersEditor({ model, root }: FiltersEditorProps) {
    const s = model.state.use();
    const cfg = s.rootConfigs[root];
    const [include, setInclude] = useState<string[] | null>(null);
    const [ignore, setIgnore] = useState<string[] | null>(null);
    const [includeDraft, setIncludeDraft] = useState("");
    const [ignoreDraft, setIgnoreDraft] = useState("");

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
