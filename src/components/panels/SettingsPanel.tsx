import { useEffect, useState } from 'react';
import { BUTTON_NAMES, BUTTON_ORDER, type ApuChannel } from '../../emulator/NesCore';
import { formatKeyCode } from '../../emulator/InputController';
import { PALETTES, PALETTE_ORDER } from '../../emulator/palettes';
import { useEngine, useEngineState } from '../../hooks/useEngine';
import { settingsStore, useSettings, type VideoFilter } from '../../storage/settings';
import { estimateStorage, requestPersistentStorage } from '../../storage/db';
import { formatBytes } from '../../utils/ines';
import { Button, Field, Kbd, Panel, Section, Segmented, Slider, Switch } from '../ui';
import { GamepadIcon, KeyboardIcon, MonitorIcon, SlidersIcon, VolumeIcon } from '../icons';

type Tab = 'video' | 'audio' | 'controls' | 'gamepad' | 'system';

const TABS: Array<{ id: Tab; label: string; icon: typeof MonitorIcon }> = [
    { id: 'video', label: 'Video', icon: MonitorIcon },
    { id: 'audio', label: 'Audio', icon: VolumeIcon },
    { id: 'controls', label: 'Keyboard', icon: KeyboardIcon },
    { id: 'gamepad', label: 'Gamepad', icon: GamepadIcon },
    { id: 'system', label: 'System', icon: SlidersIcon },
];

const FILTERS: Array<{ value: VideoFilter; label: string }> = [
    { value: 'sharp', label: 'Sharp' },
    { value: 'smooth', label: 'Smooth' },
    { value: 'scanlines', label: 'Scanlines' },
    { value: 'crt', label: 'CRT' },
    { value: 'phosphor', label: 'Phosphor' },
];

const CHANNELS: Array<{ id: ApuChannel; label: string }> = [
    { id: 'square1', label: 'Pulse 1' },
    { id: 'square2', label: 'Pulse 2' },
    { id: 'triangle', label: 'Triangle' },
    { id: 'noise', label: 'Noise' },
    { id: 'dmc', label: 'DMC' },
];

