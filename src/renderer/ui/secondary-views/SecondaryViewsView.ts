import React from "react";
import type { EditorModel } from "../../editors/base/EditorModel";
import { EditorIcon } from "../../components/icons/EditorIcon";
import {
    CollapsiblePanelStackView,
} from "../../uikit/CollapsiblePanelStack/CollapsiblePanelStackView";
import type {
    CollapsiblePanelProps,
} from "../../uikit/CollapsiblePanelStack/CollapsiblePanelStack";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import {
    applyPanelAttributes,
    createPanelElement,
    resolvePanelAttributes,
} from "../../uikit/Panel/panel-style";
import type { IconRef } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { ISecondaryViewsState } from "./SecondaryViewsModel";
import { LazySecondaryView } from "./LazySecondaryView";
import { isCompositePanelKey, panelKey } from "./panel-key";
import { secondaryViewRegistry } from "./secondary-view-registry";

export interface SecondaryViewsProps {
    /** Panel-contributing editors supplied by the owner. */
    views: EditorModel[];
    /** Controlled layout state, held by the owner. */
    state: ISecondaryViewsState;
    /** Owner-provided state update carrying layout side effects. */
    setState: (patch: Partial<ISecondaryViewsState>) => void;
}

interface RenderedPanel {
    model: EditorModel;
    panelId: string;
    key: string;
}

interface PanelRecord {
    key: string;
    model: EditorModel;
    panelId: string;
    icon?: IconRef;
    headerElement: HTMLDivElement | null;
    headerDirty: boolean;
    alive: boolean;
    readonly headerRef: (element: HTMLDivElement | null) => void;
}

/** Native controlled host for the secondary-view stack and splitter. */
export class SecondaryViewsView extends VanillaView<SecondaryViewsProps> {
    private readonly records = new Map<string, PanelRecord>();
    private stack: CollapsiblePanelStackView | undefined;
    private splitter: SplitterView | undefined;
    private outerPanel: HTMLDivElement | undefined;

    public constructor(props: SecondaryViewsProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        const stack = new CollapsiblePanelStackView(this.stackProps([]));
        const splitter = new SplitterView(this.splitterProps());

        this.stack = stack;
        this.splitter = splitter;
        const outerPanel = createPanelElement(this.outerPanelProps(this.props.state.width), [
            stack.root,
        ]);
        this.outerPanel = outerPanel;
        this.root.append(outerPanel, splitter.root);

        // Dispose host records before the stack invokes their callbacks, then
        // dispose the native children before the adapter removes this root.
        this.own(() => this.clearRecords());
        this.own(() => stack.dispose());
        this.own(() => splitter.dispose());

        stack.mount();
        splitter.mount();
        this.reconcile();
    }

    protected onUpdate(props: SecondaryViewsProps): void {
        applyPanelAttributes(
            this.requireOuterPanel(),
            resolvePanelAttributes(this.outerPanelProps(props.state.width)),
        );
        this.requireSplitter().update(this.splitterProps());
        this.reconcile();
    }

    protected onDispose(): void {
        this.records.clear();
    }

    private reconcile(): void {
        const rendered = this.getRenderedPanels();
        const renderedKeys = new Set(rendered.map((panel) => panel.key));

        for (const [key, record] of this.records) {
            if (renderedKeys.has(key)) continue;
            record.alive = false;
            record.headerElement = null;
            record.headerDirty = false;
            this.records.delete(key);
        }

        for (const panel of rendered) {
            const existing = this.records.get(panel.key);
            if (existing) {
                existing.model = panel.model;
                existing.panelId = panel.panelId;
                existing.icon = this.resolveIcon(panel);
                continue;
            }
            this.records.set(panel.key, this.createRecord(panel));
        }

        const activeKey = this.resolveActiveKey(rendered);
        this.updateStack(activeKey, rendered);
        this.drainHeaderUpdates(activeKey, rendered);
    }

    private updateStack(activeKey: string, rendered: RenderedPanel[]): void {
        this.requireStack().update(this.stackProps(
            rendered.map((panel) => this.toPanelDescriptor(panel, activeKey)),
            activeKey,
        ));
    }

