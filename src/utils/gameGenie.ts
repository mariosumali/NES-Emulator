// Game Genie code decoder for NES
// Supports 6-letter and 8-letter codes

const GENIE_ALPHABET = 'APZLGITYEOXUKSVN';

export interface GameGenieCode {
    address: number;
    value: number;
    compare?: number; // Only for 8-letter codes
}

export function decodeGameGenie(code: string): GameGenieCode | null {
    const normalized = code.toUpperCase().replace(/[^A-Z]/g, '');

    if (normalized.length !== 6 && normalized.length !== 8) {
        return null;
    }

    // Convert letters to values
    const values: number[] = [];
    for (const char of normalized) {
        const idx = GENIE_ALPHABET.indexOf(char);
        if (idx === -1) return null;
        values.push(idx);
    }

    // Decode address and value
    // The Game Genie encoding is a bit scrambled
    const n = values;

    if (normalized.length === 6) {
        // 6-letter code: AAAA-VV format (scrambled)
        const address = 0x8000 +
            ((n[3] & 7) << 12) |
            ((n[5] & 7) << 8) |
            ((n[4] & 8) << 8) |
            ((n[2] & 7) << 4) |
            ((n[1] & 8) << 4) |
            (n[4] & 7) |
            (n[3] & 8);

        const value =
            ((n[1] & 7) << 4) |
            ((n[0] & 8) << 4) |
            (n[0] & 7) |
            (n[5] & 8);

        return { address, value };
    } else {
        // 8-letter code: AAAA-VV-CC format (scrambled, with compare value)
        const address = 0x8000 +
            ((n[3] & 7) << 12) |
            ((n[5] & 7) << 8) |
            ((n[4] & 8) << 8) |
            ((n[2] & 7) << 4) |
            ((n[1] & 8) << 4) |
            (n[4] & 7) |
            (n[3] & 8);

        const value =
            ((n[1] & 7) << 4) |
            ((n[0] & 8) << 4) |
            (n[0] & 7) |
            (n[7] & 8);

        const compare =
            ((n[7] & 7) << 4) |
            ((n[6] & 8) << 4) |
            (n[6] & 7) |
            (n[5] & 8);

        return { address, value, compare };
    }
}

export function isValidGameGenieCode(code: string): boolean {
    const normalized = code.toUpperCase().replace(/[^A-Z]/g, '');
    if (normalized.length !== 6 && normalized.length !== 8) return false;

    for (const char of normalized) {
        if (!GENIE_ALPHABET.includes(char)) return false;
    }
    return true;
}
