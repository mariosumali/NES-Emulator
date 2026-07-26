import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmulatorEngine } from './emulator/EmulatorEngine';
import { captureFilename, downloadBlob, downloadUrl } from './emulator/RecordingController';
import type { Cheat } from './emulator/NesCore';
import { EngineContext, useEngine, useEngineState } from './hooks/useEngine';
import { useFullscreen } from './hooks/useFullscreen';
import { useHotkeys, type AppAction } from './hooks/useHotkeys';
import { useToasts } from './hooks/useToasts';
import { useWakeLock } from './hooks/useWakeLock';
import { settingsStore, useSettings } from './storage/settings';
import { requestPersistentStorage, romsDb } from './storage/db';
import { Dock } from './components/Dock';
import { EmptyState } from './components/EmptyState';
import { Screen } from './components/Screen';
import { TouchControls } from './components/TouchControls';
import { Announcer, Toasts } from './components/Toasts';
import { CommandPalette, ShortcutsPanel } from './components/CommandPalette';
import { SettingsPanel } from './components/panels/SettingsPanel';
import { LibraryPanel } from './components/panels/LibraryPanel';
import { SaveStatesPanel } from './components/panels/SaveStatesPanel';
import { CheatsPanel } from './components/panels/CheatsPanel';
import { Chip, IconButton } from './components/ui';
import {
    CartridgeIcon, CheatIcon, CommandIcon, LibraryIcon, SaveIcon, SettingsIcon,
} from './components/icons';

type PanelName = 'settings' | 'library' | 'states' | 'cheats' | null;

/** Convert #rrggbb to the "r g b" form the CSS tokens expect. */
function hexToRgbTriplet(hex: string): string | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export default function App() {
    // The engine outlives every render and owns the 60Hz loop. A lazy state
    // initialiser guarantees exactly one instance, even under StrictMode's
    // double-invoked render.
    const [engine] = useState(() => new EmulatorEngine());

    return (
        <EngineContext.Provider value={engine}>
            <AppInner />
        </EngineContext.Provider>
    );
}

