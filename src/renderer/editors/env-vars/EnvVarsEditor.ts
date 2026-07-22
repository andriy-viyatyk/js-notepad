import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { IPageHost } from "../../api/pages/IPageHost";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry } from "../base/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { debounce } from "../../../shared/utils";
// Import directly from types.ts (not the api/board-vars barrel) — the barrel re-exports
// board-vars-bridge.ts, which imports this folder's open-env-vars.ts, so going through the
// barrel here would create a circular module dependency.
import { DEFAULT_PROFILE, type BoardVarsFile } from "../../api/board-vars/types";
import type { ILinkData } from "../../../shared/link-data";

/** HS1 host-slot shape — the two per-window selection fields ride
 *  `host.editorSettings["env-vars-view"]`. Survives EnvVars↔Monaco switches AND app restarts. */
interface EnvVarsViewSettings {
    selectedNamespace?: string;
    selectedProfile?: string;
}

export interface EnvVarsEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["env-vars-view"]:
    selectedNamespace: string;
    selectedProfile: string;
    // View-derived — recomputed from host content by loadData:
    data: BoardVarsFile;
    status: "ok" | "locked" | "error";
    errorMessage: string | undefined;
}

export const defaultEnvVarsEditorState: EnvVarsEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    selectedNamespace: "",
    selectedProfile: "",
    data: {},
    status: "ok",
    errorMessage: undefined,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class EnvVarsEditor extends EditorModel<EnvVarsEditorState> {
    readonly editorId = "env-vars-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _saveSubUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // TD5 — self-write guard. TD4 — ref-equality marker for serialization skip.
    private skipNextContentUpdate = false;
    private lastSerializedData: BoardVarsFile | null = null;

    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    constructor(state: TComponentState<EnvVarsEditorState>) {
        super(state);

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from EnvVarsEditor");
                this._tearDownHostSubscriptions();
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    private _tearDownHostSubscriptions(): void {
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._saveSubUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
        this._saveSubUnsub = null;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get host(): TextFileModel | null {
        return this._host;
    }

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return editorRegistry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    // ── Persistence ─────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Identity-only descriptor. selectedNamespace/selectedProfile ride the HS1 host slot;
        // data/status/errorMessage are view-derived, recomputed by loadData on restore.
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryView: s.secondaryView,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<EnvVarsEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `EnvVarsEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("EnvVarsEditor.switchFrom: extracted host is not a TextFileModel");
        }
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        host.state.update((s) => {
            s.editor = this.editorId;
        });
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel("");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Environment Variables editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh EnvVarsEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // TD4 + TD5 — re-parse on external content changes; skipNext guard
        // prevents the loop from our own serialize-back writes.
        this._hostContentUnsub = host.state.subscribe(
            (content) => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.loadData(content as string);
            },
            (s) => s.content,
        );

        // HS1 — seed the 2 selection fields from host slot (sync, no flicker).
        const saved = host.getEditorState<EnvVarsViewSettings>(this.editorId);
        if (saved) {
            this.state.update((s) => {
                if (saved.selectedNamespace !== undefined) s.selectedNamespace = saved.selectedNamespace;
                if (saved.selectedProfile !== undefined) s.selectedProfile = saved.selectedProfile;
            });
        }

        // HS1 — mirror back. Slice-subscribe over a composite key so the
        // mirror fires on any of the 2 slot fields but NOT on data / status mutations.
        this._settingsUnsub = this.state.subscribe(
            () => {
                if (!this._host) return;
                const s = this.state.get();
                this._host.setEditorState<EnvVarsViewSettings>(this.editorId, {
                    selectedNamespace: s.selectedNamespace,
                    selectedProfile: s.selectedProfile,
                });
            },
            (s) => `${s.selectedNamespace}|${s.selectedProfile}`,
        );

        // TD4 — state subscription → debounced serialize-back.
        this._saveSubUnsub = this.state.subscribe(() => this.onDataChangedDebounced());

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled.env.json");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);

        this.loadData(host.state.get().content ?? "");

        // Consume the envNamespace hint (US-889) — deliberately lands on the HOST's state, not
        // this editor's own (freshly constructed) state; see EditorModel.getNavigationSourceId
        // for the same gotcha in a different consumer. Applied after loadData so `data` is
        // already populated.
        const envNamespace = (host.state.get() as { sourceLink?: ILinkData }).sourceLink?.envNamespace;
        if (envNamespace) this.focusNamespace(envNamespace);
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Data loading ────────────────────────────────────────────────────

    loadData = (content: string): void => {
        const host = this._host;
        if (host?.encrypted && !host.decrypted) {
            this.state.update((s) => {
                s.status = "locked";
            });
            return;
        }

        if (!content || content.trim() === "") {
            this.state.update((s) => {
                s.data = {};
                s.status = "ok";
                s.errorMessage = undefined;
                s.selectedNamespace = "";
                s.selectedProfile = "";
            });
            this.lastSerializedData = this.state.get().data;
            return;
        }

        try {
            const parsed: unknown = JSON.parse(content);
            validateBoardVarsFile(parsed);
            const data = parsed as BoardVarsFile;
            this.state.update((s) => {
                s.data = data;
                s.status = "ok";
                s.errorMessage = undefined;
                if (!s.selectedNamespace || !(s.selectedNamespace in data)) {
                    s.selectedNamespace = Object.keys(data).sort()[0] ?? "";
                }
                const profiles = Object.keys(data[s.selectedNamespace] ?? {});
                if (!s.selectedProfile || !profiles.includes(s.selectedProfile)) {
                    s.selectedProfile = profiles[0] ?? "";
                }
            });
            this.lastSerializedData = data;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.state.update((s) => {
                s.status = "error";
                s.errorMessage = message;
            });
        }
    };

    // ── Serialization: state → file content ─────────────────

    private onDataChanged = (): void => {
        const { data, status } = this.state.get();
        // Don't serialize over a locked/unparseable file — preserves the raw content for
        // inspection / hand-edit (the tab's "+" switcher can open it as Text Editor).
        if (status !== "ok") return;
        if (!this._host) return;
        if (data === this.lastSerializedData) return;
        this.lastSerializedData = data;
        this.skipNextContentUpdate = true;
        const content = JSON.stringify(data, null, 4);
        this._host.changeContent(content, true);
    };

    // ── Namespace focus (US-889 — persephone.var.show()) ─────────────────

    focusNamespace = (namespace: string): void => {
        this.state.update((s) => {
            s.selectedNamespace = namespace;
            const profiles = Object.keys(s.data[namespace] ?? {});
            s.selectedProfile = profiles[0] ?? DEFAULT_PROFILE;
        });
    };

    // ── Selection ─────────────────────────────────────────────────────

    setSelectedNamespace = (namespace: string): void => {
        this.state.update((s) => {
            s.selectedNamespace = namespace;
            const profiles = Object.keys(s.data[namespace] ?? {});
            s.selectedProfile = profiles[0] ?? "";
        });
    };

    setSelectedProfile = (profile: string): void => {
        this.state.update((s) => {
            s.selectedProfile = profile;
        });
    };

    // ── Variable (key) CRUD ───────────────────────────────────────────────

    /** Replace an entire profile's key→value record atomically. The AVGrid-based editor
     *  (`EnvVarsBody`) owns row-level add/edit/delete as a local buffer and only calls this
     *  once its own validation (no empty/duplicate names) passes — so `record` is always
     *  well-formed by the time it lands here. */
    setProfileData = (namespace: string, profile: string, record: Record<string, string>): void => {
        this.state.update((s) => {
            (s.data[namespace] ??= {});
            s.data[namespace][profile] = record;
        });
    };

    // ── Profile CRUD ───────────────────────────────────────────────────

    addProfile = (namespace: string, name: string): boolean => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const ns = this.state.get().data[namespace];
        if (ns && Object.prototype.hasOwnProperty.call(ns, trimmed)) return false;
        this.state.update((s) => {
            (s.data[namespace] ??= {});
            (s.data[namespace][trimmed] ??= {});
        });
        return true;
    };

    deleteProfile = async (namespace: string, profile: string, skipConfirm = false): Promise<void> => {
        if (!skipConfirm) {
            const keyCount = Object.keys(this.state.get().data[namespace]?.[profile] ?? {}).length;
            const result = await ui.confirm(
                `Delete profile "${profile}"${keyCount > 0 ? ` and its ${keyCount} variable${keyCount !== 1 ? "s" : ""}` : ""}?`,
                { title: "Delete Profile", buttons: ["Delete", "Cancel"] },
            );
            if (result !== "Delete") return;
        }
        this.state.update((s) => {
            if (s.data[namespace]) delete s.data[namespace][profile];
            if (s.selectedNamespace === namespace && s.selectedProfile === profile) {
                const remaining = Object.keys(s.data[namespace] ?? {});
                s.selectedProfile = remaining[0] ?? "";
            }
        });
    };

    // ── Namespace CRUD ───────────────────────────────────────────────────

    addNamespace = (name: string): boolean => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const { data } = this.state.get();
        if (Object.prototype.hasOwnProperty.call(data, trimmed)) return false;
        this.state.update((s) => {
            (s.data[trimmed] ??= {});
            s.selectedNamespace = trimmed;
            s.selectedProfile = "";
        });
        return true;
    };

    deleteNamespace = async (namespace: string, skipConfirm = false): Promise<void> => {
        if (!skipConfirm) {
            const profileCount = Object.keys(this.state.get().data[namespace] ?? {}).length;
            const result = await ui.confirm(
                `Delete namespace "${namespace}"${profileCount > 0 ? ` and its ${profileCount} profile${profileCount !== 1 ? "s" : ""}` : ""}?`,
                { title: "Delete Namespace", buttons: ["Delete", "Cancel"] },
            );
            if (result !== "Delete") return;
        }
        this.state.update((s) => {
            delete s.data[namespace];
            if (s.selectedNamespace === namespace) {
                const remaining = Object.keys(s.data).sort();
                s.selectedNamespace = remaining[0] ?? "";
                s.selectedProfile = s.selectedNamespace
                    ? Object.keys(s.data[s.selectedNamespace] ?? {})[0] ?? ""
                    : "";
            }
        });
    };

    // ── Save / release / dispose ────────────────────────────────────────

    /** Delegate to host — edits flow through the host, so `host.modified` is the source of
     *  truth (mirrors LinkEditor.modified). Without this override, `page.modified` / `list_pages`
     *  would report a dirty env-vars editor as unmodified, and the close-loop save prompt would
     *  be skipped. */
    get modified(): boolean {
        return this._host ? this._host.modified : super.modified;
    }

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        // Flush pending debounced save before host's saveState
        this.onDataChanged();
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        // Flush pending debounced save
        this.onDataChanged();

        this._tearDownHostSubscriptions();
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

/** Best-effort shape validation: namespace → profile → key → string. Throws with a
 *  human-readable message on the first violation (surfaced as the "error" status). */
function validateBoardVarsFile(parsed: unknown): asserts parsed is BoardVarsFile {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected a JSON object mapping namespace → profile → key → value.");
    }
    for (const namespace of Object.values(parsed as Record<string, unknown>)) {
        if (!namespace || typeof namespace !== "object" || Array.isArray(namespace)) {
            throw new Error("Expected each namespace to be an object mapping profile → key → value.");
        }
        for (const profile of Object.values(namespace as Record<string, unknown>)) {
            if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
                throw new Error("Expected each profile to be an object mapping key → value.");
            }
            for (const value of Object.values(profile as Record<string, unknown>)) {
                if (typeof value !== "string") {
                    throw new Error("Expected each variable value to be a string.");
                }
            }
        }
    }
}
