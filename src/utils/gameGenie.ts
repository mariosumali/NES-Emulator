/**
 * NES Game Genie code decoder.
 *
 * A code is 6 or 8 letters drawn from a 16-letter alphabet, each letter carrying
 * one nibble. The nibbles are scrambled across the 15-bit address and the 8-bit
 * replacement value; 8-letter codes carry an extra "compare" byte, and only
 * patch when the byte currently at that address matches it. That compare byte is
 * what makes a code safe on bank-switched carts — the same CPU address holds
 * different data depending on which PRG bank is live.
 */

const GENIE_ALPHABET = 'APZLGITYEOXUKSVN';

export interface GameGenieCode {
    /** CPU address in the $8000-$FFFF PRG window. */
    address: number;
    /** Byte to substitute. */
    value: number;
    /** Only patch when the existing byte equals this. Undefined for 6-letter codes. */
    compare?: number;
}

/**
 * Decode a Game Genie code. Returns null when the code is not well formed.
 *
 * Bit layout (n[i] is the nibble for letter i):
 *   address = 0x8000
 *           | (n3 & 7) << 12 | (n5 & 7) << 8 | (n4 & 8) << 8
 *           | (n2 & 7) << 4  | (n1 & 8) << 4 | (n4 & 7) | (n3 & 8)
 *   value   = (n1 & 7) << 4  | (n0 & 8) << 4 | (n0 & 7) | (nLast & 8)
 *   compare = (n7 & 7) << 4  | (n6 & 8) << 4 | (n6 & 7) | (n5 & 8)   [8-letter only]
 */
export function decodeGameGenie(code: string): GameGenieCode | null {
    const normalized = normalizeCode(code);
    if (normalized.length !== 6 && normalized.length !== 8) return null;

    const n: number[] = [];
    for (const char of normalized) {
        const idx = GENIE_ALPHABET.indexOf(char);
        if (idx === -1) return null;
        n.push(idx);
    }

    // Parenthesised deliberately: `+` binds tighter than `|`, and mixing the two
    // here is how these decoders classically go wrong.
    const address =
        0x8000 |
        ((n[3] & 7) << 12) |
        ((n[5] & 7) << 8) |
        ((n[4] & 8) << 8) |
        ((n[2] & 7) << 4) |
        ((n[1] & 8) << 4) |
        (n[4] & 7) |
        (n[3] & 8);

    if (normalized.length === 6) {
        const value = ((n[1] & 7) << 4) | ((n[0] & 8) << 4) | (n[0] & 7) | (n[5] & 8);
        return { address, value };
    }

    const value = ((n[1] & 7) << 4) | ((n[0] & 8) << 4) | (n[0] & 7) | (n[7] & 8);
    const compare = ((n[7] & 7) << 4) | ((n[6] & 8) << 4) | (n[6] & 7) | (n[5] & 8);
    return { address, value, compare };
}

/** Re-encode an address/value(/compare) triple back into letters. */
export function encodeGameGenie(address: number, value: number, compare?: number): string {
    const a = address & 0x7fff;
    const eightLetter = compare !== undefined;
    const n = new Array<number>(eightLetter ? 8 : 6).fill(0);

    n[0] = ((value & 7) | (((value >> 4) & 8))) & 0x0f;
    n[1] = (((value >> 4) & 7) | ((a >> 4) & 8)) & 0x0f;
    // Bit 3 of the third nibble is the length flag: set for 8-letter codes.
    // The decoder ignores it (it only reads `n[2] & 7`), but omitting it here
    // yields codes one letter off from the published ones — SLZPLOVS for what
    // should be SLXPLOVS.
    n[2] = (((a >> 4) & 7) | (eightLetter ? 8 : 0)) & 0x0f;
    n[3] = (((a >> 12) & 7) | (a & 8)) & 0x0f;
    n[4] = ((a & 7) | ((a >> 8) & 8)) & 0x0f;

    if (!eightLetter) {
        n[5] = (((a >> 8) & 7) | (value & 8)) & 0x0f;
    } else {
        n[5] = (((a >> 8) & 7) | (compare & 8)) & 0x0f;
        n[6] = ((compare & 7) | ((compare >> 4) & 8)) & 0x0f;
        n[7] = (((compare >> 4) & 7) | (value & 8)) & 0x0f;
    }

    return n.map((v) => GENIE_ALPHABET[v]).join('');
}

export function isValidGameGenieCode(code: string): boolean {
    const normalized = normalizeCode(code);
    if (normalized.length !== 6 && normalized.length !== 8) return false;
    for (const char of normalized) {
        if (!GENIE_ALPHABET.includes(char)) return false;
    }
    return true;
}

/** Uppercase and drop everything that is not a letter (people paste "SXIO-PO"). */
export function normalizeCode(code: string): string {
    return code.toUpperCase().replace(/[^A-Z]/g, '');
}

/** The valid letters, for input hints and on-screen keyboards. */
export const GAME_GENIE_LETTERS = GENIE_ALPHABET;

/**
 * Parse a "raw" cheat in the widely-used `AAAA:VV` or `AAAA?CC:VV` hex form,
 * as well as bare `AAAA VV`.
 */
export function parseRawCheat(input: string): GameGenieCode | null {
    const m = input
        .trim()
        .toUpperCase()
        .match(/^\$?([0-9A-F]{1,4})\s*(?:\?\s*([0-9A-F]{1,2}))?\s*[:=\s]\s*\$?([0-9A-F]{1,2})$/);
    if (!m) return null;
    const address = parseInt(m[1], 16);
    const compare = m[2] !== undefined ? parseInt(m[2], 16) : undefined;
    const value = parseInt(m[3], 16);
    if (Number.isNaN(address) || Number.isNaN(value)) return null;
    return { address, value, compare };
}
