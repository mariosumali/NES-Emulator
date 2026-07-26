declare module 'jsnes' {
    export interface NESOptions {
        onFrame: (buffer: number[]) => void;
        onAudioSample?: (left: number, right: number) => void;
        onStatusUpdate?: (status: string) => void;
        /** Called for every write into cartridge save RAM ($6000-$7FFF). */
        onBatteryRamWrite?: (address: number, value: number) => void;
        emulateSound?: boolean;
        /** Must match the AudioContext's real rate. Defaults to 48000. */
        sampleRate?: number;
        preferredFrameRate?: number;
    }

    export class NES {
        constructor(opts: NESOptions);
        reset(): void;
        frame(): void;
        /** Takes a binary string — one character per byte. Throws on a bad ROM. */
        loadROM(data: string): void;
        reloadROM(): void;
        buttonDown(player: number, button: number): void;
        buttonUp(player: number, button: number): void;
        zapperMove(x: number, y: number): void;
        zapperFireDown(): void;
        zapperFireUp(): void;
        getFPS(): number | null;
        setFramerate(rate: number): void;
        toJSON(): { romData: string | null; cpu: unknown; mmap: unknown; ppu: unknown };
        fromJSON(state: unknown): void;
        opts: NESOptions;
        romData: string | null;
    }

    export class Controller {
        static BUTTON_A: number;
        static BUTTON_B: number;
        static BUTTON_SELECT: number;
        static BUTTON_START: number;
        static BUTTON_UP: number;
        static BUTTON_DOWN: number;
        static BUTTON_LEFT: number;
        static BUTTON_RIGHT: number;
    }
}
