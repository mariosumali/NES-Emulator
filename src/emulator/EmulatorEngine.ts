import { AudioEngine } from './AudioEngine';
import { GamepadController, type GamepadHotkey, type GamepadInfo } from './GamepadController';
import { InputController } from './InputController';
import { FRAME_MS, NesCore, type ApuChannel, type Cheat } from './NesCore';
import { Renderer } from './Renderer';
import { RewindBuffer } from './RewindBuffer';
import { RecordingController } from './RecordingController';
import { romsDb, sramDb, statesDb, hashBytes, type RomRecord } from '../storage/db';
import { settingsStore, type Settings } from '../storage/settings';
import { parseRom, prettifyRomName, type RomInfo } from '../utils/ines';
import { extractRomFromZip, isZip } from '../utils/zip';

export type EngineStatus = 'empty' | 'loading' | 'running' | 'paused' | 'error';

export interface EngineSnapshot {
    status: EngineStatus;
    romId: string | null;
    romName: string | null;
    romInfo: RomInfo | null;
    error: string | null;

    fps: number;
    speed: number;
    isFastForward: boolean;
    isRewinding: boolean;
    rewindSeconds: number;
    audioLatencyMs: number;
    droppedAudio: number;

    isRecording: boolean;
    recordingMs: number;

    /** Which of slots 1-9 hold data for the current ROM. */
    occupiedSlots: number[];
    currentSlot: number;
    hasBattery: boolean;
    sessionMs: number;
    usingWebGl: boolean;
}

const EMPTY_SNAPSHOT: EngineSnapshot = {
    status: 'empty',
    romId: null,
    romName: null,
    romInfo: null,
    error: null,
    fps: 0,
    speed: 1,
    isFastForward: false,
    isRewinding: false,
    rewindSeconds: 0,
    audioLatencyMs: 0,
    droppedAudio: 0,
    isRecording: false,
    recordingMs: 0,
    occupiedSlots: [],
    currentSlot: 1,
    hasBattery: false,
    sessionMs: 0,
    usingWebGl: false,
};

export type ToastKind = 'info' | 'success' | 'warn' | 'error';
export interface EngineEvent {
    kind: ToastKind;
    message: string;
    detail?: string;
}

/**
 * Owns the emulator and its run loop.
 *
 * Deliberately not a React component or hook: the loop runs at 60Hz and must
 * never trigger a render. UI state is published as an immutable snapshot on a
 * 4Hz cadence (plus immediately on discrete events), which components read
 * through `useSyncExternalStore`.
 */
export class EmulatorEngine {
    public readonly audio = new AudioEngine();
    public core: NesCore | null = null;
    public renderer: Renderer | null = null;
    public input: InputController | null = null;
    public gamepad: GamepadController | null = null;
    public readonly recorder = new RecordingController();
    public readonly rewind = new RewindBuffer();

    private snapshot: EngineSnapshot = EMPTY_SNAPSHOT;
    private listeners = new Set<() => void>();
    private eventListeners = new Set<(e: EngineEvent) => void>();

    private rafId: number | null = null;
    private lastTime = 0;
    private accumulator = 0;
    private frameCount = 0;
    private pendingFrame: number[] | null = null;

    private fpsFrames = 0;
    private fpsWindowStart = 0;
    private publishTimer: number | null = null;

    private speed = 1;
    private fastForwardHeld = false;
    private rewindHeld = false;
    private running = false;

    private romBytes: Uint8Array | null = null;
    private romId: string | null = null;
    private sessionStart = 0;
    private sessionMs = 0;
    private sramTimer: number | null = null;
    private autoSaveTimer: number | null = null;

    /* ------------------------------------------------- subscription -- */

