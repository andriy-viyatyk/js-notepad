import { useState, useCallback } from "react";
import { Button, Panel, Slider } from "../../uikit";
import { ForceGraphRenderer, ForceParams } from "./ForceGraphRenderer";
import color from "../../theme/color";

/** Narrow structural interface — satisfied by both `GraphEditor` 
 *  and legacy `GraphViewModel` (preserved per GR1). Only the surface this
 *  panel actually consumes. */
interface GraphTuningHost {
    readonly renderer: { readonly forceParams: ForceParams };
    updateForceParams(params: Partial<ForceParams>): void;
    resetForceParams(): void;
}

interface GraphTuningSlidersProps {
    editor: GraphTuningHost;
}

const defaults = ForceGraphRenderer.defaultForceParams;

const sliders = [
    { key: "charge" as const, label: "Charge", min: -200, max: 0, step: 1, default: defaults.charge },
    { key: "linkDistance" as const, label: "Distance", min: 10, max: 200, step: 1, default: defaults.linkDistance },
    { key: "collide" as const, label: "Collide", min: 0, max: 1, step: 0.05, default: defaults.collide },
];

const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.graph.labelText,
    width: 52,
    flexShrink: 0,
};

const valueStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.graph.labelText,
    width: 32,
    textAlign: "right",
    flexShrink: 0,
};

function GraphTuningSliders({ editor }: GraphTuningSlidersProps) {
    const [values, setValues] = useState(() => {
        const current = editor.renderer.forceParams;
        return {
            charge: current.charge,
            linkDistance: current.linkDistance,
            collide: current.collide,
        };
    });

    const onChange = useCallback((key: keyof typeof values, value: number) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        editor.updateForceParams({ [key]: value });
    }, [editor]);

    const onReset = useCallback(() => {
        setValues({
            charge: defaults.charge,
            linkDistance: defaults.linkDistance,
            collide: defaults.collide,
        });
        editor.resetForceParams();
    }, [editor]);

    return (
        <Panel name="graph-tuning" direction="column" gap="xs" paddingX="md" paddingY="sm" borderTop>
            {sliders.map((s) => (
                <Panel key={s.key} direction="row" align="center" gap="md">
                    <span style={labelStyle}>{s.label}</span>
                    <Slider
                        name={`tuning-${s.key.replace(/([A-Z])/g, "-$1").toLowerCase()}`}
                        size="sm"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={values[s.key]}
                        onChange={(value) => onChange(s.key, value)}
                    />
                    <span style={valueStyle}>{values[s.key]}</span>
                </Panel>
            ))}
            <Panel direction="row" justify="end" paddingTop="xs">
                <Button name="tuning-reset" size="sm" variant="ghost" onClick={onReset}>Reset</Button>
            </Panel>
        </Panel>
    );
}

export { GraphTuningSliders };
