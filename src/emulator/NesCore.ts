import { NES, Controller } from 'jsnes';
import {
    bytesToBinaryString,
    isMapperSupported,
    parseRom,
    RomParseError,
    type RomInfo,
} from '../utils/ines';
import { transformPalette } from './palettes';
import type { PaletteName } from '../storage/settings';

export type AudioCallback = (left: number, right: number) => void;
export type FrameCallback = (buffer: number[]) => void;

export interface Cheat {
    id: string;
    label: string;
    code: string;
    address: number;
    value: number;
    compare?: number;
    enabled: boolean;
}

/** The NES runs at 60.0988 Hz, not 60. Over a minute that is a ~6 frame drift. */
export const NES_FPS = 60.0988139;
export const FRAME_MS = 1000 / NES_FPS;
export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 240;
const PIXELS = SCREEN_WIDTH * SCREEN_HEIGHT;

/** Cartridge save RAM lives at $6000-$7FFF. */
const SRAM_START = 0x6000;
const SRAM_SIZE = 0x2000;

export type ApuChannel = 'square1' | 'square2' | 'triangle' | 'noise' | 'dmc';

/**
 * Where each APU voice's contribution actually lands in the mixer.
 *
 * Not uniform, and getting it wrong silently half-works: the triangle is
 * interpolated into `papu.triValue` (which only *adds* `triangle.sampleValue`),
 * and the DMC mixes from `dmc.sample` rather than `sampleValue`. Muting the
 * wrong field leaves the channel audible.
 */
const MUTE_TARGETS: Record<ApuChannel, { owner: 'papu' | ApuChannel; field: string }> = {
    square1: { owner: 'square1', field: 'sampleValue' },
    square2: { owner: 'square2', field: 'sampleValue' },
    noise: { owner: 'noise', field: 'sampleValue' },
    triangle: { owner: 'papu', field: 'triValue' },
    dmc: { owner: 'dmc', field: 'sample' },
};

/**
 * PPU fields that are pure per-frame render scratch. They are listed in jsnes'
 * `JSON_PROPERTIES`, so a naive save state carries three 61,440-element arrays
 * (~184k numbers) of data that the very next rendered frame overwrites. Dropping
 * them cuts state size by roughly three quarters, which is the difference
 * between a usable rewind buffer and an unusable one.
 */
const PPU_SCRATCH = ['buffer', 'bgbuffer', 'pixrendered'] as const;

interface PaletteTable {
    curTable: number[];
    currentEmph: number;
    makeTables(): void;
    setEmphasis(emph: number): void;
}

interface NesInternals {
    cpu: { mem: number[] };
    ppu: {
        buffer: number[];
        bgbuffer: number[];
        pixrendered: number[];
        palTable: PaletteTable | null;
        clipToTvSize: boolean;
        updatePalettes?: () => void;
    };
    papu: Record<string, unknown>;
    mmap: unknown;
    romData: string | null;
    reloadROM(): void;
    toJSON(): { romData: string | null; cpu: unknown; mmap: unknown; ppu: Record<string, unknown> };
    fromJSON(s: unknown): void;
    stop?: () => void;
}

export class NesCore {
    private nes: NES;
    private internals: NesInternals;
    private frameCallback: FrameCallback;
    private audioCallback: AudioCallback;

    private cheats: Cheat[] = [];
    private romInfo: RomInfo | null = null;
    private sramDirty = false;
    private mutedChannels = new Set<ApuChannel>();
    private patchedTargets = new Set<string>();
    private basePalette: number[] | null = null;
    private paletteName: PaletteName = 'jsnes';
    private crashed = false;
    /** How many input sources currently hold each button, keyed `player:button`. */
    private buttonRefs = new Map<string, number>();

    /** Fires when the cartridge writes to battery RAM, so the host can debounce a save. */
    public onSramWrite: (() => void) | null = null;
    /** Fires when the CPU hits an illegal opcode and the machine halts. */
    public onCrash: ((error: Error) => void) | null = null;