    public subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    };

    public getSnapshot = (): EngineSnapshot => this.snapshot;

    public onEvent(fn: (e: EngineEvent) => void): () => void {
        this.eventListeners.add(fn);
        return () => { this.eventListeners.delete(fn); };
    }

    private emit(event: EngineEvent): void {
        for (const fn of this.eventListeners) fn(event);
    }

    private patch(changes: Partial<EngineSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...changes };
        for (const fn of this.listeners) fn();
    }

    /* -------------------------------------------------------- setup -- */

    /**
     * Attach the canvas. Safe to call again when the element is replaced.
     *
     * Re-attaching to the *same* element is a no-op beyond reapplying settings:
     * a canvas only ever yields one WebGL context, so tearing down and rebuilding
     * against the same element would leave us drawing into a dead one.
     */
    public attachCanvas(canvas: HTMLCanvasElement): void {
        if (this.renderer && this.renderer.element === canvas) {
            this.applyVideoSettings(settingsStore.get());
            return;
        }
        this.renderer?.dispose();
        this.renderer = new Renderer(canvas);
        this.applyVideoSettings(settingsStore.get());
        this.patch({ usingWebGl: this.renderer.isWebGl });
        if (this.pendingFrame) this.renderer.drawFrame(this.pendingFrame);
    }

    /**
     * Bring up audio and the emulator core. Must run inside a user gesture:
     * an AudioContext created outside one starts suspended, and its sample rate
     * is what the core has to be configured with.
     */
    public async ensureStarted(): Promise<void> {
        if (this.core) {
            await this.audio.resume();
            return;
        }

        await this.audio.init();

        const core = new NesCore(
            (buffer) => { this.pendingFrame = buffer; },
            (left, right) => this.audio.writeSample(left, right),
            this.audio.sampleRate
        );
        core.onSramWrite = () => this.scheduleSramSave();
        this.core = core;

        this.input = new InputController(
            (p, b) => core.buttonDown(p, b),
            (p, b) => core.buttonUp(p, b)
        );
        this.gamepad = new GamepadController(
            (p, b) => core.buttonDown(p, b),
            (p, b) => core.buttonUp(p, b)
        );
        this.gamepad.setHotkeyHandler((action) => this.handleGamepadHotkey(action));

        this.applySettings(settingsStore.get());
        this.startPublishTimer();
    }

    private startPublishTimer(): void {
        if (this.publishTimer !== null) return;
        this.publishTimer = window.setInterval(() => this.publishMetrics(), 250);
    }

    private publishMetrics(): void {
        const now = performance.now();
        const elapsed = now - this.fpsWindowStart;
        const fps = elapsed > 0 ? (this.fpsFrames * 1000) / elapsed : 0;
        this.fpsFrames = 0;
        this.fpsWindowStart = now;

        const audioStats = this.audio.getStats();

        this.patch({
            fps: this.running ? Math.round(fps * 10) / 10 : 0,
            audioLatencyMs: Math.round(audioStats.latencyMs),
            droppedAudio: audioStats.underruns,
            rewindSeconds: Math.round(this.rewind.bufferedSeconds * 10) / 10,
            recordingMs: this.recorder.elapsedMs,
            sessionMs: this.sessionMs + (this.running ? now - this.sessionStart : 0),
        });
    }

    /* ----------------------------------------------------- settings -- */

    public applySettings(settings: Settings): void {
        this.applyVideoSettings(settings);

        this.audio.setVolume(settings.volume);
        this.audio.setMuted(settings.muted);
        this.audio.setTargetLatency(settings.audioLatency);

        this.core?.setPalette(settings.palette);
        for (const [channel, muted] of Object.entries(settings.channelMutes)) {
            this.core?.setChannelMuted(channel as ApuChannel, muted);
        }

        this.input?.setTurboRate(settings.turboRate);
        this.gamepad?.setDeadzone(settings.gamepadDeadzone);
        this.gamepad?.setHapticsEnabled(settings.hapticsEnabled);

        this.rewind.setEnabled(settings.rewindEnabled);
        if (settings.rewindEnabled) this.rewind.setDuration(settings.rewindSeconds);

        this.configureAutoSave(settings);
    }

    private applyVideoSettings(settings: Settings): void {
        if (!this.renderer) return;
        this.renderer.setFilter(settings.filter, {
            scanline: settings.filter === 'sharp' || settings.filter === 'smooth'
                ? 0
                : settings.scanlineIntensity,
            curvature: settings.filter === 'crt' ? settings.curvature : 0,
            bloom: settings.filter === 'sharp' ? 0 : settings.bloom,
        });
        this.renderer.setOverscan(settings.overscan);
    }

    /* ---------------------------------------------------- ROM loading -- */

    /**
     * Load a ROM from a file. Handles ZIP archives, registers the ROM in the
     * library, and restores its battery save.
     */
    public async loadFile(file: File): Promise<void> {
        this.patch({ status: 'loading', error: null });
        try {
            let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
            let name = file.name;

            if (isZip(bytes)) {
                const extracted = await extractRomFromZip(bytes);
                bytes = extracted.data;
                name = extracted.name;
            }

            await this.loadBytes(bytes, prettifyRomName(name), name);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'The file could not be read.';
            this.patch({ status: this.core?.isLoaded() ? 'paused' : 'error', error: message });
            this.emit({ kind: 'error', message: 'Could not load that ROM', detail: message });
            throw e;
        }
    }

    public async loadBytes(bytes: Uint8Array, displayName: string, filename: string): Promise<void> {
        await this.ensureStarted();
        const core = this.core;
        if (!core) throw new Error('The emulator failed to start.');

        // Persist whatever the outgoing game had in its save RAM first.
        await this.flushSram();
        this.pause();

        const info = parseRom(bytes);
        const id = hashBytes(bytes);

        core.load(bytes);

        this.romBytes = bytes;
        this.romId = id;
        this.rewind.reset();
        this.audio.reset();
        this.frameCount = 0;
        this.sessionMs = 0;

        await this.registerRom(id, displayName, filename, bytes, info);
        await this.restoreSram(id);

        this.patch({
            status: 'paused',
            romId: id,
            romName: displayName,
            romInfo: info,
            error: null,
            hasBattery: info.hasBattery,
            currentSlot: 1,
            sessionMs: 0,
        });
        await this.refreshSlots();

        this.play();
        this.emit({ kind: 'success', message: `${displayName} loaded`, detail: `${info.mapperName} · ${info.region}` });
    }

    /** Load a ROM already in the library. */
    public async loadFromLibrary(romId: string): Promise<void> {
        const record = await romsDb.get(romId);
        if (!record) throw new Error('That game is no longer in your library.');
        await this.loadBytes(record.data, record.name, record.filename);
    }

    private async registerRom(
        id: string,
        name: string,
        filename: string,
        data: Uint8Array,
        info: RomInfo
    ): Promise<void> {
        try {
            const existing = await romsDb.get(id);
            const record: RomRecord = existing
                ? { ...existing, lastPlayedAt: Date.now() }
                : {
                    id, name, filename, data, info,
                    addedAt: Date.now(),
                    lastPlayedAt: Date.now(),
                    playTimeMs: 0,
                    favorite: false,
                };
            await romsDb.put(record);
        } catch (e) {
            // A full or unavailable database must not stop someone playing.
            console.warn('Could not add the ROM to the library:', e);
        }
    }

    /* ------------------------------------------------------- run loop -- */

    public play(): void {
        if (!this.core?.isLoaded() || this.running) return;
        this.running = true;
        this.lastTime = 0;
        this.accumulator = 0;
        this.fpsWindowStart = performance.now();
        this.fpsFrames = 0;
        this.sessionStart = performance.now();
        void this.audio.resume();
        this.rafId = requestAnimationFrame(this.loop);
        this.patch({ status: 'running' });
    }

    public pause(): void {
        if (!this.running) return;
        this.running = false;
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.input?.releaseAll();
        this.sessionMs += performance.now() - this.sessionStart;
        void this.audio.suspend();
        void this.flushSram();
        this.patch({ status: 'paused', fps: 0 });
    }

    public toggle(): void {
        if (this.running) this.pause();
        else this.play();
    }

    public reset(): void {
        if (!this.core?.isLoaded()) return;
        this.core.reset();
        this.rewind.clear();
        this.audio.reset();
        this.frameCount = 0;
        this.emit({ kind: 'info', message: 'Console reset' });
    }

    /** Advance exactly one frame while paused. */
    public step(): void {
        if (!this.core?.isLoaded() || this.running) return;
        this.core.frame();
        this.frameCount++;
        if (this.pendingFrame) this.renderer?.drawFrame(this.pendingFrame);
    }

    private loop = (now: number): void => {
        if (!this.running || !this.core) return;

        if (this.lastTime === 0) this.lastTime = now;
        // Clamp so a backgrounded tab does not try to catch up thousands of frames.
        const delta = Math.min(now - this.lastTime, 250);
        this.lastTime = now;

        if (this.rewindHeld && this.rewind.isEnabled) {
            this.runRewind();
            this.rafId = requestAnimationFrame(this.loop);
            return;
        }

        const speed = this.fastForwardHeld ? settingsStore.get().fastForwardSpeed : this.speed;

        // Pace against the audio clock. Displays run at 60/120/144Hz while the
        // console runs at 60.0988Hz, so a pure rAF cadence drifts and crackles.
        // A sub-percent nudge toward the target buffer depth is inaudible and
        // keeps the two clocks locked.
        let interval = FRAME_MS / speed;
        if (speed === 1 && this.audio.isReady) {
            interval *= 1 + this.audio.getDrift() * 0.02;
        }

        this.accumulator += delta;

        // Cap catch-up work so a slow frame cannot spiral.
        const maxFrames = speed <= 1 ? 4 : Math.ceil(speed) + 2;
        let frames = 0;
        while (this.accumulator >= interval && frames < maxFrames) {
            this.core.frame();
            this.accumulator -= interval;
            this.frameCount++;
            this.fpsFrames++;
            frames++;

            this.input?.tick(this.frameCount);
            this.rewind.tick(() => this.core!.getState());
        }

        if (this.accumulator > interval * 8) this.accumulator = 0;

        // Draw once per animation frame, not once per emulated frame — at 4x
        // that is three fewer texture uploads for zero visible difference.
        if (frames > 0 && this.pendingFrame) {
            this.renderer?.drawFrame(this.pendingFrame);
        }
        this.audio.flush();

        this.rafId = requestAnimationFrame(this.loop);
    };

    private runRewind(): void {
        const state = this.rewind.pop();
        if (!state) {
            this.rewindHeld = false;
            this.patch({ isRewinding: false });
            this.emit({ kind: 'info', message: 'Reached the start of the rewind buffer' });
            return;
        }
        this.core?.loadState(state);
        // Run one frame so the PPU repaints from the restored state.
        this.core?.frame();
        if (this.pendingFrame) this.renderer?.drawFrame(this.pendingFrame);
    }

    /* --------------------------------------------------------- speed -- */

    public setSpeed(speed: number): void {
        this.speed = speed;
        this.accumulator = 0;
        this.patch({ speed });
    }

    public setFastForward(held: boolean): void {
        if (this.fastForwardHeld === held) return;
        this.fastForwardHeld = held;
        this.accumulator = 0;
        this.patch({ isFastForward: held });
    }

    public setRewinding(held: boolean): void {
        if (this.rewindHeld === held) return;
        if (held && !this.rewind.isEnabled) {
            this.emit({ kind: 'warn', message: 'Rewind is turned off', detail: 'Enable it under Settings › Emulation.' });
            return;
        }
        this.rewindHeld = held;
        this.audio.reset();
        this.patch({ isRewinding: held });
    }

    /* --------------------------------------------------- save states -- */

    public async saveState(slot: number): Promise<void> {
        if (!this.core?.isLoaded() || !this.romId) return;
        try {
            const state = this.core.getState();
            const thumbnail = this.renderer?.captureThumbnail(160) ?? null;
            await statesDb.put({
                key: statesDb.key(this.romId, slot),
                romId: this.romId,
                slot,
                state,
                thumbnail,
                createdAt: Date.now(),
            });
            await this.refreshSlots();
            this.emit({ kind: 'success', message: `Saved to slot ${slot}` });
        } catch (e) {
            const detail = e instanceof Error ? e.message : undefined;
            this.emit({ kind: 'error', message: 'Could not save state', detail });
        }
    }

    public async loadState(slot: number): Promise<void> {
        if (!this.core?.isLoaded() || !this.romId) return;
        try {
            const record = await statesDb.get(this.romId, slot);
            if (!record) {
                this.emit({ kind: 'warn', message: `Slot ${slot} is empty` });
                return;
            }
            this.core.loadState(record.state);
            this.rewind.clear();
            this.audio.reset();
            if (this.pendingFrame) this.renderer?.drawFrame(this.pendingFrame);
            this.emit({ kind: 'success', message: `Loaded slot ${slot}` });
        } catch (e) {
            const detail = e instanceof Error ? e.message : undefined;
            this.emit({ kind: 'error', message: 'Could not load state', detail });
        }
    }

    public async deleteState(slot: number): Promise<void> {
        if (!this.romId) return;
        await statesDb.delete(this.romId, slot);
        await this.refreshSlots();
    }

    public setCurrentSlot(slot: number): void {
        this.patch({ currentSlot: slot });
    }

    public async refreshSlots(): Promise<void> {
        if (!this.romId) {
            this.patch({ occupiedSlots: [] });
            return;
        }
        try {
            const records = await statesDb.forRom(this.romId);
            this.patch({ occupiedSlots: records.map((r) => r.slot).sort((a, b) => a - b) });
        } catch {
            this.patch({ occupiedSlots: [] });
        }
    }

    private configureAutoSave(settings: Settings): void {
        if (this.autoSaveTimer !== null) {
            window.clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
        if (!settings.autoSaveEnabled) return;
        this.autoSaveTimer = window.setInterval(() => {
            // Slot 0 is the reserved auto-save so it never overwrites a manual one.
            if (this.running && this.romId) void this.saveStateQuiet(0);
        }, Math.max(15, settings.autoSaveIntervalSec) * 1000);
    }

    private async saveStateQuiet(slot: number): Promise<void> {
        if (!this.core?.isLoaded() || !this.romId) return;
        try {
            await statesDb.put({
                key: statesDb.key(this.romId, slot),
                romId: this.romId,
                slot,
                state: this.core.getState(),
                thumbnail: this.renderer?.captureThumbnail(160) ?? null,
                createdAt: Date.now(),
            });
        } catch { /* not worth interrupting play over */ }
    }

    /* ------------------------------------------------- battery saves -- */

    private scheduleSramSave(): void {
        if (this.sramTimer !== null) return;
        // Debounce: games hammer save RAM, and we only need the settled result.
        this.sramTimer = window.setTimeout(() => {
            this.sramTimer = null;
            void this.flushSram();
        }, 2000);
    }

    /** Persist cartridge save RAM — this is the game's own in-game save. */
    public async flushSram(): Promise<void> {
        const core = this.core;
        if (!core?.isLoaded() || !this.romId || !core.hasBattery() || !core.isSramDirty()) return;
        try {
            await sramDb.put(this.romId, core.getSram());
            core.clearSramDirty();
        } catch (e) {
            console.warn('Could not persist cartridge save RAM:', e);
        }
    }

    private async restoreSram(romId: string): Promise<void> {
        const core = this.core;
        if (!core?.hasBattery()) return;
        try {
            const record = await sramDb.get(romId);
            if (record?.data) {
                core.setSram(record.data);
                this.emit({ kind: 'info', message: 'Cartridge save restored' });
            }
        } catch (e) {
            console.warn('Could not restore cartridge save RAM:', e);
        }
    }

    /* -------------------------------------------------------- cheats -- */

    public setCheats(cheats: Cheat[]): void {
        this.core?.setCheats(cheats);
    }

    /* ------------------------------------------------------- capture -- */

    public screenshot(): string | null {
        return this.renderer?.capture() ?? null;
    }

    public toggleRecording(): boolean {
        return this.recorder.isRecording;
    }

    public startRecording(canvas: HTMLCanvasElement): boolean {
        const started = this.recorder.start(canvas, { audioStream: this.audio.getMediaStream() });
        this.patch({ isRecording: started });
        if (!started) {
            this.emit({ kind: 'error', message: 'Recording is not supported in this browser' });
        }
        return started;
    }

    public async stopRecording(): Promise<Blob | null> {
        const blob = await this.recorder.stop();
        this.patch({ isRecording: false, recordingMs: 0 });
        return blob;
    }

    /* ------------------------------------------------------ gamepad -- */

    private handleGamepadHotkey(action: GamepadHotkey): void {
        switch (action) {
            case 'saveState':
                void this.saveState(this.snapshot.currentSlot);
                break;
            case 'loadState':
                void this.loadState(this.snapshot.currentSlot);
                break;
            case 'rewind':
                this.setRewinding(this.gamepad?.isHotkeyHeld('rewind') ?? false);
                break;
            case 'fastForward':
                this.setFastForward(this.gamepad?.isHotkeyHeld('fastForward') ?? false);
                break;
            case 'menu':
                this.toggle();
                break;
        }
    }

    public getGamepads(): GamepadInfo[] {
        return this.gamepad?.getGamepads() ?? [];
    }

    /* ------------------------------------------------------ teardown -- */

    public async dispose(): Promise<void> {
        this.pause();
        await this.flushSram();
        if (this.publishTimer !== null) window.clearInterval(this.publishTimer);
        if (this.autoSaveTimer !== null) window.clearInterval(this.autoSaveTimer);
        if (this.sramTimer !== null) window.clearTimeout(this.sramTimer);
        this.input?.detach();
        this.gamepad?.detach();
        this.renderer?.dispose();
        this.audio.dispose();
        this.listeners.clear();
        this.eventListeners.clear();
    }

    /** Persist playtime against the library record. */
    public async recordPlaytime(): Promise<void> {
        if (!this.romId) return;
        const elapsed = this.sessionMs;
        if (elapsed < 1000) return;
        this.sessionMs = 0;
        this.sessionStart = performance.now();
        await romsDb.touch(this.romId, elapsed).catch(() => { /* library is optional */ });
    }

    public get currentRomBytes(): Uint8Array | null {
        return this.romBytes;
    }
}
