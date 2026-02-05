import styled from "@emotion/styled";
import clsx from "clsx";
import { ReactNode } from "react";
import color from "../../theme/color";

const SwitchButtonsRoot = styled.div({
    display: "flex",
    "& .switch-button": {
        backgroundColor: color.background.dark,
        padding: "3px 8px",
        color: color.text.light,
        borderWidth: 1,
        borderStyle: "outset",
        borderColor: color.border.default,
        cursor: "pointer",
        "&.active": {
            borderStyle: "inset",
            color: color.text.dark,
        },
        "&:first-of-type": {
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
        },
        "&:last-of-type": {
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
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
