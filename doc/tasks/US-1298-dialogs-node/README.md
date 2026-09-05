# US-1298: dialogs root node

**Epic:** [EPIC-084](../../epics/EPIC-084.md)  
**Status:** Implementation complete; verification pending  
**Depends on:** [US-1297: attention on every call result](../US-1297-call-attention/README.md) for the first consumer  
**Implement after:** US-1297; it replaces US-1297’s documented dialog fallback with resolved paths

## Goal

Expose the live renderer dialog stack as dialogs[i] in the AiVision root. Each child is a viewId-keyed
adapter built from the live `IDialogViewData` entry, with a shared safe surface (title, message,
buttons, click(button), cancel()) and that dialog's class-specific visible fields. Adapters implement
`aiVision` directly and hold the entry; they do not change dialog models or views. Button actions use
the model's existing close/submit path so synchronous and asynchronous canClose validation remains
authoritative. Password prompts expose only buttons and cancellation, never their entered value.

## Implementation progress

- [x] Add the viewId-keyed adapter map and all 14 per-dialog adapters.
- [x] Add the live indexed `DialogsNode` with per-resolve adapter identity.
- [x] Register `dialogs` on the AiVision root and document its paths.
- [x] Connect resolved dialog paths to US-1297 attention output.
- [ ] Manually verify every inventory button mapping and the coupled modified-page scenario.

## Background

### Existing dialog lifecycle and AiVision patterns

[src/renderer/ui/dialogs/DialogsView.ts](../../../src/renderer/ui/dialogs/DialogsView.ts):10
defines the live dialogsState as TGlobalState<IDialogViewData[]>. showDialog() at :132-142 sets a
random internalId, installs model.onClose, appends the entry, removes it on close, and returns the
model result promise. DialogsView.reconcile() reads the same array at :27-69 and keeps native views
in that order. Therefore children() must snapshot current array order into [0], [1], etc.; index()
must read the current array again so paths address live entries.

[src/renderer/ui/dialogs/dialog-view-registry.ts](../../../src/renderer/ui/dialogs/dialog-view-registry.ts):16-25
defines IDialogViewData as viewId, model, and optional internalId. The native view registry at
:32-41 is keyed by viewId, and the dialog adapters use the same stable key. Dialogs.ts:1 re-exports
dialogsState, showDialog, and closeDialog; it adds no other model metadata.

The shared resolver only accepts descriptor members that are real member names on the current
object. [src/shared/ai-vision/resolver.ts](../../../src/shared/ai-vision/resolver.ts):88-141
checks the descriptor member list, reads/invokes the named property, awaits it, and shapes the
final value at :155-157. A descriptor factory by itself cannot invent a working model.title or
model.click() property when the model has no such property. The adapter is therefore the real
resolver target: it owns the normalized public members and delegates actions to the live model.

The resolver's restricted() check runs before each hop at resolver.ts:81-83, so dialog models
must not use it to hide ordinary safe controls. HintMode is declared at resolver.ts:23; only
nodeHint() at :175-181 suppresses hints for "never", while hint.ts:42-70 formats member/child
text. help-search.ts:31-62 follows only node:true properties and live children, and
result-shaper.ts:39-46 returns a descriptor summary instead of reflecting model fields.

The shared registries are in [src/shared/ai-vision/types.ts](../../../src/shared/ai-vision/types.ts):72-99:
`registerAiVision(ctor, describe)` is constructor/prototype-keyed, while `registerAiVisionFor(instance,
describe)` is exact-instance-keyed. Dialog children use neither registry: each adapter implements its
own `aiVision` getter, selected by a `Map<symbol, (entry: IDialogViewData) => DialogAdapter>` keyed by
`entry.viewId`. This avoids the four bare `TDialogModel` instances sharing one runtime constructor,
and descriptor metadata cannot be used to invent resolver members on the model. The existing
namespace registration pattern at
[src/renderer/scripting/ai-vision/namespaces/index.ts](../../../src/renderer/scripting/ai-vision/namespaces/index.ts):14-42
is not used for these per-entry adapters. The map creates adapters on demand from the live array;
identity is preserved for the same entry
within one resolve, while identity across separate MCP calls does not matter.

