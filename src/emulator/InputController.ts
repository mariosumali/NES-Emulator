import { NES_BUTTONS } from './NesCore';

export interface KeyBinding {
    player: 1 | 2;
    button: number;
}

export type ButtonCallback = (player: 1 | 2, button: number) => void;

const STORAGE_KEY = 'nes-station:keymap';

/** Codes we must never swallow — the browser and the UI need them. */
const RESERVED = new Set(['Tab', 'F5', 'F11', 'F12']);

export const DEFAULT_KEYMAP: Array<[string, KeyBinding]> = [
    // Player 1 — WASD cluster plus J/K, the layout most web emulators use.
    ['KeyW', { player: 1, button: NES_BUTTONS.UP }],
    ['KeyA', { player: 1, button: NES_BUTTONS.LEFT }],
    ['KeyS', { player: 1, button: NES_BUTTONS.DOWN }],
    ['KeyD', { player: 1, button: NES_BUTTONS.RIGHT }],
    ['ArrowUp', { player: 1, button: NES_BUTTONS.UP }],
    ['ArrowLeft', { player: 1, button: NES_BUTTONS.LEFT }],
    ['ArrowDown', { player: 1, button: NES_BUTTONS.DOWN }],
    ['ArrowRight', { player: 1, button: NES_BUTTONS.RIGHT }],
    ['KeyK', { player: 1, button: NES_BUTTONS.A }],
    ['KeyJ', { player: 1, button: NES_BUTTONS.B }],
    ['Enter', { player: 1, button: NES_BUTTONS.START }],
    ['ShiftRight', { player: 1, button: NES_BUTTONS.SELECT }],

    // Player 2 — numpad.
    ['Numpad8', { player: 2, button: NES_BUTTONS.UP }],
    ['Numpad4', { player: 2, button: NES_BUTTONS.LEFT }],
    ['Numpad2', { player: 2, button: NES_BUTTONS.DOWN }],
    ['Numpad6', { player: 2, button: NES_BUTTONS.RIGHT }],
    ['Numpad1', { player: 2, button: NES_BUTTONS.A }],
    ['Numpad0', { player: 2, button: NES_BUTTONS.B }],
    ['NumpadEnter', { player: 2, button: NES_BUTTONS.START }],
    ['NumpadAdd', { player: 2, button: NES_BUTTONS.SELECT }],
];

/** Turbo bindings map a key to a button that auto-fires while held. */
const DEFAULT_TURBO: Array<[string, KeyBinding]> = [
    ['KeyI', { player: 1, button: NES_BUTTONS.A }],
    ['KeyU', { player: 1, button: NES_BUTTONS.B }],
];

export class InputController {
    private keys = new Map<string, KeyBinding>();
    private turbo = new Map<string, KeyBinding>();
    private held = new Set<string>();
    /** Buttons currently pressed, so blur can release exactly those. */
    private pressed = new Set<string>();

    private onDown: ButtonCallback;
    private onUp: ButtonCallback;

    private turboRate = 16;
    private turboPhase = new Map<string, boolean>();
    private enabled = true;

    constructor(onDown: ButtonCallback, onUp: ButtonCallback) {
        this.onDown = onDown;
        this.onUp = onUp;
        this.load();
        this.attach();
    }

    /* ------------------------------------------------------ bindings -- */

