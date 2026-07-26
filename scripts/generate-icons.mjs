/**
 * Generates the PWA raster icons from the same shapes as public/icon.svg.
 *
 * Browsers still want PNGs in a manifest (and iOS requires one for
 * apple-touch-icon), but pulling in a rasteriser just for two files is a poor
 * trade. This draws the icon directly and encodes the PNG with the built-in
 * zlib — no dependencies, and it runs anywhere Node does.
 *
 *   node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** 4x supersampling, box-filtered down. Cheap and plenty for icon-sized art. */
const SS = 4;

const lerp = (a, b, t) => a + (b - a) * t;

function mixHex(hexA, hexB, t) {
    const a = parseInt(hexA.slice(1), 16);
    const b = parseInt(hexB.slice(1), 16);
    return [
        lerp((a >> 16) & 255, (b >> 16) & 255, t),
        lerp((a >> 8) & 255, (b >> 8) & 255, t),
        lerp(a & 255, b & 255, t),
    ];
}

/** Signed distance to a rounded rectangle; negative inside. */
function sdRoundRect(px, py, x, y, w, h, r) {
    const cx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
    const cy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
    const dx = Math.max(cx, 0);
    const dy = Math.max(cy, 0);
    return Math.min(Math.max(cx, cy), 0) + Math.hypot(dx, dy) - r;
}

/**
 * The cartridge silhouette: a rounded rect with the bottom-right shoulder
 * sliced off, which is the shape everyone recognises instantly.
 */
function insideCartridge(px, py, u) {
    if (sdRoundRect(px, py, 14 * u, 13 * u, 36 * u, 38 * u, 2 * u) > 0) return false;
    // Diagonal cut across the bottom-right corner.
    return px / u + py / u < 50 + 44.5;
}

function drawIcon(size) {
    const u = size / 64;
    const w = size * SS;
    const rgba = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let r = 0, g = 0, b = 0, a = 0;

            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const px = (x + (sx + 0.5) / SS) * u * (64 / size) * (size / 64);
                    const py = (y + (sy + 0.5) / SS) * u * (64 / size) * (size / 64);
                    // Work in icon units scaled to the output size.
                    const ux = (x + (sx + 0.5) / SS);
                    const uy = (y + (sy + 0.5) / SS);
                    void px; void py; void w;

                    let cr = 0, cg = 0, cb = 0, ca = 0;

                    // Body: rounded square with a vertical gradient.
                    if (sdRoundRect(ux, uy, 0, 0, size, size, 14 * u) <= 0) {
                        const [br, bg, bb] = mixHex('#22262f', '#0d0f13', uy / size);
                        cr = br; cg = bg; cb = bb; ca = 255;
                    }

                    if (ca > 0) {
                        // Cartridge plate.
                        if (insideCartridge(ux, uy, u)) {
                            cr = lerp(cr, 232, 0.1);
                            cg = lerp(cg, 234, 0.1);
                            cb = lerp(cb, 240, 0.1);
                        }

                        // Label.
                        if (sdRoundRect(ux, uy, 20 * u, 18 * u, 24 * u, 13 * u, 2 * u) <= 0) {
                            const t = ((ux - 20 * u) / (24 * u) + (uy - 18 * u) / (13 * u)) / 2;
                            const [lr, lg, lb] = mixHex('#ff5f5f', '#e11d2e', Math.min(1, Math.max(0, t)));
                            cr = lr; cg = lg; cb = lb;
                        }

                        // Ridges.
                        const ridge =
                            sdRoundRect(ux, uy, 20 * u, 36 * u, 24 * u, 2.4 * u, 1.2 * u) <= 0 ||
                            sdRoundRect(ux, uy, 20 * u, 41 * u, 18 * u, 2.4 * u, 1.2 * u) <= 0;
                        if (ridge) {
                            cr = lerp(cr, 143, 0.55);
                            cg = lerp(cg, 151, 0.55);
                            cb = lerp(cb, 166, 0.55);
                        }
                    }

                    r += cr; g += cg; b += cb; a += ca;
                }
            }

            const n = SS * SS;
            const i = (y * size + x) * 4;
            rgba[i] = Math.round(r / n);
            rgba[i + 1] = Math.round(g / n);
            rgba[i + 2] = Math.round(b / n);
            rgba[i + 3] = Math.round(a / n);
        }
    }

    return rgba;
}

/* ------------------------------------------------------------ PNG output -- */

function crc32(buf) {
    let c;
    const table = crc32.table ?? (crc32.table = (() => {
        const t = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c;
        }
        return t;
    })());

    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
    // Each scanline is prefixed with a filter byte; filter 0 (None) is fine here.
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y++) {
        raw[y * (size * 4 + 1)] = 0;
        Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // colour type: RGBA
    ihdr[10] = 0;  // deflate
    ihdr[11] = 0;  // adaptive filtering
    ihdr[12] = 0;  // no interlace

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
    const png = encodePng(drawIcon(size), size);
    writeFileSync(join(OUT_DIR, `icon-${size}.png`), png);
    console.log(`wrote public/icon-${size}.png (${png.length} bytes)`);
}
