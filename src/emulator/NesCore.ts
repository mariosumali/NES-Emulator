import { NES, Controller } from 'jsnes';

export type AudioCallback = (left: number, right: number) => void;
export type FrameCallback = (buffer: number[]) => void;

export class NesCore {
    private nes: NES;
    private audioCallback: AudioCallback | null = null;
    private frameCallback: FrameCallback | null = null;

    constructor(onFrame: FrameCallback, onAudio: AudioCallback) {
        this.frameCallback = onFrame;
        this.audioCallback = onAudio;

        this.nes = new NES({
            onFrame: (buffer: number[]) => {
                // Log every 60th frame to avoid spam, but prove it's running
                if (Math.random() < 0.01) console.log("NES Frame generated", buffer.length);
                if (this.frameCallback) this.frameCallback(buffer);
            },
            onAudioSample: (left: number, right: number) => {
                if (this.audioCallback) this.audioCallback(left, right);
            },
            sampleRate: 44100, // Standard audio context rate
        });
    }

    public loadROM(romData: string) {
        this.nes.loadROM(romData);
    }

    public frame() {
        this.nes.frame();
    }

    public reset() {
        this.nes.reset();
    }

    public buttonDown(player: 1 | 2, button: number) {
        this.nes.buttonDown(player, button);
    }

    public buttonUp(player: 1 | 2, button: number) {
        this.nes.buttonUp(player, button);
    }

    public getFPS() {
        return this.nes.getFPS();
    }

    public getState() {
        return (this.nes as any).toJSON();
    }

    public loadState(state: any) {
        (this.nes as any).fromJSON(state);
    }

    public writeMem(address: number, value: number) {
        (this.nes as any).cpu.mmap.write(address, value);
    }
}

export const NES_BUTTONS = {
    A: Controller.BUTTON_A,
    B: Controller.BUTTON_B,
    SELECT: Controller.BUTTON_SELECT,
    START: Controller.BUTTON_START,
    UP: Controller.BUTTON_UP,
    DOWN: Controller.BUTTON_DOWN,
    LEFT: Controller.BUTTON_LEFT,
    RIGHT: Controller.BUTTON_RIGHT,
};
