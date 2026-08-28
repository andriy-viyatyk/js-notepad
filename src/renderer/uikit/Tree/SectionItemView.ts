import { applyRestProps, bindRef, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { ElementRef, RestPropsState } from "../shared/dom-props";
import { fillSlot } from "../shared/fill-slot";
import { VanillaView } from "../shared/vanilla-view";
import { TreeIndents } from "./tree-indents";
import type { SectionItemProps } from "./SectionItem";
import "./SectionItem.css";

const defaultIndentSize = 16;

/**
 * A non-interactive section header row in a tree.
 *
 * Deliberately **not** shared with `ListBox`'s `SectionItemView`, which writes `root.textContent`:
 * Tree's section `label` is slot content, so a rich label has to go through a slot, and the
 * ListBox implementation would silently stringify or drop it. It also renders level guides, which
 * the flat list has no concept of.
 *
 * The label host is `display: contents`, so it is not a layout box and the label's content remains a
 * direct flex item of the row exactly as it was in the React DOM. It exists because `fillSlot` needs
 * a host it owns outright.
 *
 * The guides carry no `.tree-indent` class here — section rows are never selected, so the
 * selected-state border override has nothing to target. That matches the React `SectionItem`, which
 * omitted the class too.
 */
export class SectionItemView extends VanillaView<SectionItemProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    private labelHost: HTMLSpanElement | undefined;
    private labelCleanup: (() => void) | undefined;
    private indents: TreeIndents | undefined;

    private refCleanup: () => void = () => undefined;
    private boundRef: ElementRef<HTMLDivElement> | undefined;

    public constructor(props: SectionItemProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.labelHost = document.createElement("span");
        this.labelHost.dataset.part = "label";
        this.labelHost.style.display = "contents";
        this.root.append(this.labelHost);

        this.indents = new TreeIndents(this.root, this.labelHost);

        this.applyProps(this.props);
        this.setRef(this.props.ref);

        this.own(() => this.labelCleanup?.());
        this.own(() => this.clearRef());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: SectionItemProps): void {
        this.applyProps(props);
        this.setRef(props.ref);
    }

    private applyProps(props: SectionItemProps): void {
        const {
            name,
            id,
            level,
            label,
            indentSize = defaultIndentSize,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ref: _ref,
            ...rest
        } = props;

        const labelHost = this.labelHost;
        const indents = this.indents;
        if (!labelHost || !indents) return;

        const root = this.root;
        root.dataset.type = "tree-section";
        if (name === undefined) root.removeAttribute("data-name");
        else root.dataset.name = name;
        if (id === undefined) root.removeAttribute("id");
        else root.id = id;
        root.setAttribute("role", "presentation");

        indents.sync(level, indentSize);
        this.labelCleanup = fillSlot(labelHost, label);

        applyRestProps(root, rest as Record<string, unknown>, this.restPropsState);
    }

    private setRef(ref: ElementRef<HTMLDivElement> | undefined): void {
        if (ref === this.boundRef) return;
        this.refCleanup();
        this.boundRef = ref;
        this.refCleanup = bindRef(this.root, ref);
    }

    private clearRef(): void {
        this.refCleanup();
        this.refCleanup = () => undefined;
        this.boundRef = undefined;
    }
}
