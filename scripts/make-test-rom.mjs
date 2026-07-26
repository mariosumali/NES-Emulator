/**
 * Emits a minimal, legally-clean NROM test cartridge.
 *
 * Hand-assembled 6502 that initialises the PPU, writes the universal background
 * colour, and enables rendering — enough to prove the whole pipeline end to end
 * (header parse -> mapper -> CPU -> PPU -> renderer) without needing a
 * copyrighted ROM.
 *
 *   node scripts/make-test-rom.mjs [outfile]
 */

import { writeFileSync } from 'node:fs';

const PRG_SIZE = 16384;
const CHR_SIZE = 8192;

// Assembled at $8000. NROM-128 mirrors this bank at $C000, so the vectors at
// $FFFA-$FFFF live at PRG offsets $3FFA-$3FFF.
const program = [
    0x78,                    // SEI
    0xd8,                    // CLD
    0xa2, 0x40,              // LDX #$40
    0x8e, 0x17, 0x40,        // STX $4017   disable APU frame IRQ
    0xa2, 0xff,              // LDX #$FF
    0x9a,                    // TXS
    0xe8,                    // INX          -> X = 0
    0x8e, 0x00, 0x20,        // STX $2000   disable NMI
    0x8e, 0x01, 0x20,        // STX $2001   disable rendering
    0x8e, 0x10, 0x40,        // STX $4010   disable DMC IRQ

    0x2c, 0x02, 0x20,        // BIT $2002   |  wait for vblank #1
    0x10, 0xfb,              // BPL -5      |

    0x2c, 0x02, 0x20,        // BIT $2002   |  wait for vblank #2 (PPU warm)
    0x10, 0xfb,              // BPL -5      |

    0xa9, 0x3f,              // LDA #$3F    |
    0x8d, 0x06, 0x20,        // STA $2006   |  point VRAM at $3F00
    0xa9, 0x00,              // LDA #$00    |
    0x8d, 0x06, 0x20,        // STA $2006   |
    0xa9, 0x21,              // LDA #$21    |  NES colour $21 (sky blue)
    0x8d, 0x07, 0x20,        // STA $2007   |  -> universal background

    0xa9, 0x0a,              // LDA #$0A    |
    0x8d, 0x01, 0x20,        // STA $2001   |  show background

    0x4c, 0x32, 0x80,        // JMP $8032   spin forever
];

const header = [
    0x4e, 0x45, 0x53, 0x1a,  // "NES\x1a"
    0x01,                    // 1 x 16KB PRG
    0x01,                    // 1 x 8KB CHR
    0x00,                    // flags 6: mapper 0, horizontal mirroring, no battery
    0x00,                    // flags 7
    0, 0, 0, 0, 0, 0, 0, 0,
];

const prg = new Uint8Array(PRG_SIZE);
prg.set(program, 0);
// Vectors: NMI, RESET, IRQ — all pointed at the program start.
prg[0x3ffa] = 0x00; prg[0x3ffb] = 0x80;
prg[0x3ffc] = 0x00; prg[0x3ffd] = 0x80;
prg[0x3ffe] = 0x00; prg[0x3fff] = 0x80;

const rom = new Uint8Array(16 + PRG_SIZE + CHR_SIZE);
rom.set(header, 0);
rom.set(prg, 16);
// CHR stays zeroed — this ROM draws no tiles, only the backdrop colour.

const out = process.argv[2] ?? 'test-rom.nes';
writeFileSync(out, rom);
console.log(`wrote ${out} (${rom.length} bytes) — NROM, sky-blue backdrop`);