export function SettingsPanel({ onClose, onAnnounce }: { onClose: () => void; onAnnounce: (m: string) => void }) {
    const [tab, setTab] = useState<Tab>('video');

    return (
        <Panel title="Settings" onClose={onClose}>
            <div className="panel-nav" role="tablist" aria-label="Settings sections">
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        id={`tab-${id}`}
                        aria-selected={tab === id}
                        aria-controls={`panel-${id}`}
                        className="panel-nav-btn"
                        onClick={() => setTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="panel-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'video' && <VideoSettings />}
                {tab === 'audio' && <AudioSettings />}
                {tab === 'controls' && <KeyboardSettings onAnnounce={onAnnounce} />}
                {tab === 'gamepad' && <GamepadSettings />}
                {tab === 'system' && <SystemSettings />}
            </div>
        </Panel>
    );
}

/* ---------------------------------------------------------------- Video --- */

function VideoSettings() {
    const s = useSettings();
    const state = useEngineState();

    return (
        <>
            <Section
                title="Picture"
                hint={
                    state.usingWebGl
                        ? 'Rendered on the GPU, so the CRT effects cost nothing on the main thread.'
                        : 'WebGL is unavailable, so shader effects are limited. Scanlines still apply.'
                }
            >
                <Field
                    label="Filter"
                    stacked
                    control={
                        <Segmented
                            full
                            label="Video filter"
                            value={s.filter}
                            options={FILTERS}
                            onChange={(v) => settingsStore.set({ filter: v })}
                        />
                    }
                />

                {s.filter !== 'sharp' && s.filter !== 'smooth' && (
                    <Field
                        label="Scanline depth"
                        stacked
                        control={
                            <Slider
                                label="Scanline depth"
                                min={0} max={1} step={0.05}
                                value={s.scanlineIntensity}
                                format={(v) => `${Math.round(v * 100)}%`}
                                onChange={(v) => settingsStore.set({ scanlineIntensity: v })}
                            />
                        }
                    />
                )}

                {s.filter === 'crt' && (
                    <>
                        <Field
                            label="Screen curvature"
                            stacked
                            control={
                                <Slider
                                    label="Screen curvature"
                                    min={0} max={0.6} step={0.02}
                                    value={s.curvature}
                                    format={(v) => `${Math.round((v / 0.6) * 100)}%`}
                                    onChange={(v) => settingsStore.set({ curvature: v })}
                                />
                            }
                        />
                        <Field
                            label="Phosphor bloom"
                            stacked
                            control={
                                <Slider
                                    label="Phosphor bloom"
                                    min={0} max={1} step={0.05}
                                    value={s.bloom}
                                    format={(v) => `${Math.round(v * 100)}%`}
                                    onChange={(v) => settingsStore.set({ bloom: v })}
                                />
                            }
                        />
                    </>
                )}
            </Section>

            <Section title="Geometry">
                <Field
                    label="Aspect ratio"
                    description={
                        s.aspect === 'ntsc'
                            ? 'NES pixels are 8:7, not square — this is how the games were meant to look.'
                            : undefined
                    }
                    stacked
                    control={
                        <Segmented
                            full
                            label="Aspect ratio"
                            value={s.aspect}
                            options={[
                                { value: 'ntsc', label: 'NTSC 4:3' },
                                { value: 'pixel', label: 'Square pixels' },
                                { value: 'stretch', label: 'Fill' },
                            ]}
                            onChange={(v) => settingsStore.set({ aspect: v })}
                        />
                    }
                />
                <Field
                    label="Maximum scale"
                    stacked
                    control={
                        <Slider
                            label="Maximum scale"
                            min={1} max={6} step={0.5}
                            value={s.scale}
                            format={(v) => `${v}x`}
                            onChange={(v) => settingsStore.set({ scale: v })}
                        />
                    }
                />
                <Field
                    label="Integer scaling"
                    description="Snap to whole device pixels so the picture never shimmers."
                    control={
                        <Switch
                            label="Integer scaling"
                            checked={s.integerScale}
                            onChange={(v) => settingsStore.set({ integerScale: v })}
                        />
                    }
                />
                <Field
                    label="Crop overscan"
                    description="Hide the 8 rows at the top and bottom that a TV bezel used to cover."
                    control={
                        <Switch
                            label="Crop overscan"
                            checked={s.overscan}
                            onChange={(v) => settingsStore.set({ overscan: v })}
                        />
                    }
                />
            </Section>

            <Section title="Colour">
                <Field
                    label="Palette"
                    description={PALETTES[s.palette]?.description}
                    stacked
                    control={
                        <Segmented
                            full
                            label="Colour palette"
                            value={s.palette}
                            options={PALETTE_ORDER.map((p) => ({ value: p, label: PALETTES[p].label }))}
                            onChange={(v) => settingsStore.set({ palette: v })}
                        />
                    }
                />
                <Field
                    label="Ambient glow"
                    description="Spill the picture's colour onto the page behind the screen."
                    control={
                        <Switch
                            label="Ambient glow"
                            checked={s.ambientGlow}
                            onChange={(v) => settingsStore.set({ ambientGlow: v })}
                        />
                    }
                />
            </Section>

            <Section title="Interface">
                <Field
                    label="Theme"
                    stacked
                    control={
                        <Segmented
                            full
                            label="Theme"
                            value={s.theme}
                            options={[
                                { value: 'dark', label: 'Dark' },
                                { value: 'light', label: 'Light' },
                                { value: 'system', label: 'System' },
                            ]}
                            onChange={(v) => settingsStore.set({ theme: v })}
                        />
                    }
                />
                <Field
                    label="Performance overlay"
                    description="Frame rate, audio buffer, and renderer."
                    control={
                        <Switch
                            label="Performance overlay"
                            checked={s.showFps}
                            onChange={(v) => settingsStore.set({ showFps: v })}
                        />
                    }
                />
                <Field
                    label="Power-on animation"
                    control={
                        <Switch
                            label="Power-on animation"
                            checked={s.crtPowerOn}
                            onChange={(v) => settingsStore.set({ crtPowerOn: v })}
                        />
                    }
                />
            </Section>
        </>
    );
}

/* ---------------------------------------------------------------- Audio --- */

function AudioSettings() {
    const s = useSettings();
    const state = useEngineState();

    return (
        <>
            <Section title="Output">
                <Field
                    label="Volume"
                    stacked
                    control={
                        <Slider
                            label="Volume"
                            min={0} max={1} step={0.01}
                            value={s.volume}
                            format={(v) => `${Math.round(v * 100)}%`}
                            onChange={(v) => settingsStore.set({ volume: v, muted: false })}
                        />
                    }
                />
                <Field
                    label="Mute"
                    control={<Switch label="Mute" checked={s.muted} onChange={(v) => settingsStore.set({ muted: v })} />}
                />
            </Section>

            <Section
                title="Latency"
                hint={`Lower is more responsive but more likely to crackle. Currently buffering ${state.audioLatencyMs}ms.`}
            >
                <Field
                    label="Buffer target"
                    stacked
                    control={
                        <Slider
                            label="Audio buffer target"
                            min={30} max={200} step={10}
                            value={s.audioLatency}
                            format={(v) => `${v}ms`}
                            onChange={(v) => settingsStore.set({ audioLatency: v })}
                        />
                    }
                />
            </Section>

            <Section title="Channel mixer" hint="Mute individual APU voices — useful for hearing a soundtrack's parts.">
                {CHANNELS.map((channel) => (
                    <Field
                        key={channel.id}
                        label={channel.label}
                        control={
                            <Switch
                                label={`${channel.label} enabled`}
                                checked={!s.channelMutes[channel.id]}
                                onChange={(on) =>
                                    settingsStore.set({
                                        channelMutes: { ...s.channelMutes, [channel.id]: !on },
                                    })
                                }
                            />
                        }
                    />
                ))}
            </Section>
        </>
    );
}

/* ------------------------------------------------------------- Keyboard --- */

function KeyboardSettings({ onAnnounce }: { onAnnounce: (m: string) => void }) {
    const engine = useEngine();
    const s = useSettings();
    const [player, setPlayer] = useState<1 | 2>(1);
    const [listening, setListening] = useState<{ button: number; turbo: boolean } | null>(null);
    const [, force] = useState(0);
    const input = engine.input;

    useEffect(() => {
        if (!listening || !input) return;

        // Suspend gameplay input while capturing, otherwise binding "A" also
        // makes the character jump.
        input.setEnabled(false);

        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.code === 'Escape') {
                setListening(null);
                onAnnounce('Remapping cancelled');
                return;
            }
            const ok = input.bind(e.code, player, listening.button, listening.turbo);
            onAnnounce(
                ok
                    ? `${formatKeyCode(e.code)} bound to ${BUTTON_NAMES[listening.button]}`
                    : `${formatKeyCode(e.code)} is reserved by the browser`
            );
            setListening(null);
            force((n) => n + 1);
        };

        window.addEventListener('keydown', onKey, { capture: true });
        return () => {
            window.removeEventListener('keydown', onKey, { capture: true });
            input.setEnabled(true);
        };
    }, [listening, player, input, onAnnounce]);

    if (!input) {
        return <p className="section-hint">Load a game to configure controls.</p>;
    }

    return (
        <>
            <Section title="Player">
                <Segmented
                    full
                    label="Configure player"
                    value={player}
                    options={[{ value: 1, label: 'Player 1' }, { value: 2, label: 'Player 2' }]}
                    onChange={(v) => setPlayer(v as 1 | 2)}
                />
            </Section>

            <Section title="Buttons" hint="Choose Change, then press a key. Escape cancels.">
                {BUTTON_ORDER.map((button) => {
                    const keys = input.getKeysFor(player, button);
                    const isListening = listening?.button === button && !listening.turbo;
                    return (
                        <div className="binding" key={button} data-listening={isListening ? 'true' : undefined}>
                            <span className="binding-name">{BUTTON_NAMES[button]}</span>
                            <span className="binding-keys">
                                {keys.length === 0
                                    ? <Kbd empty>unbound</Kbd>
                                    : keys.map((code) => <Kbd key={code}>{formatKeyCode(code)}</Kbd>)}
                            </span>
                            <Button
                                size="sm"
                                active={isListening}
                                onClick={() => setListening({ button, turbo: false })}
                                aria-label={`Change the key for ${BUTTON_NAMES[button]}`}
                            >
                                {isListening ? 'Press a key…' : 'Change'}
                            </Button>
                        </div>
                    );
                })}
            </Section>

            <Section title="Turbo" hint="Auto-fire while held. Handy for shooters and for mashing B.">
                <Field
                    label="Rate"
                    stacked
                    control={
                        <Slider
                            label="Turbo rate"
                            min={4} max={30} step={1}
                            value={s.turboRate}
                            format={(v) => `${v}/sec`}
                            onChange={(v) => settingsStore.set({ turboRate: v })}
                        />
                    }
                />
                {[0, 1].map((i) => {
                    const button = i === 0 ? BUTTON_ORDER[5] : BUTTON_ORDER[4];
                    const keys = input.getKeysFor(player, button, true);
                    const isListening = listening?.button === button && listening.turbo;
                    return (
                        <div className="binding" key={`turbo-${button}`} data-listening={isListening ? 'true' : undefined}>
                            <span className="binding-name">Turbo {BUTTON_NAMES[button]}</span>
                            <span className="binding-keys">
                                {keys.length === 0
                                    ? <Kbd empty>unbound</Kbd>
                                    : keys.map((code) => <Kbd key={code}>{formatKeyCode(code)}</Kbd>)}
                            </span>
                            <Button
                                size="sm"
                                active={isListening}
                                onClick={() => setListening({ button, turbo: true })}
                                aria-label={`Change the turbo key for ${BUTTON_NAMES[button]}`}
                            >
                                {isListening ? 'Press a key…' : 'Change'}
                            </Button>
                        </div>
                    );
                })}
            </Section>

            <Section title="Reset">
                <Button
                    variant="outline"
                    onClick={() => {
                        input.resetToDefaults();
                        force((n) => n + 1);
                        onAnnounce('Keyboard bindings restored to defaults');
                    }}
                >
                    Restore default bindings
                </Button>
            </Section>
        </>
    );
}

