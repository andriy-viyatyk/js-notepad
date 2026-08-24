# US-1048: hast -> DOM markdown renderer; MarkdownBlock to vanilla

## Goal

Replace only react-markdown's final HAST-to-JSX step with a framework-free HAST-to-DOM
renderer. Keep the existing remark/rehype pipeline, markdown DOM shape, CSS scope,
link behavior, search commands, and React-facing MarkdownBlockProps contract. Move the
three mounted overrides (code, pre, img) to vanilla views; turn checkbox and link
handling into rehype HAST rewrites.

This is an investigation and implementation plan only. It does not authorize
implementation, tests, dashboard edits, epic edits, or a commit.

## Background

### Current pipeline and measured surface

src/renderer/editors/markdown/MarkdownBlock.tsx:1-310 delegates to ReactMarkdown
10.1.0. The installed react-markdown source at node_modules/react-markdown/lib/index.js
verifies this order:

    unified -> remark-parse -> remark plugins -> remark-rehype
            -> rehype plugins -> react-markdown post() -> hast-util-to-jsx-runtime

Its createProcessor at lines 262-273 builds the processor. Its post() at lines
313-384 applies urlTransform, turns any remaining raw node into text unless HTML is
skipped, and calls toJsxRuntime. This task keeps every stage through the rehype plugins
and replaces only the last conversion.

Measured files:

| File | Lines | Current role |
|---|---:|---|
| src/renderer/editors/markdown/MarkdownBlock.tsx | 323 | React renderer host, preprocessing, plugins, async git-root resolution, context menu, match counting, and command queue |
| src/renderer/editors/markdown/CodeBlock.tsx | 246 | code/pre overrides, Mermaid rendering, two component models, and image-copy helper |
| src/renderer/editors/markdown/MarkdownImage.tsx | 55 | img override with copy/open toolbar |
| src/renderer/editors/markdown/rehypeHeadingIds.ts | 77 | Framework-free heading-id plugin |
| src/renderer/editors/markdown/rehypeHighlight.ts | 86 | Framework-free search-highlight plugin |

The current five override entries are at MarkdownBlock.tsx:127-156:

- code selects CodeBlock, which uses ColorizedCode for recognized Monaco languages and
  otherwise emits a normal code element.
- pre selects createPreBlock, which replaces Mermaid fences with the inline Mermaid
  surface and wraps other fenced code in div.code-block-wrapper, pre, and a copy button.
- input replaces task-list checkboxes with CheckedIcon or UncheckedIcon.
- a decodes through react-markdown's urlTransform, resolves through resolveRelatedLink,
  and emits an anchor.
- img resolves src and mounts MarkdownImage.

E1-10 settles the split: input and a become HAST-to-HAST rehype plugins. Only code,
pre, and img need a substitution seam. hast-util-to-dom is not adopted. The four
already-transitive packages that become direct dependencies are unified, remark-parse,
remark-rehype, and property-information. remark-gfm and rehype-raw are already direct.
react-markdown and hast-util-to-jsx-runtime remain until Epic F removes them.

The installed versions checked were unified 11.0.5, remark-parse 11.0.0,
remark-rehype 11.1.2, rehype-raw 7.0.0, and property-information 7.1.0.
property-information/index.js exports html and svg schemas and find(schema, name).
Its Info records canonical DOM property, serialized attribute, namespace,
boolean/number/list behavior, and whether a value must be assigned as a DOM property.
The walker must use this map; it must not invent a local className/htmlFor/SVG/boolean map.

### Consumer contract audit

The prompt describes eight consumers. A repository-wide search of this checkout finds
five runtime JSX call sites, one value/type re-export module, and no additional
MarkdownBlock call site. The five calls and two exported contract edges below are the
complete evidence; the implementation preserves the public face so none needs a source
change.

