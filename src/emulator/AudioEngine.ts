import { AUDIO_WORKLET_SOURCE } from './audioWorklet';

/**
 * Audio output for the emulator.
 *
 * Two things matter here and the previous implementation got both wrong:
 *
 *  1. The emulator core must generate samples at the AudioContext's *actual*
 *     rate. Hardcoding 44100 while the device runs at 48000 means every game
 *     plays ~9% flat and the buffer drains continuously. `sampleRate` is read
 *     from the live context and handed to the core.
 *
 *  2. Sample delivery must not touch the audio thread's memory through an
 *     O(n) queue. Samples are batched on the main thread and posted to an
 *     AudioWorklet that owns a ring buffer.
 *
 * The engine also reports buffer pressure back to the run loop
 * ({@link getDrift}), which uses it to pace emulation against the audio clock
 * rather than the display refresh rate — the only way to stay glitch-free on a
 * 144Hz monitor running a 60.0988Hz console.
 */

/** Frames per postMessage batch. 512 @48k ≈ 10.6ms — cheap without adding lag. */
const BATCH_FRAMES = 512;

export interface AudioStats {
    /** Frames currently buffered in the worklet. */
    buffered: number;
    /** Target buffer depth in frames. */
    target: number;
    /** Underrun frames since the previous report. */
    underruns: number;
    latencyMs: number;
}

export class AudioEngine {
    private context: AudioContext | null = null;
    private node: AudioWorkletNode | null = null;
    private gain: GainNode | null = null;
    private destination: MediaStreamAudioDestinationNode | null = null;
    private workletUrl: string | null = null;

    private batch = new Float32Array(BATCH_FRAMES * 2);
    private batchIndex = 0;

    private buffered = 0;
    private capacity = 0;
    private underruns = 0;

    private volume = 0.7;
    private muted = false;
    private targetLatencyMs = 90;
    private ready = false;
    private initPromise: Promise<void> | null = null;

    /** Sample rate the emulator core must be configured with. */
    public get sampleRate(): number {
        return this.context?.sampleRate ?? 48000;
    }

    public get isReady(): boolean {
        return this.ready;
    }

    /**
     * Create the AudioContext. Must be called from a user gesture on iOS and
     * from a gesture-adjacent task everywhere else, or the context starts
     * suspended and never produces sound.
     */
    public async init(): Promise<void> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this.doInit();
        return this.initPromise;
    }

    private async doInit(): Promise<void> {
        const Ctor: typeof AudioContext =
            window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const context = new Ctor({ latencyHint: 'interactive' });
        this.context = context;

        const blob = new Blob([AUDIO_WORKLET_SOURCE], { type: 'application/javascript' });
        this.workletUrl = URL.createObjectURL(blob);
        await context.audioWorklet.addModule(this.workletUrl);

        // ~1 second of headroom. The ring only ever fills to the target depth;
        // the extra capacity absorbs a stalled tab without dropping audio.
        this.capacity = Math.ceil(context.sampleRate);

        this.node = new AudioWorkletNode(context, 'nes-audio', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: { capacityFrames: this.capacity },
        });

        this.node.port.onmessage = (event: MessageEvent) => {
            const msg = event.data as { type: string; available: number; underrunFrames: number };
            if (msg.type === 'level') {
                this.buffered = msg.available;
                this.underruns += msg.underrunFrames;
            }
        };

        this.gain = context.createGain();
        this.gain.gain.value = this.muted ? 0 : this.volume;

        // A second tap so screen recordings can capture game audio, not silence.
        this.destination = context.createMediaStreamDestination();

        this.node.connect(this.gain);
        this.gain.connect(context.destination);
        this.gain.connect(this.destination);

        this.ready = true;

        // Deliberately not awaited. Under Chrome's autoplay policy a suspended
        // context's resume() promise stays *pending* — it neither resolves nor
        // rejects — until the page gets a user activation. Awaiting it here would
        // hang `init()`, and with it every caller waiting to load a ROM.
        void this.resume();
    }

    public async resume(): Promise<void> {
        if (this.context && this.context.state === 'suspended') {
            try {
                await this.context.resume();
            } catch {
                // Autoplay policy — the next user gesture will retry.
            }
        }
    }

    public async suspend(): Promise<void> {
        if (this.context && this.context.state === 'running') {
            try {
                await this.context.suspend();
            } catch { /* ignore */ }
        }
    }

    /** Called once per generated sample by the emulator core. */
    public writeSample(left: number, right: number): void {
        if (!this.ready) return;
        this.batch[this.batchIndex++] = left;
        this.batch[this.batchIndex++] = right;
        if (this.batchIndex >= this.batch.length) this.flushBatch();
    }

    private flushBatch(): void {
        if (this.batchIndex === 0 || !this.node) return;
        const chunk = this.batch.subarray(0, this.batchIndex).slice();
        this.node.port.postMessage({ type: 'samples', data: chunk }, [chunk.buffer]);
        this.batchIndex = 0;
    }

    /** Push any partial batch — call at the end of each emulated frame. */
    public flush(): void {
        this.flushBatch();
    }

    /** Drop buffered audio, e.g. after loading a state or seeking a rewind. */
    public reset(): void {
        this.batchIndex = 0;
        this.buffered = 0;
        this.node?.port.postMessage({ type: 'flush' });
    }

    public setVolume(volume: number): void {
        this.volume = Math.max(0, Math.min(1, volume));
        this.applyGain();
    }

    public setMuted(muted: boolean): void {
        this.muted = muted;
        this.applyGain();
    }

    private applyGain(): void {
        if (!this.gain || !this.context) return;
        const value = this.muted ? 0 : this.volume;
        // Ramp rather than jump: an instantaneous gain change is a click.
        this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.015);
    }

    public setTargetLatency(ms: number): void {
        this.targetLatencyMs = Math.max(20, Math.min(300, ms));
    }

    private get targetFrames(): number {
        return Math.round((this.targetLatencyMs / 1000) * this.sampleRate);
    }

    /**
     * How far the buffer is from its target, normalised to roughly [-1, 1].
     *
     * Positive means we are running ahead (buffer too full) and the run loop
     * should emulate slightly slower; negative means we are starving it. The run
     * loop turns this into a sub-percent adjustment of the frame interval, which
     * is inaudible but eliminates the periodic crackle you get from pacing a
     * 60.0988Hz console off a 60.000Hz display.
     */
    public getDrift(): number {
        if (!this.ready) return 0;
        const target = this.targetFrames;
        if (target === 0) return 0;
        return Math.max(-1, Math.min(1, (this.buffered - target) / target));
    }

    public getStats(): AudioStats {
        const stats: AudioStats = {
            buffered: this.buffered,
            target: this.targetFrames,
            underruns: this.underruns,
            latencyMs: (this.buffered / this.sampleRate) * 1000,
        };
        this.underruns = 0;
        return stats;
    }

    /** Audio track for {@link RecordingController} so captures have sound. */
    public getMediaStream(): MediaStream | null {
        return this.destination?.stream ?? null;
    }

    public dispose(): void {
        this.node?.port.postMessage({ type: 'stop' });
        this.node?.disconnect();
        this.gain?.disconnect();
        this.destination?.disconnect();
        this.context?.close().catch(() => { /* already closed */ });
        if (this.workletUrl) URL.revokeObjectURL(this.workletUrl);
        this.context = null;
        this.node = null;
        this.gain = null;
        this.destination = null;
        this.workletUrl = null;
        this.ready = false;
        this.initPromise = null;
    }
}
