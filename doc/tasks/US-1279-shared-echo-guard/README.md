# US-1279: `createEchoGuard()` + adopt at the three file-echo sites

## Goal

Replace the three boolean self-write flags with one renderer-core `createEchoGuard()` utility whose
bounded pending exact tokens are consumed only when an observed value matches a value that was
written, and are cleared on every nonmatching observation. Adopt it at the settings file watcher,
browser search-history file watcher, and the text-host content subscription, while preserving genuine
external changes.

This document is an investigation and implementation plan only. No source implementation, tests,
or task-dashboard change is part of this task-document pass.

## Background

US-1279 is Strand B of [EPIC-081](../../epics/EPIC-081.md). The reviewed epic's corrections are
authoritative over the older roadmap: this task covers the three sites below, and does not absorb
the already-correct `MonacoEditorHostView`, `MermaidEditor`, or `SelectModel` suppression patterns.

The working tree already contains the EPIC-081 dashboard entry for US-1279. Per the request for this
investigation, `doc/active-work.md` is intentionally not edited.

### Verified current sites

The three target files have no diff against commit `d44ab072` in the current checkout, so the epic's
reported line references were re-verified against the source as written below.

EPIC-081's Strand B verification ledger rows B1-B4 cover this task: B1 is the settings UI-save echo
check and is now verified-safe for the write/read round-trip specifically, B2 is external settings-file
editing, B3 is the browser-history pair, and B4 is the TextHostEditorModel pair. B1 still needs the
running-app behavior check. B2 is the acceptance test that proves arm-and-hope was actually fixed: it
must pick up an external edit after a UI save, rather than merely showing that a replacement flag was
introduced.

#### Settings file watcher

`src/renderer/api/settings.ts` currently imports `FileWatcher` from
`../core/utils/file-watcher` at line 6. `Settings` stores a boolean at line 186. `init()` prepares
`appSettings.json`, creates the watcher at lines 228-234, and `fileChanged()` at lines 237-243
consumes the boolean before calling `loadSettings(true)`. `loadSettings()` reads the actual file
through `this.fileWatcher?.getTextContent()` at line 261 and parses that raw string with `parseJSON5`.

The write path is `set()` → `saveSettingsDebounced()` at lines 208-216 and 322. When the 300 ms
debounce runs, `saveSettings()` currently arms at line 288, serializes state with
`JSON.stringify(..., null, 4)` at line 289, inserts the documented comments at lines 290-316, builds
the final raw string at line 318, and writes it with `fs.saveDataFile()` at line 319. The token that
can honestly be armed is therefore the final `contentWithComments` string, not the intermediate
JSON string and not the parsed settings object. At consume time, the watcher callback can read the
same raw file representation with `FileWatcher.getTextContent()`; comparison must happen before
`parseJSON5`, because parsing discards comments and formatting.

The file watcher itself calls `fs.watch()` at `src/renderer/core/utils/file-watcher.ts:8-21`, refreshes
its `stat` at lines 93-97, and invokes the consumer through a 300 ms debounce at lines 99-101. The
settings save also has a 300 ms debounce, but the source contains no happens-before guarantee or
measured distribution for the write-to-`fs.watch` notification latency. The matching strategy must
therefore not rely on a guessed wall-clock TTL.

The source identifies a possible BOM divergence: `fs.saveDataFile` at
`src/renderer/api/fs.ts:519-520` reaches `_writeFile()` at lines 243-247, which calls
`_saveStringFile()` with no encoding and therefore `_encodeString()`'s UTF-8/no-BOM default at lines
141-159. `FileWatcher.getTextContent()` at `src/renderer/core/utils/file-watcher.ts:70-86` calls
`fs.readFile()` without an encoding override; `fs.readFile()` reaches `_decodeBuffer()` at
`src/renderer/api/fs.ts:272-279`, whose reader strips a leading BOM.

That concern was measured in the running app through `app.fs`: each payload was written with
`saveDataFile`, read with `getDataFile`, and compared for exact JavaScript string equality. The
throwaway data file was deleted afterward with `deleteDataFile` and confirmed gone; real settings and
history files were not touched.

