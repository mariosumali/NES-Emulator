/**
 * Minimal ZIP reader — just enough to pull a .nes out of an archive, which is
 * how virtually every ROM on disk is actually stored.
 *
 * Inflation uses the platform `DecompressionStream('deflate-raw')`, so there is
 * no dependency to ship and it works offline. Browsers without it (older Safari)
 * fall back gracefully: stored (uncompressed) entries still work and we throw a
 * clear message for deflated ones.
 */

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export interface ZipEntry {
    name: string;
    compressedSize: number;
    uncompressedSize: number;
    method: number;
    localHeaderOffset: number;
}

export function isZip(bytes: Uint8Array): boolean {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

export function hasInflateSupport(): boolean {
    return typeof DecompressionStream !== 'undefined';
}

/** List the entries in a ZIP archive without decompressing anything. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // The EOCD sits at the very end, after a comment of up to 64KB.
    let eocd = -1;
    const scanFrom = Math.max(0, bytes.length - (0xffff + 22));
    for (let i = bytes.length - 22; i >= scanFrom; i--) {
        if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd === -1) throw new Error('Not a valid ZIP archive (no end-of-central-directory record).');

    let entryCount = view.getUint16(eocd + 10, true);
    let centralOffset = view.getUint32(eocd + 16, true);

    // ZIP64: the 32-bit fields saturate and the real values live in a separate record.
    if (entryCount === 0xffff || centralOffset === 0xffffffff) {
        const locator = eocd - 20;
        if (locator >= 0 && view.getUint32(locator, true) === SIG_EOCD64_LOCATOR) {
            const eocd64 = Number(view.getBigUint64(locator + 8, true));
            if (view.getUint32(eocd64, true) === SIG_EOCD64) {
                entryCount = Number(view.getBigUint64(eocd64 + 32, true));
                centralOffset = Number(view.getBigUint64(eocd64 + 48, true));
            }
        }
    }

    const entries: ZipEntry[] = [];
    let p = centralOffset;
    for (let i = 0; i < entryCount; i++) {
        if (p + 46 > bytes.length || view.getUint32(p, true) !== SIG_CENTRAL) break;

        const method = view.getUint16(p + 10, true);
        const compressedSize = view.getUint32(p + 20, true);
        const uncompressedSize = view.getUint32(p + 24, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const localHeaderOffset = view.getUint32(p + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));

        // Skip directory markers.
        if (!name.endsWith('/')) {
            entries.push({ name, compressedSize, uncompressedSize, method, localHeaderOffset });
        }
        p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

/** Decompress a single entry to bytes. */
export async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const off = entry.localHeaderOffset;
    if (view.getUint32(off, true) !== SIG_LOCAL) {
        throw new Error(`Corrupt ZIP: bad local header for "${entry.name}".`);
    }
    // The local header's name/extra lengths can differ from the central directory's.
    const nameLen = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);
    const dataStart = off + 30 + nameLen + extraLen;
    const data = bytes.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.method === 0) return data.slice();
    if (entry.method !== 8) {
        throw new Error(`Unsupported ZIP compression method ${entry.method} for "${entry.name}".`);
    }
    if (!hasInflateSupport()) {
        throw new Error('This browser cannot decompress ZIP archives. Please extract the .nes file first.');
    }

    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
}

/**
 * Pull the first NES ROM out of an archive. Prefers a `.nes` extension, then
 * falls back to any entry whose contents begin with the iNES signature.
 */
export async function extractRomFromZip(
    bytes: Uint8Array
): Promise<{ name: string; data: Uint8Array }> {
    const entries = listZipEntries(bytes);
    if (entries.length === 0) throw new Error('The ZIP archive is empty.');

    const byExt = entries.filter((e) => /\.(nes|unf|unif)$/i.test(e.name));
    const candidates = byExt.length > 0 ? byExt : entries;

    // Largest first — ROM sets sometimes bundle a tiny readme alongside the ROM.
    candidates.sort((a, b) => b.uncompressedSize - a.uncompressedSize);

    let lastError: unknown = null;
    for (const entry of candidates) {
        try {
            const data = await readZipEntry(bytes, entry);
            if (data.length > 16 && data[0] === 0x4e && data[1] === 0x45 && data[2] === 0x53 && data[3] === 0x1a) {
                return { name: entry.name.split('/').pop() || entry.name, data };
            }
            if (byExt.length > 0) {
                // Trust the extension even if the signature check was inconclusive.
                return { name: entry.name.split('/').pop() || entry.name, data };
            }
        } catch (e) {
            lastError = e;
        }
    }
    if (lastError) throw lastError;
    throw new Error('No NES ROM found inside the archive.');
}
