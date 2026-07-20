import type { ReactNode } from "react";
import type { TextFileModel } from "../text/TextEditorModel";
import { EditorToolbar } from "./EditorToolbar";
import { Spacer } from "../../uikit/Spacer/Spacer";
import { Divider } from "../../uikit/Divider/Divider";
import { Button } from "../../uikit/Button/Button";
import { ArchiveIcon, FolderOpenIcon, GlobeIcon, MemoryIcon } from "../../theme/icons";
import { DEFAULT_BROWSER_COLOR, MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import color from "../../theme/color";

interface ContentHostFooterProps {
    host: TextFileModel;
    /** Editor-specific footer status. Rendered before the encoding label
     *  (e.g. the Todo editor's "N items" count). */
    footerContributions?: ReactNode;
}

/** The shared text-host footer row: `script` toggle · (contributions) · provider icon ·
 *  encoding label. Rendered by `TextChrome` for built-in text-host editors and by
 *  `BoardEditorView` for content-host boards (US-886) — any editor whose content host is a
 *  `TextFileModel`. */
export function ContentHostFooter({ host, footerContributions }: ContentHostFooterProps) {
    return (
        <EditorToolbar name="text-chrome-footer" borderTop>
            <ScriptToggleButton host={host} />
            <Spacer />
            {footerContributions}
            <Divider orientation="vertical" />
            <ProviderIcon host={host} />
            <EncodingLabel host={host} />
        </EditorToolbar>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────

function ScriptToggleButton({ host }: { host: TextFileModel }) {
    if (!host.script) return null;
    const open = host.script.state.use((s) => s.open);
    return (
        <Button
            name="text-toggle-script"
            variant="ghost"
            size="sm"
            onClick={host.script.toggleOpen}
        >
            <span style={{ color: open ? color.text.default : color.text.light, fontSize: 13 }}>
                script
            </span>
        </Button>
    );
}

function EncodingLabel({ host }: { host: TextFileModel }) {
    const encoding = host.state.use((s) => s.encoding);
    return (
        <span style={{ color: color.text.light, padding: "0 4px", fontSize: 13 }}>
            {encoding || "utf-8"}
        </span>
    );
}

/** Base icon for the pipe's provider; cache/data/no-pipe render nothing. */
const PROVIDER_META: Record<string, { label: string; render: () => ReactNode }> = {
    file: { label: "Local file", render: () => <FolderOpenIcon width={16} height={16} color={color.text.light} /> },
    http: { label: "HTTP", render: () => <GlobeIcon width={16} height={16} color={DEFAULT_BROWSER_COLOR} /> },
    mneme: { label: "Mneme", render: () => <MemoryIcon width={16} height={16} color={MEMORY_ICON_COLOR} /> },
};

/** Provider badge shown before the encoding: a base provider icon, plus an
 *  archive icon when the pipe carries an ArchiveTransformer (an archive entry
 *  is a FileProvider + ArchiveTransformer, not a provider of its own). */
function ProviderIcon({ host }: { host: TextFileModel }) {
    // Touch state so the footer re-renders normally; pipe is stable per page.
    host.state.use((s) => s.filePath);
    const pipe = host.pipe;
    if (!pipe) return null;

    const meta = PROVIDER_META[pipe.provider.type];
    const isArchive = pipe.transformers.some((t) => t.type === "archive");
    if (!meta && !isArchive) return null;

    const title = [meta?.label, isArchive ? "Archive" : null].filter(Boolean).join(" · ")
        + (pipe.provider.sourceUrl ? ` — ${pipe.provider.sourceUrl}` : "");

    return (
        <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "0 2px" }}>
            {meta?.render()}
            {isArchive && <ArchiveIcon width={16} height={16} />}
        </span>
    );
}
