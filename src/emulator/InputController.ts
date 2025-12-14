import { NES_BUTTONS } from "./NesCore";

export class InputController {
    private keys: Map<string, number>;
    private handleButtonDown: (player: 1 | 2, button: number) => void;
    private handleButtonUp: (player: 1 | 2, button: number) => void;
    private STORAGE_KEY = 'nes_emulator_keymap';

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
            ['KeyJ', NES_BUTTONS.A],
            ['KeyK', NES_BUTTONS.B],
            ['ShiftRight', NES_BUTTONS.SELECT],
            ['Enter', NES_BUTTONS.START],
            ['KeyW', NES_BUTTONS.UP],
            ['KeyA', NES_BUTTONS.LEFT],
            ['KeyS', NES_BUTTONS.DOWN],
            ['KeyD', NES_BUTTONS.RIGHT],
            // Arrows
            ['ArrowUp', NES_BUTTONS.UP],
            ['ArrowLeft', NES_BUTTONS.LEFT],
            ['ArrowDown', NES_BUTTONS.DOWN],
            ['ArrowRight', NES_BUTTONS.RIGHT],
        ]);
    }

    public getKeyMap(): Map<string, number> {
        return new Map(this.keys);
    }

    public setKeyBinding(code: string, button: number) {
        // Remove existing binding for this button (optional, but good for 1:1 mapping)
        // Actually, we usually allow multiple keys for one button (like WASD + Arrows)
        // But for remapping UI, we usually want "Press key for A".
        // If we want to support multiple keys, the UI needs to handle it.
        // For simplicity, let's just add/overwrite.

        // If we want to CLEAR old bindings for this button, we'd have to iterate.
        // Let's just add it for now.
        this.keys.set(code, button);
        this.saveKeyMap();
    }

    public clearButtonBindings(button: number) {
        for (const [code, btn] of this.keys.entries()) {
            if (btn === button) {
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

        const button = this.keys.get(e.code);
        if (button !== undefined) {
            this.handleButtonDown(1, button); // Player 1
        }
    };

    private onKeyUp = (e: KeyboardEvent) => {
        const button = this.keys.get(e.code);
        if (button !== undefined) {
            this.handleButtonUp(1, button); // Player 1
        }
    };
}
