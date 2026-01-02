import { NES_BUTTONS } from './NesCore';

type ButtonCallback = (player: 1 | 2, button: number) => void;

interface GamepadMapping {
    [buttonIndex: number]: number; // gamepad button index -> NES button
}

const DEFAULT_MAPPING: GamepadMapping = {
    0: NES_BUTTONS.B,      // A/Cross -> B
    1: NES_BUTTONS.A,      // B/Circle -> A  
    2: NES_BUTTONS.B,      // X/Square -> B (alternative)
    3: NES_BUTTONS.A,      // Y/Triangle -> A (alternative)
    8: NES_BUTTONS.SELECT, // Back/Share -> Select
    9: NES_BUTTONS.START,  // Start/Options -> Start
    12: NES_BUTTONS.UP,    // D-pad Up
    13: NES_BUTTONS.DOWN,  // D-pad Down
    14: NES_BUTTONS.LEFT,  // D-pad Left
    15: NES_BUTTONS.RIGHT, // D-pad Right
};

export class GamepadController {
    private onButtonDown: ButtonCallback;
    private onButtonUp: ButtonCallback;
    private mapping: GamepadMapping;
    private prevButtonStates: Map<number, boolean[]> = new Map();
    private animationId: number | null = null;
    private STORAGE_KEY = 'nes_emulator_gamepad_mapping';

    constructor(onButtonDown: ButtonCallback, onButtonUp: ButtonCallback) {
        this.onButtonDown = onButtonDown;
        this.onButtonUp = onButtonUp;
        this.mapping = this.loadMapping();
        this.startPolling();

        window.addEventListener('gamepadconnected', this.onGamepadConnected);
        window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    }

    private loadMapping(): GamepadMapping {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return { ...DEFAULT_MAPPING };
            }
        }
        return { ...DEFAULT_MAPPING };
    }

    public saveMapping(): void {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.mapping));
    }

    public getMapping(): GamepadMapping {
        return { ...this.mapping };
    }

    public setButtonMapping(gamepadButton: number, nesButton: number): void {
        this.mapping[gamepadButton] = nesButton;
        this.saveMapping();
    }

    public resetMapping(): void {
        this.mapping = { ...DEFAULT_MAPPING };
        this.saveMapping();
    }

    private onGamepadConnected = (e: GamepadEvent) => {
        console.log('Gamepad connected:', e.gamepad.id);
        this.prevButtonStates.set(e.gamepad.index, new Array(e.gamepad.buttons.length).fill(false));
    };

    private onGamepadDisconnected = (e: GamepadEvent) => {
        console.log('Gamepad disconnected:', e.gamepad.id);
        this.prevButtonStates.delete(e.gamepad.index);
    };

    private startPolling(): void {
        const poll = () => {
            const gamepads = navigator.getGamepads();

            for (const gamepad of gamepads) {
                if (!gamepad) continue;

                let prevStates = this.prevButtonStates.get(gamepad.index);
                if (!prevStates) {
                    prevStates = new Array(gamepad.buttons.length).fill(false);
                    this.prevButtonStates.set(gamepad.index, prevStates);
                }

                // Check buttons
                for (let i = 0; i < gamepad.buttons.length; i++) {
                    const pressed = gamepad.buttons[i].pressed;
                    const wasPressed = prevStates[i];
                    const nesButton = this.mapping[i];

                    if (nesButton !== undefined) {
                        if (pressed && !wasPressed) {
                            // Player determined by gamepad index (0 = P1, 1 = P2)
                            const player = (gamepad.index === 0 ? 1 : 2) as 1 | 2;
                            this.onButtonDown(player, nesButton);
                        } else if (!pressed && wasPressed) {
                            const player = (gamepad.index === 0 ? 1 : 2) as 1 | 2;
                            this.onButtonUp(player, nesButton);
                        }
                    }

                    prevStates[i] = pressed;
                }

                // Check analog stick for D-pad (left stick)
                const deadzone = 0.5;
                const axes = gamepad.axes;

                // Left stick horizontal (axis 0)
                if (axes[0] < -deadzone) {
                    if (!prevStates[100]) { // Use 100+ for virtual axis buttons
                        this.onButtonDown(gamepad.index === 0 ? 1 : 2, NES_BUTTONS.LEFT);
                        prevStates[100] = true;
                    }
                } else if (axes[0] > deadzone) {
                    if (!prevStates[101]) {
                        this.onButtonDown(gamepad.index === 0 ? 1 : 2, NES_BUTTONS.RIGHT);
                        prevStates[101] = true;
                    }
                } else {
                    if (prevStates[100]) {
                        this.onButtonUp(gamepad.index === 0 ? 1 : 2, NES_BUTTONS.LEFT);
                        prevStates[100] = false;
                    }
                    if (prevStates[101]) {
                        this.onButtonUp(gamepad.index === 0 ? 1 : 2, NES_BUTTONS.RIGHT);
                        prevStates[101] = false;
                    }
                }

                // Left stick vertical (axis 1)
                if (axes[1] < -deadzone) {
                    if (!prevStates[102]) {
                        this.onButtonDown(gamepad.index === 0 ? 1 : 2, NES_BUTTONS.UP);
                        prevStates[102] = true;
                    }
                } else if (axes[1] > deadzone) {
                    if (!prevStates[103]) {
                        this.onButtonDown(gamepad.index === 0 ? 1 : 2, NES_BUTTONS.DOWN);
                        prevStates[103] = true;
                    }
                } else {
                    if (prevStates[102]) {
                        this.onButtonUp(gamepad.index === 0 ? 1 : 2, NES_BUTTONS.UP);
                        prevStates[102] = false;
                    }
                    if (prevStates[103]) {
                        this.onButtonUp(gamepad.index === 0 ? 1 : 2, NES_BUTTONS.DOWN);
                        prevStates[103] = false;
                    }
                }
            }

            this.animationId = requestAnimationFrame(poll);
        };

        poll();
    }

    public getConnectedGamepads(): Gamepad[] {
        return Array.from(navigator.getGamepads()).filter((g): g is Gamepad => g !== null);
    }

    public detach(): void {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
        }
        window.removeEventListener('gamepadconnected', this.onGamepadConnected);
        window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    }
}
