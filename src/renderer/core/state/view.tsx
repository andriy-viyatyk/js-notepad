/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-wrapper-object-types */
import React, { ReactElement } from "react";
import styled from "@emotion/styled";
import { clsx } from "clsx";
import { TDialogModel, TModel } from "./model";

export interface DefaultProps {
    className?: string;
}

export interface ViewProps<M extends TModel<T>, T = unknown> extends DefaultProps {
    model: M;
}

export type ViewPropsRO<M extends TModel<T>, T = unknown> = Readonly<
    ViewProps<M, T>
>;

export interface IViewData<M extends TModel<T>, T = unknown> {
    viewId: Symbol;
    model: M;
    internalId?: string;
}

export interface IDialogViewData<
    // M's default uses `any` to accept all concrete TDialogModel subclasses
    // at use sites (e.g. `showDialog({ model: ConfirmationDialogModel, ... })`).
    // TS classes are invariant in their type parameters, and defaults can't
    // forward-reference later type params, so widening to `unknown` would
    // reject those subclass assignments. The `any` is load-bearing here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    M extends TDialogModel<T> = TDialogModel<any, any>,
    T = unknown,
> extends IViewData<M, T> {}

export type DefaultView = React.FC<ViewProps<TModel<unknown>>>;

interface IViewRegistration<T extends DefaultView = DefaultView> {
    viewId: Symbol;
    Component: T;
}

const views: Map<Symbol, IViewRegistration> = new Map<
    Symbol,
    IViewRegistration
>();

const registerView = <T extends DefaultView = DefaultView>(
    viewId: Symbol,
    // eslint-disable-next-line @typescript-eslint/no-shadow
    View: T
) => {
    views.set(viewId, { viewId, Component: View });
};

const renderView = (
    viewId: Symbol,
    props: ViewProps<TModel<unknown>>
): ReactElement | null => {
    if (!views.has(viewId)) {
        throw new Error(`View "${viewId.toString()}" not registered.`);
    }

    const Component = views.get(viewId)?.Component;
    return Component ? <Component {...props} /> : null;
};

export const Views = {
    registerView,
    renderView,
};

const ViewRoot = styled.div({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    "&:not(.isActive)": {
        display: "none",
    },
});

export function View<M extends TModel<T>, T = unknown>(
    props: IViewData<M, T> & { active: boolean }
) {
    return (
        <ViewRoot className={clsx({ isActive: props.active })}>
            {renderView(props.viewId, { model: props.model })}
        </ViewRoot>
    );
}