| Payload | Exact result |
|---|---|
| Plain ASCII | Identical |
| Header + JSON (the real settings shape, 109 chars) | Identical (109 in, 109 out) |
| Trailing newline (`"abc\n"`) | Identical |
| No trailing newline (`"abc"`) | Identical |
| CRLF (`"a\r\nb"`) | Identical |
| Unicode (Cyrillic, accents, and emoji) | Identical |
| Leading BOM (`"\\uFEFF{...}"`) | Not identical (8 chars in, 7 out; first difference at index 0) |

The write-to-read round-trip is therefore faithful for every shape these two sites actually produce:
settings writes `${settingsFileHeader}\n${lines.join("\\n")}`, and browser history writes
`entries.join("\\n")`; neither prepends a BOM. B1 remains a running-app behavior check, but its
round-trip expectation is now measured-safe rather than an unknown. B2 still must confirm that an
external settings-file edit is applied after a UI save.

The settings save path also permits a second write before the first watcher notification is observed:
`saveSettingsDebounced` coalesces `set()` calls only while its 300 ms timer is pending, then
`saveSettings()` fires `fs.saveDataFile()` without awaiting or serializing it. A later `set()` starts a
new 300 ms window, while `fs.watch()` notification delivery has no ordering contract in this source.
Therefore the guard must retain a bounded recent set here too; the save debounce is not sufficient to
justify one pending token.

Before:

```typescript
private fileChanged = () => {
    if (this.skipNextFileChange) {
        this.skipNextFileChange = false;
        return;
    }
    this.loadSettings(true);
};

private saveSettings = () => {
    this.skipNextFileChange = true;
    const content = JSON.stringify(this.state.get().settings, null, 4);
    // ...insert comments...
    const contentWithComments = `${settingsFileHeader}\n${lines.join("\n")}`;
    fs.saveDataFile(settingsFileName, contentWithComments);
};
```

Planned after:

```typescript
private fileChanged = async () => {
    const content = await this.fileWatcher?.getTextContent();
    if (content !== undefined && this.echoGuard.consume(content)) return;
    await this.loadSettings(true, content);
};

private saveSettings = () => {
    // ...build the final contentWithComments first...
    this.echoGuard.arm(contentWithComments);
    fs.saveDataFile(settingsFileName, contentWithComments);
};
```

The exact `loadSettings` signature/implementation change is part of adoption: it should accept the
already-read raw content so the callback parses the value it matched, rather than reading the file a
second time after matching. If no content is available, retain the existing missing-file behavior and
do not consume the pending token.

#### Browser search-history file watcher

`src/renderer/editors/browser/browser-search-history.ts` imports `FileWatcher` at line 3 and `fs`
at line 4. `SearchHistoryStorage` stores the boolean at line 25. `init()` creates the data file and
watcher at lines 34-42; `fileChanged()` at lines 44-50 consumes the boolean or calls `load()`.

The read path at lines 52-64 obtains the raw data with `fs.getDataFile(fileName)` at line 54, then
normalizes it by splitting on newlines, trimming entries, and dropping empty strings at lines 55-58.
The write path is `add()`, `removeMany()`, or `clear()` → `save()` at lines 72-107. `save()` currently
arms at line 67 and writes `entries.join("\n")` at lines 68-69. The token available at arm time is
that exact joined string. At consume time, read the raw `fs.getDataFile(fileName)` result before the
trim/filter normalization and compare that raw string; otherwise a token could not distinguish file
formatting/whitespace changes that the current loader intentionally normalizes.
`fs.getDataFile()` uses the same `_decodeBuffer()` path described above. The measured probe therefore
establishes exact round-trip behavior for the non-BOM content this site produces; the leading-BOM
divergence is a caller limitation, not a reason to normalize the generic guard.

Before:

```typescript
private fileChanged = () => {
    if (this.skipNextFileChange) {
        this.skipNextFileChange = false;
        return;
    }
    this.load();
};

private save = async (entries: string[]) => {
    this.skipNextFileChange = true;
    const fileName = getFileName(this.profileName);
    await fs.saveDataFile(fileName, entries.join("\n"));
};
```

Planned after:

```typescript
private fileChanged = async () => {
    const content = await fs.getDataFile(getFileName(this.profileName));
    if (content !== undefined && this.echoGuard.consume(content)) return;
    await this.load(content);
};

private save = async (entries: string[]) => {
    const content = entries.join("\n");
    this.echoGuard.arm(content);
    await fs.saveDataFile(getFileName(this.profileName), content);
};
```

