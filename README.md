# NES Emulator Web

A browser-based NES emulator built with React, TypeScript, and jsnes.

![NES Emulator Screenshot](./screenshot.png)

## Features

**Core Emulation**
- Accurate NES emulation via jsnes at 60 FPS
- Full audio support with stereo output

**Save System**
- 5 independent save slots
- Persistent storage in browser localStorage

**Controls**
- Fully remappable keyboard controls
- Player 2 support with separate bindings
- USB/Bluetooth gamepad support
- On-screen touch controls for mobile

**Speed Controls**
- Fast forward (2x, 4x)
- Slow motion (0.5x)

**Cheats**
- Game Genie code support (6 and 8 letter)
- Raw memory address/value cheats

**Display**
- Fullscreen mode
- CRT/scanline filter effects
- Adjustable screen size (1x-3x)
- Multiple color themes

**Media**
- Screenshot capture (PNG)
- Screen recording (WebM)

## Default Controls

| NES Button | Player 1 | Player 2 (Numpad) |
|------------|----------|-------------------|
| D-Pad | WASD / Arrows | 8, 4, 5, 6 |
| A | J | 1 |
| B | K | 0 |
| Start | Enter | 9 |
| Select | Right Shift | 7 |

Gamepads use standard mapping (D-pad, A/B/X/Y, Start/Select).

## Getting Started

```bash
npm install
npm run dev
```

Load a `.nes` ROM file and play.

## Tech Stack

React, TypeScript, Vite, jsnes, Web Audio API, Gamepad API, MediaRecorder API

## License

MIT — Created by Mario Sumali