    constructor(onFrame: FrameCallback, onAudio: AudioCallback, sampleRate: number) {
        this.frameCallback = onFrame;
        this.audioCallback = onAudio;

        this.nes = new NES({
            onFrame: (buffer: number[]) => this.frameCallback(buffer),
            onAudioSample: (left: number, right: number) => this.audioCallback(left, right),
            // Must match the AudioContext's real rate or every game plays at the
            // wrong pitch and the buffer permanently drifts.
            sampleRate,
            onBatteryRamWrite: () => {
                this.sramDirty = true;
                this.onSramWrite?.();
            },
        } as ConstructorParameters<typeof NES>[0]);

        this.internals = this.nes as unknown as NesInternals;

        // jsnes' CPU calls `nes.stop()` when it decodes an illegal opcode, but
        // never defines it — so a bad ROM throws a TypeError straight out of
        // frame(), which would otherwise kill the animation loop for good.
        this.internals.stop = () => { this.crashed = true; };
    }

    /* ------------------------------------------------------------- ROM -- */

    /**
     * Validate and load a ROM. Throws with a user-facing message; the caller is
     * expected to surface it rather than let it reach the console.
     */
    public load(bytes: Uint8Array): RomInfo {
        const info = parseRom(bytes);

        if (!isMapperSupported(info.mapper)) {
            throw new RomParseError(
                `This game uses mapper ${info.mapper} (${info.mapperName}), which this emulator core does not implement yet.`
            );
        }

        try {
            this.nes.loadROM(bytesToBinaryString(bytes));
        } catch (e) {
            throw new RomParseError(e instanceof Error ? e.message : 'The ROM could not be loaded.');
        }

        this.romInfo = info;
        this.sramDirty = false;
        this.crashed = false;
        this.afterRomLoad();
        return info;
    }

    /** Re-apply everything jsnes throws away when it (re)builds its subsystems. */
    private afterRomLoad(): void {
        // jsnes blanks 8 pixels on all four sides by default, so the picture is
        // really 240x224 inside a 256x240 frame. Turn that off and let the
        // renderer's overscan setting decide what to crop.
        this.internals.ppu.clipToTvSize = false;
        this.applyChannelMutes();
        this.setPalette(this.paletteName);
    }

    public getRomInfo(): RomInfo | null {
        return this.romInfo;
    }

    public isLoaded(): boolean {
        return this.romInfo !== null && !this.crashed;
    }

    public get hasCrashed(): boolean {
        return this.crashed;
    }

    /** Run one frame. Returns false if the machine has halted. */
    public frame(): boolean {
        if (this.crashed) return false;
        this.applyCheats();
        try {
            this.nes.frame();
        } catch (e) {
            this.crashed = true;
            this.onCrash?.(e instanceof Error ? e : new Error(String(e)));
            return false;
        }
        return !this.crashed;
    }

    /**
     * Soft reset — the console's Reset button. Preserves cartridge save RAM,
     * exactly as the real hardware does.
     *
     * Note that jsnes' own `nes.reset()` must never be called on its own: it
     * reallocates `cpu.mem` without re-running `mmap.loadROM()`, and since jsnes
     * has no separate ROM address space that erases the cartridge, leaving the
     * CPU to execute zeroes. `reloadROM()` does the full reset-and-remap.
     */
    public reset(): void {
        if (!this.internals.romData) return;
        const battery = this.hasBattery();
        const sram = battery ? this.getSram() : null;

        this.crashed = false;
        this.internals.reloadROM();

        if (sram) this.setSram(sram);
        this.afterRomLoad();
    }

    /** Hard power cycle — also wipes cartridge save RAM. */
    public powerCycle(): void {
        if (!this.internals.romData) return;
        this.crashed = false;
        this.internals.reloadROM();
        const mem = this.internals.cpu.mem;
        for (let i = 0; i < SRAM_SIZE; i++) mem[SRAM_START + i] = 0;
        this.sramDirty = true;
        this.afterRomLoad();
    }

    /* --------------------------------------------------------- Input -- */

    /**
     * Button presses are reference counted.
     *
     * Several sources can hold the same NES button at once: the default keymap
     * binds both WASD and the arrow keys to each direction, a gamepad reports
     * its d-pad and its analog stick separately, and touch and keyboard can be
     * used together. jsnes' controller is a flat `state[button] = 0x40` with no
     * counting, so without this, releasing *any* holder releases the button —
     * brush an arrow key while running right on D and the character stops dead.
     */
    public buttonDown(player: 1 | 2, button: number): void {
        const key = `${player}:${button}`;
        const count = (this.buttonRefs.get(key) ?? 0) + 1;
        this.buttonRefs.set(key, count);
        if (count === 1) this.nes.buttonDown(player, button);
    }

    public buttonUp(player: 1 | 2, button: number): void {
        const key = `${player}:${button}`;
        const count = (this.buttonRefs.get(key) ?? 0) - 1;
        if (count > 0) {
            this.buttonRefs.set(key, count);
            return;
        }
        this.buttonRefs.delete(key);
        this.nes.buttonUp(player, button);
    }

