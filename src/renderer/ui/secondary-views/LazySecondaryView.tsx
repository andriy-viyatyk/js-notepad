import { type ComponentType } from "react";
import { secondaryViewRegistry, type SecondaryViewProps } from "./secondary-view-registry";
import type { EditorOrHost } from "../../editors/base";
import color from "../../theme/color";
import { errMessage } from "../../../shared/utils";
import type { IconRef } from "../../uikit";
import { TComponentModel, useComponentModel } from "../../core/state/model";

interface LazySecondaryViewProps {
    model: EditorOrHost;
    /** Panel-type id — the registry key (NOT an editor instance id). */
    panelId: string;
    headerRef: HTMLDivElement | null;
    /** Resolved leading header icon, forwarded to the panel component. */
    icon?: IconRef;
    /** Whether this panel is the expanded one — forwarded to the panel component. */
    expanded?: boolean;
}

interface LazySecondaryViewState {
    Component: ComponentType<SecondaryViewProps> | null;
    error: string | null;
}

class LazySecondaryViewModel extends TComponentModel<LazySecondaryViewState, LazySecondaryViewProps> {
    setComponent = (Component: ComponentType<SecondaryViewProps>) => {
        this.state.update((s) => { s.Component = Component; });
    };

    setError = (error: string | null) => {
        this.state.update((s) => { s.error = error; });
    };

    init() {
        this.effect(() => {
            const def = secondaryViewRegistry.get(this.props.panelId);
            if (!def) {
                queueMicrotask(() => {
                    if (this.isLive) this.setError(`Unknown secondary view: "${this.props.panelId}"`);
                });
                return;
            }
            if (def.arm === "vanilla") {
                queueMicrotask(() => {
                    if (this.isLive) {
                        this.setError(`Vanilla secondary view used by React host: "${this.props.panelId}"`);
                    }
                });
                return;
            }
            let cancelled = false;
            void def.loadComponent().then((mod) => {
                if (!cancelled) this.setComponent(mod.default);
            }).catch((err) => {
                if (!cancelled) this.setError(errMessage(err, `Failed to load "${this.props.panelId}".`));
            });
            return () => { cancelled = true; };
        }, () => [this.props.panelId]);
    }
}

/** Loads a secondary view component from the registry and renders it. */
export function LazySecondaryView(props: LazySecondaryViewProps) {
    const { model: editorModel, panelId, headerRef, icon, expanded } = props;
    const viewModel = useComponentModel(props, LazySecondaryViewModel, { Component: null, error: null });
    const { Component, error } = viewModel.state.use();

    if (error) return <div style={{ padding: 8, color: color.text.light }}>{error}</div>;
    if (!Component) return null;
    return <Component model={editorModel} panelId={panelId} headerRef={headerRef} icon={icon} expanded={expanded} />;
}
