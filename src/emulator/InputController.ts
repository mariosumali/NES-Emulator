import { NES_BUTTONS } from "./NesCore";

interface KeyBinding {
    player: 1 | 2;
    button: number;
}

export class InputController {
    private keys: Map<string, KeyBinding>;
    private handleButtonDown: (player: 1 | 2, button: number) => void;
    private handleButtonUp: (player: 1 | 2, button: number) => void;
    private STORAGE_KEY = 'nes_emulator_keymap_v2';

    constructor(
        onButtonDown: (player: 1 | 2, button: number) => void,
        onButtonUp: (player: 1 | 2, button: number) => void
    ) {
        this.handleButtonDown = onButtonDown;
        this.handleButtonUp = onButtonUp;
        this.keys = new Map();
        this.loadKeyMap();
        this.attach();
    }

    private loadKeyMap() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.keys = new Map(parsed);
            } catch (e) {
                console.error('Failed to parse keymap', e);
                this.setDefaultKeyMap();
            }
        } else {
            this.setDefaultKeyMap();
        }
    }

    private setDefaultKeyMap() {
        this.keys = new Map([
            // Player 1 - WASD + JK
            ['KeyJ', { player: 1, button: NES_BUTTONS.A }],
            ['KeyK', { player: 1, button: NES_BUTTONS.B }],
            ['ShiftRight', { player: 1, button: NES_BUTTONS.SELECT }],
            ['Enter', { player: 1, button: NES_BUTTONS.START }],
            ['KeyW', { player: 1, button: NES_BUTTONS.UP }],
            ['KeyA', { player: 1, button: NES_BUTTONS.LEFT }],
            ['KeyS', { player: 1, button: NES_BUTTONS.DOWN }],
            ['KeyD', { player: 1, button: NES_BUTTONS.RIGHT }],
            // Player 1 - Arrow keys (alternative)
            ['ArrowUp', { player: 1, button: NES_BUTTONS.UP }],
            ['ArrowLeft', { player: 1, button: NES_BUTTONS.LEFT }],
            ['ArrowDown', { player: 1, button: NES_BUTTONS.DOWN }],
            ['ArrowRight', { player: 1, button: NES_BUTTONS.RIGHT }],
            // Player 2 - Numpad
            ['Numpad8', { player: 2, button: NES_BUTTONS.UP }],
            ['Numpad4', { player: 2, button: NES_BUTTONS.LEFT }],
            ['Numpad5', { player: 2, button: NES_BUTTONS.DOWN }],
            ['Numpad2', { player: 2, button: NES_BUTTONS.DOWN }],
            ['Numpad6', { player: 2, button: NES_BUTTONS.RIGHT }],
            ['Numpad1', { player: 2, button: NES_BUTTONS.A }],
            ['Numpad0', { player: 2, button: NES_BUTTONS.B }],
            ['Numpad7', { player: 2, button: NES_BUTTONS.SELECT }],
            ['Numpad9', { player: 2, button: NES_BUTTONS.START }],
        ]);
    }

    public getKeyMap(): Map<string, KeyBinding> {
        return new Map(this.keys);
    }

    public getKeyMapForPlayer(player: 1 | 2): Map<string, number> {
        const playerKeys = new Map<string, number>();
        this.keys.forEach((binding, code) => {
            if (binding.player === player) {
                playerKeys.set(code, binding.button);
            }
        });
        return playerKeys;
    }

    public setKeyBinding(code: string, player: 1 | 2, button: number) {
        this.keys.set(code, { player, button });
        this.saveKeyMap();
    }

    public clearButtonBindings(player: 1 | 2, button: number) {
        for (const [code, binding] of this.keys.entries()) {
            if (binding.player === player && binding.button === button) {
                this.keys.delete(code);
            }
        }
        this.saveKeyMap();
    }

    private saveKeyMap() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(this.keys.entries())));
    }

    private attach() {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    public detach() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    private onKeyDown = (e: KeyboardEvent) => {
        // Ignore repetitive keydown events
        if (e.repeat) return;

        const binding = this.keys.get(e.code);
        if (binding !== undefined) {
            this.handleButtonDown(binding.player, binding.button);
        }
    };

    private onKeyUp = (e: KeyboardEvent) => {
        const binding = this.keys.get(e.code);
        if (binding !== undefined) {
            this.handleButtonUp(binding.player, binding.button);
        }
    };
}