    /** Release everything — used on blur so nothing gets stuck down. */
    public releaseAll(): void {
        this.buttonRefs.clear();
        for (const player of [1, 2] as const) {
            for (const button of Object.values(NES_BUTTONS)) {
                this.nes.buttonUp(player, button);
            }
        }
    }

    /* ---------------------------------------------------- Save states -- */

    /**
     * Snapshot the machine.
     *
     * Two things are stripped: `romData` (the whole cartridge as a binary
     * string — we keep ROMs in IndexedDB and put it back on load) and the PPU's
     * render scratch buffers. Between them that is over 90% of what jsnes would
     * otherwise serialise.
     */
    public getState(): unknown {
        const state = this.internals.toJSON();
        const ppu: Record<string, unknown> = { ...state.ppu };
        for (const key of PPU_SCRATCH) delete ppu[key];
        return { cpu: state.cpu, mmap: state.mmap, ppu };
    }

    public loadState(state: unknown): boolean {
        const s = state as { cpu: unknown; mmap: unknown; ppu: Record<string, unknown> };
        if (!s?.ppu || !s.cpu) return false;

        // Re-supply the scratch buffers we dropped; jsnes writes into them
        // without allocating, so leaving them undefined crashes the next frame.
        const ppu: Record<string, unknown> = { ...s.ppu };
        for (const key of PPU_SCRATCH) {
            if (!Array.isArray(ppu[key])) ppu[key] = new Array<number>(PIXELS).fill(0);
        }

        try {
            this.internals.fromJSON({ ...s, ppu, romData: this.internals.romData });
        } catch {
            return false;
        }

        this.crashed = false;
        // fromJSON runs a reset internally, which rebuilds the palette table.
        this.internals.ppu.clipToTvSize = false;
        this.applyChannelMutes();
        this.setPalette(this.paletteName);
        return true;
    }

    /* --------------------------------------------------- Battery SRAM -- */

    public hasBattery(): boolean {
        return this.romInfo?.hasBattery ?? false;
    }

    public isSramDirty(): boolean {
        return this.sramDirty;
    }

    public clearSramDirty(): void {
        this.sramDirty = false;
    }

    /** Snapshot cartridge save RAM ($6000-$7FFF). */
    public getSram(): Uint8Array {
        const mem = this.internals.cpu.mem;
        const out = new Uint8Array(SRAM_SIZE);
        for (let i = 0; i < SRAM_SIZE; i++) out[i] = mem[SRAM_START + i] & 0xff;
        return out;
    }

    /**
     * Restore cartridge save RAM. jsnes' own `loadBatteryRam` is dead code (it
     * tests `.length` on a boolean flag), so we write straight into CPU memory.
     */
    public setSram(data: Uint8Array): void {
        const mem = this.internals.cpu.mem;
        const n = Math.min(SRAM_SIZE, data.length);
        for (let i = 0; i < n; i++) mem[SRAM_START + i] = data[i];
        this.sramDirty = false;
    }

    /* -------------------------------------------------------- Cheats -- */

    public setCheats(cheats: Cheat[]): void {
        this.cheats = cheats;
    }

    /**
     * Apply enabled cheats for the upcoming frame.
     *
     * Deliberately writes to CPU memory directly rather than through
     * `mmap.write()`: for addresses at $8000 and above a mapper write is a
     * *bank-switch register write*, so routing Game Genie patches through it
     * corrupts MMC1/MMC3 games instead of patching them. The 8-letter compare
     * byte is honoured so a code only fires when the intended bank is live.
     */
    private applyCheats(): void {
        if (this.cheats.length === 0) return;
        const mem = this.internals.cpu.mem;
        for (const cheat of this.cheats) {
            if (!cheat.enabled) continue;
            const addr = cheat.address & 0xffff;
            if (cheat.compare !== undefined && (mem[addr] & 0xff) !== (cheat.compare & 0xff)) continue;
            mem[addr] = cheat.value & 0xff;
        }
    }

    /* ------------------------------------------------- Memory access -- */

    public peek(address: number): number {
        return this.internals.cpu.mem[address & 0xffff] & 0xff;
    }

    public poke(address: number, value: number): void {
        this.internals.cpu.mem[address & 0xffff] = value & 0xff;
    }