| File and line | Exact current usage | Contract consequence |
|---|---|---|
| src/renderer/editors/markdown/MarkdownBody.tsx:238-245 | commandQueue, content, highlightText, compact, filePath, onMatchCountChange | All six remain accepted and forwarded unchanged. |
| src/renderer/editors/mcp-inspector/ResourceContentView.tsx:86 | content={content.text}, compact | No new required prop. |
| src/renderer/editors/mcp-inspector/McpInspectorView.tsx:389 | content={state.instructions}, compact | Embedded compact surface remains valid. |
| src/renderer/editors/log-view/items/MarkdownOutputView.tsx:33 | content={entry.text}, compact | No callback or file path is supplied. |
| src/renderer/editors/mneme-root/MnemeRootEditorView.tsx:247 | content={resultsMarkdown}, compact, highlightText={s.searchQuery} | Highlighting remains a rehype input. |
| src/renderer/editors/markdown/index.tsx:73 | Re-exports MarkdownBlock | Named React face remains available. |
| src/renderer/editors/markdown/index.tsx:74 | Re-exports MarkdownBlockProps | Exact interface remains available. |
| src/renderer/editors/markdown/MarkdownBlock.tsx:161 | Defines the exported MarkdownBlock(props: MarkdownBlockProps) face | This is the eighth contract edge if the face itself is counted; it becomes a thin adapter. |

The source evidence does not support eight independent runtime consumers. The plan
treats the five actual call sites as immutable and preserves all eight listed contract
edges rather than inventing three paths.

### Reference conversions

src/renderer/editors/shared/ColorizedCodeView.ts is the direct prerequisite. It owns a
code root, applies residual attributes, writes readable textContent while colorization
is pending, rejects stale async results, and has the one guarded innerHTML write allowed
by roadmap section 3.4. That exception is justified because Monaco escapes source angle
brackets and emits only code-owned span.mtk-* markup. The comment and
if (this.root.innerHTML !== html) guard must remain there. The markdown walker adds no
comparable exception.

src/renderer/editors/mermaid/MermaidBodyView.ts proves the vanilla lifecycle and
SubtreeSwap pattern, but its model and panel/viewport layout are for the standalone
Mermaid editor. The reusable render path is render-mermaid.ts: inline markdown already
uses renderMermaidSvg and svgToDataUrl, so SVG generation is shared. Inline
error/loading/toolbar/copy remains a distinct view; that duplication is real and belongs
in the removal ledger.

src/renderer/editors/shared/MonacoDiffEditorHostView.ts establishes explicit widget
ownership but is not a dependency here. ColorizedCodeView calls static
monaco.editor.colorize and creates no widget or text model, so no Monaco host is reused
or added.

doc/tasks/US-1044-editors-shared-vanilla/README.md section 3.4 documents the only
existing rich-markup exception. Project rules also require direct imports, static
co-located CSS, no hardcoded colors, errMessage/guard for caught unknown values, and no
direct require("path") or require("fs").

## Implementation Plan

### 1. Add direct pipeline dependencies

Modify package.json and refresh package-lock.json so source imports are declared
directly. Add property-information ^7.0.0, remark-parse ^11.0.0, remark-rehype ^11.0.0,
and unified ^11.0.0 alongside the existing react-markdown, rehype-raw, and remark-gfm.
Keep react-markdown until Epic F. Do not add hast-util-to-dom or any other package.

Before:

~~~json
"react-markdown": "^10.1.0",
"rehype-raw": "^7.0.0",
"remark-gfm": "^4.0.1"
~~~

After:

~~~json
"property-information": "^7.0.0",
"react-markdown": "^10.1.0",
"rehype-raw": "^7.0.0",
"remark-gfm": "^4.0.1",
"remark-parse": "^11.0.0",
"remark-rehype": "^11.0.0",
"unified": "^11.0.0"
~~~

### 2. Keep the React face and add MarkdownBlockView

Change src/renderer/editors/markdown/MarkdownBlock.tsx from the hook/JSX renderer to
the thin-face pattern. Keep every field of MarkdownBlockProps, including
style?: React.CSSProperties and all optional fields.

Before:

~~~tsx
import ReactMarkdown, { Components } from "react-markdown";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// preprocessing, getComponents(), hooks, and ReactMarkdown JSX follow

export const MarkdownBlock = function MarkdownBlock(props: MarkdownBlockProps) {
    // React state/effects and JSX tree construction live here.
};
~~~

After:

~~~tsx
import { mountVanilla } from "../../uikit/shared/mount";
import { MarkdownBlockView } from "./MarkdownBlockView";
import type { MarkdownBlockProps } from "./MarkdownBlockView";

export type { MarkdownBlockProps } from "./MarkdownBlockView";

export function MarkdownBlock(props: MarkdownBlockProps) {
    return mountVanilla(MarkdownBlockView, props);
}
~~~

The exact location of the interface may remain in the face file if that avoids a type
cycle; the emitted public signature must be identical. Add
src/renderer/editors/markdown/MarkdownBlockView.ts as the sole owner of preprocessing,
pipeline execution, DOM rendering, async wiki-root resolution, context menu, match
counting, queue commands, and anchors. Keep the existing preprocessFrontmatter and
preprocessFencedContainers bodies unchanged, including BOM and empty-frontmatter cases.

Build one processor in the same order as react-markdown:

~~~ts
const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeMarkdownOverrides, { filePath, wikiRoot })
    .use(rehypeHeadingIds)
    .use(rehypeHighlight, highlightText);

const tree = processor.runSync(processor.parse(processedContent));
renderHast(root, tree, substitutionContext);
~~~

Use the existing heading-id and highlight plugins unchanged. The new override plugin
runs after rehypeRaw so raw HTML has already become ordinary HAST.

#### Walker shape and property mapping

Implement an auditable recursive walker in MarkdownBlockView.ts or a directly imported,
markdown-local helper. It must have these behaviors:

1. A root renders children into a DocumentFragment or the markdown root.
2. A text node becomes document.createTextNode(node.value).
3. An element uses document.createElement(tagName) in HTML context and
   document.createElementNS("http://www.w3.org/2000/svg", tagName) in SVG context.
   Entering svg switches to the SVG property-information schema; leaving restores the
   parent namespace. Handle foreignObject's HTML boundary.
4. Every property uses find(html, key) or find(svg, key). Use Info.property,
   Info.attribute, mustUseProperty, boolean/booleanish, overloaded-boolean, number,
   comma-separated, and space-separated metadata. Arrays become the same comma- or
   space-separated strings as hast-util-to-jsx-runtime. checked, multiple, muted, and
   selected use the DOM property path because property-information marks them
   mustUseProperty. Remove nullish and NaN values. Styles use the element style or
   attribute API, never a markup string.
5. Do not install event handlers from HAST. The verified rehypeRaw sample produces an
   onError property for raw HTML; it is not a React event function and must be omitted
   rather than assigned as an attribute.
6. A raw node is not expected after rehypeRaw: rehype-raw parses raw strings into
   element/text/comment HAST before the walker. If one reaches the defensive branch,
   emit document.createTextNode(node.value), never parse or assign it as markup.
   Unsupported/comment nodes follow the current JSX converter's behavior and are ignored.
7. Before normal element creation, call a substitution callback for code, pre, and img.
   It returns a detached view root or a native root for a plain code element, records
   every created VanillaView, appends its root, then mounts it. Normal children are
   rendered only when substitution declines.

The walker builds every ordinary markdown node with createElement/createElementNS plus
text nodes or textContent and never assembles markup strings. Existing icon DOM builders
may retain their own static, code-owned SVG template implementation; that is outside the
walker and adds no markdown innerHTML exception.

#### Transient ownership

Do not call this.child(view) for every code/image/Mermaid node. child() claims ownership
but does not mount, and its lifetime is correct only when it matches the parent. A
markdown re-walk retires and recreates these nodes constantly.