    private load(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as {
                    keys: Array<[string, KeyBinding]>;
                    turbo?: Array<[string, KeyBinding]>;
                };
                this.keys = new Map(parsed.keys);
                this.turbo = new Map(parsed.turbo ?? DEFAULT_TURBO);
                if (this.keys.size > 0) return;
            }
        } catch {
            // Corrupt payload — fall through to defaults.
        }
        this.resetToDefaults();
    }

    private save(): void {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ keys: [...this.keys], turbo: [...this.turbo] })
            );
        } catch { /* private mode */ }
    }

    public resetToDefaults(): void {
        this.keys = new Map(DEFAULT_KEYMAP);
        this.turbo = new Map(DEFAULT_TURBO);
        this.save();
    }

    public getKeyMap(): Map<string, KeyBinding> {
        return new Map(this.keys);
    }

    public getTurboMap(): Map<string, KeyBinding> {
        return new Map(this.turbo);
    }

    public getKeysFor(player: 1 | 2, button: number, turbo = false): string[] {
        const source = turbo ? this.turbo : this.keys;
        const out: string[] = [];
        for (const [code, binding] of source) {
            if (binding.player === player && binding.button === button) out.push(code);
        }
        return out;
    }

    /**
     * Bind a key, replacing whatever it was bound to. Returns false when the key
     * is reserved by the browser.
     */
    public bind(code: string, player: 1 | 2, button: number, turbo = false): boolean {
        if (RESERVED.has(code)) return false;
        // A physical key drives exactly one thing, so clear it everywhere first.
        this.keys.delete(code);
        this.turbo.delete(code);
        (turbo ? this.turbo : this.keys).set(code, { player, button });
        this.save();
        return true;
    }

    public unbind(player: 1 | 2, button: number, turbo = false): void {
        const source = turbo ? this.turbo : this.keys;
        for (const [code, binding] of [...source]) {
            if (binding.player === player && binding.button === button) source.delete(code);
        }
        this.save();
    }

    /** Which other action, if any, already owns this key. */
    public findConflict(code: string): (KeyBinding & { turbo: boolean }) | null {
        const direct = this.keys.get(code);
        if (direct) return { ...direct, turbo: false };
        const turbo = this.turbo.get(code);
        if (turbo) return { ...turbo, turbo: true };
        return null;
    }

    /*
     * Presses forward straight through. Collapsing duplicate holders of the
     * same NES button (WASD vs arrows, keyboard vs pad) is handled once, in
     * NesCore's reference-counted buttonDown/buttonUp.
     */
    private press(player: 1 | 2, button: number): void {
        this.onDown(player, button);
    }

    private release(player: 1 | 2, button: number): void {
        this.onUp(player, button);
    }

    /* -------------------------------------------------------- runtime -- */

    public setTurboRate(hz: number): void {
        this.turboRate = Math.max(1, Math.min(30, hz));
    }

    /** Suspend game input — used while the remap UI is capturing keys. */
    public setEnabled(enabled: boolean): void {
        if (!enabled) this.releaseAll();
        this.enabled = enabled;
    }

    /**
     * Advance auto-fire. Called once per emulated frame so the rate is measured
     * in console frames, which is what speedrunners expect.
     */
    public tick(frameCount: number): void {
        if (this.turbo.size === 0) return;
        const period = Math.max(1, Math.round(60 / this.turboRate));
        const on = Math.floor(frameCount / period) % 2 === 0;

        for (const code of this.held) {
            const binding = this.turbo.get(code);
            if (!binding) continue;
            const key = `${binding.player}:${binding.button}`;
            if (this.turboPhase.get(key) === on) continue;
            this.turboPhase.set(key, on);
            if (on) this.press(binding.player, binding.button);
            else this.release(binding.player, binding.button);
        }
    }

    /* --------------------------------------------------------- events -- */

    private attach(): void {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.releaseAll);
        document.addEventListener('visibilitychange', this.handleVisibility);
    }

    public detach(): void {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('blur', this.releaseAll);
        document.removeEventListener('visibilitychange', this.handleVisibility);
        this.releaseAll();
    }

    private handleVisibility = (): void => {
        if (document.hidden) this.releaseAll();
    };

    /** Typing in a field must not also drive Mario. */
    private isTextEntry(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        const tag = target.tagName;
        return (
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            target.isContentEditable
        );
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (!this.enabled || e.repeat) return;
        if (this.isTextEntry(e.target)) return;
        // Leave browser shortcuts (Cmd+R, Ctrl+T) alone.
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        const binding = this.keys.get(e.code);
        const turboBinding = this.turbo.get(e.code);
        if (!binding && !turboBinding) return;

        // Arrow keys and Space scroll the page; only suppress that once we know
        // the key is actually bound to the game.
        e.preventDefault();
        this.held.add(e.code);

        if (binding) {
            this.pressed.add(e.code);
            this.press(binding.player, binding.button);
        }
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (this.isTextEntry(e.target)) return;
        const wasHeld = this.held.delete(e.code);

        const binding = this.keys.get(e.code);
        if (binding && this.pressed.delete(e.code)) {
            this.release(binding.player, binding.button);
        }

        const turboBinding = this.turbo.get(e.code);
        if (turboBinding && wasHeld) {
            const key = `${turboBinding.player}:${turboBinding.button}`;
            // Only unwind the pulse if it is currently in its "on" phase,
            // otherwise the count goes negative and a co-held key gets released.
            if (this.turboPhase.get(key) === true) {
                this.release(turboBinding.player, turboBinding.button);
            }
            this.turboPhase.delete(key);
        }
    };

    /**
     * Release every held button. Without this, alt-tabbing while running
     * right leaves the character running right forever.
     */
    public releaseAll = (): void => {
        // One release per key that was actually down; NesCore's reference count
        // collapses keys that shared a button.
        for (const code of this.pressed) {
            const binding = this.keys.get(code);
            if (binding) this.onUp(binding.player, binding.button);
        }
        for (const [key, on] of this.turboPhase) {
            if (!on) continue;
            const [player, button] = key.split(':');
            this.onUp(Number(player) as 1 | 2, Number(button));
        }
        this.pressed.clear();
        this.held.clear();
        this.turboPhase.clear();
    };
}

/** Human-friendly label for a KeyboardEvent.code. */
export function formatKeyCode(code: string): string {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return `Num ${code.slice(6) || '·'}`;
    if (code.startsWith('Arrow')) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] ?? code;
    const named: Record<string, string> = {
        ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
        ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
        AltLeft: 'L Alt', AltRight: 'R Alt',
        MetaLeft: 'L Cmd', MetaRight: 'R Cmd',
        Space: 'Space', Enter: 'Enter', Escape: 'Esc', Backspace: '⌫',
        Backquote: '`', Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']',
        Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    };
    return named[code] ?? code;
}