    /** Copy a slice of CPU memory — used by the memory viewer and cheat search. */
    public readMemory(start: number, length: number): Uint8Array {
        const mem = this.internals.cpu.mem;
        const out = new Uint8Array(length);
        for (let i = 0; i < length; i++) out[i] = mem[(start + i) & 0xffff] & 0xff;
        return out;
    }

    /** The 2KB of work RAM that cheat searches care about. */
    public readWorkRam(): Uint8Array {
        return this.readMemory(0x0000, 0x0800);
    }

    /* ------------------------------------------------------ Palette -- */

    /**
     * Swap the PPU's colour table.
     *
     * The base table is captured on first use because the transform is applied
     * destructively — re-transforming an already-transformed palette would
     * compound the curve every time the user changes the setting.
     */
    public setPalette(name: PaletteName): void {
        this.paletteName = name;
        const palTable = this.internals.ppu.palTable;
        if (!palTable) return;

        if (!this.basePalette) {
            // `curTable` may already hold an emphasised variant; rebuild the
            // un-emphasised base before snapshotting it.
            palTable.currentEmph = -1;
            palTable.setEmphasis(0);
            this.basePalette = [...palTable.curTable];
        }

        palTable.curTable = transformPalette(this.basePalette, name);
        palTable.makeTables();
        // setEmphasis is a no-op when the requested emphasis is already current,
        // so force it to re-copy from the freshly built emphasis tables.
        palTable.currentEmph = -1;
        palTable.setEmphasis(0);

        // The PPU caches resolved colours per palette entry; refresh them or the
        // change will not show until the game next writes to palette RAM.
        this.internals.ppu.updatePalettes?.();
    }

    public getPalette(): PaletteName {
        return this.paletteName;
    }

    /* ---------------------------------------------------------- APU -- */

    public setChannelMuted(channel: ApuChannel, muted: boolean): void {
        if (muted) this.mutedChannels.add(channel);
        else this.mutedChannels.delete(channel);
        this.applyChannelMutes();
    }

    public isChannelMuted(channel: ApuChannel): boolean {
        return this.mutedChannels.has(channel);
    }

    /**
     * Mute by intercepting the mixer's source field with an accessor that
     * reports zero. This survives register writes, unlike toggling `isEnabled`,
     * which the game itself will happily turn back on.
     */
    private applyChannelMutes(): void {
        const papu = this.internals.papu;

        for (const [name, target] of Object.entries(MUTE_TARGETS) as Array<[ApuChannel, typeof MUTE_TARGETS[ApuChannel]]>) {
            const owner = (target.owner === 'papu' ? papu : papu[target.owner]) as Record<string, unknown> | undefined;
            if (!owner) continue;

            const key = `${target.owner}.${target.field}`;
            if (this.patchedTargets.has(key)) continue;

            const backing = { value: (owner[target.field] as number) ?? 0 };
            const isMuted = () => this.mutedChannels.has(name);
            try {
                Object.defineProperty(owner, target.field, {
                    configurable: true,
                    get: () => (isMuted() ? 0 : backing.value),
                    set: (v: number) => { backing.value = v; },
                });
                this.patchedTargets.add(key);
            } catch {
                // Non-configurable in some engine build — muting is optional.
            }
        }
    }

    /* ------------------------------------------------------- Escape -- */

    /** Escape hatch for tooling (tile viewer, disassembler). Use sparingly. */
    public get raw(): NES {
        return this.nes;
    }

    /** The PPU's current framebuffer, for thumbnails while paused. */
    public getFrameBuffer(): number[] {
        return this.internals.ppu.buffer;
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
} as const;

export const BUTTON_NAMES: Record<number, string> = {
    [NES_BUTTONS.A]: 'A',
    [NES_BUTTONS.B]: 'B',
    [NES_BUTTONS.SELECT]: 'Select',
    [NES_BUTTONS.START]: 'Start',
    [NES_BUTTONS.UP]: 'Up',
    [NES_BUTTONS.DOWN]: 'Down',
    [NES_BUTTONS.LEFT]: 'Left',
    [NES_BUTTONS.RIGHT]: 'Right',
};

/** Display order for the remapping UI: d-pad, then face, then system buttons. */
export const BUTTON_ORDER = [
    NES_BUTTONS.UP,
    NES_BUTTONS.DOWN,
    NES_BUTTONS.LEFT,
    NES_BUTTONS.RIGHT,
    NES_BUTTONS.B,
    NES_BUTTONS.A,
    NES_BUTTONS.SELECT,
    NES_BUTTONS.START,
];
