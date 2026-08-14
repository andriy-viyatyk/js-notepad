import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { TextFileModel } from "../text/TextEditorModel";
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

export class EnvVarsEditor extends TextHostEditorModel<EnvVarsEditorState> {
    readonly editorId = "env-vars-view";
    protected readonly displayName = "Environment Variables";

    // TD4 — ref-equality marker for serialization skip.
    private lastSerializedData: BoardVarsFile | null = null;

    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    protected untitledName(): string {
        return "untitled.env.json";
    }

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // TD4 + TD5 — re-parse on external content changes; the base's echo
        // guard prevents the loop from our own serialize-back writes.
        this.subscribeHostContent((content) => this.loadData(content));

        // HS1 — seed the 2 selection fields from host slot (sync, no flicker)
        // and mirror back. Slice-subscribe over a composite key so the
        // mirror fires on any of the 2 slot fields but NOT on data / status mutations.
        this.mirrorHostSettings<EnvVarsViewSettings>(
            (saved) => {
                this.state.update((s) => {
                    if (saved.selectedNamespace !== undefined) s.selectedNamespace = saved.selectedNamespace;
                    if (saved.selectedProfile !== undefined) s.selectedProfile = saved.selectedProfile;
                });
            },
            (s) => ({
                selectedNamespace: s.selectedNamespace,
                selectedProfile: s.selectedProfile,
            }),
            (s) => `${s.selectedNamespace}|${s.selectedProfile}`,
        );

        // TD4 — state subscription → debounced serialize-back.
        this.registerHostSubscription(this.state.subscribe(() => this.onDataChangedDebounced()));

        this.loadData(host.state.get().content ?? "");

        // Consume the envNamespace hint (US-889) — deliberately lands on the HOST's state, not
        // this editor's own (freshly constructed) state; see EditorModel.getNavigationSourceId
        // for the same gotcha in a different consumer. Applied after loadData so `data` is
        // already populated.
        const envNamespace = (host.state.get() as { sourceLink?: ILinkData }).sourceLink?.envNamespace;
        if (envNamespace) this.focusNamespace(envNamespace);
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
        const content = JSON.stringify(data, null, 4);
        this.writeToHost(content, true);
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

    async saveState(): Promise<void> {
        // Flush pending debounced save before host's saveState
        this.onDataChanged();
        await super.saveState();
    }

    async dispose(): Promise<void> {
        // Flush pending debounced save
        this.onDataChanged();
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