The renderer root loads paid AiVision registration lazily through
[src/renderer/scripting/ai-vision/root.ts](../../../src/renderer/scripting/ai-vision/root.ts):1
(import "./namespaces"). Current root members and descriptor are :28-126; dialogs is absent.
The proposed dialog registration should follow this pattern with a direct side-effect import from
the AiVision path only. No ordinary startup import from src/renderer/ui/dialogs should be added.

TGlobalState.get() is a direct read of currentState at
[src/renderer/core/state/state.ts](../../../src/renderer/core/state/state.ts):44-85, and
dialogsState is a TGlobalState marker at :118-122. A dialogs node that reads dialogsState.get()
in children()/index() has no state mutation or UI creation. It is safe to mark the root's dialogs
property `node: true` for helpSearch; the node itself must not call showDialog, mount views, focus,
open, or close a dialog.

### Binding decision evidence (EPIC-084 decisions 1-5 and 8)

| Decision | Verified source evidence and interpretation for this task |
|---|---|
| 1. Attention is renderer/per-window, attached to ICallResult, and includes dialogs/menu state | Live dialog state is renderer-local (DialogsView.ts:10, :132-142); current ICallResult is resolver.ts:35-44 and lacks attention; main receives forwarded envelopes at call-tools.ts:138-149 and renders them at :174-190. US-1297 owns the pass-through. This task guarantees that its dialogs[i] paths exist once registration is loaded. |
| 2. Attention is independent of hints | Resolver nodeHint() suppresses hints for mode never at resolver.ts:175-181, while hint formatting is separate in hint.ts:42-70 and dialog children/descriptors are independent live state. Nothing in this task conditions dialogs registration or actions on HintMode. |
| 3. dialogs is a live indexed root; children are viewId-keyed adapters; shared title/message/buttons/click/cancel | Live entries and their identity are verified by DialogsView.ts:10, :132-147 and dialog-view-registry.ts:16-25. A Map keyed by entry.viewId selects an adapter factory; each adapter implements aiVision directly and holds the live entry. The resolver therefore reads real adapter members (resolver.ts:88-141), with no model or view changes and no registerAiVision/registerAiVisionFor call. |
| 4. Password/encryption dialogs expose buttons and cancel only | PasswordDialog.ts:15-19 contains password, confirm, and error; :41-52 validates and closes with the password. Its view has Encrypt/Decrypt and Cancel at PasswordDialogView.ts:83-112. The adapter must omit title/message/mode/error/secret fields and never serialize the result. |
| 5. Menus mirror dialogs later | Popup state uses items at showPopupMenu.ts:16-24, MenuItem supports labels, flags, and nested items at context-menu.ts:3-25, and poppers are exposed through visiblePoppers() at PoppersView.ts:121-141. No menus node exists; US-1299 owns it. This task only needs its coupling contract through US-1297’s fallback. |
| 8. Native OS dialogs are reported, not driven | Native calls exist in src/ipc/main/dialog-handlers.ts:15-72, src/main/browser-service.ts:254-255, and src/main/download-service.ts:102-105; their per-window tracker is owned by src/main/native-dialog-tracker.ts. dialogs covers renderer TDialogModel entries only; US-1301 owns native reporting and no adapter action may drive an OS dialog. |

There is no doc/architecture/ai-vision.md in the repository. The matching architecture references
are [doc/architecture/scripting.md](../../architecture/scripting.md):573-588 and
[doc/architecture/overview.md](../../architecture/overview.md):77-84. They require cooperative
descriptors, live children, renderer routing, and plain-value script/Board call contracts.

### Complete on-disk dialog inventory

The inventory contains 14 dialog classes: 13 `Dialog.ts` model/view pairs under
`src/renderer/ui/dialogs/`, plus the editor-owned `EditLinkDialogModel`/`EditLinkDialogView` in
`src/renderer/editors/link-editor/`. There is no separate encryption-dialog class; the
password/encryption prompt is `PasswordDialogModel`. The table records state/result/click behavior
verified from each model and native view. Buttons means visible controls relevant to click;
non-closing controls are marked so the descriptor cannot pretend they return a dialog result.

The implementation convention is narrower and uniform: each adapter's buttons member lists
result-bearing controls, plus Password's Encrypt/Decrypt submit labels whose secret result is
discarded. Browse and Tor Reconnect remain documented in this audit but are omitted from buttons
and rejected by click().

