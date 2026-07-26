import { NES_BUTTONS } from './NesCore';

export type ButtonCallback = (player: 1 | 2, button: number) => void;
export type HotkeyCallback = (action: GamepadHotkey) => void;

/** Actions a shoulder button or stick click can trigger. */
export type GamepadHotkey = 'saveState' | 'loadState' | 'rewind' | 'fastForward' | 'menu';

export interface GamepadInfo {
    index: number;
    id: string;
    player: 1 | 2 | null;
    connected: boolean;
    buttonCount: number;
    axisCount: number;
}

/** Standard-mapping button indices, per the Gamepad API spec. */
export const STANDARD_BUTTONS: Record<number, string> = {
    0: 'A (bottom)', 1: 'B (right)', 2: 'X (left)', 3: 'Y (top)',
    4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'Select / Share', 9: 'Start / Options',
    10: 'L3', 11: 'R3',
    12: 'D-pad Up', 13: 'D-pad Down', 14: 'D-pad Left', 15: 'D-pad Right',
    16: 'Home',
};

export type GamepadMapping = Record<number, number>;

/**
 * Defaults follow the physical layout rather than the labels: the NES A button
 * sits to the right of B, so it maps to the right face button. On an Xbox pad
 * that is B, on a PlayStation pad it is Circle — which is what muscle memory
 * expects when the buttons are laid out horizontally.
 */
export const DEFAULT_MAPPING: GamepadMapping = {
    0: NES_BUTTONS.B,
    1: NES_BUTTONS.A,
    2: NES_BUTTONS.B,
    3: NES_BUTTONS.A,
    8: NES_BUTTONS.SELECT,
    9: NES_BUTTONS.START,
    12: NES_BUTTONS.UP,
    13: NES_BUTTONS.DOWN,
    14: NES_BUTTONS.LEFT,
    15: NES_BUTTONS.RIGHT,
};

export const DEFAULT_HOTKEYS: Record<number, GamepadHotkey> = {
    4: 'rewind',
    5: 'fastForward',
    6: 'loadState',
    7: 'saveState',
};

const STORAGE_KEY = 'nes-station:gamepad';

/** Virtual button ids for the analog stick, kept clear of real button indices. */
const AXIS_LEFT = 1000;
const AXIS_RIGHT = 1001;
const AXIS_UP = 1002;
const AXIS_DOWN = 1003;

interface PadState {
    buttons: boolean[];
    axes: Map<number, boolean>;
}

export class GamepadController {
    private onDown: ButtonCallback;
    private onUp: ButtonCallback;
    private onHotkey: HotkeyCallback | null = null;

    private mapping: GamepadMapping;
    private hotkeys: Record<number, GamepadHotkey>;
    private deadzone = 0.35;
    private hapticsEnabled = true;

    private states = new Map<number, PadState>();
    /** Gamepad index -> player, assigned in the order pads are first seen. */
    private players = new Map<number, 1 | 2>();
    private rafId: number | null = null;
    private listenersChanged: (() => void) | null = null;

    constructor(onDown: ButtonCallback, onUp: ButtonCallback) {
        this.onDown = onDown;
        this.onUp = onUp;
        const stored = this.load();
        this.mapping = stored.mapping;
        this.hotkeys = stored.hotkeys;

        window.addEventListener('gamepadconnected', this.handleConnected);
        window.addEventListener('gamepaddisconnected', this.handleDisconnected);
        this.startPolling();
    }

    /* ------------------------------------------------------- storage -- */

