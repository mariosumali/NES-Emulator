declare module 'jsnes' {
  export interface NESOptions {
    onFrame: (buffer: number[]) => void;
    onAudioSample: (left: number, right: number) => void;
    emulateSound?: boolean;
    sampleRate?: number;
  }

  export class NES {
    constructor(opts: NESOptions);
    reset(): void;
    frame(): void;
    loadROM(data: string): void;
    buttonDown(player: number, button: number): void;
    buttonUp(player: number, button: number): void;
    getFPS(): number | null;
    opts: NESOptions;
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