| Model/file and state fields | Visible buttons and result type | User click -> close(result) mapping | Safe AiVision exposure |
|---|---|---|---|
| ConfirmationDialog in [ConfirmationDialog.ts](../../../src/renderer/ui/dialogs/ConfirmationDialog.ts):9-18, model at :23-33: title, message, buttons | Dynamic buttons; result string | Each label at ConfirmationDialogView.ts:85-98 calls model.close(buttons[index]); Cancel therefore returns literal "Cancel"; X/Esc calls close(undefined) at :40 and :47 | title, message, buttons; labels are values. |
| InputDialog in [InputDialog.ts](../../../src/renderer/ui/dialogs/InputDialog.ts):9-19, :22-35: title, message, value, buttons, selectAll, defaultButton, options, selectedOption | Dynamic buttons; InputResult { value, button, selectedOption? } or undefined | InputDialogView.ts:165-176 calls close({ value: current value, button: buttons[index], selectedOption }); Enter uses default/first button at InputDialog.ts:38-47; X/Esc is close(undefined) in the view :77-90 | All listed display/input state except selectAll may be exposed; value/options are not secrets in this model. |
| TextDialogModel in [TextDialog.ts](../../../src/renderer/ui/dialogs/TextDialog.ts):16-24, :26-39: title, text, buttons, readOnly, options, width, height; live editorText at :38-44 | Dynamic buttons; result { text, button } or undefined | TextDialogView.ts:109-122 calls close({ text: editorText, button }); X closes undefined at :40-43; Escape is undefined at TextDialog.ts:46-50 | title, text/live editorText, buttons, readOnly, safe editor options/dimensions. |
| PasswordDialogModel in [PasswordDialog.ts](../../../src/renderer/ui/dialogs/PasswordDialog.ts):15-19, :21-28: mode, message, password, confirm, error | Decrypt or Encrypt, plus Cancel; result string or undefined | Submit calls model.submit() at PasswordDialogView.ts:83-92; submit validates and internally calls close(password) at PasswordDialog.ts:41-52. Cancel/X/Esc calls close(undefined) at the view :91-112. The adapter may invoke Encrypt/Decrypt but must await and discard the result; it must not accept/return/serialize password. | Only visible button labels and cancel(); no title, message, mode, error, password, confirm, or result value, per the privacy decision. |
| CommitDialogModel in [CommitDialog.ts](../../../src/renderer/ui/dialogs/CommitDialog.ts):9-18, :22-37: title, branch, originalBranch, message, name, email, buttons, committing; private viewDisposed and callback onAction | Dynamic action buttons plus Cancel; CommitResult { message, name, email, branch, button } or undefined | CommitDialogView.ts:186-195 maps Cancel to close(undefined) and other buttons to submit(button); submit builds the result and calls close(result) at CommitDialog.ts:63-75, allowing async canClose/onAction at :57-61. Visible label transforms are actionButtonLabel() :83-88, so visible “Create Branch & Commit” maps to underlying “Commit” when applicable. | Visible form fields, title, buttons, committing; never onAction or lifecycle internals. |
| EditLinkDialogModel in [EditLinkDialog.ts](../../../src/renderer/editors/link-editor/EditLinkDialog.ts):13-31, :36-94: dialogTitle, linkTitle, href, category, tags, imgSrc, target; private catalog/image state | Cancel, Save; `EditLinkResult` or undefined | Cancel uses close(undefined); Save calls the model's `save()` method, which trims the editable fields and closes with the link result | title, link fields, tags, target, buttons; omit category/tag catalogs, discovered images, and proxy state. |
| CreateBoardDialogModel in [CreateBoardDialog.ts](../../../src/renderer/ui/dialogs/CreateBoardDialog.ts):31-40: title, template, folder, name, creating; private viewDisposed | Browse (non-closing), Cancel, Create; result absolute board-root string or undefined | Cancel calls close(undefined) at CreateBoardDialogView.ts:87-90; Create calls submit() at :92-97, which scaffolds and calls close(root) at CreateBoardDialog.ts:66-80; Browse only opens an OS folder dialog at :54-62 | title, template, folder, name, creating; omit lifecycle flag. |
| CreateBoardVarsStorageDialogModel in [CreateBoardVarsStorageDialog.ts](../../../src/renderer/ui/dialogs/CreateBoardVarsStorageDialog.ts):16-25: path, creating; private viewDisposed | Browse (non-closing), Cancel, Create; result true or undefined/false | Cancel is close(undefined) at CreateBoardVarsStorageDialogView.ts:72-75; Create calls submit() at :77-82 and closes true at CreateBoardVarsStorageDialog.ts:52-68; Browse invokes native save dialog at :37-49 | path, creating; no lifecycle flag. |
| LibrarySetupDialogModel in [LibrarySetupDialog.ts](../../../src/renderer/ui/dialogs/LibrarySetupDialog.ts):19-23, :25-32: title, folderPath, copyExamples, linking; private viewDisposed | Browse (non-closing), Link, Cancel; result linked folder string or undefined | Link calls link() at LibrarySetupDialogView.ts:80-84; it performs work and calls close(trimmed) at LibrarySetupDialog.ts:51-73. Cancel/X/Esc calls close(undefined) at the view :86-110; Browse opens native folder selection at model :43-49 | title, folderPath, copyExamples, linking; omit lifecycle flag. |
| NamespaceCollisionDialog in [NamespaceCollisionDialog.ts](../../../src/renderer/ui/dialogs/NamespaceCollisionDialog.ts):9-12; model is bare TDialogModel at :16-23: namespace, collidingRoot | Cancel, Register Anyway; result boolean | View calls close(false) for Cancel and X/Esc at NamespaceCollisionDialogView.ts:39-46, :54-65; Register Anyway calls close(true) | namespace, collidingRoot, synthesized visible title/message, buttons. Both paths are shown in the view :27-37 and :55. |
| OpenUrlDialogModel in [OpenUrlDialog.ts](../../../src/renderer/ui/dialogs/OpenUrlDialog.ts):9-15: value | Open File, Cancel, Open; result {type:"file"}, undefined, or {type:"url", value} | Open File calls close({ type: "file" }) at OpenUrlDialogView.ts:47-52 and model :35-37; Cancel closes undefined at :53-57; Open calls submit() at :58-63, which closes the trimmed URL at OpenUrlDialog.ts:28-33 | value and synthesized title/message/buttons; it is user-entered but not a password field. |
| RegisterToolsetDialog in [RegisterToolsetDialog.ts](../../../src/renderer/ui/dialogs/RegisterToolsetDialog.ts):18-22; model is bare TDialogModel at :26-31: toolsetName, toolsetRoot, tools | Cancel, Register toolset; result boolean | View calls close(false) for Cancel/X/Esc and close(true) for Register at RegisterToolsetDialogView.ts:42-49, :57-68 | toolsetName, toolsetRoot, tool names/descriptions, synthesized visible title/message/buttons. |
| TorInfoDialogModel in [TorInfoDialog.ts](../../../src/renderer/ui/dialogs/TorInfoDialog.ts):12-20, :87-102: partition, loading, reconnecting, info, note; private viewDisposed | Close (closes), Reconnect (disabled while busy and non-closing); result void/undefined | Close/X/Esc calls close(undefined) at TorInfoDialogView.ts:118-140; Reconnect calls reconnect() at :112-116 and :200-204, which updates state/reloads but never calls close (TorInfoDialog.ts:42-78) | partition, loading/reconnecting status, safe displayed info/note, and buttons; omit lifecycle flag. Reconnect must be non-closing if included. |
| TrustBoardDialog in [TrustBoardDialog.ts](../../../src/renderer/ui/dialogs/TrustBoardDialog.ts):9-11; model is bare TDialogModel at :15-20: boardPath | Cancel, Trust Board; result boolean | View calls close(false) for Cancel/X/Esc and close(true) for Trust Board at TrustBoardDialogView.ts:41-49, :56-67 | boardPath and the static trust-scope sentence, plus synthesized title/message/buttons. There is no board-name field and the adapter does not derive or expose one. |

