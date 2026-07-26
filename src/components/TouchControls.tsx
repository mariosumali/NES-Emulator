import { useCallback, useEffect, useRef, useState } from 'react';
import { NES_BUTTONS } from '../emulator/NesCore';
import { useSettings } from '../storage/settings';

/**
 * On-screen controls.
 *
 * Built on Pointer Events rather than Touch Events for three reasons:
 *
 *  - React attaches `touchstart`/`touchmove` as *passive* listeners, so
 *    `e.preventDefault()` inside `onTouchStart` silently does nothing and the
 *    page scrolls under your thumb. Scrolling is stopped by `touch-action: none`
 *    in CSS, and pointer events let us cancel what remains.
 *  - Pointer capture makes slide-across work: a thumb can roll from Left to
 *    Down without lifting, which touch-target-bound handlers cannot do.
 *  - The same code then serves mouse and stylus for free.
 *
 * The d-pad is hit-tested radially so diagonals are reachable — an 8-way pad,
 * not four independent buttons.
 */

type Zone = 'dpad' | 'face';

interface TouchControlsProps {
    onButtonDown: (player: 1 | 2, button: number) => void;
    onButtonUp: (player: 1 | 2, button: number) => void;
    visible: boolean;
}

/** Fraction of the pad's radius treated as a neutral centre. */
const DPAD_DEADZONE = 0.28;

