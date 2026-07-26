/**
 * Packs a jsnes save-state object into a single flat ArrayBuffer.
 *
 * A jsnes state is a tree of plain objects holding ~200,000 numbers across CPU
 * memory, PPU VRAM, mirror tables, nametables and pattern tiles. Held as
 * ordinary JS arrays that is well over a megabyte each — fine for one save slot,
 * hopeless for a rewind ring holding a hundred of them.
 *
 * The shape of the state never varies for a given ROM, so we learn it once
 * (paths to every numeric array, their lengths, and the narrowest integer width
 * that fits) and then every capture is a straight copy into a preallocated
 * buffer. That turns a ~1.4MB object graph into roughly 210KB of typed array,
 * and capture into a memcpy rather than an allocation storm.
 */

type Path = Array<string | number>;
type Width = 1 | 2 | 4;

interface Slot {
    path: Path;
    length: number;
    width: Width;
    offset: number;
    /** True when the array holds negative values and needs a signed view. */
    signed: boolean;
}

export interface PackedState {
    buffer: ArrayBuffer;
    /** Scalars and object shape, with numeric arrays elided. */
    template: unknown;
    layoutVersion: number;
}

function isNumericArray(value: unknown): value is number[] {
    if (!Array.isArray(value) || value.length === 0) return false;
    // Sampling beats scanning for the shape pass; a wrong guess only costs us a
    // layout rebuild, which is handled.
    const step = Math.max(1, Math.floor(value.length / 32));
    for (let i = 0; i < value.length; i += step) {
        const v = value[i];
        if (typeof v !== 'number' && typeof v !== 'boolean') return false;
    }
    return true;
}

function widthFor(min: number, max: number): { width: Width; signed: boolean } {
    if (min >= 0 && max <= 0xff) return { width: 1, signed: false };
    if (min >= -0x80 && max <= 0x7f) return { width: 1, signed: true };
    if (min >= 0 && max <= 0xffff) return { width: 2, signed: false };
    if (min >= -0x8000 && max <= 0x7fff) return { width: 2, signed: true };
    return { width: 4, signed: true };
}

export class StatePacker {
    private slots: Slot[] = [];
    private template: unknown = null;
    private byteLength = 0;
    private layoutVersion = 0;
    private ready = false;

    /** Bytes one packed state occupies. */
    public get stateBytes(): number {
        return this.byteLength;
    }

    public get version(): number {
        return this.layoutVersion;
    }

    /** Discard the learned layout — call when the ROM changes. */
    public reset(): void {
        this.slots = [];
        this.template = null;
        this.byteLength = 0;
        this.ready = false;
        this.layoutVersion++;
    }

    private learn(state: unknown): void {
        this.slots = [];
        let offset = 0;

        const template = this.walk(state, [], (path, array) => {
            let min = 0;
            let max = 0;
            for (let i = 0; i < array.length; i++) {
                const v = Number(array[i]) | 0;
                if (v < min) min = v;
                if (v > max) max = v;
            }
            const { width, signed } = widthFor(min, max);
            // Keep each slot aligned to its own element size so the typed-array
            // views can be created directly over the shared buffer.
            offset = Math.ceil(offset / width) * width;
            this.slots.push({ path: [...path], length: array.length, width, offset, signed });
            offset += array.length * width;
        });

        this.template = template;
        this.byteLength = offset;
        this.ready = true;
        this.layoutVersion++;
    }

    /** Deep-copy `value`, calling `onArray` for numeric arrays and eliding them. */
    private walk(
        value: unknown,
        path: Path,
        onArray: (path: Path, array: number[]) => void
    ): unknown {
        if (value === null || typeof value !== 'object') return value;

        if (Array.isArray(value)) {
            if (isNumericArray(value)) {
                onArray(path, value);
                return null;
            }
            return value.map((item, i) => this.walk(item, [...path, i], onArray));
        }

        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = this.walk(item, [...path, key], onArray);
        }
        return out;
    }

    private resolve(root: unknown, path: Path): unknown {
        let node: unknown = root;
        for (const key of path) {
            if (node === null || typeof node !== 'object') return undefined;
            node = (node as Record<string | number, unknown>)[key];
        }
        return node;
    }

    private view(buffer: ArrayBuffer, slot: Slot) {
        if (slot.width === 1) {
            return slot.signed
                ? new Int8Array(buffer, slot.offset, slot.length)
                : new Uint8Array(buffer, slot.offset, slot.length);
        }
        if (slot.width === 2) {
            return slot.signed
                ? new Int16Array(buffer, slot.offset, slot.length)
                : new Uint16Array(buffer, slot.offset, slot.length);
        }
        return new Int32Array(buffer, slot.offset, slot.length);
    }

    /**
     * Pack a state. `into` lets the caller recycle a buffer from a ring so
     * steady-state rewind allocates nothing.
     *
     * Returns null when the state no longer matches the learned layout (a value
     * outgrew its slot, or the shape changed). The caller should drop its
     * history and try again — the next call relearns.
     */
    public pack(state: unknown, into?: ArrayBuffer): PackedState | null {
        if (!this.ready) this.learn(state);

        const buffer = into && into.byteLength === this.byteLength ? into : new ArrayBuffer(this.byteLength);

        for (const slot of this.slots) {
            const source = this.resolve(state, slot.path);
            if (!Array.isArray(source) || source.length !== slot.length) {
                this.reset();
                return null;
            }
            const view = this.view(buffer, slot);
            for (let i = 0; i < slot.length; i++) {
                const v = Number(source[i]) | 0;
                view[i] = v;
                // Typed arrays wrap silently; catching it here is what keeps a
                // rewind from restoring subtly corrupted state.
                if (view[i] !== v) {
                    this.reset();
                    return null;
                }
            }
        }

        return { buffer, template: this.template, layoutVersion: this.layoutVersion };
    }

    /** Rebuild a state object from a packed buffer. */
    public unpack(packed: PackedState): unknown | null {
        if (!this.ready || packed.layoutVersion !== this.layoutVersion) return null;

        const state = structuredClone(this.template);
        for (const slot of this.slots) {
            const parentPath = slot.path.slice(0, -1);
            const key = slot.path[slot.path.length - 1];
            const parent = this.resolve(state, parentPath);
            if (parent === null || typeof parent !== 'object') return null;

            const view = this.view(packed.buffer, slot);
            const array = new Array<number>(slot.length);
            for (let i = 0; i < slot.length; i++) array[i] = view[i];
            (parent as Record<string | number, unknown>)[key] = array;
        }
        return state;
    }
}
