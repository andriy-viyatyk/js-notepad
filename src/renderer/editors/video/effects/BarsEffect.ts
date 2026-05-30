import type { IVisualizerEffect } from "./types";

const BAR_COUNT = 48;
const BAR_GAP   = 3;

// Rainbow hue sweep left (red) → right (violet)
const HUE_START = 0;
const HUE_END   = 270;

function barColors(i: number, isDark: boolean): [string, string] {
    const hue = HUE_START + (i / (BAR_COUNT - 1)) * (HUE_END - HUE_START);
    return isDark
        ? [`hsl(${hue}, 90%, 15%)`,  `hsl(${hue}, 100%, 60%)`]
        : [`hsl(${hue}, 80%, 30%)`,  `hsl(${hue}, 90%,  50%)`];
}

// Particle system constants
const PARTICLE_H       = 3;    // height of flying mini-bar (px)
const PARTICLE_SPEED   = 45;   // px/sec drift away from center
const PARTICLE_MAX_AGE = 3;    // seconds lifetime
const EMIT_THRESHOLD   = 0.70; // bar fill fraction before emitting
const EMIT_RATE        = 1.5;  // particles/sec per bar above threshold

interface BarParticle {
    x:      number;
    y:      number;  // center y
    vy:     number;  // px/sec (negative = up, positive = down)
    barIdx: number;  // index into stamps[]
    age:    number;  // seconds
}

export class BarsEffect implements IVisualizerEffect {
    private data       = new Uint8Array(0);
    private particles: BarParticle[] = [];
    private emitAccum  = new Float32Array(BAR_COUNT);
    private lastTime   = 0;

    // One stamp per bar — rebuilt on resize or theme change
    private stamps: OffscreenCanvas[] = [];
    private stampDark     = false;
    private stampBarWidth = 0;

    dispose(): void {
        this.particles.length = 0;
        this.stamps.length = 0;
    }

    draw(ctx: CanvasRenderingContext2D, analyser: AnalyserNode, W: number, H: number, isDark: boolean): void {
        if (this.data.length !== analyser.frequencyBinCount) {
            this.data = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(this.data);
        ctx.clearRect(0, 0, W, H);

        const now = performance.now() / 1000;
        const dt  = this.lastTime > 0 ? Math.min(now - this.lastTime, 0.1) : 0;
        this.lastTime = now;

        // Centered square matching Circular effect area
        const unit     = Math.min(W, H) / 2;
        const drawW    = unit * 2;
        const drawH    = unit * 2;
        const drawX    = W / 2 - unit;
        const cy       = H / 2;
        const barWidth = (drawW - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;

        // ── Rebuild stamps when barWidth or theme changes ─────────────────────
        if (barWidth !== this.stampBarWidth || isDark !== this.stampDark) {
            this.stampBarWidth = barWidth;
            this.stampDark     = isDark;
            const sw = Math.max(1, Math.ceil(barWidth));
            for (let i = 0; i < BAR_COUNT; i++) {
                const sc    = new OffscreenCanvas(sw, PARTICLE_H);
                const sctx  = sc.getContext("2d");
                const [edge, highlight] = barColors(i, isDark);
                const grad  = sctx.createLinearGradient(0, 0, sw, 0);
                grad.addColorStop(0,    edge);
                grad.addColorStop(0.45, highlight);
                grad.addColorStop(1,    edge);
                sctx.fillStyle = grad;
                sctx.beginPath();
                sctx.roundRect(0, 0, sw, PARTICLE_H, 2);
                sctx.fill();
                this.stamps[i] = sc;
            }
        }

        // ── Update & draw particles (behind bars) ────────────────────────────
        for (let j = this.particles.length - 1; j >= 0; j--) {
            const p = this.particles[j];
            p.y   += p.vy * dt;
            p.age += dt;

            if (p.age > PARTICLE_MAX_AGE) {
                this.particles[j] = this.particles[this.particles.length - 1];
                this.particles.pop();
                continue;
            }

            ctx.globalAlpha = Math.max(0, 1 - p.age / PARTICLE_MAX_AGE);
            ctx.drawImage(this.stamps[p.barIdx], p.x, p.y - PARTICLE_H / 2);
        }
        ctx.globalAlpha = 1;

        // ── Draw bars & emit particles ───────────────────────────────────────
        for (let i = 0; i < BAR_COUNT; i++) {
            const binIndex = Math.round(Math.pow(i / BAR_COUNT, 1.5) * (this.data.length - 1));
            const value    = this.data[binIndex] / 255;
            const halfH    = Math.max(1, value * drawH * 0.35);
            const x        = drawX + i * (barWidth + BAR_GAP);

            const [edge, highlight] = barColors(i, isDark);
            const grad = ctx.createLinearGradient(x, 0, x + barWidth, 0);
            grad.addColorStop(0,    edge);
            grad.addColorStop(0.45, highlight);
            grad.addColorStop(1,    edge);
            ctx.fillStyle = grad;

            // Upper half
            ctx.beginPath();
            ctx.roundRect(x, cy - halfH, barWidth, halfH, [2, 2, 0, 0]);
            ctx.fill();

            // Lower half
            ctx.beginPath();
            ctx.roundRect(x, cy, barWidth, halfH, [0, 0, 2, 2]);
            ctx.fill();

            // Emit particles when bar is near its peak
            if (value > EMIT_THRESHOLD) {
                const energy = (value - EMIT_THRESHOLD) / (1 - EMIT_THRESHOLD);
                this.emitAccum[i] += energy * EMIT_RATE * dt;
                while (this.emitAccum[i] >= 1) {
                    this.emitAccum[i] -= 1;
                    this.particles.push({ x, y: cy - halfH, vy: -PARTICLE_SPEED, barIdx: i, age: 0 });
                    this.particles.push({ x, y: cy + halfH, vy:  PARTICLE_SPEED, barIdx: i, age: 0 });
                }
            } else {
                this.emitAccum[i] = 0;
            }
        }
    }
}
