/**
 * Typed, versioned settings store.
 *
 * Small and synchronous, so localStorage is the right home. Components subscribe
 * via `useSettings()` (useSyncExternalStore) which keeps reads tear-free and
 * lets non-React code — the audio engine, the renderer — read the same source.
 */

import { useSyncExternalStore } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type VideoFilter = 'sharp' | 'smooth' | 'scanlines' | 'crt' | 'phosphor';
export type AspectMode = 'pixel' | 'ntsc' | 'stretch';
export type PaletteName = 'jsnes' | 'nostalgia' | 'fceux' | 'nes-classic' | 'vivid' | 'grayscale';

export interface Settings {
    version: number;

    // Video
    scale: number;
    integerScale: boolean;
    aspect: AspectMode;
    filter: VideoFilter;
    /** Crop the 8 scanlines top/bottom that real TVs hid behind the bezel. */
    overscan: boolean;
    palette: PaletteName;
    /** Bleed the frame's edge colours into the surrounding page. */
    ambientGlow: boolean;
    scanlineIntensity: number;
    curvature: number;
    bloom: number;

    // Audio
    volume: number;
    muted: boolean;
    /** Target audio buffer in ms. Lower = snappier, higher = safer. */
    audioLatency: number;
    channelMutes: { square1: boolean; square2: boolean; triangle: boolean; noise: boolean; dmc: boolean };

    // Emulation
    rewindEnabled: boolean;
    rewindSeconds: number;
    fastForwardSpeed: number;
    autoSaveEnabled: boolean;
    autoSaveIntervalSec: number;
    /** Pause emulation when the tab loses focus. */
    pauseOnBlur: boolean;
    turboRate: number;

    // Input
    gamepadDeadzone: number;
    hapticsEnabled: boolean;

    // Interface
    theme: ThemeMode;
    accent: string;
    showFps: boolean;
    showTouchControls: 'auto' | 'always' | 'never';
    touchOpacity: number;
    showInputDisplay: boolean;
    uiSounds: boolean;
    crtPowerOn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
    version: 3,

    scale: 3,
    integerScale: false,
    aspect: 'ntsc',
    filter: 'crt',
    overscan: false,
    palette: 'nostalgia',
    ambientGlow: true,
    scanlineIntensity: 0.35,
    curvature: 0.18,
    bloom: 0.35,

    volume: 0.7,
    muted: false,
    audioLatency: 90,
    channelMutes: { square1: false, square2: false, triangle: false, noise: false, dmc: false },

    rewindEnabled: true,
    rewindSeconds: 30,
    fastForwardSpeed: 3,
    autoSaveEnabled: true,
    autoSaveIntervalSec: 60,
    pauseOnBlur: true,
    turboRate: 16,

    gamepadDeadzone: 0.35,
    hapticsEnabled: true,

    theme: 'dark',
    accent: '#ff4d4d',
    showFps: false,
    showTouchControls: 'auto',
    touchOpacity: 0.6,
    showInputDisplay: false,
    uiSounds: true,
    crtPowerOn: true,
};

const STORAGE_KEY = 'nes-station:settings';

function load(): Settings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw) as Partial<Settings>;
        // Merge rather than replace so new settings pick up their defaults and
        // removed ones fall away without a migration step.
        return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            channelMutes: { ...DEFAULT_SETTINGS.channelMutes, ...(parsed.channelMutes ?? {}) },
            version: DEFAULT_SETTINGS.version,
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

let current: Settings = load();
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

export const settingsStore = {
    get: () => current,

    set(patch: Partial<Settings>) {
        current = { ...current, ...patch };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        } catch {
            // Quota or private mode — settings simply won't persist this session.
        }
        emit();
    },

    reset() {
        current = { ...DEFAULT_SETTINGS };
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch { /* ignore */ }
        emit();
    },

    subscribe(fn: () => void) {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },
};

export function useSettings(): Settings {
    return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, () => DEFAULT_SETTINGS);
}

/** Convenience for `const [value, setValue] = useSetting('volume')`. */
export function useSetting<K extends keyof Settings>(key: K): [Settings[K], (v: Settings[K]) => void] {
    const settings = useSettings();
    return [settings[key], (v: Settings[K]) => settingsStore.set({ [key]: v } as Partial<Settings>)];
}
