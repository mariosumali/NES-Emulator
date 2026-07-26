import { useEngineState } from '../hooks/useEngine';
import { useSettings, settingsStore } from '../storage/settings';
import { IconButton } from './ui';
import {
    CameraIcon, ExitFullscreenIcon, FastForwardIcon, FullscreenIcon, LoadIcon,
    MuteIcon, PauseIcon, PlayIcon, RecordIcon, ResetIcon, RewindIcon, SaveIcon,
    StepIcon, StopIcon, VolumeIcon,
} from './icons';

const SLOTS = [1, 2, 3, 4, 5];

interface DockProps {
    onTogglePlay: () => void;
    onStep: () => void;
    onReset: () => void;
    onRewind: (held: boolean) => void;
    onFastForward: (held: boolean) => void;
    onSelectSlot: (slot: number) => void;
    onSave: () => void;
    onLoad: () => void;
    onScreenshot: () => void;
    onToggleRecording: () => void;
    onToggleFullscreen: () => void;
    isFullscreen: boolean;
    fullscreenSupported: boolean;
}

/**
 * The transport bar.
 *
 * Replaces the old three-column control wall, which gave equal visual weight to
 * things used constantly (play/pause) and things used once a session (recording).
 * Here the primary action is the only large, filled control; everything else is
 * a quiet icon, grouped by frequency of use.
 */
export function Dock(props: DockProps) {
    const state = useEngineState();
    const settings = useSettings();

    const running = state.status === 'running';
    const hasRom = state.romId !== null;

    // Hold-to-act: pointer down starts, pointer up or leaving the button stops.
    const holdHandlers = (fn: (held: boolean) => void) => ({
        onPointerDown: () => fn(true),
        onPointerUp: () => fn(false),
        onPointerLeave: () => fn(false),
        onPointerCancel: () => fn(false),
    });

    return (
        <div className="dock" role="toolbar" aria-label="Emulator controls">
            <div className="dock-group">
                <IconButton
                    label={running ? 'Pause' : 'Play'}
                    shortcut="Space"
                    tone="primary"
                    large
                    disabled={!hasRom}
                    onClick={props.onTogglePlay}
                >
                    {running ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
                </IconButton>

                <IconButton
                    label="Advance one frame"
                    shortcut="N"
                    disabled={!hasRom || running}
                    onClick={props.onStep}
                >
                    <StepIcon />
                </IconButton>

                <IconButton label="Reset console" shortcut="R" disabled={!hasRom} onClick={props.onReset}>
                    <ResetIcon />
                </IconButton>
            </div>

            <span className="dock-divider" aria-hidden="true" />

            <div className="dock-group">
                <IconButton
                    label="Rewind (hold)"
                    shortcut="Backspace"
                    active={state.isRewinding}
                    disabled={!hasRom || !settings.rewindEnabled}
                    {...holdHandlers(props.onRewind)}
                >
                    <RewindIcon />
                </IconButton>

                <IconButton
                    label="Fast forward (hold)"
                    shortcut="Shift"
                    active={state.isFastForward}
                    disabled={!hasRom}
                    {...holdHandlers(props.onFastForward)}
                >
                    <FastForwardIcon />
                </IconButton>
            </div>

            <span className="dock-divider" aria-hidden="true" />

            <div className="dock-group">
                <div className="slot-row" role="radiogroup" aria-label="Save slot">
                    {SLOTS.map((slot) => {
                        const filled = state.occupiedSlots.includes(slot);
                        return (
                            <button
                                key={slot}
                                type="button"
                                role="radio"
                                aria-checked={state.currentSlot === slot}
                                // Occupancy is in the name, not just the dot —
                                // colour alone is not an accessible signal.
                                aria-label={`Slot ${slot}${filled ? ', has a save' : ', empty'}`}
                                className="slot"
                                data-current={state.currentSlot === slot ? 'true' : undefined}
                                data-filled={filled ? 'true' : undefined}
                                onClick={() => props.onSelectSlot(slot)}
                            >
                                {slot}
                            </button>
                        );
                    })}
                </div>

                <IconButton label="Save state" shortcut="F2" disabled={!hasRom} onClick={props.onSave}>
                    <SaveIcon />
                </IconButton>
                <IconButton label="Load state" shortcut="F4" disabled={!hasRom} onClick={props.onLoad}>
                    <LoadIcon />
                </IconButton>
            </div>

            <span className="dock-divider" aria-hidden="true" />

            <div className="dock-group">
                <IconButton label="Take screenshot" shortcut="P" disabled={!hasRom} onClick={props.onScreenshot}>
                    <CameraIcon />
                </IconButton>

                <IconButton
                    label={state.isRecording ? 'Stop recording' : 'Record video'}
                    shortcut="V"
                    tone={state.isRecording ? 'recording' : 'default'}
                    disabled={!hasRom}
                    onClick={props.onToggleRecording}
                >
                    {state.isRecording ? <StopIcon /> : <RecordIcon />}
                </IconButton>

                <IconButton
                    label={settings.muted ? 'Unmute' : 'Mute'}
                    shortcut="M"
                    active={settings.muted}
                    onClick={() => settingsStore.set({ muted: !settings.muted })}
                >
                    {settings.muted ? <MuteIcon /> : <VolumeIcon />}
                </IconButton>

                {props.fullscreenSupported && (
                    <IconButton
                        label={props.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        shortcut="F"
                        onClick={props.onToggleFullscreen}
                    >
                        {props.isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
                    </IconButton>
                )}
            </div>
        </div>
    );
}
