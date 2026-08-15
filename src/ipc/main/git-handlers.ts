import { Endpoint } from "../api-types";
import type { GitIdentity, GitSwitchTarget } from "../git-ipc";
import { bindEndpoint } from "./endpoint-registry";

export type GitEndpoint =
    | Endpoint.gitProbe
    | Endpoint.gitDetectRepo
    | Endpoint.gitLog
    | Endpoint.gitShow
    | Endpoint.gitStatus
    | Endpoint.gitCommitMessage
    | Endpoint.gitCommitFiles
    | Endpoint.gitStage
    | Endpoint.gitUnstage
    | Endpoint.gitDiscard
    | Endpoint.gitCommit
    | Endpoint.gitIdentity
    | Endpoint.gitRefs
    | Endpoint.gitSwitch
    | Endpoint.gitCreateBranch
    | Endpoint.gitFetch
    | Endpoint.gitAheadBehind
    | Endpoint.gitPull
    | Endpoint.gitPush
    | Endpoint.gitRemoteUrl;

/** Register Git's lazy-loaded renderer API endpoints. Keeping these together
 * makes the service boundary explicit without loading git-service at startup. */
export function initGitHandlers(): void {
    bindEndpoint(Endpoint.gitProbe, async () => (await import("../../main/git-service")).probeGit());
    bindEndpoint(Endpoint.gitDetectRepo, async (_event, dir: string) => (await import("../../main/git-service")).detectRepo(dir));
    bindEndpoint(Endpoint.gitLog, async (_event, dir: string, options) => (await import("../../main/git-service")).log(dir, options));
    bindEndpoint(Endpoint.gitShow, async (_event, dir: string, rev: string, path: string) => (await import("../../main/git-service")).show(dir, rev, path));
    bindEndpoint(Endpoint.gitStatus, async (_event, dir: string) => (await import("../../main/git-service")).status(dir));
    bindEndpoint(Endpoint.gitCommitMessage, async (_event, dir: string, hash: string) => (await import("../../main/git-service")).commitMessage(dir, hash));
    bindEndpoint(Endpoint.gitCommitFiles, async (_event, dir: string, hash: string) => (await import("../../main/git-service")).commitFiles(dir, hash));
    bindEndpoint(Endpoint.gitStage, async (_event, dir: string, paths: string[]) => (await import("../../main/git-service")).stage(dir, paths));
    bindEndpoint(Endpoint.gitUnstage, async (_event, dir: string, paths: string[]) => (await import("../../main/git-service")).unstage(dir, paths));
    bindEndpoint(Endpoint.gitDiscard, async (_event, dir: string, trackedPaths: string[], untrackedPaths: string[]) => (await import("../../main/git-service")).discard(dir, trackedPaths, untrackedPaths));
    bindEndpoint(Endpoint.gitCommit, async (_event, dir: string, message: string, identity?: GitIdentity) => (await import("../../main/git-service")).commit(dir, message, identity));
    bindEndpoint(Endpoint.gitIdentity, async (_event, dir: string) => (await import("../../main/git-service")).getIdentity(dir));
    bindEndpoint(Endpoint.gitRefs, async (_event, dir: string) => (await import("../../main/git-service")).refs(dir));
    bindEndpoint(Endpoint.gitSwitch, async (_event, dir: string, target: GitSwitchTarget) => (await import("../../main/git-service")).switchTo(dir, target));
    bindEndpoint(Endpoint.gitCreateBranch, async (_event, dir: string, name: string, startPoint?: string, checkout?: boolean) => (await import("../../main/git-service")).createBranch(dir, name, startPoint, checkout));
    bindEndpoint(Endpoint.gitFetch, async (_event, dir: string, options) => (await import("../../main/git-service")).fetch(dir, options));
    bindEndpoint(Endpoint.gitAheadBehind, async (_event, dir: string) => (await import("../../main/git-service")).aheadBehind(dir));
    bindEndpoint(Endpoint.gitPush, async (_event, dir: string, options) => (await import("../../main/git-service")).push(dir, options));
    bindEndpoint(Endpoint.gitPull, async (_event, dir: string, options) => (await import("../../main/git-service")).pull(dir, options));
    bindEndpoint(Endpoint.gitRemoteUrl, async (_event, dir: string, remote: string) => (await import("../../main/git-service")).remoteUrl(dir, remote));
}