MarkdownBlockView must keep a per-render list of created views, claim each once with the
explicit ownership helper or equivalent local collection, mount each after its root is
attached, and dispose/remove the complete old list before installing the next tree.
Dispose nested/transient views before host roots and make root removal explicit:
VanillaView.dispose() deliberately does not detach root. Mount failure cleanup must
preserve the original unknown error and use errMessage/guard for reporting catches.

### 3. Add the HAST rewrite plugins

Add src/renderer/editors/markdown/rehypeMarkdownOverrides.ts. It exports a factory
receiving filePath and wikiRoot and performs HAST mutations only:

- For input with properties.type === "checkbox", replace the input node with the HAST
  SVG equivalent of the existing 14x14 checked/unchecked icon. The replacement is
  ordinary SVG HAST and goes through the generic walker; it is not a DOM substitution
  and creates no React or vanilla root. Preserve checked state and non-interactive
  disabled/task-list semantics.
- For a, safely decode properties.href and replace it with
  resolveRelatedLink(filePath, decodedHref, wikiRoot). Preserve other properties and
  children.
- Apply the same safe decode/resolve operation to img properties.src before the img
  substitution, preserving the current MarkdownImage contract.

Before:

~~~tsx
const getComponents = (...) => ({
    input: ({ node, ...props }) => props.type === "checkbox"
        ? (props.checked ? <CheckedIcon /> : <UncheckedIcon />)
        : <input {...props} />,
    a: ({ href, children, ...props }) =>
        <a href={resolveRelatedLink(filePath, href, wikiRoot)} {...props}>{children}</a>,
    img: ({ src, ...props }) =>
        <MarkdownImage src={resolveRelatedLink(filePath, src, wikiRoot)} {...props} />,
});
~~~

After:

~~~ts
const rehypePlugins = [
    rehypeRaw,
    [rehypeMarkdownOverrides, { filePath, wikiRoot }],
    rehypeHeadingIds,
    ...(highlightText ? [createRehypeHighlight(highlightText)] : []),
];

// a/checkbox are ordinary HAST here; only code/pre/img invoke
// context.substitute(node) during renderHast().
~~~

The existing heading-id and highlight files need no edits. Do not add
unist-util-visit merely for this recursion.

### 4. Convert CodeBlock.tsx to CodeBlock.ts

Rename src/renderer/editors/markdown/CodeBlock.tsx to
src/renderer/editors/markdown/CodeBlock.ts. Remove React hooks, JSX, React.ReactNode,
and useComponentModel. Keep the language alias map, resolveLanguage, Mermaid language
detection, and copyImageToClipboard.

The code override must recognize language-* using the existing Monaco aliases, strip
the terminal newline for ColorizedCodeView, pass HAST properties through the shared
property mapper, and otherwise preserve a native code element with rendered children.

Before:

~~~tsx
export function CodeBlock({ className, children, node, ...props }: CodeBlockProps) {
    const language = resolveLanguage(className);
    return language
        ? <ColorizedCode code={String(children).replace(/\n$/, "")} ... />
        : <code className={className} {...props}>{children}</code>;
}
~~~

After, schematic:

~~~ts
export function createCodeBlockNode(node: Element, context: MarkdownRenderContext): Node {
    const properties = context.toDomProperties(node.properties, "html");
    const language = resolveLanguage(properties.className);
    if (language) {
        const view = new ColorizedCodeView({
            ...properties,
            code: hastText(node).replace(/\n$/, ""),
            language,
        });
        context.track(view);
        return view.root;
    }
    return context.renderElement("code", properties, node.children);
}
~~~

Use direct import of ColorizedCodeView; do not add a Monaco editor host.

MermaidModel survives as the model for rendered svgUrl, error, and copied state because
all state the view renders remains model-owned under E1-7. Refactor its React init/effect
registration into an explicit-driver-compatible prop update path with a generation guard
around renderMermaidSvg and svgToDataUrl; createComponentModelDriver rejects models that
register effects. Use errMessage(error, "Failed to render diagram") for caught unknown
values and invalidate pending work on disposal.