For all non-password adapters, cancel() must call model.close(undefined), not simulate a button
label. This matters for ConfirmationDialog, whose real Cancel button returns string "Cancel", and
for boolean dialogs whose Cancel button returns false. `click(label)` must require an exact visible
label, reject unknown, omitted, or disabled labels with an ordinary thrown Error, and await the
model's closing or submit method so canClose is honored. The resolver catches that thrown method
error and returns its ordinary error result at resolver.ts:126-141. Input/Text/Commit/CreateBoard/
LibrarySetup/OpenUrl/Password submit labels call the existing model method when that path ends in
close; direct close(result) mappings use the inventory table.

For TrustBoard, RegisterToolset, NamespaceCollision, and TorInfo, the adapter carries the visible
title/message strings as constants duplicated from the corresponding view: TrustBoardDialogView.ts
:30-35 and :57, RegisterToolsetDialogView.ts:31-37 and :58, NamespaceCollisionDialogView.ts:35-36
and :55, and TorInfoDialogView.ts:104-106 and :130. Each constant gets an implementation comment
naming the mirrored view file and line. This is accepted duplication; no model getters or view
changes are needed.

### Coupling to US-1297

US-1297 already returns pending attention while a blocking action awaits. Before this task is
loaded, dialog attention uses the fallback
A blocking dialog is open, but the dialogs node is not available yet; use browser_snapshot/browser_click on pageId "app" to inspect and answer it.
to text containing paths such as:

