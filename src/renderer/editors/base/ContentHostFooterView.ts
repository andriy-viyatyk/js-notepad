import type { IContentPipe } from "../../api/types/io.pipe";
import color from "../../theme/color";
import { DEFAULT_BROWSER_COLOR, MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { DividerView } from "../../uikit/Divider/DividerView";
import { fillSlot, type SlotContent } from "../../uikit/shared/fill-slot";
import { createIconElement } from "../../uikit/shared/slots";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { EditorToolbarView } from "./EditorToolbarView";
import type { TextFileModel } from "../text/TextEditorModel";
import "../../uikit/Button/Button.css";
import "../../uikit/Divider/Divider.css";
import "../../uikit/Spacer/Spacer.css";
import "./ContentHostFooter.css";

export interface ContentHostFooterViewProps {
    host: TextFileModel;
    footerContributions?: SlotContent;
}

interface ProviderMeta {
    label: string;
    createIcon: () => SVGElement;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
    file: {
        label: "Local file",
        createIcon: () => createIconElement("folder-open", { width: 16, height: 16, color: color.text.light }),
    },
    http: {
        label: "HTTP",
        createIcon: () => createIconElement("globe", { width: 16, height: 16, color: DEFAULT_BROWSER_COLOR }),
    },
    mneme: {
        label: "Mneme",
        createIcon: () => createIconElement("memory", { width: 16, height: 16, color: MEMORY_ICON_COLOR }),
    },
};

/** Native footer composition. The owned toolbar root remains the public footer root. */
export class ContentHostFooterView extends VanillaView<ContentHostFooterViewProps> {
    private readonly toolbar: EditorToolbarView;
    private footerContent: HTMLSpanElement | undefined;
    private footerContributions: HTMLSpanElement | undefined;
    private encodingLabel: HTMLSpanElement | undefined;
    private providerBadge: HTMLSpanElement | undefined;
    private contributionCleanup: (() => void) | undefined;

    public constructor(props: ContentHostFooterViewProps) {
        const toolbar = new EditorToolbarView({ name: "text-chrome-footer", borderTop: true });
        super(props, toolbar.root);
        this.toolbar = toolbar;
    }

    protected onMount(): void {
        this.child(this.toolbar);
        this.toolbar.mount();

        const footerContent = document.createElement("span");
        footerContent.dataset.part = "footer-content";
        this.footerContent = footerContent;

        // Let EditorToolbarView own the toolbar slot transition.
        this.toolbar.update({ name: "text-chrome-footer", borderTop: true, children: footerContent });

        if (this.props.host.script) {
            const scriptLabel = document.createElement("span");
            scriptLabel.dataset.part = "script-label";
            scriptLabel.textContent = "script";
            const scriptButton = this.child(new ButtonView({
                name: "text-toggle-script",
                variant: "ghost",
                size: "sm",
                onClick: this.props.host.script.toggleOpen,
                children: scriptLabel,
            }));
            footerContent.append(scriptButton.root);
            scriptButton.mount();

            this.bind(this.props.host.script.state, (state) => state.open, (open) => {
                scriptLabel.dataset.state = open ? "open" : "closed";
            });
        }

        const spacer = this.child(new SpacerView({}));
        footerContent.append(spacer.root);
        spacer.mount();

        const footerContributions = document.createElement("span");
        footerContributions.dataset.part = "footer-contributions";
        this.footerContributions = footerContributions;
        footerContent.append(footerContributions);

        const divider = this.child(new DividerView({ orientation: "vertical" }));
        footerContent.append(divider.root);
        divider.mount();

        const encodingLabel = document.createElement("span");
        encodingLabel.dataset.part = "encoding-label";
        this.encodingLabel = encodingLabel;
        footerContent.append(encodingLabel);

        this.updateContributions(this.props.footerContributions);
        this.bind(this.props.host.state, (state) => state.encoding, (encoding) => {
            encodingLabel.textContent = encoding || "utf-8";
        });
        this.bind(this.props.host.pipeState, (pipe) => pipe, (pipe) => {
            this.renderProvider(pipe);
        });

        this.own(() => {
            this.contributionCleanup?.();
            this.contributionCleanup = undefined;
        });
    }

    protected onUpdate(props: ContentHostFooterViewProps): void {
        this.updateContributions(props.footerContributions);
    }

    protected onDispose(): void {
        this.footerContent = undefined;
        this.footerContributions = undefined;
        this.encodingLabel = undefined;
        this.providerBadge = undefined;
    }

    private updateContributions(contributions: SlotContent | undefined): void {
        if (!this.footerContributions) return;
        this.contributionCleanup = fillSlot(this.footerContributions, contributions);
    }

    private renderProvider(pipe: IContentPipe | null): void {
        this.providerBadge?.remove();
        this.providerBadge = undefined;

        if (!pipe || !this.footerContent || !this.encodingLabel) return;

        const meta = PROVIDER_META[pipe.provider.type];
        const isArchive = pipe.transformers.some((transformer) => transformer.type === "archive");
        if (!meta && !isArchive) return;

        const title = [meta?.label, isArchive ? "Archive" : null].filter(Boolean).join(" · ")
            + (pipe.provider.sourceUrl ? ` — ${pipe.provider.sourceUrl}` : "");
        const badge = document.createElement("span");
        badge.dataset.part = "provider-badge";
        badge.title = title;
        if (meta) badge.append(meta.createIcon());
        if (isArchive) badge.append(createIconElement("archive", { width: 16, height: 16 }));
        this.footerContent.insertBefore(badge, this.encodingLabel);
        this.providerBadge = badge;
    }
}