MermaidBlock becomes MermaidBlockView. Build the current inline tree with createElement,
native button listeners, existing icon DOM builders, and existing CSS classes. Reuse the
shared render-mermaid.ts path, not standalone MermaidBodyView. Keep open-in-editor and
image-copy actions, clear the copied timer on disposal, and preserve the current
mutually-exclusive inline error/loading/diagram output.

CodePreModel also survives as the model for copied state. It has no effects, so a
createComponentModelDriver is appropriate. CodePreBlock becomes a vanilla view that
creates the wrapper, pre, copy button, and native listener, binds copied to the button
class, renders the HAST child into pre, and cleans up its feedback timer. Preserve
code-block-wrapper, copy-btn, and copied classes.

| Existing model | After conversion | Reason |
|---|---|---|
| MermaidModel | Retained and driven by the vanilla lifecycle; async render/cancellation moves to explicit prop/dispose path | svgUrl, error, and copied are rendered state; the React effect API cannot be passed to createComponentModelDriver. |
| CodePreModel | Retained and driven by the vanilla lifecycle | copied is rendered state and the model is already effect-free. |

### 5. Convert MarkdownImage.tsx to MarkdownImage.ts

Rename src/renderer/editors/markdown/MarkdownImage.tsx to
src/renderer/editors/markdown/MarkdownImage.ts. Replace hooks and JSX with
MarkdownImageView extends VanillaView<MarkdownImageProps>.

Before:

~~~tsx
export function MarkdownImage({ src, ...props }: MarkdownImageProps) {
    const [copied, setCopied] = useState(false);
    return <span className="md-image">
        <img ref={imgRef} src={src} {...props} />
        <div className="diagram-toolbar">...</div>
    </span>;
}
~~~

After, schematic:

~~~ts
export class MarkdownImageView extends VanillaView<MarkdownImageViewProps> {
    public constructor(props: MarkdownImageViewProps) {
        const root = document.createElement("span");
        root.className = "md-image";
        super(props, root);
    }

    protected onMount(): void {
        // Build img, toolbar, native listeners, and existing Copy/Open icons.
        // Apply HAST properties through property-information, never markup strings.
    }
}
~~~

Preserve data:/blob: open-button suppression, resolved src, canvas copy behavior,
app.events.openRawLink.sendAsync(createLinkData(src)), 14x14 icons, title attributes,
all CSS class names, and timer cleanup. This transient view is tracked by the
MarkdownBlockView render ownership collection, not by child().

### 6. Port state and commands to explicit vanilla homes

The vanilla host must preserve these behaviors:

| Existing behavior | Vanilla home |
|---|---|
| preprocessFencedContainers and preprocessFrontmatter | Pure functions in MarkdownBlockView.ts before processor.parse; keep BOM, empty-frontmatter, and Mermaid-container cases. |
| detectGitRoot async wikiRoot | Field plus generation/cancel flag and detectGitRoot(filePath) cleanup. On a current result, set wikiRoot and re-walk so links/images resolve again. |
| findAnchorTarget's exact-id, case-insensitive-id, slug-of-fragment passes | Same function and logic, scoped to this root and using CSS.escape. |
| onMatchCountChange | After each walk, count .highlighted-text; reset to zero without highlighting; notify only on a changed count using the latest callback. |
| commandQueue scrollToMatch and fragment navigation | commandQueue.register(handler) in onMount; unregister/re-register if the optional queue changes. Remove active class, add requested class, and schedule smooth scroll; anchor requests use findAnchorTarget. Absent queue is a no-op. |
| Link context menu | One native contextmenu listener. Find closest anchor, reuse ContextMenuEvent.fromNativeEvent, preserve Open in New Tab, Copy Link, external browser items, lazy imports, and href rules. |
| Root class/style and CSS import | Keep MarkdownBlock.css unchanged; preserve markdown-block/compact class calculation and explicitly remove stale style keys. |

Use incoming props directly in onUpdate. VanillaView.update assigns this.props before
onUpdate, so this.props cannot be treated as the old props. VanillaView.dispose does
not detach root, so owner cleanup must remove roots.

