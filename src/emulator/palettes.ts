import type { PaletteName } from '../storage/settings';

/**
 * Palette variants.
 *
 * The NES has no single "correct" palette — the PPU emits analogue NTSC and
 * every TV decoded it differently, which is why emulators ship a dozen competing
 * LUTs. Rather than bake in someone else's captured table, each variant here is
 * a documented tone curve applied to the core's hardware palette. That keeps hue
 * relationships authentic while offering the looks people actually want.
 *
 * jsnes packs palette entries as 0x00BBGGRR (its `getRed()` reads the high byte
 * of what is really the blue channel), so pack and unpack in that order.
 */

export interface PaletteTransform {
    label: string;
    description: string;
    /** Applied per channel in 0-1 space. */
    apply: (r: number, g: number, b: number) => [number, number, number];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function saturate(r: number, g: number, b: number, amount: number): [number, number, number] {
    const l = luma(r, g, b);
    return [
        clamp01(l + (r - l) * amount),
        clamp01(l + (g - l) * amount),
        clamp01(l + (b - l) * amount),
    ];
}

function gamma(v: number, exponent: number): number {
    return clamp01(Math.pow(v, exponent));
}

export const PALETTES: Record<PaletteName, PaletteTransform> = {
    jsnes: {
        label: 'Hardware',
        description: 'The emulator core’s NTSC table, untouched.',
        apply: (r, g, b) => [r, g, b],
    },
    nostalgia: {
        label: 'Nostalgia',
        description: 'Warmer and slightly softened, the way a CRT in a living room read.',
        apply: (r, g, b) => {
            const [sr, sg, sb] = saturate(r, g, b, 0.92);
            return [
                clamp01(gamma(sr, 0.94) * 1.02),
                clamp01(gamma(sg, 0.97)),
                clamp01(gamma(sb, 1.05) * 0.97),
            ];
        },
    },
    fceux: {
        label: 'Neutral',
        description: 'Flat response with no tint — closest to the raw signal.',
        apply: (r, g, b) => [gamma(r, 1.08), gamma(g, 1.08), gamma(b, 1.08)],
    },
    'nes-classic': {
        label: 'Classic Edition',
        description: 'Higher contrast and deeper blacks, like the mini console’s output.',
        apply: (r, g, b) => {
            const [sr, sg, sb] = saturate(r, g, b, 1.05);
            return [gamma(sr, 1.18), gamma(sg, 1.18), gamma(sb, 1.18)];
        },
    },
    vivid: {
        label: 'Vivid',
        description: 'Punchy, saturated colour for modern displays.',
        apply: (r, g, b) => {
            const [sr, sg, sb] = saturate(r, g, b, 1.35);
            return [gamma(sr, 0.88), gamma(sg, 0.88), gamma(sb, 0.88)];
        },
    },
    grayscale: {
        label: 'Monochrome',
        description: 'Luminance only — how the game looked on a black-and-white set.',
        apply: (r, g, b) => {
            const l = luma(r, g, b);
            return [l, l, l];
        },
    },
};

/** Apply a transform to a packed 0x00BBGGRR table. */
export function transformPalette(base: number[], name: PaletteName): number[] {
    const transform = PALETTES[name] ?? PALETTES.jsnes;
    return base.map((packed) => {
        // jsnes' packing: low byte is red, high byte of the 24-bit word is blue.
        const r = (packed & 0xff) / 255;
        const g = ((packed >> 8) & 0xff) / 255;
        const b = ((packed >> 16) & 0xff) / 255;
        const [nr, ng, nb] = transform.apply(r, g, b);
        return (
            (Math.round(nb * 255) << 16) |
            (Math.round(ng * 255) << 8) |
            Math.round(nr * 255)
        );
    });
}

export const PALETTE_ORDER: PaletteName[] = [
    'nostalgia',
    'jsnes',
    'fceux',
    'nes-classic',
    'vivid',
    'grayscale',
];