    private load(): { mapping: GamepadMapping; hotkeys: Record<number, GamepadHotkey> } {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    mapping: { ...DEFAULT_MAPPING, ...(parsed.mapping ?? {}) },
                    hotkeys: { ...DEFAULT_HOTKEYS, ...(parsed.hotkeys ?? {}) },
                };
            }
        } catch { /* fall through */ }
        return { mapping: { ...DEFAULT_MAPPING }, hotkeys: { ...DEFAULT_HOTKEYS } };
    }

    private save(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ mapping: this.mapping, hotkeys: this.hotkeys }));
        } catch { /* private mode */ }
    }

    public getMapping(): GamepadMapping {
        return { ...this.mapping };
    }

    public setButtonMapping(padButton: number, nesButton: number | null): void {
        if (nesButton === null) delete this.mapping[padButton];
        else this.mapping[padButton] = nesButton;
        this.save();
    }

    public getHotkeys(): Record<number, GamepadHotkey> {
        return { ...this.hotkeys };
    }

    public resetMapping(): void {
        this.mapping = { ...DEFAULT_MAPPING };
        this.hotkeys = { ...DEFAULT_HOTKEYS };
        this.save();
    }

    public setDeadzone(value: number): void {
        this.deadzone = Math.max(0.05, Math.min(0.9, value));
    }

    public setHapticsEnabled(enabled: boolean): void {
        this.hapticsEnabled = enabled;
    }

    public setHotkeyHandler(fn: HotkeyCallback | null): void {
        this.onHotkey = fn;
    }

    /** Notified when pads connect or disconnect so the settings UI can refresh. */
    public setChangeHandler(fn: (() => void) | null): void {
        this.listenersChanged = fn;
    }

    /* ------------------------------------------------------ discovery -- */

    private handleConnected = (e: GamepadEvent): void => {
        this.assignPlayer(e.gamepad.index);
        this.listenersChanged?.();
    };

    private handleDisconnected = (e: GamepadEvent): void => {
        // Release anything the pad was holding before we forget about it.
        const player = this.players.get(e.gamepad.index);
        const state = this.states.get(e.gamepad.index);
        if (player && state) {
            state.buttons.forEach((pressed, i) => {
                const nesButton = this.mapping[i];
                if (pressed && nesButton !== undefined) this.onUp(player, nesButton);
            });
            for (const [axis, active] of state.axes) {
                if (active) this.onUp(player, this.axisToButton(axis));
            }
        }
        this.states.delete(e.gamepad.index);
        this.players.delete(e.gamepad.index);
        this.listenersChanged?.();
    };

    /**
     * Assign the lowest free player slot. Using `gamepad.index` directly, as the
     * previous implementation did, breaks the moment a pad disconnects and
     * reconnects — the browser hands out a new index and the only pad in the
     * room silently becomes player 2.
     */
    private assignPlayer(index: number): void {
        if (this.players.has(index)) return;
        const taken = new Set(this.players.values());
        const slot = !taken.has(1) ? 1 : !taken.has(2) ? 2 : null;
        if (slot) this.players.set(index, slot);
    }

    public getGamepads(): GamepadInfo[] {
        const pads = navigator.getGamepads?.() ?? [];
        const out: GamepadInfo[] = [];
        for (const pad of pads) {
            if (!pad) continue;
            out.push({
                index: pad.index,
                id: pad.id,
                player: this.players.get(pad.index) ?? null,
                connected: pad.connected,
                buttonCount: pad.buttons.length,
                axisCount: pad.axes.length,
            });
        }
        return out;
    }

    /** Manually move a pad to a player slot. */
    public assignTo(index: number, player: 1 | 2 | null): void {
        for (const [i, p] of [...this.players]) {
            if (p === player && i !== index) this.players.delete(i);
        }
        if (player === null) this.players.delete(index);
        else this.players.set(index, player);
        this.listenersChanged?.();
    }

    /** Rumble, where supported. Silently no-ops on pads without an actuator. */
    public vibrate(player: 1 | 2, durationMs = 40, intensity = 0.4): void {
        if (!this.hapticsEnabled) return;
        const pads = navigator.getGamepads?.() ?? [];
        for (const pad of pads) {
            if (!pad || this.players.get(pad.index) !== player) continue;
            const actuator = (pad as Gamepad & {
                vibrationActuator?: { playEffect(type: string, params: object): Promise<string> };
            }).vibrationActuator;
            actuator?.playEffect('dual-rumble', {
                startDelay: 0,
                duration: durationMs,
                weakMagnitude: intensity,
                strongMagnitude: intensity * 0.5,
            }).catch(() => { /* unsupported effect type */ });
        }
    }

    /* -------------------------------------------------------- polling -- */

    private axisToButton(axis: number): number {
        switch (axis) {
            case AXIS_LEFT: return NES_BUTTONS.LEFT;
            case AXIS_RIGHT: return NES_BUTTONS.RIGHT;
            case AXIS_UP: return NES_BUTTONS.UP;
            default: return NES_BUTTONS.DOWN;
        }
    }

    private startPolling(): void {
        const poll = () => {
            this.poll();
            this.rafId = requestAnimationFrame(poll);
        };
        this.rafId = requestAnimationFrame(poll);
    }

    /**
     * Polls on its own animation frame rather than piggy-backing on the emulation
     * loop, so Start still un-pauses the game while emulation is stopped.
     */
    public poll(): void {
        const pads = navigator.getGamepads?.() ?? [];

        for (const pad of pads) {
            if (!pad || !pad.connected) continue;
            this.assignPlayer(pad.index);
            const player = this.players.get(pad.index);
            if (!player) continue;

            let state = this.states.get(pad.index);
            if (!state) {
                state = { buttons: new Array(pad.buttons.length).fill(false), axes: new Map() };
                this.states.set(pad.index, state);
            }

            for (let i = 0; i < pad.buttons.length; i++) {
                const pressed = pad.buttons[i].pressed || pad.buttons[i].value > 0.5;
                const was = state.buttons[i] ?? false;
                if (pressed === was) continue;
                state.buttons[i] = pressed;

                const nesButton = this.mapping[i];
                if (nesButton !== undefined) {
                    if (pressed) this.onDown(player, nesButton);
                    else this.onUp(player, nesButton);
                }

                const hotkey = this.hotkeys[i];
                // Hotkeys fire on press; hold-style ones (rewind, fast-forward)
                // are edge-reported both ways by the caller's own state.
                if (hotkey && this.onHotkey) {
                    if (pressed || hotkey === 'rewind' || hotkey === 'fastForward') {
                        this.onHotkey(hotkey);
                    }
                }
            }

            // Left stick doubles as a d-pad.
            const [x = 0, y = 0] = pad.axes;
            this.updateAxis(state, player, AXIS_LEFT, x < -this.deadzone);
            this.updateAxis(state, player, AXIS_RIGHT, x > this.deadzone);
            this.updateAxis(state, player, AXIS_UP, y < -this.deadzone);
            this.updateAxis(state, player, AXIS_DOWN, y > this.deadzone);
        }
    }

    private updateAxis(state: PadState, player: 1 | 2, axis: number, active: boolean): void {
        if ((state.axes.get(axis) ?? false) === active) return;
        state.axes.set(axis, active);
        const button = this.axisToButton(axis);
        if (active) this.onDown(player, button);
        else this.onUp(player, button);
    }

    /** True while any pad is holding a button mapped to this hotkey. */
    public isHotkeyHeld(action: GamepadHotkey): boolean {
        const pads = navigator.getGamepads?.() ?? [];
        for (const pad of pads) {
            if (!pad?.connected) continue;
            for (const [indexStr, mapped] of Object.entries(this.hotkeys)) {
                if (mapped !== action) continue;
                const button = pad.buttons[Number(indexStr)];
                if (button && (button.pressed || button.value > 0.5)) return true;
            }
        }
        return false;
    }

    public detach(): void {
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
        window.removeEventListener('gamepadconnected', this.handleConnected);
        window.removeEventListener('gamepaddisconnected', this.handleDisconnected);
        this.states.clear();
        this.players.clear();
    }
}
