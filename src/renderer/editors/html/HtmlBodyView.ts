import type { EditorConfig } from "../base/EditorConfig";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { dismissOverlays } from "../../uikit/shared/overlayLayer";
import type { HtmlEditor } from "./HtmlEditor";

// Injected into the previewed HTML. The nested browser document owns both listeners
// until navigation replaces that document; they are not host view/model resources.
// Two capture-phase listeners:
//  1. Block <a> navigation inside the preview.
//  2. On any pointerdown, ping the host (`html:interact`) so it can dismiss open
//     menus / popovers. The iframe is sandboxed (opaque origin) so its clicks
//     don't bubble to the host document.
const injectedScript = `<script>document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.href){e.preventDefault();}},true);document.addEventListener("pointerdown",function(){try{window.parent.postMessage({__persephone:"html:interact"},"*");}catch(e){}},true);</script>`;

// Injected ahead of the previewed document's own scripts, so it must go at the very top.
//
// The preview iframe is sandboxed without `allow-same-origin`, so its document has an opaque
// origin and its URL is `about:srcdoc` — rewriting the history URL from there is not allowed.
// How Chromium refuses depends on the host document's scheme: served over http (the dev server)
// it throws a catchable `SecurityError` and the page carries on, but under `file://` (a packaged
// build) it tears the frame down instead, leaving the preview a blank grey rectangle. Mockups
// that keep their tab in the URL (`history.replaceState(null, "", "#tab")`) therefore rendered in
// dev and showed nothing in the installed app.
//
// A no-op is the whole fix: the preview has no address bar and no session history of its own, so
// there is nothing for a history rewrite to mean here. Guarded on an opaque origin so this stays
// inert if the preview ever gains a real origin.
const injectedPrologue = `<script>(function(){if(location.origin!=="null")return;var noop=function(){};try{history.replaceState=noop;history.pushState=noop;}catch(e){}})();</script>`;

// A leading `<!doctype html>` has to stay first — anything ahead of it drops the preview into
// quirks mode.
const doctypePattern = /^\s*<!doctype[^>]*>/i;

function withInjectedScripts(content: string): string {
    const doctype = doctypePattern.exec(content);
    const at = doctype ? doctype[0].length : 0;
    return content.slice(0, at) + injectedPrologue + content.slice(at) + injectedScript;
}

export interface HtmlBodyViewProps {
    model: HtmlEditor;
    editorConfig?: EditorConfig;
}

export class HtmlBodyView extends VanillaView<HtmlBodyViewProps> {
    private readonly iframe: HTMLIFrameElement;
    private model: HtmlEditor;
    private hostSubscription: (() => void) | undefined;
    private boundModel: HtmlEditor | undefined;
    private boundHost: HtmlEditor["host"] = null;
    private queueSubscription: (() => void) | undefined;
    private appliedSrcdoc: string | undefined;

    public constructor(props: HtmlBodyViewProps) {
        const iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "allow-scripts");
        iframe.title = "HTML Preview";
        super(props, iframe);
        this.iframe = iframe;
        this.model = props.model;
    }

    protected onMount(): void {
        this.applyContent(this.model.host?.state.get().content ?? "");
        this.applyFrameStyle(this.props.editorConfig);
        this.model.setCaptureElement(this.iframe);
        this.bindToHostIfNeeded();
        this.installMessageListener();
        this.queueSubscription = this.ownSubscription(this.model.typedQueue.subscribe(() => {
            // Deliberate no-op: drain the focus queue to keep its lifecycle clean.
        }));
    }

    protected onUpdate(props: HtmlBodyViewProps): void {
        this.applyFrameStyle(props.editorConfig);

        const modelChanged = this.model !== props.model;
        if (modelChanged) {
            this.model.setCaptureElement(null);
            this.queueSubscription?.();
            this.queueSubscription = undefined;
            this.model = props.model;
            this.model.setCaptureElement(this.iframe);
            this.queueSubscription = this.ownSubscription(this.model.typedQueue.subscribe(() => {
                // Deliberate no-op: drain the focus queue to keep its lifecycle clean.
            }));
        }

        this.bindToHostIfNeeded();
        this.applyContent(this.model.host?.state.get().content ?? "");
    }

    protected onDispose(): void {
        this.model.setCaptureElement(null);
    }

    private applyContent(content: string): void {
        // Assigning `srcdoc` navigates the nested document — it reloads the
        // preview and re-runs its scripts. The previous view wrote the attribute only when
        // the value actually changed, and `onUpdate` fires on every shell re-render, so an
        // unguarded write would reload the preview (losing
        // scroll position) on updates that did not touch the content.
        const next = withInjectedScripts(content);
        if (next === this.appliedSrcdoc) return;
        this.appliedSrcdoc = next;
        this.iframe.srcdoc = next;
    }

    private applyFrameStyle(editorConfig?: EditorConfig): void {
        const maxH = editorConfig?.maxEditorHeight;
        this.iframe.style.border = "none";
        if (maxH !== undefined) {
            this.iframe.style.flex = "";
            this.iframe.style.height = `${maxH}px`;
            this.iframe.style.width = "100%";
        } else {
            this.iframe.style.flex = "1";
            this.iframe.style.height = "";
            this.iframe.style.width = "";
        }
    }

    private bindToHostIfNeeded(): void {
        const host = this.model.host;
        if (this.model === this.boundModel && host === this.boundHost && this.hostSubscription) return;

        this.hostSubscription?.();
        this.hostSubscription = undefined;
        this.boundModel = this.model;
        this.boundHost = host;
        if (!host) return;

        this.hostSubscription = this.ownSubscription(host.state.subscribe(
            (content: string) => this.applyContent(content),
            (state) => state.content,
        ));
    }

    private installMessageListener(): void {
        const onMessage = (event: MessageEvent): void => {
            if (event.source !== this.iframe.contentWindow) return;
            const data = event.data as { __persephone?: string } | undefined;
            if (data?.__persephone === "html:interact") {
                dismissOverlays();
                // Clicking inside a sandboxed iframe makes it the host document's `activeElement`
                // but dispatches no focus event here, so nothing bubbles to an ancestor that tracks
                // focus — a notebook note holding an HTML preview stayed inactive however much the
                // user clicked in it.
                //
                // `focus()` alone is not enough: by then the iframe usually *is* the activeElement,
                // and focusing an already-focused element is specified as a no-op that emits
                // nothing. So announce the transition ourselves in exactly that case. Listeners are
                // expected to be idempotent about focus they already believe they have.
                const alreadyFocused = document.activeElement === this.iframe;
                this.iframe.focus();
                if (alreadyFocused) {
                    this.iframe.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
                }
            }
        };

        window.addEventListener("message", onMessage);
        this.ownSubscription(() => window.removeEventListener("message", onMessage));
    }
}