`load()` should accept the already-read raw content for the watcher path and keep its current
normalization and state update. The initial load may continue to call `fs.getDataFile()` itself. The
source shows no debounce or serialization around `save()`: `add()`, `removeMany()`, and `clear()` can
each reach the async `save()` path concurrently. This is why the shared guard cannot retain only one
browser token. `FileWatcher`'s 300 ms callback debounce coalesces notifications but does not serialize
the writes or prove their read-back encoding.

This is a reachable overlap, not only a theoretical timing concern: each public write method updates
state and calls the async `save()` independently, and `save()` reaches `await fs.saveDataFile(...)`
without a queue. The guard therefore retains the latest three write tokens, with oldest eviction, so
several filesystem events can be matched without allowing unbounded state.

#### Text-host content subscription

`src/renderer/editors/base/TextHostEditorModel.ts` stores `_skipNextContentUpdate` at line 63.
`writeToHost()` at lines 268-276 arms it at line 274 and immediately calls
`this._host.changeContent(content, byUser)` at line 275. `subscribeHostContent()` at lines 278-295
registers a host-state subscription with selector `s => s.content` at lines 284-293; the wrapper
consumes the boolean at lines 286-288 before forwarding the content to the editor handler at line
290.

The host implementation is `TextFileModel` in
`src/renderer/editors/text/TextEditorModel.ts`. `changeContent()` assigns the exact `newContent` to
`state.content` at lines 272-278. `TOneState` dispatches state subscribers synchronously at
`src/renderer/core/state/state.ts:72-79`, and its selector wrapper passes the changed selected value
to the listener at lines 99-111. Thus this site can arm the exact `content` string and consume the
exact callback value without a file read, hash, mtime, or watcher event. If the new content equals
the previous selected value, the selector does not invoke the listener; a later nonmatching content
event must clear the one-shot guard rather than be swallowed.

There is no second write waiting behind a watcher event at this site: `changeContent()` dispatches
the selected state change synchronously, so the normal write-to-consume sequence completes before a
second `writeToHost()` call can intervene. The only retained token edge case is a write whose value
equals the selector's previous value and therefore produces no callback; the next callback still
clears it on a non-match.

Before:

```typescript
private _skipNextContentUpdate = false;

protected writeToHost(content: string, byUser?: boolean): void {
    if (!this._host) return;
    this._skipNextContentUpdate = true;
    this._host.changeContent(content, byUser);
}
// subscription callback:
if (this._skipNextContentUpdate) {
    this._skipNextContentUpdate = false;
    return;
}
```

Planned after:

```typescript
private readonly echoGuard = createEchoGuard<string>();

protected writeToHost(content: string, byUser?: boolean): void {
    if (!this._host) return;
    this.echoGuard.arm(content);
    this._host.changeContent(content, byUser);
}
// subscription callback:
if (this.echoGuard.consume(content)) return;
```

### Utility location and dependency decision

Create `src/renderer/core/utils/echo-guard.ts`. This is a pure renderer utility with no API, editor,
UIKit, filesystem, or Node imports. `api/settings.ts` already consumes renderer core utilities
(`../core/state/*`, `../core/utils/*`), and browser/editor code already consumes core utilities via
`../../core/*`. The proposed dependency graph is therefore `api/` → `core/` and `editors/` → `core/`,
with no reverse edge introduced by the new module.

`src/renderer/uikit/` is not the right home: its split contract permits only core, theme, and UIKit
dependencies and defines it as the standalone reusable UI library. This guard is not UI. `src/shared/`
would broaden a renderer-only mechanism into a cross-process dependency without need. Do not add a
barrel export unless an existing import convention requires it; the project coding standards prefer
direct imports to avoid circular dependencies.

The proposed API is deliberately transport-neutral and per-instance:

```typescript
export interface EchoGuard<T> {
    arm(token: T): void;
    consume(token: T): boolean;
}

export function createEchoGuard<T>(): EchoGuard<T>;
```

Each call to `createEchoGuard()` creates an independent guard; it must never be a module-level
singleton. The three adopters each own their own `createEchoGuard<string>()`, so settings, browser
history, and text-host tokens cannot cross-consume one another. The guard retains at most three
pending exact string references (oldest evicted), because two writes can precede a file watcher
callback. Token retention is not a memory concern: the armed value is the same immutable string
reference already held by the writer/host, not a copied string.