~~~
Attention: dialog "Unsaved Changes" is open: Do you want to save the changes you made to "x.txt"?
Buttons: Save, Don't Save, Cancel
Resolve it with dialogs[0].click("Don't Save") or dialogs[0].cancel().
~~~

The US-1297 popup fallback must continue to contain menus node coming in US-1299; this task does
not create menus.

## Implementation Plan

1. Add a renderer AiVision dialogs module, proposed as
   src/renderer/scripting/ai-vision/dialogs/index.ts plus direct per-view adapter modules
   under src/renderer/scripting/ai-vision/dialogs/ (confirmation.ts, input.ts, text.ts,
   password.ts, commit.ts, create-board.ts, create-board-vars-storage.ts, edit-link.ts,
   library-setup.ts, namespace-collision.ts, open-url.ts, register-toolset.ts, tor-info.ts,
   and trust-board.ts).
   Keep index.ts a side-effect registration entry point and import it directly from
   src/renderer/scripting/ai-vision/root.ts alongside import "./namespaces". Use direct imports;
   do not create an unrelated barrel.
2. Build the adapter map in
   src/renderer/scripting/ai-vision/dialogs/index.ts: `Map<symbol, (entry: IDialogViewData) =>
   DialogAdapter>`. Register one factory for each of the 14 exported dialog view IDs (including
   `trustBoardDialogId`). Select by `entry.viewId`, not by model constructor, and do not call either
   shared AiVision registry. Keep a per-DialogsNode WeakMap keyed by the live entry so the same entry
   returns the same adapter within one resolve; build from the current array and do not retain stale
   entries across resolves.
3. Implement the per-view adapters under
   src/renderer/scripting/ai-vision/dialogs/ as classes that hold an `IDialogViewData` entry and
   implement `aiVision` directly, satisfying `isAiVisible()` from
   src/shared/ai-vision/types.ts:67-75. Each exposes real resolver members `title`, `message`, readonly
   `buttons: readonly string[]`, `click(button: string)`, and `cancel()`, plus only its inventory
   row's safe fields. All state-derived values read `entry.model.state.get()` live; only the four
   documented view-hardcoded title/message strings are adapter constants. `click()` uses exact visible labels and
   delegates closing/submit actions to the entry model; `cancel()` awaits `entry.model.close(undefined)`.
   No model-side base, named model subclasses, or changes under src/renderer/ui/dialogs are needed.
4. Add DialogsNode in the AiVision dialogs module. Its descriptor should be kind Dialogs, a concise
   summary, `node: true` root member metadata, children() mapped from live dialogsState with segment
   [index], and index(key) returning the current entry's adapter. Do not retain stale entries or use
   internalId in the public path. Reading state must be get()/map only and must not mount, focus,
   open, close, or invoke a dialog.
5. Keep all 14 dialog models and all 14 dialog views unchanged. The adapters are the only per-dialog
   implementation layer: their hard-coded TrustBoard/RegisterToolset/NamespaceCollision/TorInfo
   title/message constants mirror the verified view strings and carry comments naming the source
   view/line. The adapter map and live DialogsNode are the complete AiVision integration.
