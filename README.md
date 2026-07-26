# NES Station

A fast, offline NES emulator that runs entirely in your browser. Built with React, TypeScript and [jsnes](https://github.com/bfirsh/jsnes), with a WebGL2 renderer, an AudioWorklet mixer, and a local game library.

Your ROMs never leave your device — there is no server, no upload, and no account.

![NES Station](./screenshot.png)

## Features

**Picture**
- WebGL2 renderer with a real CRT shader: barrel distortion, aperture-grille mask, luminance-weighted scanlines, phosphor bloom and a vignette — each individually adjustable
- Five presets: Sharp, Smooth, Scanlines, CRT, Phosphor. Canvas2D fallback when WebGL is unavailable
- Correct NTSC geometry (NES pixels are 8:7, not square), optional integer scaling, and overscan cropping
- Six colour palettes, ambient glow that spills the picture onto the page, dark and light themes

**Play**
- Rewind — hold <kbd>Backspace</kbd> to scrub backwards through the last 30 seconds
- Hold-to-fast-forward, frame stepping, and soft reset that preserves your cartridge save
- Nine save-state slots per game with screenshot thumbnails, plus a periodic auto-save
- **Cartridge saves work.** Games with battery-backed SRAM (Zelda, Final Fantasy, Metroid…) keep their in-game saves, written automatically and restored when you come back

**Library**
- Drag and drop `.nes` or `.zip` anywhere; archives are unpacked in the browser
- Games persist in IndexedDB with generated cover art, play time, and search
- Export a cartridge save as a `.sav` file for use in other emulators

**Input**
- Fully remappable keyboard, with turbo/auto-fire at a configurable rate
- Gamepad support with per-player assignment, adjustable deadzone, and rumble
- On-screen controls built on pointer events: true 8-way d-pad with diagonals, slide between buttons, haptics

**Sound**
- AudioWorklet mixer with a lock-free ring buffer, running at the device's real sample rate
- Emulation paced against the audio clock, so it stays glitch-free on 120Hz and 144Hz displays
- Per-channel mixer for the two pulses, triangle, noise and DMC

**Cheats**
- Game Genie codes (6 and 8 letter), with the compare byte honoured so codes are safe on bank-switched cartridges
- A memory scanner for finding your own values — scan, play, filter by increased/decreased/unchanged, then freeze

**Everything else**
- Installable PWA that works fully offline
- Command palette (<kbd>⌘K</kbd>), keyboard shortcuts (<kbd>?</kbd>), screenshots, and video capture *with audio*

## Getting started

```bash
npm install
npm run dev
```

Then drop a `.nes` file onto the page.

To try it without a ROM, generate the bundled homebrew test cartridge — a hand-assembled 6502 program that fills the screen with a colour:

```bash
npm run test-rom -- test-rom.nes
```

## Controls

| NES button | Player 1 | Player 2 |
|---|---|---|
| D-pad | WASD or arrow keys | Numpad 8 4 2 6 |
| A | K | Numpad 1 |
| B | J | Numpad 0 |
| Turbo A / B | I / U | — |
| Start | Enter | Numpad Enter |
| Select | Right Shift | Numpad + |

| Shortcut | Action |
|---|---|
| <kbd>Space</kbd> | Play / pause |
| <kbd>Backspace</kbd> (hold) | Rewind |
| <kbd>Shift</kbd> (hold) | Fast forward |
| <kbd>F2</kbd> / <kbd>F4</kbd> | Save / load state |
| <kbd>1</kbd>–<kbd>9</kbd> | Select save slot |
| <kbd>R</kbd> / <kbd>N</kbd> | Reset / step one frame |
| <kbd>P</kbd> / <kbd>V</kbd> | Screenshot / record |
| <kbd>F</kbd> / <kbd>M</kbd> | Fullscreen / mute |
| <kbd>L</kbd> <kbd>O</kbd> <kbd>C</kbd> <kbd>,</kbd> | Library, saves, cheats, settings |
| <kbd>⌘K</kbd> / <kbd>?</kbd> | Command palette / shortcuts |

Gamepads use standard mapping. Shoulder buttons are bound to rewind, fast forward, and save/load state.

## Compatibility

The emulator core implements iNES mappers 0, 1, 2, 3, 4, 5, 7, 11, 34, 38, 66, 94, 140 and 180 — which covers the large majority of the commercial library. A ROM using anything else is rejected up front with an explanation rather than failing silently.

Save states capture CPU, PPU and mapper state. They do **not** capture APU state, so you may hear a brief audio discontinuity right after loading one.

## Development

```bash
npm run check      # typecheck, lint, and run the Game Genie test suite
npm run build      # production build
npm run icons      # regenerate the PWA icons from public/icon.svg
```

`scripts/verify-gamegenie.mjs` pins the Game Genie codec against published codes — the bit scramble is easy to break in ways that still look plausible.

## Tech

React 19 · TypeScript · Vite · jsnes · WebGL2 · AudioWorklet · IndexedDB · Gamepad API · MediaRecorder · Service Worker

## Legal

NES Station ships no games and contains no Nintendo code or assets. Use ROMs you have dumped from cartridges you own, or homebrew released for free by its authors. Nintendo and Nintendo Entertainment System are trademarks of Nintendo; this project is unaffiliated.

## License

MIT — created by Mario Sumali
