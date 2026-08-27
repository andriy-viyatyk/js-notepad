import type { ReactElement, SVGProps } from "react";
import { createIconPlaceholderElement } from "../shared/slots";
import { getIcon, type IconName } from "../../theme/icon-registry";
import type { SvgIconComponent, SvgIconProps } from "../../theme/icons";

export type IconProps = Omit<SvgIconProps, "children"> & (
    | { name: IconName; icon?: never }
    | { icon: SvgIconComponent; name?: never }
);

/**
 * The one React face for builder-backed icons. The builder owns the SVG body; React owns the
 * outer element and receives the body's serialized markup rather than a native SVG child.
 */
export function Icon(props: IconProps): ReactElement {
    const resolvedIcon = "name" in props ? getIcon(props.name) : props.icon;
    const built = resolvedIcon?.createElement(props) ?? createIconPlaceholderElement(props);
    const {
        name: _name,
        icon: _icon,
        viewBox,
        title: _title,
        width,
        height,
        className,
        ref,
        ...svgProps
    } = props as IconProps & SVGProps<SVGSVGElement>;
    const outputClassName = !resolvedIcon
        ? ["icon-placeholder", className].filter(Boolean).join(" ")
        : className ?? built.getAttribute("class") ?? undefined;

    return (
        <svg
            {...svgProps}
            ref={ref}
            className={outputClassName}
            data-icon-placeholder={!resolvedIcon ? "true" : undefined}
            viewBox={viewBox ?? resolvedIcon?.viewBox ?? built.getAttribute("viewBox") ?? "0 0 24 24"}
            width={width ?? built.getAttribute("width") ?? 24}
            height={height ?? built.getAttribute("height") ?? 24}
            dangerouslySetInnerHTML={{ __html: built.innerHTML }}
        />
    );
}