### 7. Re-render policy and split verdict

The effective re-render inputs today are content, highlightText, filePath, resolved
wikiRoot, and Mermaid light mode when processed content contains a Mermaid fence.
For each, re-run preprocessing, the full unified pipeline, and the full HAST walk.
Leave the root element, root event listener, queue machinery, and git-root machinery
in place. compact, className, style, and callbacks can update root fields without a
HAST re-walk; a queue change updates only request registration.

A full re-walk is intentional. It disposes every transient override before installing
the new tree and avoids stale Mermaid, colorization, image, or copy state. Do not add
keyed incremental patching in this task.

The conversion cannot be split at the walker. A walker without code/pre either regresses
Monaco/Mermaid output or mounts a React root per code block, worse than today. An img-less
pass regresses the image toolbar. The three substitutions, transient ownership, and
pipeline must land together; the clean split is between the unchanged upstream pipeline
and this complete final renderer.

### Files that need NO changes

- src/renderer/editors/markdown/MarkdownBlock.css and its .markdown-block scoping.
- src/renderer/editors/markdown/rehypeHeadingIds.ts and rehypeHighlight.ts.
- src/renderer/editors/shared/ColorizedCode.tsx and ColorizedCodeView.ts.
- src/renderer/editors/mermaid/MermaidBodyView.ts, render-mermaid.ts, and index.tsx.
- src/renderer/editors/shared/MonacoDiffEditorHostView.ts and its CSS.
- src/renderer/editors/markdown/MarkdownBody.tsx and MarkdownEditor.ts.
- All five runtime consumer files listed in the consumer table.
- src/renderer/editors/markdown/index.tsx.
- doc/active-work.md and doc/epics/EPIC-059.md.

## Concerns

### Security and output fidelity

Markdown is untrusted input in a nodeIntegration:true, contextIsolation:false, no-CSP
renderer. No new walker code may assign interpolated content to innerHTML; all text
uses text nodes/textContent and all structure uses createElement/createElementNS.
rehypeRaw is safe to keep because it parses raw strings into HAST before this code runs.
The defensive raw branch renders a raw value as literal text. on* properties from raw
HTML are omitted rather than installed.

The only sanctioned innerHTML write remains in ColorizedCodeView.ts, guarded and
justified by Monaco escaping. Existing static icon builders may retain their
code-owned SVG template behavior; that is outside this walker.

The property mapper must be checked against property-information HTML/SVG schemas for
arrays, checked, hidden, disabled, data-*, ARIA, style, and SVG camel-case attributes.
A short hand-rolled mapping is disallowed.

### View lifetime and async work

The largest correctness hazard is repeated transient view creation. child() is wrong
for these nodes because ownership is permanent while markdown branches are temporary.
The render collection must claim, mount, dispose, and detach every override root
explicitly. Mermaid render generations, Monaco generations, copy timers, queue
subscriptions, and async git-root lookup all need disposal guards.

MermaidBodyView cannot absorb the inline Mermaid implementation without changing the
output tree, model contract, or toolbar behavior. Honest reuse is the shared
renderMermaidSvg/svgToDataUrl path. The remaining inline/standalone duplication belongs
in the removal ledger for a later consolidation decision.

### Size and now-or-defer verdict

This is technically implementable now: US-1044 supplied the colorization seam, US-1046
supplied the Mermaid lifecycle precedent, and E1-10 removed dependency/design
uncertainty. It is not cleanly splittable: the security-sensitive walker and all three
mounted substitutions are one correctness unit, and both CodeBlock models need
lifecycle changes together.

The evidence favors **defer to Epic E2**. No E1 task in the current tree depends on a
vanilla MarkdownBlock; existing users can keep the unchanged React face, while E2 is
the epic that will create the markdown editor's first complete vanilla owner and can
consume this whole plan as one unit. Deferral does not discard work or reduce scope:
E2 inherits this exact walker, plugin, lifecycle, security, and consumer-contract plan.

