import { StatePacker, type PackedState } from './StatePacker';

/**
 * Ring buffer of recent emulator states, so the player can scrub backwards out
 * of a bad jump.
 *
 * Snapshots are taken every N frames rather than every frame — at 60Hz a
 * per-frame ring would need gigabytes. Capturing at ~5Hz and replaying forward
 * from the nearest snapshot is what every emulator with rewind actually does;
 * at this granularity the seam is imperceptible.
 *
 * Buffers are recycled in place, so once the ring is warm, rewinding allocates
 * nothing.
 */

/** Snapshot every 12 emulated frames (~5 per second). */
export const REWIND_INTERVAL_FRAMES = 12;

/** Hard ceiling so a long session cannot exhaust memory on a modest machine. */
const MAX_BYTES = 96 * 1024 * 1024;

export class RewindBuffer {
    private packer = new StatePacker();
    private slots: PackedState[] = [];
    private capacity = 0;
    private head = -1;
    private size = 0;
    private frameCounter = 0;
    private enabled = true;

    constructor(seconds = 30) {
        this.setDuration(seconds);
    }

    /** Resize the ring. Existing history is discarded. */
    public setDuration(seconds: number): void {
        const snapshotsPerSecond = 60 / REWIND_INTERVAL_FRAMES;
        this.capacity = Math.max(2, Math.round(seconds * snapshotsPerSecond));
        this.clear();
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) this.clear();
    }

    public get isEnabled(): boolean {
        return this.enabled;
    }

    public clear(): void {
        this.slots = [];
        this.head = -1;
        this.size = 0;
        this.frameCounter = 0;
    }

    /** Drop the learned layout too — call when a different ROM is loaded. */
    public reset(): void {
        this.packer.reset();
        this.clear();
    }

    /** Seconds of history currently held. */
    public get bufferedSeconds(): number {
        return (this.size * REWIND_INTERVAL_FRAMES) / 60;
    }

    public get bufferedBytes(): number {
        return this.slots.length * this.packer.stateBytes;
    }

    public get isEmpty(): boolean {
        return this.size === 0;
    }

    /**
     * Offer a state for capture. Cheap to call every frame — it only does work
     * on the interval boundary.
     */
    public tick(getState: () => unknown): void {
        if (!this.enabled) return;
        if (this.frameCounter++ % REWIND_INTERVAL_FRAMES !== 0) return;
        this.capture(getState());
    }

    private capture(state: unknown): void {
        const next = (this.head + 1) % this.capacity;

        // Recycle the buffer we are about to overwrite.
        const recycled = this.slots[next]?.buffer;
        const packed = this.packer.pack(state, recycled);

        if (!packed) {
            // Layout changed underneath us; history is no longer replayable.
            this.clear();
            return;
        }

        // Respect the memory ceiling by shrinking the ring rather than failing.
        if (this.packer.stateBytes * this.capacity > MAX_BYTES) {
            this.capacity = Math.max(2, Math.floor(MAX_BYTES / Math.max(1, this.packer.stateBytes)));
            this.clear();
            return;
        }

        this.slots[next] = packed;
        this.head = next;
        this.size = Math.min(this.size + 1, this.capacity);
    }

    /**
     * Pop the most recent snapshot. Returns null when history is exhausted, at
     * which point the caller should simply keep playing.
     */
    public pop(): unknown | null {
        if (this.size === 0) return null;

        const packed = this.slots[this.head];
        const state = this.packer.unpack(packed);

        this.head = (this.head - 1 + this.capacity) % this.capacity;
        this.size--;
        // Re-align the interval counter so the next forward capture lands on a
        // clean boundary instead of immediately re-snapshotting.
        this.frameCounter = 0;

        return state;
    }
}