6. Define exact click(button) semantics from the inventory table. Match visible labels exactly;
   account for Commit’s actionButtonLabel() transformation; route result-bearing actions through
   close(result) or a model method that ends in close(result); use cancel() for an undefined result.
   Use one convention: buttons lists result-bearing controls and safe submit controls only; omit
   non-closing Browse and Tor Reconnect. click() rejects those omitted labels, and no adapter
   pretends that they have a close result. Unknown, omitted, and disabled labels throw ordinary
   Errors; resolver.ts:126-141 catches the invoked action error and formats it through errMessage.
7. Preserve the Password privacy rule in both adapter members and implementation: expose only
   the safe Encrypt/Decrypt button labels and cancel(). click("Encrypt")/click("Decrypt") invokes
   the existing submit action, awaits it, and returns no result; the adapter must not read,
   return, log, or shape the internal password or its close result. Invalid action errors must use
   the shared resolver path and any caught unknown error must use errMessage.
8. Add the root member and help text in src/renderer/scripting/ai-vision/root.ts. The member is
   node: true because the stable DialogsNode getter is side-effect free; its children remain
   dynamic. Update root help/examples only with dialogs paths; do not add menus (US-1299).
9. Verify descriptor discovery through helpSearch and $help: help-search.ts follows only node: true
   properties at :31-53 and dynamic children at :54-62, so dialogs must be reachable without
   probing each dialog getter. Confirm shapeResult() sees the descriptor on the direct child and
   never dumps dialog internals; its descriptor branch is result-shaper.ts:39-46.
10. Manually verify every inventory row’s button mapping, especially Confirmation’s string "Cancel"
    versus cancel() undefined, boolean dialogs, Commit’s visible transformed labels, async Commit
    canClose, non-closing controls, and Password’s no-value guarantee. Then run the coupled
    modified-page scenario from US-1297. No unit tests or hardcoded UI colors are to be added.

### Before → after snippets

Current root and live dialog entry shape:

~~~
// root.ts
const ROOT_MEMBERS = [
    { name: "ui", kind: "property", node: true, summary: "..." },
];

// DialogsView.ts / dialog-view-registry.ts
export const dialogsState = new TGlobalState<IDialogViewData[]>([]);
interface IDialogViewData { viewId: Symbol; model: TDialogModel; internalId?: string; }
~~~

Planned viewId-keyed adapter and root node:

~~~
type DialogAdapter = IAiVisible & {
    readonly entry: IDialogViewData;
    readonly title: string | undefined;
    readonly message: string | undefined;
    readonly buttons: readonly string[];
    click(button: string): Promise<unknown>;
    cancel(): Promise<undefined>;
};

class TrustBoardAdapter implements DialogAdapter {
    constructor(readonly entry: IDialogViewData) {}
    get title() { return "Trust this board?"; } // Mirrors TrustBoardDialogView.ts:57.
    get message() { return "Trusting this board lets it run programs on your computer with your full user privileges — including reading and changing your files and using any signed-in command-line tools (cloud CLIs, git, etc.)."; } // Mirrors TrustBoardDialogView.ts:30-32.
    get buttons() { return ["Cancel", "Trust Board"] as const; }
    get aiVision(): IAiVisionDescriptor { return TRUST_BOARD_DESCRIPTOR; }
    async click(button: string) { return closeForVisibleButton(this.entry, button); }
    async cancel(): Promise<undefined> {
        await this.entry.model.close(undefined);
        return undefined;
    }
}

const adapterFactories = new Map<symbol, (entry: IDialogViewData) => DialogAdapter>();

// DialogsNode: the cache is per resolve; state is read again for every operation.
class DialogsNode {
    private readonly adapters = new WeakMap<IDialogViewData, DialogAdapter>();
    private getAdapter(entry: IDialogViewData): DialogAdapter {
        const cached = this.adapters.get(entry);
        if (cached) return cached;
        const factory = adapterFactories.get(entry.viewId);
        if (!factory) throw new Error(`No dialog adapter for ${entry.viewId.toString()}.`);
        const adapter = factory(entry);
        this.adapters.set(entry, adapter);
        return adapter;
    }
    children(): readonly IAiChild[] {
        return dialogsState.get().map((entry, index) => {
            const adapter = this.getAdapter(entry);
            return { segment: `[${index}]`, kind: adapter.aiVision.kind, summary: adapter.aiVision.summary };
        });
    }
    index(key: string | number): DialogAdapter | undefined {
        const entry = dialogsState.get()[numericIndex(key)];
        return entry ? this.getAdapter(entry) : undefined;
    }
}