## Acceptance Criteria

- MarkdownBlock.tsx keeps the exact MarkdownBlockProps fields/optionality and becomes
  only a mountVanilla(MarkdownBlockView, props) face. All five runtime call sites and
  the value/type re-export compile without edits.
- MarkdownBlockView preserves frontmatter and fenced-container preprocessing,
  synchronous remark/rehype output, heading IDs, highlight spans, root scoping,
  class/style behavior, context-menu items, match counting, queue requests, async
  wikiRoot re-resolution, and the three-pass anchor lookup.
- Pipeline order remains remark-parse -> remark-gfm -> remark-rehype with dangerous HTML
  enabled -> rehype-raw -> markdown overrides -> existing heading/highlight plugins.
  react-markdown's final JSX conversion is gone from source; its package remains until
  Epic F.
- The walker handles root, element, text, SVG namespace, and defensive raw nodes; uses
  property-information for HTML/SVG mapping; maps list/boolean/property values; omits
  untrusted event-handler properties; and never uses innerHTML or markup-string assembly
  for markdown content.
- After rehypeRaw, ordinary/raw HTML reaches the walker as element/text HAST, not raw
  strings. A forced raw node is literal text and cannot enter the HTML parser.
- Checkbox replacement and URL rewriting are rehype HAST plugins with no React roots or
  per-node vanilla views. Link/image URLs retain decodeURIComponent, malformed-escape
  fallback, resolveRelatedLink, and async wikiRoot behavior.
- code, pre, and img substitutions mount vanilla roots with no React root per node.
  ColorizedCodeView is used for language code; fenced-code wrapper/pre/copy, Mermaid
  loading/error/diagram/copy/open, image copy/open, and all CSS hooks remain intact.
- MermaidModel and CodePreModel remain model-owned rendered state and are compatible
  with the explicit vanilla model driver. Async and timer resources are disposed.
- Every retired transient view is disposed and its root detached. onUpdate uses incoming
  props, and owner code handles the fact that VanillaView.dispose does not detach root.
- content, highlightText, filePath, wikiRoot, and Mermaid light-mode changes re-walk
  the full tree where applicable; root listeners/queue plumbing/root element are reused.
- MarkdownBlock.css is unchanged, .markdown-block remains the scope, and visible output
  matches React apart from the established adapter host.
- package.json/package-lock.json directly declare only the four settled pipeline packages;
  hast-util-to-dom is absent and no new dependency is introduced.
- No hardcoded colors, Emotion, inline layout styling, require("path"), require("fs"),
  unsafe caught-error stringification, unit tests, dashboard/epic edits, or commit are
  added. Written files are UTF-8 and non-ASCII text is checked.

## Files Changed

| File | Planned change |
|---|---|
| package.json | Add direct declarations for unified, remark-parse, remark-rehype, and property-information; retain existing markdown packages. |
| package-lock.json | Refresh direct dependency metadata without adding hast-util-to-dom. |
| src/renderer/editors/markdown/MarkdownBlock.tsx | Preserve React-facing exports and reduce implementation to the mountVanilla adapter. |
| src/renderer/editors/markdown/MarkdownBlockView.ts | New vanilla host: preprocessing, unified pipeline, safe HAST walker, substitutions, wiki-root, context menu, match count, queue, anchors, and root updates. |
| src/renderer/editors/markdown/rehypeMarkdownOverrides.ts | New checkbox-icon and URL HAST rewrite plugins. |
| src/renderer/editors/markdown/CodeBlock.tsx -> src/renderer/editors/markdown/CodeBlock.ts | Remove React JSX/hooks; add vanilla code/pre/Mermaid views and explicit model-driver lifecycle while retaining aliases and image-copy helper. |
| src/renderer/editors/markdown/MarkdownImage.tsx -> src/renderer/editors/markdown/MarkdownImage.ts | Replace React image override with MarkdownImageView and native toolbar behavior. |