function AppInner() {
    const engine = useEngine();
    const state = useEngineState();
    const settings = useSettings();
    const { toasts, push, dismiss } = useToasts();

    const [panel, setPanel] = useState<PanelName>(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [libraryCount, setLibraryCount] = useState(0);
    const [libraryToken, setLibraryToken] = useState(0);
    const [announcement, setAnnouncement] = useState('');
    const [cheats, setCheatsState] = useState<Cheat[]>([]);
    const [chromeVisible, setChromeVisible] = useState(true);

    const fullscreen = useFullscreen('game-screen');
    const running = state.status === 'running';
    useWakeLock(running);

    const announce = useCallback((message: string) => {
        // Re-set with a space appended when unchanged, so repeated identical
        // messages are still announced rather than swallowed as "no change".
        setAnnouncement((prev) => (prev === message ? `${message} ` : message));
    }, []);

    /* ---------------------------------------------------- engine events -- */

    useEffect(() => engine.onEvent((e) => push(e.kind, e.message, e.detail)), [engine, push]);

    useEffect(() => {
        void requestPersistentStorage();
        void romsDb.all().then((all) => setLibraryCount(all.length)).catch(() => setLibraryCount(0));
    }, [libraryToken]);

    // Deliberately no dispose-on-unmount: this component only unmounts when the
    // page goes away, and StrictMode's double-invoked effects would otherwise
    // tear down the engine in development and never rebuild it. `pagehide`
    // below handles the durable work.

    /* --------------------------------------------------------- settings -- */

    useEffect(() => { engine.applySettings(settings); }, [engine, settings]);

    // Theme
    useEffect(() => {
        const root = document.documentElement;
        const apply = () => {
            const resolved = settings.theme === 'system'
                ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
                : settings.theme;
            root.dataset.theme = resolved;
            document.querySelector('meta[name="theme-color"]')
                ?.setAttribute('content', resolved === 'light' ? '#f4f5f7' : '#08090b');
        };
        apply();
        if (settings.theme !== 'system') return;
        const media = window.matchMedia('(prefers-color-scheme: light)');
        media.addEventListener('change', apply);
        return () => media.removeEventListener('change', apply);
    }, [settings.theme]);

    // Accent
    useEffect(() => {
        const triplet = hexToRgbTriplet(settings.accent);
        if (!triplet) return;
        const root = document.documentElement;
        root.style.setProperty('--accent', settings.accent);
        root.style.setProperty('--accent-rgb', triplet);
    }, [settings.accent]);

    /* ----------------------------------------------------------- cheats -- */

    // Cheats are per-game: a Game Genie address means nothing on another cartridge.
    useEffect(() => {
        if (!state.romId) { setCheatsState([]); return; }
        try {
            const raw = localStorage.getItem(`nes-station:cheats:${state.romId}`);
            setCheatsState(raw ? (JSON.parse(raw) as Cheat[]) : []);
        } catch {
            setCheatsState([]);
        }
    }, [state.romId]);

    const setCheats = useCallback((next: Cheat[]) => {
        setCheatsState(next);
        engine.setCheats(next);
        if (state.romId) {
            try {
                localStorage.setItem(`nes-station:cheats:${state.romId}`, JSON.stringify(next));
            } catch { /* quota */ }
        }
    }, [engine, state.romId]);

    useEffect(() => { engine.setCheats(cheats); }, [engine, cheats]);

    /* ------------------------------------------------------ file intake -- */

    const handleFiles = useCallback(async (files: FileList | File[]) => {
        const list = Array.from(files).filter((f) => /\.(nes|zip)$/i.test(f.name));
        if (list.length === 0) {
            push('warn', 'That file is not a NES ROM', 'Drop a .nes file, or a .zip containing one.');
            return;
        }
        try {
            // Load the first, register the rest into the library silently.
            await engine.loadFile(list[0]);
            setPanel(null);
        } catch {
            // loadFile already surfaced a toast.
        } finally {
            setLibraryToken((n) => n + 1);
        }
    }, [engine, push]);

    // Window-wide drag and drop.
    useEffect(() => {
        let depth = 0;
        const onEnter = (e: DragEvent) => {
            if (!e.dataTransfer?.types.includes('Files')) return;
            depth++;
            setDragging(true);
        };
        const onLeave = () => { if (--depth <= 0) { depth = 0; setDragging(false); } };
        const onOver = (e: DragEvent) => { e.preventDefault(); };
        const onDrop = (e: DragEvent) => {
            e.preventDefault();
            depth = 0;
            setDragging(false);
            if (e.dataTransfer?.files.length) void handleFiles(e.dataTransfer.files);
        };
        window.addEventListener('dragenter', onEnter);
        window.addEventListener('dragleave', onLeave);
        window.addEventListener('dragover', onOver);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onEnter);
            window.removeEventListener('dragleave', onLeave);
            window.removeEventListener('dragover', onOver);
            window.removeEventListener('drop', onDrop);
        };
    }, [handleFiles]);

    /* ------------------------------------------------- lifecycle safety -- */

    // Never lose an in-game save to a tab close.
    useEffect(() => {
        const flush = () => { void engine.flushSram(); void engine.recordPlaytime(); };
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
        return () => window.removeEventListener('pagehide', flush);
    }, [engine]);

    useEffect(() => {
        if (!settings.pauseOnBlur) return;
        const onHidden = () => { if (document.hidden) engine.pause(); };
        document.addEventListener('visibilitychange', onHidden);
        return () => document.removeEventListener('visibilitychange', onHidden);
    }, [engine, settings.pauseOnBlur]);

    // Auto-hide chrome in landscape phone mode after a moment of stillness.
    useEffect(() => {
        let timer = 0;
        const wake = () => {
            setChromeVisible(true);
            window.clearTimeout(timer);
            if (running) timer = window.setTimeout(() => setChromeVisible(false), 2600);
        };
        wake();
        window.addEventListener('pointermove', wake);
        window.addEventListener('pointerdown', wake);
        window.addEventListener('keydown', wake);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('pointermove', wake);
            window.removeEventListener('pointerdown', wake);
            window.removeEventListener('keydown', wake);
        };
    }, [running]);

    /* ---------------------------------------------------------- actions -- */

    const screenshot = useCallback(() => {
        const url = engine.screenshot();
        if (!url) { push('error', 'Could not capture the screen'); return; }
        downloadUrl(url, captureFilename(state.romName ?? 'nes', 'png'));
        push('success', 'Screenshot saved');
    }, [engine, push, state.romName]);

    const toggleRecording = useCallback(async () => {
        if (engine.recorder.isRecording) {
            const blob = await engine.stopRecording();
            if (blob) {
                downloadBlob(blob, captureFilename(state.romName ?? 'nes', engine.recorder.fileExtension));
                push('success', 'Recording saved');
            }
            return;
        }
        const canvas = document.querySelector<HTMLCanvasElement>('.screen-canvas');
        if (!canvas) return;
        if (engine.startRecording(canvas)) push('info', 'Recording started', 'Press V again to stop.');
    }, [engine, push, state.romName]);

    const togglePlay = useCallback(async () => {
        if (!state.romId) return;
        // Resuming has to happen inside the gesture for iOS to unmute us.
        await engine.ensureStarted();
        engine.toggle();
    }, [engine, state.romId]);

    const actions = useMemo<AppAction[]>(() => {
        const hasRom = state.romId !== null;
        const list: AppAction[] = [
            { id: 'play', group: 'Playback', label: running ? 'Pause' : 'Play', code: 'Space', keys: ['Space'], run: () => void togglePlay(), disabled: !hasRom },
            { id: 'reset', group: 'Playback', label: 'Reset console', code: 'KeyR', keys: ['R'], run: () => engine.reset(), disabled: !hasRom },
            { id: 'step', group: 'Playback', label: 'Advance one frame', code: 'KeyN', keys: ['N'], run: () => engine.step(), disabled: !hasRom || running },
            { id: 'rewind', group: 'Playback', label: 'Rewind', code: 'Backspace', keys: ['Backspace'], hold: true, run: (held) => engine.setRewinding(!!held), disabled: !hasRom },
            { id: 'ff', group: 'Playback', label: 'Fast forward', code: 'ShiftLeft', shift: true, keys: ['Shift'], hold: true, run: (held) => engine.setFastForward(!!held), disabled: !hasRom },

            { id: 'save', group: 'Saves', label: `Save to slot ${state.currentSlot}`, code: 'F2', keys: ['F2'], run: () => void engine.saveState(state.currentSlot), disabled: !hasRom },
            { id: 'load', group: 'Saves', label: `Load slot ${state.currentSlot}`, code: 'F4', keys: ['F4'], run: () => void engine.loadState(state.currentSlot), disabled: !hasRom },
            { id: 'states', group: 'Saves', label: 'Manage save states', code: 'KeyO', keys: ['O'], run: () => setPanel('states'), disabled: !hasRom },

            { id: 'screenshot', group: 'Capture', label: 'Take screenshot', code: 'KeyP', keys: ['P'], run: screenshot, disabled: !hasRom },
            { id: 'record', group: 'Capture', label: state.isRecording ? 'Stop recording' : 'Record video', code: 'KeyV', keys: ['V'], run: () => void toggleRecording(), disabled: !hasRom },

            { id: 'mute', group: 'Audio', label: settings.muted ? 'Unmute' : 'Mute', code: 'KeyM', keys: ['M'], run: () => settingsStore.set({ muted: !settings.muted }) },

            { id: 'library', group: 'Navigate', label: 'Open library', code: 'KeyL', keys: ['L'], run: () => setPanel('library') },
            { id: 'settings', group: 'Navigate', label: 'Open settings', code: 'Comma', keys: [','], run: () => setPanel('settings') },
            { id: 'cheats', group: 'Navigate', label: 'Open cheats', code: 'KeyC', keys: ['C'], run: () => setPanel('cheats'), disabled: !hasRom },
            { id: 'palette', group: 'Navigate', label: 'Command palette', code: 'KeyK', mod: true, keys: ['Mod', 'K'], run: () => setPaletteOpen(true) },
            { id: 'shortcuts', group: 'Navigate', label: 'Keyboard shortcuts', code: 'Slash', shift: true, keys: ['?'], run: () => setShortcutsOpen(true) },
            { id: 'escape', group: 'Navigate', label: 'Close panel', code: 'Escape', hidden: true, run: () => { setPanel(null); setPaletteOpen(false); setShortcutsOpen(false); } },

            { id: 'theme', group: 'Interface', label: `Switch to ${settings.theme === 'light' ? 'dark' : 'light'} theme`, run: () => settingsStore.set({ theme: settings.theme === 'light' ? 'dark' : 'light' }) },
            { id: 'fps', group: 'Interface', label: settings.showFps ? 'Hide performance overlay' : 'Show performance overlay', run: () => settingsStore.set({ showFps: !settings.showFps }) },
        ];

        if (fullscreen.isSupported()) {
            list.push({
                id: 'fullscreen', group: 'Interface',
                label: fullscreen.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen',
                code: 'KeyF', keys: ['F'], run: () => void fullscreen.toggle(),
            });
        }

        for (let slot = 1; slot <= 9; slot++) {
            list.push({
                id: `slot-${slot}`, group: 'Saves', label: `Select save slot ${slot}`,
                code: `Digit${slot}`, keys: [String(slot)], hidden: slot > 5,
                run: () => { engine.setCurrentSlot(slot); announce(`Save slot ${slot} selected`); },
                disabled: !hasRom,
            });
        }

        return list;
    }, [engine, running, state.romId, state.currentSlot, state.isRecording, settings.muted, settings.theme, settings.showFps, screenshot, toggleRecording, togglePlay, fullscreen, announce]);

    // Panels own their own Escape handling; suspend global hotkeys while one is up
    // so typing in a search field never triggers a game action.
    useHotkeys(actions, !paletteOpen);

    /* ------------------------------------------------------------ touch -- */

    const isTouchDevice = useMemo(
        () => typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0),
        []
    );
    const showTouch =
        settings.showTouchControls === 'always' ||
        (settings.showTouchControls === 'auto' && isTouchDevice && state.romId !== null);

    /* ------------------------------------------------------------ render -- */

    return (
        <div className="app" data-chrome={chromeVisible ? 'true' : 'false'}>
            <a className="skip-link" href="#game-screen">Skip to the game screen</a>

            <header className="topbar">
                <span className="brand">
                    <span className="brand-mark" aria-hidden="true"><CartridgeIcon size={15} /></span>
                    <span className="brand-name">NES <em>Station</em></span>
                </span>

                <div className="topbar-title">
                    {state.romName ? (
                        <>
                            <span className="truncate">{state.romName}</span>
                            {state.romInfo && (
                                <Chip>{state.romInfo.mapperName}</Chip>
                            )}
                            {state.isRecording && <Chip tone="danger" pulse>REC</Chip>}
                            {state.hasBattery && <Chip tone="ok">Battery save</Chip>}
                        </>
                    ) : (
                        <span className="eyebrow">No cartridge</span>
                    )}
                </div>

                <div className="topbar-actions">
                    <IconButton label="Command palette" shortcut="⌘K" onClick={() => setPaletteOpen(true)}>
                        <CommandIcon />
                    </IconButton>
                    <IconButton label="Library" shortcut="L" onClick={() => setPanel('library')}>
                        <LibraryIcon />
                    </IconButton>
                    <IconButton label="Save states" shortcut="O" disabled={!state.romId} onClick={() => setPanel('states')}>
                        <SaveIcon />
                    </IconButton>
                    <IconButton label="Cheats" shortcut="C" disabled={!state.romId} onClick={() => setPanel('cheats')}>
                        <CheatIcon />
                    </IconButton>
                    <IconButton label="Settings" shortcut="," onClick={() => setPanel('settings')}>
                        <SettingsIcon />
                    </IconButton>
                </div>
            </header>

            <main className="stage">
                {state.romId ? (
                    <Screen onRequestStart={() => void togglePlay()} />
                ) : (
                    <EmptyState
                        onFiles={(files) => void handleFiles(files)}
                        onOpenLibrary={() => setPanel('library')}
                        libraryCount={libraryCount}
                        dragging={dragging}
                    />
                )}

                {state.status === 'error' && state.error && (
                    <div className="toast" data-kind="error" style={{ maxInlineSize: 520 }}>
                        <div className="toast-body">
                            <div className="toast-title">This game could not be loaded</div>
                            <div className="toast-detail">{state.error}</div>
                        </div>
                    </div>
                )}

                {/* No transport controls before a cartridge is in: a row of
                    dead buttons is a worse first impression than none. */}
                {state.romId && <Dock
                    onTogglePlay={() => void togglePlay()}
                    onStep={() => engine.step()}
                    onReset={() => engine.reset()}
                    onRewind={(held) => engine.setRewinding(held)}
                    onFastForward={(held) => engine.setFastForward(held)}
                    onSelectSlot={(slot) => engine.setCurrentSlot(slot)}
                    onSave={() => void engine.saveState(state.currentSlot)}
                    onLoad={() => void engine.loadState(state.currentSlot)}
                    onScreenshot={screenshot}
                    onToggleRecording={() => void toggleRecording()}
                    onToggleFullscreen={() => void fullscreen.toggle()}
                    isFullscreen={fullscreen.isFullscreen}
                    fullscreenSupported={fullscreen.isSupported()}
                />}
            </main>

            <TouchControls
                onButtonDown={(p, b) => engine.core?.buttonDown(p, b)}
                onButtonUp={(p, b) => engine.core?.buttonUp(p, b)}
                visible={showTouch}
            />

            {dragging && (
                <div className="drop-veil" aria-hidden="true">
                    <div className="drop-veil-inner">Drop to load</div>
                </div>
            )}

            {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} onAnnounce={announce} />}
            {panel === 'library' && (
                <LibraryPanel
                    onClose={() => setPanel(null)}
                    onPlay={(romId) => { void engine.loadFromLibrary(romId).then(() => setPanel(null)); }}
                    onFiles={(files) => void handleFiles(files)}
                    currentRomId={state.romId}
                    refreshToken={libraryToken}
                />
            )}
            {panel === 'states' && <SaveStatesPanel onClose={() => setPanel(null)} />}
            {panel === 'cheats' && (
                <CheatsPanel onClose={() => setPanel(null)} cheats={cheats} setCheats={setCheats} />
            )}

            {paletteOpen && <CommandPalette actions={actions} onClose={() => setPaletteOpen(false)} />}
            {shortcutsOpen && <ShortcutsPanel actions={actions} onClose={() => setShortcutsOpen(false)} />}

            <Toasts toasts={toasts} onDismiss={dismiss} />
            <Announcer message={announcement} />
        </div>
    );
}