// root descriptor concept
{ name: "dialogs", kind: "property", node: true,
  summary: "Open renderer dialogs; index live entries." }
~~~

The adapter is the resolver target: `resolveCall()` reads its real properties and invokes its methods;
unknown, omitted, or disabled labels throw ordinary Errors. The resolver catches an invoked method's
error and returns the normal error result at resolver.ts:126-141.

## Concerns / Resolved decisions

- **The 14-class inventory is confirmed.** Thirteen dialog model/view pairs live in
  src/renderer/ui/dialogs; EditLinkDialogModel/EditLinkDialogView is the fourteenth pair and is
  editor-owned in src/renderer/editors/link-editor. There is no separate encryption model;
  PasswordDialogModel is the encryption/decryption prompt.
- **ViewId adapters resolve the constructor ambiguity.** The four bare model instances for
  Confirmation, NamespaceCollision, RegisterToolset, and TrustBoard all have runtime constructor
  TDialogModel, so constructor registration cannot distinguish them. The adapter map selects by
  each live entry's exported viewId and avoids changing those models.
- **Adapters provide real resolver members.** IAiVisionDescriptor.members is a whitelist, not a
  name-to-function map; resolveCall() reads target[name]. Each adapter owns real title, message,
  buttons, click, cancel, and safe fields, so no shared model base or virtual-member resolver
  extension is needed.
- **Common title/message do not exist uniformly.** Several views hard-code them: Trust Board at
  TrustBoardDialogView.ts:30-35 and :57, Register toolset at :31-37 and :58, Namespace collision at
  :35-36 and :55, and Tor info at :104-106 and :130. Each adapter carries the verified constants;
  it must not scrape DOM or expose arbitrary state.
- **Trust Board has no board-name field.** Its model only stores boardPath (TrustBoardDialog.ts:9-20).
  The adapter exposes boardPath and the static trust-scope sentence from the view; it does not
  derive or expose a board name.
- **Password click has a deliberately sanitized result.** The visible submit action closes with the
  secret inside PasswordDialogModel.submit(), while privacy forbids returning that result. The
  adapter click awaits the existing submit and returns no result. The internal close(password)
  value is never observed or serialized; invalid/failed validation leaves the prompt open and does
  not leak its error or secret.
- **Non-closing controls are intentionally omitted.** Browse opens a native OS picker in
  CreateBoard/CreateBoardVarsStorage/LibrarySetup, and Tor Reconnect updates state without close.
  The uniform buttons contract lists result-bearing controls plus Password's safe submit labels;
  click() rejects omitted controls rather than claiming a misleading result.
- **Live index races are expected.** A dialog can close between children() and index(); an absent
  current item must return the resolver’s normal No item error, never a stale model. Adapters
  must not retain stale IDialogViewData objects beyond the live state read.
- **US-1297 coupling is limited to path text.** US-1297 returns a pending result and its documented
  fallback before this task lands. Once adapters are loaded, the same attention text can name the
  live `dialogs[i].click(...)` or `.cancel()` path; pending timing and context lifetime are owned by
  US-1297.

## Acceptance Criteria

1. Call root discovery and helpSearch list a side-effect-free dialogs node; $help explains that
   children are live indexed adapters over dialog entries.
2. dialogs.children() reflects current dialogsState order and dialogs[i] resolves the current
   viewId-keyed adapter for the live IDialogViewData entry; stale/closed indexes fail cleanly. The
   same entry returns the same adapter within one resolve, while separate MCP calls need not preserve
   adapter identity.
3. Every one of the 14 on-disk dialog models has a viewId-keyed adapter and the documented
   state/button/result mapping; no model or view is changed.
4. Every adapter supplies real resolver members for the shared safe surface. click(label) uses exact
   visible labels, rejects unknown/omitted/disabled labels with a normal thrown Error, maps each
   result according to the inventory, awaits model submit/close so canClose is honored, and
   cancel() always routes close(undefined). The resolver reports thrown action errors at
   resolver.ts:126-141.
5. Password/encryption adapters expose only buttons and cancel(); no path reaches mode, message,
   error, password, confirm, or the returned secret.
6. US-1297 can render resolved dialog paths such as dialogs[0].click("Don't Save"); before this
   task’s registration is loaded, US-1297’s exact fallback remains valid and is not replaced by an
   unresolved path. The popup fallback still says menus node coming in US-1299.
