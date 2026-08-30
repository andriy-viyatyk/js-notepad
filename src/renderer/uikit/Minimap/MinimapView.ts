import { createComponentModelDriver } from "../../core/state/model";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type NativeHTMLAttributes,
} from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";
import {
    defaultMinimapState,
    MinimapModel,
    type MinimapState,
} from "./MinimapModel";
import "./Minimap.css";

export interface MinimapProps
    extends Omit<
        NativeHTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onClick" | "onMouseEnter"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances in DOM inspector output. Never used for styling. */
    name?: string;

    /** The scroll container this minimap mirrors and drives. */
    scrollContainer: HTMLElement | null;
    onClick?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
}

export class MinimapView extends VanillaView<MinimapProps> {
    private readonly driver;
    private readonly restState = createRestPropsState();
    private scrollContainer: HTMLElement | null = null;
    private contentContainer: HTMLDivElement | undefined;
    private contentMirror: HTMLDivElement | undefined;
    private indicator: HTMLDivElement | undefined;
    private observer: MutationObserver | undefined;
    private scrollListenerRelease: (() => void) | undefined;
    private sourceToMirror = new WeakMap<Node, Node>();
    private mirrorFallbacks = 0;

    constructor(props: MinimapProps) {
        super(props);
        this.driver = createComponentModelDriver(
            {},
            MinimapModel,
            defaultMinimapState,
        );
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.contentContainer = document.createElement("div");
        this.contentContainer.dataset.part = "content-container";
        this.contentMirror = document.createElement("div");
        this.contentMirror.dataset.part = "content";
        this.contentContainer.append(this.contentMirror);

        this.indicator = document.createElement("div");
        this.indicator.dataset.part = "indicator";
        this.root.dataset.type = "minimap";
        if (this.props.name !== undefined) {
            this.root.dataset.name = this.props.name;
        }
        this.root.append(this.contentContainer, this.indicator);

        this.own(() => this.observer?.disconnect());
        this.setScrollContainer(this.props.scrollContainer);
        this.listen(window, "resize", this.syncEverything);

        this.listen(this.root, "click", (event) => {
            const handler = this.props.onClick;
            if (handler) {
                handler(event);
            } else {
                this.handleBackgroundClick(event);
            }
        });
        this.listen(this.root, "mouseenter", (event) => {
            const handler = this.props.onMouseEnter;
            if (handler) {
                handler(event);
            } else {
                this.handleMouseEnter();
            }
        });
        this.listen(this.indicator, "pointerdown", this.handlePointerDown);
        this.listen(this.indicator, "pointermove", this.handlePointerMove);
        this.listen(this.indicator, "pointerup", this.handlePointerUp);

        applyRestProps(this.root, this.getRestProps(), this.restState);
        this.own(() => clearRestListeners(this.root, this.restState));

        this.driver.mount();
        this.syncEverything();
        this.bind(this.driver.model.state, (state) => state, (state) => {
            this.applyState(state);
        });
    }

    protected onUpdate(props: MinimapProps): void {
        this.driver.update({});
        if (props.name === undefined) {
            delete this.root.dataset.name;
        } else {
            this.root.dataset.name = props.name;
        }
        if (props.scrollContainer !== this.scrollContainer) {
            this.setScrollContainer(props.scrollContainer);
        }
    }

    public get mirrorFallbackCount(): number {
        return this.mirrorFallbacks;
    }

