/**
 * iNES / NES 2.0 header parser.
 *
 * We parse the header ourselves rather than relying on jsnes so that the UI can
 * describe a ROM (mapper, size, region, battery) *before* handing it to the
 * emulator — and so we can tell the user precisely why an unsupported ROM failed.
 */

export type Region = 'NTSC' | 'PAL' | 'Multi' | 'Dendy';
export type Mirroring = 'horizontal' | 'vertical' | 'four-screen';

export interface RomInfo {
    /** iNES mapper number (NES 2.0 extends this to 12 bits). */
    mapper: number;
    /** Human name for the mapper, e.g. "MMC3". */
    mapperName: string;
    /** Sub-mapper (NES 2.0 only, 0 otherwise). */
    subMapper: number;
    /** PRG ROM size in bytes. */
    prgSize: number;
    /** CHR ROM size in bytes (0 means the cart uses CHR RAM). */
    chrSize: number;
    /** True when the cartridge has battery-backed save RAM. */
    hasBattery: boolean;
    /** True when a 512-byte trainer precedes PRG data. */
    hasTrainer: boolean;
    mirroring: Mirroring;
    region: Region;
    /** "iNES" or "NES 2.0". */
    format: 'iNES' | 'NES 2.0';
    /** Total file size in bytes. */
    fileSize: number;
}

/**
 * Mapper numbers jsnes actually implements — mirrors the `Mappers[n]` keys in
 * jsnes/src/mappers.js. Anything else throws inside `ROM.createMapper()`, so we
 * check up front and show a useful message instead of a stack trace.
 */
export const SUPPORTED_MAPPERS = new Set([0, 1, 2, 3, 4, 5, 7, 11, 34, 38, 66, 94, 140, 180]);

const MAPPER_NAMES: Record<number, string> = {
    0: 'NROM',
    1: 'MMC1',
    2: 'UxROM',
    3: 'CNROM',
    4: 'MMC3',
    5: 'MMC5',
    7: 'AxROM',
    9: 'MMC2',
    10: 'MMC4',
    11: 'Color Dreams',
    13: 'CPROM',
    15: '100-in-1',
    16: 'Bandai FCG',
    18: 'Jaleco SS88006',
    19: 'Namco 163',
    20: 'Famicom Disk System',
    21: 'VRC4a/VRC4c',
    22: 'VRC2a',
    23: 'VRC2b/VRC4e',
    24: 'VRC6a',
    25: 'VRC4b/VRC4d',
    26: 'VRC6b',
    32: 'Irem G-101',
    33: 'Taito TC0190',
    34: 'BNROM / NINA-001',
    38: 'UNL-PCI556',
    64: 'Tengen RAMBO-1',
    65: 'Irem H3001',
    66: 'GxROM',
    67: 'Sunsoft-3',
    68: 'Sunsoft-4',
    69: 'Sunsoft FME-7',
    71: 'Camerica',
    73: 'VRC3',
    75: 'VRC1',
    78: 'Irem 74HC161',
    85: 'VRC7',
    94: 'Senjou no Ookami',
    140: 'Jaleco JF-11',
    180: 'Crazy Climber',
    206: 'DxROM',
};

export function mapperName(mapper: number): string {
    return MAPPER_NAMES[mapper] ?? `Mapper ${mapper}`;
}

export class RomParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RomParseError';
    }
}

/**
 * Parse an iNES / NES 2.0 header. Throws {@link RomParseError} with a message
 * suitable for showing directly to the user.
 */
export function parseRom(bytes: Uint8Array): RomInfo {
    if (bytes.length < 16) {
        throw new RomParseError('File is too small to be a NES ROM.');
    }
    if (bytes[0] !== 0x4e || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1a) {
        throw new RomParseError(
            'Missing the "NES" file signature. This does not look like an iNES ROM — if it is zipped, drop the .zip in directly.'
        );
    }

    const flags6 = bytes[6];
    const flags7 = bytes[7];
    const isNes2 = (flags7 & 0x0c) === 0x08;

    let mapper = (flags6 >> 4) | (flags7 & 0xf0);
    let subMapper = 0;
    let prgBanks = bytes[4];
    let chrBanks = bytes[5];
    let region: Region = 'NTSC';

    if (isNes2) {
        mapper |= (bytes[8] & 0x0f) << 8;
        subMapper = (bytes[8] & 0xf0) >> 4;

        // NES 2.0 extends the size fields by 4 bits each (byte 9).
        const prgHigh = bytes[9] & 0x0f;
        const chrHigh = (bytes[9] & 0xf0) >> 4;
        // 0xF signals an exponent-multiplier encoding rather than a bank count.
        prgBanks = prgHigh === 0x0f ? prgBanks : prgBanks | (prgHigh << 8);
        chrBanks = chrHigh === 0x0f ? chrBanks : chrBanks | (chrHigh << 8);

        switch (bytes[12] & 0x03) {
            case 0: region = 'NTSC'; break;
            case 1: region = 'PAL'; break;
            case 2: region = 'Multi'; break;
            case 3: region = 'Dendy'; break;
        }
    } else {
        // Archaic iNES files put a signature in bytes 7-15. If any of bytes 12-15
        // are non-zero the upper mapper nibble is garbage and must be ignored.
        let dirty = false;
        for (let i = 12; i < 16; i++) {
            if (bytes[i] !== 0) { dirty = true; break; }
        }
        if (dirty) mapper &= 0x0f;
        if (bytes[9] & 0x01) region = 'PAL';
    }

    const mirroring: Mirroring =
        (flags6 & 0x08) !== 0 ? 'four-screen' : (flags6 & 0x01) !== 0 ? 'vertical' : 'horizontal';

    return {
        mapper,
        mapperName: mapperName(mapper),
        subMapper,
        prgSize: prgBanks * 16384,
        chrSize: chrBanks * 8192,
        hasBattery: (flags6 & 0x02) !== 0,
        hasTrainer: (flags6 & 0x04) !== 0,
        mirroring,
        region,
        format: isNes2 ? 'NES 2.0' : 'iNES',
        fileSize: bytes.length,
    };
}

export function isMapperSupported(mapper: number): boolean {
    return SUPPORTED_MAPPERS.has(mapper);
}

/**
 * jsnes' `loadROM` takes a "binary string" (one char per byte). Converting a
 * 4MB ROM with `String.fromCharCode(...bytes)` blows the call stack, so chunk it.
 */
export function bytesToBinaryString(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    let out = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
    }
    return out;
}

/** Human-readable byte size, e.g. "256 KB". */
export function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Strip a filename down to something presentable: drop the extension and the
 * bracketed/parenthesised release tags that ROM sets are littered with.
 */
export function prettifyRomName(filename: string): string {
    return filename
        .replace(/\.(nes|zip|fds|unf|unif)$/i, '')
        .replace(/\s*[([][^)\]]*[)\]]/g, '')
        .replace(/[_.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || filename;
}