/* -------------------------------------------------------------- Gamepad --- */

function GamepadSettings() {
    const engine = useEngine();
    const s = useSettings();
    const [pads, setPads] = useState(engine.getGamepads());

    useEffect(() => {
        // The Gamepad API only materialises a pad after its first input, so poll
        // rather than relying solely on the connect event.
        const timer = window.setInterval(() => setPads(engine.getGamepads()), 800);
        return () => window.clearInterval(timer);
    }, [engine]);

    return (
        <>
            <Section title="Connected" hint="Press a button on a controller if it does not appear.">
                {pads.length === 0 ? (
                    <p className="section-hint">No controllers detected.</p>
                ) : (
                    pads.map((pad) => (
                        <Field
                            key={pad.index}
                            label={pad.id.replace(/\s*\([^)]*\)\s*$/, '')}
                            description={`${pad.buttonCount} buttons · ${pad.axisCount} axes`}
                            control={
                                <Segmented
                                    label={`Assign ${pad.id}`}
                                    value={pad.player ?? 0}
                                    options={[
                                        { value: 0, label: 'Off' },
                                        { value: 1, label: 'P1' },
                                        { value: 2, label: 'P2' },
                                    ]}
                                    onChange={(v) => {
                                        engine.gamepad?.assignTo(pad.index, v === 0 ? null : (v as 1 | 2));
                                        setPads(engine.getGamepads());
                                    }}
                                />
                            }
                        />
                    ))
                )}
            </Section>

            <Section title="Feel">
                <Field
                    label="Stick deadzone"
                    stacked
                    control={
                        <Slider
                            label="Stick deadzone"
                            min={0.05} max={0.8} step={0.05}
                            value={s.gamepadDeadzone}
                            format={(v) => `${Math.round(v * 100)}%`}
                            onChange={(v) => settingsStore.set({ gamepadDeadzone: v })}
                        />
                    }
                />
                <Field
                    label="Vibration"
                    description="Also drives haptics on the on-screen controls."
                    control={
                        <Switch
                            label="Vibration"
                            checked={s.hapticsEnabled}
                            onChange={(v) => settingsStore.set({ hapticsEnabled: v })}
                        />
                    }
                />
            </Section>

            <Section title="Default mapping">
                <ul className="shortcut-list">
                    {[
                        ['D-pad / left stick', 'Direction'],
                        ['Right face button (B / ○)', 'A'],
                        ['Bottom face button (A / ✕)', 'B'],
                        ['Select / Share', 'Select'],
                        ['Start / Options', 'Start'],
                        ['L1 / R1', 'Rewind / Fast forward'],
                        ['L2 / R2', 'Load / Save state'],
                    ].map(([from, to]) => (
                        <li className="shortcut-item" key={from}>
                            <span>{from}</span>
                            <Kbd>{to}</Kbd>
                        </li>
                    ))}
                </ul>
                <Button variant="outline" onClick={() => engine.gamepad?.resetMapping()}>
                    Restore default mapping
                </Button>
            </Section>
        </>
    );
}

