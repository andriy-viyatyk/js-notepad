import styled from "@emotion/styled";
import { TextFileModel } from "./TextPageModel";
import color from "../../theme/color";
import { TextField } from "../../components/basic/TextField";
import { useCallback, useMemo, useState } from "react";
import { Button } from "../../components/basic/Button";
import { keyframes } from "@emotion/react";

const pulse = keyframes`
  0% { transform: scale(0.9) translateX(-50%); }
  100% { transform: scale(1) translateX(-50%); }
`;

const EncryptionPanelRoot = styled.div({
    position: "absolute",
    top: 2,
    left: "50%",
    zIndex: 10,
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    padding: "8px 16px",
    border: `1px solid ${color.border.default}`,
    outline: `1px solid ${color.border.default}`,
    borderRadius: 4,
    backgroundColor: color.background.default,
    animation: `${pulse} 0.1s ease-out`,
    "& .password-field": {
        marginTop: 24,
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
            "&:hover": {
                borderColor: color.border.active,
            }
        }
    },
    "& .error-pannel": {
        padding: "8px 0",
        color: color.misc.red,
        fontSize: 13,
    },
})

interface EncryptionPanelProps {
    model: TextFileModel;
    onSubmit?: (password: string) => void;
    onCancel?: () => void;
    className?: string;
}

export function EncryptionPanel({ model, onSubmit, onCancel, className }: EncryptionPanelProps) {
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
        <EncryptionPanelRoot className={className}>
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
        </EncryptionPanelRoot>
    );
}

// Re-export with old name for backward compatibility
export { EncryptionPanel as EncriptionPanel };
