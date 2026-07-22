import { ui } from "../../api/ui";
import { shell } from "../../api/shell";
import type { TextFileModel } from "./TextEditorModel";
import { DecryptTransformer } from "../../content/transformers/DecryptTransformer";

export class TextFileEncryptionModel {
    constructor(private model: TextFileModel) {}

    get encrypted(): boolean {
        return shell.encryption.isEncrypted(this.model.state.get().content);
    }

    get decrypted(): boolean {
        return this.model.state.get().password !== undefined;
    }

    get withEncryption(): boolean {
        return this.decrypted || this.encrypted;
    }

    /**
     * Encrypt plaintext content — writes encrypted text to disk.
     * After: pipe has NO DecryptTransformer, content on disk is encrypted, page shows encrypted text.
     */
    encript = async (password: string): Promise<void> => {
        if (this.encrypted) {
            ui.notify("File is already encrypted", "warning");
            return;
        }
        try {
            const encryptedContent = await shell.encryption.encrypt(
                this.model.state.get().content,
                password,
            );

            // Write encrypted content through pipe (no DecryptTransformer — writes as-is)
            if (this.model.pipe?.writable) {
                await this.model.pipe.writeText(encryptedContent);
            }

            const modified =
                this.model.state.get().modified ||
                this.model.state.get().password !== password;
            this.model.state.update((s) => {
                s.content = encryptedContent;
                s.encrypted = true;
                s.password = undefined;
                s.modified = modified;
                s.temp = s.temp && !modified;
            });
            this.model.io.markModificationUnsaved();
        } catch (error) {
            ui.notify((error as Error).message, "warning");
        }
    };

    /**
     * Re-encrypt and lock — clone pipe without DecryptTransformer.
     * After: pipe has NO DecryptTransformer, shows encrypted text, 🔒.
     */
    encryptWithCurrentPassword = async (): Promise<void> => {
        const password = this.model.state.get().password;
        if (!password) {
            ui.notify("No password set for encryption", "warning");
            return;
        }

        const pipe = this.model.pipe;
        if (!pipe) {
            // Fallback: use old direct encryption
            await this.encript(password);
            return;
        }

        try {
            // Clone pipe without DecryptTransformer
            const candidate = pipe.clone();
            candidate.removeTransformer("decrypt");

            // Re-read content through pipe without DecryptTransformer → encrypted text
            const encryptedContent = await candidate.readText();

            // Swap pipes
            pipe.dispose();
            this.model.pipe = candidate;
            this.model.io.setupWatch();
            this.model.io.recreateCachePipe();

            this.model.state.update((s) => {
                s.content = encryptedContent;
                s.encrypted = true;
                s.password = undefined;
            });
            this.model.io.markModificationUnsaved();
        } catch (error) {
            this.alertEncryptionError(error as Error);
        }
    };

    /**
     * Decrypt — clone-and-try with DecryptTransformer.
     * After: pipe HAS DecryptTransformer, shows plaintext, 🔓.
     */
    decrypt = async (password: string): Promise<boolean> => {
        if (!this.encrypted) {
            return false;
        }

        const pipe = this.model.pipe;
        if (!pipe) {
            // Fallback: use old direct decryption
            try {
                const decrypted = await shell.encryption.decrypt(
                    this.model.state.get().content,
                    password,
                );
                this.model.state.update((s) => {
                    s.content = decrypted;
                    s.encrypted = false;
                    s.password = password;
                });
                return true;
            } catch (error) {
                this.alertEncryptionError(error as Error);
                return false;
            }
        }

        // Clone-and-try: clone pipe, add DecryptTransformer, try readText
        const candidate = pipe.clone();
        candidate.addTransformer(new DecryptTransformer(password));
        try {
            const plaintext = await candidate.readText();

            // Success — swap pipes
            pipe.dispose();
            this.model.pipe = candidate;
            this.model.io.setupWatch();
            this.model.io.recreateCachePipe();

            this.model.state.update((s) => {
                s.content = plaintext;
                s.encrypted = false;
                s.password = password;
            });
            return true;
        } catch (error) {
            // Failed — discard clone
            candidate.dispose();
            this.alertEncryptionError(error as Error);
            return false;
        }
    };

    showEncryptionDialog = async (message?: string) => {
        const mode = this.encrypted && !this.decrypted ? "decrypt" : "encrypt";
        const password = await ui.password({ mode, message });
        if (!password) return;

        if (mode === "decrypt") {
            await this.decrypt(password);
        } else {
            await this.encript(password);
        }
        this.model.focusEditor();
    };

    /**
     * Remove encryption permanently — write plaintext to disk.
     * After: pipe has NO DecryptTransformer, plaintext on disk.
     */
    makeUnencrypted = async () => {
        const pipe = this.model.pipe;
        const content = this.model.state.get().content;

        if (pipe) {
            // Clone without DecryptTransformer and write plaintext
            const candidate = pipe.clone();
            candidate.removeTransformer("decrypt");

            try {
                if (candidate.writable) {
                    await candidate.writeText(content);
                }
            } catch {
                // Write failed — still update state (will save on next Ctrl+S)
            }

            pipe.dispose();
            this.model.pipe = candidate;
            this.model.io.setupWatch();
            this.model.io.recreateCachePipe();
        }

        this.model.state.update((s) => {
            s.password = undefined;
            s.modified = true;
        });
        this.model.io.markModificationUnsaved();
    };

    alertEncryptionError = (err: Error) => {
        ui.notify(err.message || err.name || "Unknown encryption error", "warning");
    };

}