/* --------------------------------------------------------------- System --- */

function SystemSettings() {
    const s = useSettings();
    const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
    const [persistent, setPersistent] = useState<boolean | null>(null);

    useEffect(() => {
        void estimateStorage().then(setStorage);
        void navigator.storage?.persisted?.().then(setPersistent).catch(() => setPersistent(null));
    }, []);

    return (
        <>
            <Section title="Emulation">
                <Field
                    label="Rewind"
                    description="Hold Backspace to scrub backwards."
                    control={
                        <Switch
                            label="Rewind"
                            checked={s.rewindEnabled}
                            onChange={(v) => settingsStore.set({ rewindEnabled: v })}
                        />
                    }
                />
                {s.rewindEnabled && (
                    <Field
                        label="Rewind buffer"
                        stacked
                        control={
                            <Slider
                                label="Rewind buffer length"
                                min={5} max={120} step={5}
                                value={s.rewindSeconds}
                                format={(v) => `${v}s`}
                                onChange={(v) => settingsStore.set({ rewindSeconds: v })}
                            />
                        }
                    />
                )}
                <Field
                    label="Fast-forward speed"
                    stacked
                    control={
                        <Slider
                            label="Fast-forward speed"
                            min={1.5} max={8} step={0.5}
                            value={s.fastForwardSpeed}
                            format={(v) => `${v}x`}
                            onChange={(v) => settingsStore.set({ fastForwardSpeed: v })}
                        />
                    }
                />
                <Field
                    label="Pause when tab is hidden"
                    control={
                        <Switch
                            label="Pause when tab is hidden"
                            checked={s.pauseOnBlur}
                            onChange={(v) => settingsStore.set({ pauseOnBlur: v })}
                        />
                    }
                />
            </Section>

            <Section title="Saves" hint="Cartridge saves are written automatically. Auto-save states use a reserved slot.">
                <Field
                    label="Periodic auto-save"
                    control={
                        <Switch
                            label="Periodic auto-save"
                            checked={s.autoSaveEnabled}
                            onChange={(v) => settingsStore.set({ autoSaveEnabled: v })}
                        />
                    }
                />
                {s.autoSaveEnabled && (
                    <Field
                        label="Interval"
                        stacked
                        control={
                            <Slider
                                label="Auto-save interval"
                                min={15} max={300} step={15}
                                value={s.autoSaveIntervalSec}
                                format={(v) => (v >= 60 ? `${Math.round(v / 60)}min` : `${v}s`)}
                                onChange={(v) => settingsStore.set({ autoSaveIntervalSec: v })}
                            />
                        }
                    />
                )}
            </Section>

            <Section title="Touch controls">
                <Field
                    label="Show"
                    stacked
                    control={
                        <Segmented
                            full
                            label="Show touch controls"
                            value={s.showTouchControls}
                            options={[
                                { value: 'auto', label: 'Auto' },
                                { value: 'always', label: 'Always' },
                                { value: 'never', label: 'Never' },
                            ]}
                            onChange={(v) => settingsStore.set({ showTouchControls: v })}
                        />
                    }
                />
                <Field
                    label="Opacity"
                    stacked
                    control={
                        <Slider
                            label="Touch control opacity"
                            min={0.2} max={1} step={0.05}
                            value={s.touchOpacity}
                            format={(v) => `${Math.round(v * 100)}%`}
                            onChange={(v) => settingsStore.set({ touchOpacity: v })}
                        />
                    }
                />
            </Section>

            <Section
                title="Storage"
                hint={
                    storage
                        ? `Using ${formatBytes(storage.usage)} of roughly ${formatBytes(storage.quota)}.`
                        : 'Storage usage is unavailable in this browser.'
                }
            >
                {persistent === false && (
                    <Field
                        label="Protect from eviction"
                        description="Ask the browser not to clear your library under storage pressure."
                        control={
                            <Button
                                size="sm"
                                onClick={async () => setPersistent(await requestPersistentStorage())}
                            >
                                Request
                            </Button>
                        }
                    />
                )}
                {persistent === true && <p className="section-hint">Storage is persistent — your library is safe from automatic clearing.</p>}
            </Section>

            <Section title="Reset">
                <Button variant="danger" onClick={() => settingsStore.reset()}>
                    Restore all settings to defaults
                </Button>
            </Section>
        </>
    );
}
