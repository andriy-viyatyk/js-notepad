import styled from "@emotion/styled";
import { TextFileModel } from "./TextFilePage.model";
import color from "../../theme/color";
import { TextField } from "../../controls/TextField";
import { useCallback, useMemo, useState } from "react";
import { Button } from "../../controls/Button";

const EncriptionPanelRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    padding: "8px 16px",
    border: `1px solid ${color.border.active}`,
    borderRadius: 4,
    backgroundColor: color.background.default,
    "& .password-field": {
        marginTop: 20,
        "& input": {
            width: 280,
        }
    },
    "& .button-pannel": {
        marginTop: 8,
        display: "flex",
        justifyContent: "space-around",
        columnGap: 8,
        "& button": {
            width: 90,
            justifyContent: "center",
        }
    },
    "& .error-pannel": {
        padding: "8px 0",
        color: color.misc.red,
        fontSize: 13,
    },
})

interface EncriptionPanelProps {
    model: TextFileModel;
    onSubmit?: (password: string) => void;
    onCancel?: () => void;
    className?: string;
}

export function EncriptionPanel({ model, onSubmit, onCancel, className }: EncriptionPanelProps) {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string>("");

    const doSubmit = useCallback(() => {
        if (!password) {
            setError("Password cannot be empty");
            return;
        }
        if ((!model.withEncription || model.decripted) && password !== confirm) {
            setError("Passwords do not match");
            return;
        }
        onSubmit?.(password);
    }, [password, confirm, onSubmit, model.withEncription, model.decripted]);

    const buttonText = useMemo(() => {
        if (!model.withEncription || model.decripted) {
            return "Encrypt";
        }
        return "Decrypt";
    }, [model.withEncription, model.decripted]);

    const handleEnterKey = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            doSubmit();
        } else if (e.key === "Escape") {
            onCancel?.();
        }
    }, [doSubmit, onCancel]);

    return (
        <EncriptionPanelRoot className={className}>
            <TextField
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                className="password-field"
                autoFocus
                onKeyDown={handleEnterKey}
            />
            {(!model.withEncription || model.decripted) && (
                <TextField
                    label="Confirm Password"
                    type="password"
                    value={confirm}
                    onChange={setConfirm}
                    className="password-field"
                    onKeyDown={handleEnterKey}
                />
            )}
            {error && (
                <div className="error-pannel">{error}</div>
            )}
            <div className="button-pannel">
                <Button type="raised" onClick={doSubmit} >
                    {buttonText}
                </Button>
                <Button type="raised" onClick={onCancel} >
                    Cancel
                </Button>
            </div>
        </EncriptionPanelRoot>
    );
}