import styled from "@emotion/styled";
import clsx from "clsx";
import { ReactNode } from "react";
import color from "../../theme/color";

const SwitchButtonsRoot = styled.div({
    display: "flex",
    borderRadius: 4,
    border: `1px solid ${color.border.default}`,
    overflow: "hidden",
    "& .switch-button": {
        backgroundColor: "transparent",
        padding: "3px 8px",
        color: color.text.light,
        border: "none",
        borderRight: `1px solid ${color.border.default}`,
        cursor: "pointer",
        "&:last-of-type": {
            borderRight: "none",
        },
        "&:hover:not(.active)": {
            color: color.text.default,
            backgroundColor: color.background.light,
        },
        "&.active": {
            color: color.text.selection,
            backgroundColor: color.background.selection,
        },
    }
});

interface SwitchButtonsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    getLabel?: (option: string) => ReactNode;
}

export function SwitchButtons(props: SwitchButtonsProps) {
    const { options, value, onChange, getLabel, ...rest } = props;
    return (
        <SwitchButtonsRoot {...rest}>
            {options.map((option) => {
                const isActive = option === value;
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        className={clsx("switch-button", { active: isActive })}
                    >
                        {getLabel ? getLabel(option) : option}
                    </button>
                );
            })}
        </SwitchButtonsRoot>
    );
}