export function TouchControls({ onButtonDown, onButtonUp, visible }: TouchControlsProps) {
    const settings = useSettings();
    const dpadRef = useRef<HTMLDivElement>(null);
    const faceRef = useRef<HTMLDivElement>(null);

    /** Which NES buttons each active pointer is currently holding. */
    const pointers = useRef(new Map<number, Set<number>>());
    const [pressed, setPressed] = useState<Set<number>>(new Set());

    const syncPressed = useCallback(() => {
        const next = new Set<number>();
        for (const buttons of pointers.current.values()) {
            for (const button of buttons) next.add(button);
        }
        setPressed(next);
    }, []);

    const buzz = useCallback(() => {
        if (!settings.hapticsEnabled) return;
        navigator.vibrate?.(8);
    }, [settings.hapticsEnabled]);

    /** Reconcile one pointer's held buttons against a new target set. */
    const update = useCallback(
        (pointerId: number, next: Set<number>) => {
            const current = pointers.current.get(pointerId) ?? new Set<number>();

            for (const button of current) {
                if (!next.has(button)) onButtonUp(1, button);
            }
            for (const button of next) {
                if (!current.has(button)) {
                    onButtonDown(1, button);
                    buzz();
                }
            }

            if (next.size === 0) pointers.current.delete(pointerId);
            else pointers.current.set(pointerId, next);
            syncPressed();
        },
        [onButtonDown, onButtonUp, buzz, syncPressed]
    );

    const release = useCallback(
        (pointerId: number) => update(pointerId, new Set()),
        [update]
    );

    /* --- Hit testing ------------------------------------------------------ */

    const hitDpad = useCallback((clientX: number, clientY: number): Set<number> => {
        const rect = dpadRef.current?.getBoundingClientRect();
        const out = new Set<number>();
        if (!rect) return out;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const radius = Math.max(rect.width, rect.height) / 2;
        const dx = (clientX - cx) / radius;
        const dy = (clientY - cy) / radius;

        if (Math.hypot(dx, dy) < DPAD_DEADZONE) return out;

        // 8-way: an axis engages once the pointer is meaningfully off-centre on
        // it, so the corners naturally produce two directions at once.
        const threshold = 0.22;
        if (dx < -threshold) out.add(NES_BUTTONS.LEFT);
        else if (dx > threshold) out.add(NES_BUTTONS.RIGHT);
        if (dy < -threshold) out.add(NES_BUTTONS.UP);
        else if (dy > threshold) out.add(NES_BUTTONS.DOWN);

        return out;
    }, []);

    const hitFace = useCallback((clientX: number, clientY: number): Set<number> => {
        const out = new Set<number>();
        const container = faceRef.current;
        if (!container) return out;

        for (const el of container.querySelectorAll<HTMLElement>('[data-button]')) {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const r = rect.width / 2;
            // Slightly generous radius: thumbs are imprecise and a near-miss
            // that does nothing feels broken.
            if (Math.hypot(clientX - cx, clientY - cy) <= r * 1.15) {
                out.add(Number(el.dataset.button));
            }
        }
        return out;
    }, []);

    /* --- Pointer handlers -------------------------------------------------- */

    const makeHandlers = (zone: Zone) => {
        const hit = zone === 'dpad' ? hitDpad : hitFace;
        return {
            onPointerDown: (e: React.PointerEvent) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                update(e.pointerId, hit(e.clientX, e.clientY));
            },
            onPointerMove: (e: React.PointerEvent) => {
                if (!pointers.current.has(e.pointerId)) return;
                e.preventDefault();
                update(e.pointerId, hit(e.clientX, e.clientY));
            },
            onPointerUp: (e: React.PointerEvent) => {
                e.preventDefault();
                release(e.pointerId);
            },
            onPointerCancel: (e: React.PointerEvent) => release(e.pointerId),
            onLostPointerCapture: (e: React.PointerEvent) => release(e.pointerId),
            onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        };
    };

    const simpleButton = (button: number) => ({
        onPointerDown: (e: React.PointerEvent) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            update(e.pointerId, new Set([button]));
        },
        onPointerUp: (e: React.PointerEvent) => {
            e.preventDefault();
            release(e.pointerId);
        },
        onPointerCancel: (e: React.PointerEvent) => release(e.pointerId),
        onLostPointerCapture: (e: React.PointerEvent) => release(e.pointerId),
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    });

    /* --- Release everything when hidden or backgrounded -------------------- */

    useEffect(() => {
        if (visible) return;
        for (const pointerId of [...pointers.current.keys()]) release(pointerId);
    }, [visible, release]);

    useEffect(() => {
        const releaseAll = () => {
            for (const pointerId of [...pointers.current.keys()]) release(pointerId);
        };
        window.addEventListener('blur', releaseAll);
        document.addEventListener('visibilitychange', releaseAll);
        return () => {
            window.removeEventListener('blur', releaseAll);
            document.removeEventListener('visibilitychange', releaseAll);
        };
    }, [release]);

    if (!visible) return null;

    const isDown = (button: number) => (pressed.has(button) ? 'true' : undefined);

    return (
        <div
            className="touch-controls"
            style={{ '--touch-opacity': settings.touchOpacity } as React.CSSProperties}
            role="group"
            aria-label="On-screen controller"
        >
            <div className="touch-dpad" ref={dpadRef} {...makeHandlers('dpad')}>
                <div className="touch-btn dpad-up" data-pressed={isDown(NES_BUTTONS.UP)} aria-hidden="true">▲</div>
                <div className="touch-btn dpad-left" data-pressed={isDown(NES_BUTTONS.LEFT)} aria-hidden="true">◀</div>
                <div className="dpad-mid" aria-hidden="true" />
                <div className="touch-btn dpad-right" data-pressed={isDown(NES_BUTTONS.RIGHT)} aria-hidden="true">▶</div>
                <div className="touch-btn dpad-down" data-pressed={isDown(NES_BUTTONS.DOWN)} aria-hidden="true">▼</div>
                <span className="sr-only">Directional pad</span>
            </div>

            <div className="touch-center">
                <div
                    className="touch-btn"
                    role="button"
                    tabIndex={-1}
                    aria-label="Select"
                    data-pressed={isDown(NES_BUTTONS.SELECT)}
                    {...simpleButton(NES_BUTTONS.SELECT)}
                >
                    SELECT
                </div>
                <div
                    className="touch-btn"
                    role="button"
                    tabIndex={-1}
                    aria-label="Start"
                    data-pressed={isDown(NES_BUTTONS.START)}
                    {...simpleButton(NES_BUTTONS.START)}
                >
                    START
                </div>
            </div>

            <div className="touch-face" ref={faceRef} {...makeHandlers('face')}>
                <div
                    className="touch-btn touch-b"
                    data-button={NES_BUTTONS.B}
                    data-pressed={isDown(NES_BUTTONS.B)}
                    aria-hidden="true"
                >
                    B
                </div>
                <div
                    className="touch-btn touch-a"
                    data-button={NES_BUTTONS.A}
                    data-pressed={isDown(NES_BUTTONS.A)}
                    aria-hidden="true"
                >
                    A
                </div>
                <span className="sr-only">A and B buttons</span>
            </div>
        </div>
    );
}