    private setScrollContainer(scrollContainer: HTMLElement | null): void {
        this.scrollListenerRelease?.();
        this.scrollListenerRelease = undefined;
        this.observer?.disconnect();
        this.observer = undefined;
        this.scrollContainer = scrollContainer;
        this.sourceToMirror = new WeakMap<Node, Node>();
        this.contentMirror?.replaceChildren();

        if (!scrollContainer || !this.contentMirror) {
            this.syncEverything();
            return;
        }

        this.rebuildMirrorFromSource();
        this.observer = new MutationObserver(this.onSourceMutations);
        this.observer.observe(scrollContainer, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
        });
        this.scrollListenerRelease = this.listen(scrollContainer, "scroll", this.syncEverything);
        this.syncEverything();
    }

    private readonly onSourceMutations = (records: MutationRecord[]): void => {
        let failure: { record: MutationRecord; reason: string } | undefined;
        const applied = records.every((record) => {
            const reason = this.applyMutationRecord(record);
            if (!reason) return true;
            failure = { record, reason };
            return false;
        });
        if (!applied && failure) {
            this.recordMirrorFallback(failure.record.type, failure.reason);
            this.rebuildMirrorFromSource();
        }
        this.syncEverything();
    };

    private applyMutationRecord(record: MutationRecord): string | undefined {
        switch (record.type) {
            case "childList":
                return this.applyChildListMutation(record);
            case "characterData":
                return this.applyCharacterDataMutation(record);
            case "attributes":
                return this.applyAttributeMutation(record);
            default:
                return `unexpected mutation type "${record.type}"`;
        }
    }

    private applyChildListMutation(record: MutationRecord): string | undefined {
        const source = this.scrollContainer;
        const mirror = this.contentMirror;
        if (!source || !mirror) return "source or mirror is unavailable";

        const mirroredParent = record.target === source
            ? mirror
            : this.sourceToMirror.get(record.target);
        if (!mirroredParent) return "mutation target has no mirrored parent";

        for (const removedNode of Array.from(record.removedNodes)) {
            const mirroredNode = this.sourceToMirror.get(removedNode);
            if (!mirroredNode) return "removed node has no mirror";
            if (mirroredNode.parentNode !== mirroredParent) {
                return "removed node is not under the expected mirrored parent";
            }
            mirroredParent.removeChild(mirroredNode);
        }

        let mirroredNextSibling: Node | null = null;
        if (record.nextSibling) {
            mirroredNextSibling = this.sourceToMirror.get(record.nextSibling) ?? null;
            if (!mirroredNextSibling) return "next sibling has no mirror";
            if (mirroredNextSibling.parentNode !== mirroredParent) {
                return "next sibling is not under the expected mirrored parent";
            }
        }

        for (const addedNode of Array.from(record.addedNodes)) {
            const mirroredNode = this.cloneAndIndex(addedNode);
            mirroredParent.insertBefore(mirroredNode, mirroredNextSibling);
        }

        return undefined;
    }

    private applyCharacterDataMutation(record: MutationRecord): string | undefined {
        const mirroredNode = this.sourceToMirror.get(record.target);
        if (!mirroredNode) return "character-data target has no mirror";
        if (!(mirroredNode instanceof CharacterData)) {
            return "character-data target does not map to character data";
        }
        mirroredNode.data = (record.target as CharacterData).data;
        return undefined;
    }

    private applyAttributeMutation(record: MutationRecord): string | undefined {
        const source = this.scrollContainer;
        if (!source) return "source is unavailable";
        if (record.target === source) return undefined;
        if (!(record.target instanceof Element)) {
            return "attribute target is not an element";
        }
        if (!record.attributeName) return "attribute mutation has no attribute name";

        const mirroredNode = this.sourceToMirror.get(record.target);
        if (!mirroredNode) return "attribute target has no mirror";
        if (!(mirroredNode instanceof Element)) {
            return "attribute target does not map to an element";
        }

        const namespace = record.attributeNamespace;
        const localName = this.getAttributeLocalName(record.attributeName);
        const value = namespace
            ? record.target.getAttributeNS(namespace, localName)
            : record.target.getAttribute(record.attributeName);
        if (value === null) {
            if (namespace) {
                mirroredNode.removeAttributeNS(namespace, localName);
            } else {
                mirroredNode.removeAttribute(record.attributeName);
            }
        } else if (namespace) {
            mirroredNode.setAttributeNS(namespace, record.attributeName, value);
        } else {
            mirroredNode.setAttribute(record.attributeName, value);
        }
        return undefined;
    }

    private cloneAndIndex(sourceNode: Node): Node {
        const mirroredNode = sourceNode.cloneNode(true);
        this.indexNodeTree(sourceNode, mirroredNode);
        return mirroredNode;
    }

    private indexNodeTree(sourceNode: Node, mirroredNode: Node): void {
        this.sourceToMirror.set(sourceNode, mirroredNode);
        const sourceChildren = Array.from(sourceNode.childNodes);
        const mirroredChildren = Array.from(mirroredNode.childNodes);
        sourceChildren.forEach((child, index) => {
            this.indexNodeTree(child, mirroredChildren[index]);
        });
    }

    private rebuildMirrorFromSource(): void {
        const source = this.scrollContainer;
        const mirror = this.contentMirror;
        if (!source || !mirror) return;

        this.sourceToMirror = new WeakMap<Node, Node>();
        const mirroredChildren = Array.from(source.childNodes, (child) =>
            this.cloneAndIndex(child));
        mirror.replaceChildren(...mirroredChildren);
    }

    private recordMirrorFallback(type: string, reason: string): void {
        this.mirrorFallbacks += 1;
        if (import.meta.env.DEV) {
            console.warn(`[MinimapView] incremental mirror fallback (${type}): ${reason}`);
        }
    }

    private getAttributeLocalName(attributeName: string): string {
        const separatorIndex = attributeName.indexOf(":");
        return separatorIndex === -1
            ? attributeName
            : attributeName.slice(separatorIndex + 1);
    }

    private readonly syncEverything = (): void => {
        const source = this.scrollContainer;
        const wrapper = this.root;
        const contentContainer = this.contentContainer;
        const mirror = this.contentMirror;
        if (!source || !contentContainer || !mirror) return;

        const layout = this.driver.model.syncGeometry({
            scrollTop: source.scrollTop,
            scrollHeight: source.scrollHeight,
            clientHeight: source.clientHeight,
            wrapperHeight: wrapper.clientHeight,
            wrapperScrollHeight: wrapper.scrollHeight,
            mirrorHeight: mirror.getBoundingClientRect().height,
        });
        contentContainer.style.height = `${layout.scaledContentHeight}px`;
        wrapper.scrollTop = layout.wrapperScrollTop;
    };

    private readonly handlePointerDown = (event: PointerEvent): void => {
        event.preventDefault();
        const indicator = this.indicator;
        if (!indicator) return;
        indicator.setPointerCapture(event.pointerId);
        this.driver.model.beginDrag(
            event.clientY,
            this.scrollContainer?.scrollTop ?? 0,
        );
    };

    private readonly handlePointerMove = (event: PointerEvent): void => {
        const indicator = this.indicator;
        const source = this.scrollContainer;
        const mirror = this.contentMirror;
        if (!indicator || !source || !mirror || !indicator.hasPointerCapture(event.pointerId)) {
            return;
        }

        source.scrollTop = this.driver.model.getDragScrollTop(event.clientY, {
            scrollHeight: source.scrollHeight,
            wrapperHeight: this.root.clientHeight,
            wrapperScrollHeight: this.root.scrollHeight,
            mirrorHeight: mirror.getBoundingClientRect().height,
        });
    };

    private readonly handlePointerUp = (event: PointerEvent): void => {
        const indicator = this.indicator;
        if (!indicator) return;
        if (indicator.hasPointerCapture(event.pointerId)) {
            indicator.releasePointerCapture(event.pointerId);
        }
        this.driver.model.endDrag();
    };

    private readonly handleBackgroundClick = (event: MouseEvent): void => {
        const source = this.scrollContainer;
        const wrapper = this.root;
        const mirror = this.contentMirror;
        if (!source || !mirror) return;

        const target = event.target;
        if (target instanceof Element && target.closest('[data-part="indicator"]')) {
            return;
        }

        const wrapperRect = wrapper.getBoundingClientRect();
        const clickY = event.clientY - wrapperRect.top + wrapper.scrollTop;
        source.scrollTop = this.driver.model.getBackgroundScrollTop({
            clickY,
            indicatorHeight: this.driver.model.state.get().indicatorHeight,
            scrollHeight: source.scrollHeight,
            mirrorHeight: mirror.getBoundingClientRect().height,
        });
    };

    private readonly handleMouseEnter = (): void => {
        if (!this.driver.model.state.get().indicatorHeight) {
            this.syncEverything();
        }
    };

    private getRestProps(props: MinimapProps = this.props): Record<string, unknown> {
        const {
            name: _name,
            scrollContainer: _scrollContainer,
            children: _children,
            onClick: _onClick,
            onMouseEnter: _onMouseEnter,
            ...rest
        } = props;
        return rest as Record<string, unknown>;
    }

    private applyState(state: MinimapState): void {
        const indicator = this.indicator;
        if (!indicator) return;
        if (state.isDragging) {
            indicator.dataset.dragging = "";
        } else {
            delete indicator.dataset.dragging;
        }
        indicator.style.top = `${state.indicatorTop}px`;
        indicator.style.height = `${state.indicatorHeight}px`;
    }
}
