/**
 * `.env` loading for toolsets (EPIC-038 / US-802). A thin wrapper over Node's built-in
 * `util.parseEnv` — verified present in Persephone's runtime (Node 22 / Electron 39) and
 * dotenv-compatible (the parser behind `node --env-file`): it handles `KEY=VALUE`, `#` comments,
 * blank lines, `export ` prefixes, single/double quotes, and inline comments, and skips malformed
 * lines without throwing. So there is no hand-rolled parser and no `dotenv` dependency (T-C5).
 *
 * We parse content we read ourselves; we deliberately do NOT use `process.loadEnvFile`, which
 * would mutate the renderer's own `process.env`. The parsed map is passed to `app.proc.execute`
 * as `opts.env`, which the command runner merges OVER `process.env` for the child only.
 */
import { fs } from "../fs";
import { fpJoin } from "../../core/utils/file-path";

// `util` is not one of the restricted modules (only `path`/`fs` are — see coding-style), so a
// direct require is fine. Cast to a minimal shape rather than depend on @types/node exposing the
// (experimental) `parseEnv` typing.
const { parseEnv } = require("util") as {
    parseEnv(content: string): Record<string, string>;
};

/** Read + parse `<toolsetRoot>/.env` into a flat map. Returns `{}` when the file is absent or
 *  unreadable (a toolset without secrets is normal — never throws). */
export async function loadDotEnv(toolsetRoot: string): Promise<Record<string, string>> {
    const p = fpJoin(toolsetRoot, ".env");
    try {
        if (!(await fs.exists(p))) return {};
        return parseEnv((await fs.readFile(p)).content);
    } catch {
        return {};
    }
}