The utility's doc comment must make the expiry rule explicit: `consume()` always resolves the
observed event. On a match it removes the matching token and any older superseded tokens, returning
true; on a non-match it clears every pending token before returning false. In the single-token
TextHost case, every call therefore clears the only pending token; in the file cases, newer tokens
that may still produce later callbacks can remain after a match. No nonmatching change can leave an
older token armed to swallow the next genuine change. Exact strings are intentional; a digest was
considered and rejected because a collision could swallow the genuine edit this task is fixing.
Do not strip a leading BOM in this generic utility: that was considered and rejected because
`TextHostEditorModel` passes document content, where a leading BOM can be legitimate content and
stripping it would break exact matching. The BOM caveat belongs to the file adopters: if a caller arms
a token beginning with a BOM, the reader's stripping causes the guard to silently degrade to no guard,
with the self-reload echo returning; neither current file site can produce such a token.
This is bounded pending-token matching, not a time-boxed guard, because no site has a verified
write-to-notification latency beyond the existing watcher debounce.

## Implementation Plan

1. Add `src/renderer/core/utils/echo-guard.ts` with the generic `EchoGuard<T>` contract and
   `createEchoGuard<T>()`. Store a bounded set of at most three pending tokens, evicting the oldest
   when full. Make `consume()` use exact value equality: remove the matching token and older tokens
   on a match, but clear every pending token before returning `false` on a non-match. The utility's
   doc comment must state that this clear-on-every-consume behavior retires arm-and-hope: a
   nonmatching change is processed and disarms the pending echoes, so no stale token can swallow the
   next genuine change. Keep the module pure: no `fs`, `FileWatcher`, `api`, `editors`, DOM, or
   caught-value handling.
2. Update `src/renderer/api/settings.ts`:
   - replace `skipNextFileChange` with a `createEchoGuard<string>()` instance and add the direct core
     utility import;
   - build `contentWithComments` before arming it in `saveSettings()`, so the arm token is exactly
     what `fs.saveDataFile()` writes;
   - make the watcher path obtain raw `getTextContent()`, call `consume(rawContent)` only when a
     value was read, and pass that same raw value into `loadSettings()` for parsing;
   - preserve `loadSettings(true)`'s external-change emission behavior and its initial-load behavior.
3. Update `src/renderer/editors/browser/browser-search-history.ts`:
   - replace `skipNextFileChange` with a string echo guard and add the direct core utility import;
   - compute `entries.join("\\n")` once, arm that exact string, and write that same variable;
   - read the raw data in `fileChanged()`, consume it before normalization, and let `load()` reuse the
     observed raw content while preserving the current trimming/filtering and state updates;
   - preserve initial loading and all three save callers; the guard must retain up to three pending
     write strings because those callers can overlap before the first watcher callback.
4. Update `src/renderer/editors/base/TextHostEditorModel.ts`:
   - replace `_skipNextContentUpdate` with a string echo guard;
   - arm immediately before `TextFileModel.changeContent()` and consume the callback's selected
     content string;
   - keep host-subscription teardown, host switching, and handler invocation unchanged.
5. Check that only the three targeted boolean flags disappear. Do not modify
   `src/renderer/editors/shared/MonacoEditorHostView.ts`, `src/renderer/editors/mermaid/MermaidEditor.ts`,
   or `src/renderer/uikit/Select/SelectModel.ts`; their save/restore, try/finally, and focus
   suppression mechanisms are explicitly out of scope.
6. Validate the implementation with the repository's normal lint/type/build checks if the user later
   authorizes implementation. This task document itself requires no tests or test harness, matching
   the task scope and project guidance.
7. Use the completed `app.fs` round-trip measurement as the fidelity evidence: all seven tested
   payloads matched exactly except a leading BOM, which neither file adopter produces. After
   implementation, run the remaining behavior checks in EPIC-081 ledger rows B1-B4; B1 confirms the
   measured own-save expectation, while B2 (external settings-file edit after a UI save) is mandatory
   acceptance of the arm-and-hope fix.

## Concerns

- **No honest numeric TTL is available from source.** `FileWatcher` debounces its callback by 300 ms,
  and settings saving also waits 300 ms before writing, but neither the write completion nor the
  `fs.watch` notification latency is measured here. A wall-clock expiry would therefore be guessed.
  Event-driven expiry is the resolved strategy: a matching observation consumes its token and older
  tokens, while a nonmatching observation clears every pending token before the genuine change is
  processed.