    private drainHeaderUpdates(activeKey: string, rendered: RenderedPanel[]): void {
        const dirtyRecords = Array.from(this.records.values()).filter(
            (record) => record.alive && record.headerDirty,
        );
        if (!dirtyRecords.length) return;

        for (const record of dirtyRecords) record.headerDirty = false;
        this.updateStack(activeKey, rendered);
    }

    private getRenderedPanels(): RenderedPanel[] {
        return this.props.views.flatMap((model) => {
            const panelIds = (model.state.get() as { secondaryView?: string[] }).secondaryView;
            if (!panelIds?.length) return [];
            return panelIds
                .filter((panelId) => secondaryViewRegistry.has(panelId))
                .map((panelId) => ({
                    model,
                    panelId,
                    key: panelKey(model.id, panelId),
                }));
        });
    }

    private resolveActiveKey(rendered: RenderedPanel[]): string {
        const activePanel = this.props.state.activePanel;
        if (isCompositePanelKey(activePanel)) return activePanel;
        return rendered.find((panel) => panel.panelId === activePanel)?.key ?? activePanel;
    }

    private createRecord(panel: RenderedPanel): PanelRecord {
        const record: PanelRecord = {
            key: panel.key,
            model: panel.model,
            panelId: panel.panelId,
            icon: this.resolveIcon(panel),
            headerElement: null,
            headerDirty: false,
            alive: true,
            headerRef: (element) => this.publishHeader(record, element),
        };
        return record;
    }

    private publishHeader(record: PanelRecord, element: HTMLDivElement | null): void {
        if (!record.alive || this.records.get(record.key) !== record) return;
        if (record.headerElement === element) return;
        record.headerElement = element;
        record.headerDirty = true;
    }

    private toPanelDescriptor(panel: RenderedPanel, activeKey: string): CollapsiblePanelProps {
        const record = this.records.get(panel.key);
        if (!record) throw new Error(`SecondaryViews lost panel record: ${panel.key}`);

        return {
            id: panel.key,
            name: panel.panelId,
            headerRef: record.headerRef,
            alwaysRenderContent: true,
            children: React.createElement(LazySecondaryView, {
                model: record.model as never,
                panelId: record.panelId,
                headerRef: record.headerElement,
                icon: record.icon,
                expanded: panel.key === activeKey,
            }),
        };
    }

    private resolveIcon(panel: RenderedPanel): IconRef | undefined {
        return secondaryViewRegistry.get(panel.panelId)?.icon ??
            React.createElement(EditorIcon, { editor: panel.model });
    }

    private outerPanelProps(width: number) {
        return {
            name: "secondary-views-container",
            direction: "column" as const,
            width,
            shrink: false,
            overflow: "hidden" as const,
            height: "100%",
            background: "default" as const,
        };
    }

    private stackProps(
        panels: CollapsiblePanelProps[],
        activePanel = this.resolveActiveKey(this.getRenderedPanels()),
    ) {
        return {
            name: "secondary-views-stack",
            activePanel,
            setActivePanel: this.setActivePanel,
            height: "100%",
            panels,
        };
    }

    private splitterProps() {
        return {
            name: "secondary-views-splitter",
            orientation: "vertical" as const,
            value: this.props.state.width,
            onChange: this.setWidth,
            side: "before" as const,
            min: 120,
            border: "after" as const,
            background: "default" as const,
            hoverBackground: "light" as const,
        };
    }

    private readonly setActivePanel = (id: string): void => {
        this.props.setState({ activePanel: id });
    };

    private readonly setWidth = (width: number): void => {
        this.props.setState({ width });
    };

    private clearRecords(): void {
        for (const record of this.records.values()) {
            record.alive = false;
            record.headerElement = null;
            record.headerDirty = false;
        }
        this.records.clear();
    }

    private requireStack(): CollapsiblePanelStackView {
        if (!this.stack) throw new Error("SecondaryViews stack is not mounted.");
        return this.stack;
    }

    private requireOuterPanel(): HTMLDivElement {
        if (!this.outerPanel) throw new Error("SecondaryViews panel is not mounted.");
        return this.outerPanel;
    }

    private requireSplitter(): SplitterView {
        if (!this.splitter) throw new Error("SecondaryViews splitter is not mounted.");
        return this.splitter;
    }
}
