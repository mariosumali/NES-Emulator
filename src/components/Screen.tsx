import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../emulator/NesCore';
import { useEngine, useEngineState } from '../hooks/useEngine';
import { useSettings } from '../storage/settings';
import { PauseIcon, RewindIcon } from './icons';

/**
 * NES pixels are not square. On NTSC hardware the pixel aspect ratio is 8:7,
 * which is what makes a 256x240 frame fill a 4:3 screen — circles in Metroid
 * are round only at this ratio.
 */
const NTSC_PAR = 8 / 7;
const OVERSCAN_ROWS = 16;

interface ScreenProps {
    onRequestStart: () => void;
}

export function Screen({ onRequestStart }: ScreenProps) {
    const engine = useEngine();
    const state = useEngineState();
    const settings = useSettings();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const glowSlotRef = useRef<HTMLDivElement>(null);
    const [showPowerOn, setShowPowerOn] = useState(false);

    const running = state.status === 'running';
    const sourceHeight = settings.overscan ? SCREEN_HEIGHT - OVERSCAN_ROWS : SCREEN_HEIGHT;

    /* --- Attach the renderer to this canvas ------------------------------ */

    useLayoutEffect(() => {
        if (canvasRef.current) engine.attachCanvas(canvasRef.current);
    }, [engine]);

    /* --- Mount the ambient-glow canvas the renderer owns ------------------ */

    useEffect(() => {
        const slot = glowSlotRef.current;
        const glow = engine.renderer?.getGlowCanvas();
        if (!slot || !glow) return;
        glow.style.width = '100%';
        glow.style.height = '100%';
        slot.appendChild(glow);
        return () => { glow.remove(); };
    }, [engine, state.romId]);

    /* --- Sizing ---------------------------------------------------------- */

    /**
     * Size the canvas so one source pixel maps to a whole number of device
     * pixels. Left to the compositor, a 2.5x scale on a 2x display lands on
     * fractional device pixels and the picture shimmers as it moves.
     *
     * Writes straight to the element and the renderer rather than through React
     * state: this runs on every resize and orientation change, and none of it
     * needs to re-render the tree.
     */
    const measure = useCallback(() => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const par = settings.aspect === 'pixel' ? 1 : NTSC_PAR;

        const isFullscreen = document.fullscreenElement === wrap;
        // Leave room for the bezel padding and the dock below.
        const availableWidth = isFullscreen ? window.innerWidth : Math.min(wrap.parentElement?.clientWidth ?? 960, 1180) - 32;
        const availableHeight = isFullscreen
            ? window.innerHeight
            : Math.max(240, window.innerHeight - 220);

        const naturalWidth = SCREEN_WIDTH * par;
        let scale = Math.min(availableWidth / naturalWidth, availableHeight / sourceHeight);

        if (settings.aspect !== 'stretch') {
            scale = Math.min(scale, settings.scale);
        }

        if (settings.integerScale) {
            // Snap to an integer number of device pixels per source pixel.
            const deviceScale = Math.max(1, Math.floor(scale * dpr));
            scale = deviceScale / dpr;
        }

        const width = Math.max(SCREEN_WIDTH, Math.round(naturalWidth * scale));
        const height = Math.max(sourceHeight, Math.round(sourceHeight * scale));

        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        engine.renderer?.resize(width, height);
    }, [engine, settings.aspect, settings.scale, settings.integerScale, sourceHeight]);

    useLayoutEffect(() => {
        measure();
        const observer = new ResizeObserver(measure);
        if (wrapRef.current?.parentElement) observer.observe(wrapRef.current.parentElement);
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);
        document.addEventListener('fullscreenchange', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
            document.removeEventListener('fullscreenchange', measure);
        };
    }, [measure]);

    /* --- Power-on flourish ----------------------------------------------- */

    useEffect(() => {
        if (!state.romId || !settings.crtPowerOn) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        // Deferred out of the effect body so this is a scheduled update rather
        // than a synchronous cascade off the ROM change.
        const start = window.setTimeout(() => setShowPowerOn(true), 0);
        const end = window.setTimeout(() => setShowPowerOn(false), 700);
        return () => { window.clearTimeout(start); window.clearTimeout(end); };
    }, [state.romId, settings.crtPowerOn]);

    /* --- Description for assistive technology ---------------------------- */

    const description = state.romName
        ? `${state.romName}. ${running ? 'Playing' : 'Paused'}.`
        : 'No game loaded.';

    return (
        <div className="screen-wrap" ref={wrapRef} id="game-screen">
            {settings.ambientGlow && (
                <div
                    className="screen-glow"
                    ref={glowSlotRef}
                    data-visible={running ? 'true' : 'false'}
                    aria-hidden="true"
                />
            )}

            <div className="bezel" data-filter={settings.filter}>
                <canvas
                    ref={canvasRef}
                    className="screen-canvas"
                    role="img"
                    aria-label={description}
                    onClick={() => { if (!running) onRequestStart(); }}
                />

                {showPowerOn && <div className="power-on" aria-hidden="true" />}

                {state.status === 'paused' && state.romId && (
                    <div className="pause-veil">
                        <span className="pause-veil-icon"><PauseIcon size={26} /></span>
                        <span className="pause-veil-label">Paused</span>
                    </div>
                )}

                {state.isRewinding && (
                    <div className="rewind-overlay">
                        <RewindIcon size={14} />
                        Rewinding · {state.rewindSeconds.toFixed(1)}s left
                    </div>
                )}

                {settings.showFps && running && (
                    <div className="hud" aria-hidden="true">
                        <div className="hud-row">
                            <span className="hud-key">FPS</span>
                            <span>{state.fps.toFixed(1)}</span>
                        </div>
                        <div className="hud-row">
                            <span className="hud-key">AUDIO</span>
                            <span>{state.audioLatencyMs}ms</span>
                        </div>
                        {state.speed !== 1 && (
                            <div className="hud-row">
                                <span className="hud-key">SPEED</span>
                                <span>{state.speed}x</span>
                            </div>
                        )}
                        <div className="hud-row">
                            <span className="hud-key">VIDEO</span>
                            <span>{state.usingWebGl ? 'GL' : '2D'}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