- **Raw representation is part of token correctness.** Settings must compare the final commented
  raw file string, not parsed JSON; search history must compare the raw file string, not the trimmed
  entries array. Passing the already-read raw value to the loader avoids a second read changing the
  value after the guard decision.
- **Concurrent writes.** Settings calls are coalesced only while the 300 ms save debounce timer is
  pending; once `saveSettings()` starts, `fs.saveDataFile()` is fire-and-forget and a later setting
  change can start another write before the first watcher event. Search-history `save()` has no
  debounce or serialization, so its public add/remove/clear operations can overlap directly. The
  source therefore cannot make a single pending token safe for either file site; the bounded
  three-token guard is the selected capacity. A nonmatching callback still clears all pending tokens
  and processes the observed change.
- **Missing content.** A file callback must not call `consume()` when `getTextContent()` returns
  `undefined`; the pending token remains armed temporarily because no content event was available to
  classify. It cannot swallow the next genuine change: the next available nonmatching content clears
  all pending tokens and is processed. An empty string is content and must be consumed normally.
- **Text-host is not a file watcher.** It is nevertheless the same generic one-shot echo shape: the
  writer has the exact token and the synchronous state callback returns the exact token. The utility
  must remain generic and must not impose watcher/file timing semantics on this adopter.
- **Error handling.** The planned changes do not need new catches. If implementation adds a caught
  value in any touched path, it must use `errMessage` from `src/shared/utils.ts`; no hand-rolled error
  stringification is permitted.
- **No tests or harnesses.** Do not add unit tests or a test harness for this task; use static checks
  and the project's normal validation commands if implementation is authorized later.

## Acceptance Criteria

- [ ] `src/renderer/core/utils/echo-guard.ts` exports `createEchoGuard()` with `arm(token)` and
      `consume(token): boolean`, keeps at most three per-instance exact tokens, evicts the oldest,
      removes a match plus older tokens, and clears all tokens on every nonmatching consume.
- [ ] `src/renderer/api/settings.ts` arms the exact final `contentWithComments` string and compares
      the exact raw watcher content before parsing; a nonmatching external file change is processed.
- [ ] `src/renderer/editors/browser/browser-search-history.ts` arms the exact `entries.join("\\n")`
      string and compares raw file content before normalization; external changes are processed.
- [ ] `src/renderer/editors/base/TextHostEditorModel.ts` arms exact host content before
      `changeContent()` and consumes exact selected content; a later nonmatching content event is not
      swallowed.
- [ ] The measured `app.fs` probe is recorded: `saveDataFile` → `getDataFile` matched exactly for
      all tested site-shaped payloads (ASCII, settings header + JSON, both newline forms, CRLF, and
      Unicode); only a leading BOM differed, and neither current adopter produces one.
- [ ] EPIC-081 rows B1-B4 are run after implementation. B1 confirms the measured own-save expectation;
      B2's external settings-file edit is the required arm-and-hope acceptance test, not optional.
- [ ] The three boolean flags and their unconditional skip branches are removed, with no behavior
      changes to unrelated host lifecycle, load, save, or settings-emission logic.
- [ ] `MonacoEditorHostView.ts`, `MermaidEditor.ts`, and `SelectModel.ts` are unchanged.
- [ ] No unit tests, test harnesses, `doc/active-work.md`, or commits are added/changed by this task.
- [ ] Any new caught value uses `errMessage`; no hand-rolled error stringification is introduced.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/core/utils/echo-guard.ts` | Add the pure generic single-shot token guard. |
| `src/renderer/api/settings.ts` | Replace the settings file boolean with raw-content guard adoption. |
| `src/renderer/editors/browser/browser-search-history.ts` | Replace the history file boolean with raw-content guard adoption. |
| `src/renderer/editors/base/TextHostEditorModel.ts` | Replace the synchronous content boolean with exact-content guard adoption. |
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | **No change** — explicit out of scope. |
| `src/renderer/editors/mermaid/MermaidEditor.ts` | **No change** — explicit out of scope. |
| `src/renderer/uikit/Select/SelectModel.ts` | **No change** — explicit out of scope. |
| `doc/active-work.md` | **No change** — dashboard maintained by the user. |
| Tests/test harnesses | **No change** — explicitly out of scope. |
