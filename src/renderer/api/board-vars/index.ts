// Board environment variables — foundation (EPIC-046 / US-887).
// Consumed by the board bridge (US-888) and the `.env.json` editor (US-889).

export { boardVars } from "./BoardEnvStore";
export { resolveBoardNamespace } from "./namespace";
export {
    DEFAULT_PROFILE,
    type BoardVarsFile,
    type BoardVarsNamespace,
    type BoardVarsProfile,
    type BoardVarsLoadStatus,
    type BoardVarsLoadResult,
} from "./types";