7. Reading dialogs performs no UI/state mutation, creates no view, invokes no button, and does not
   mark a transient model closed. node: true is used only because this read is safe.
8. No menus node, native OS dialog driver/tracker, unit tests, or unrelated dialog classes are
   added in this task; no existing dialog behavior is removed.

## Files Changed Summary

| File | Planned change |
|---|---|
| doc/tasks/US-1298-dialogs-node/README.md | This investigation, 14-class inventory, and implementation plan. |
| doc/tasks/US-1297-call-attention/README.md | Coupled attention contract and fallback referenced by this task. |
| doc/active-work.md | Link US-1297 and US-1298 under EPIC-084. |
| doc/epics/EPIC-084.md | Mark US-1297 and US-1298 In Progress. |
| src/renderer/scripting/ai-vision/root.ts | Lazy-load dialogs registration and add the root member/help. |
| src/renderer/scripting/ai-vision/dialogs/index.ts | New lazy registration entry point and DialogsNode. |
| src/renderer/scripting/ai-vision/dialogs/confirmation.ts, input.ts, text.ts, password.ts, commit.ts, create-board.ts, create-board-vars-storage.ts, edit-link.ts, library-setup.ts, namespace-collision.ts, open-url.ts, register-toolset.ts, tor-info.ts, trust-board.ts | ViewId-keyed adapter classes, safe live fields, and exact button mappings. |

Files intentionally needing NO changes for US-1298:

| File/group | Reason |
|---|---|
| src/shared/ai-vision/types.ts, resolver.ts, hint.ts, result-shaper.ts, help-search.ts | Existing registry, resolver, hint, shaping, and safe-node traversal contracts are reused; no new shared protocol is required. |
| src/renderer/ui/dialogs/DialogsView.ts, Dialogs.ts, dialog-view-registry.ts | Live state, IDialogViewData shape, and close lifecycle are the source contract; do not move or duplicate dialog ownership. |
| src/renderer/core/state/model.ts | TDialogModel.close, canClose, and onClose already provide the required lifecycle gate at :63-92. |
| src/renderer/ui/dialogs/ConfirmationDialog.ts, InputDialog.ts, TextDialog.ts, PasswordDialog.ts, CommitDialog.ts, CreateBoardDialog.ts, CreateBoardVarsStorageDialog.ts, LibrarySetupDialog.ts, NamespaceCollisionDialog.ts, OpenUrlDialog.ts, RegisterToolsetDialog.ts, TorInfoDialog.ts, TrustBoardDialog.ts; src/renderer/editors/link-editor/EditLinkDialog.ts | Existing live models and state/button behavior are consumed by adapters; no model changes. |
| src/renderer/ui/dialogs/ConfirmationDialogView.ts, InputDialogView.ts, TextDialogView.ts, PasswordDialogView.ts, CommitDialogView.ts, CreateBoardDialogView.ts, CreateBoardVarsStorageDialogView.ts, LibrarySetupDialogView.ts, NamespaceCollisionDialogView.ts, OpenUrlDialogView.ts, RegisterToolsetDialogView.ts, TorInfoDialogView.ts, TrustBoardDialogView.ts; src/renderer/editors/link-editor/EditLinkDialogView.ts | Existing user-facing strings and button behavior are the mapping source; no view changes. |
| src/renderer/ui/dialogs/poppers/showPopupMenu.ts, PoppersView.ts | Popup reporting/fallback and US-1299’s menus node belong to US-1297/US-1299, not this node. |
| src/main/mcp/tools/call-tools.ts, src/main/mcp/ai-vision/* | Main pass-through/rendering is US-1297; dialog adapters are renderer-only. |
| src/renderer/api/mcp/command-registry.ts, call-command.ts, board-call-command.ts, src/board-shim.ts, src/main/board-bridge.ts | Existing dispatch and plain script/Board contracts do not need dialog-node-specific changes. |
| src/renderer/editors/text/TextFileActionsModel.ts | Unsaved Changes is reproduction consumer/evidence, not a behavior target. |
| doc/architecture/*, qa/runs/2026-09-05-epic-083-call-vs-tools.md | Existing architecture and QA evidence are referenced, not rewritten by this planning task. |
