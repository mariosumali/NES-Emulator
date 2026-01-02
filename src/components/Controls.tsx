import React from 'react';

interface ControlsProps {
    onRomLoad: (data: string) => void;
    onReset: () => void;
    onPause: () => void;
    onResume: () => void;
    onStep: () => void;
    onSaveState: () => void;
    onLoadState: () => void;
    isPlaying: boolean;
    currentSlot: number;
    onSlotChange: (slot: number) => void;
    savedSlots: boolean[];
    speedMultiplier: number;
    onSpeedChange: (speed: number) => void;
    onFullscreen: () => void;
    isFullscreen: boolean;
    onScreenshot: () => void;
    isRecording: boolean;
    onRecordToggle: () => void;
}

export const Controls = ({
    onRomLoad,
    onReset,
    onPause,
    onResume,
    onStep,
    onSaveState,
    onLoadState,
    isPlaying,
    currentSlot,
    onSlotChange,
    savedSlots,
    speedMultiplier,
    onSpeedChange,
    onFullscreen,
    isFullscreen,
    onScreenshot,
    isRecording,
    onRecordToggle
}: ControlsProps) => {

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const result = evt.target?.result;
            if (typeof result === 'string') {
                onRomLoad(result);
            }
        };
        reader.readAsBinaryString(file);
    };

    const getSpeedLabel = (speed: number) => {
        if (speed < 1) return `${speed}x`;
        if (speed > 1) return `${speed}x`;
        return '1x';
    };

    return (
        <div className="controls">
            {/* ROM and Playback */}
            <div className="control-group">
                <label className="file-upload btn">
                    Load ROM
                    <input type="file" accept=".nes" onChange={handleFileChange} hidden />
                </label>
            </div>

            <div className="control-group">
                {isPlaying ? (
                    <button className="btn" onClick={onPause}>Pause</button>
                ) : (
                    <>
                        <button className="btn" onClick={onResume}>Resume</button>
                        <button className="btn" onClick={onStep}>Step</button>
                    </>
                )}
                <button className="btn btn-secondary" onClick={onReset}>Reset</button>
            </div>

            {/* Speed Controls */}
            <div className="control-group">
                <button
                    className={`btn btn-small ${speedMultiplier === 0.5 ? 'btn-active' : ''}`}
                    onClick={() => onSpeedChange(speedMultiplier === 0.5 ? 1 : 0.5)}
                    title="Slow Motion (0.5x)"
                >
                    0.5x
                </button>
                <button
                    className={`btn btn-small ${speedMultiplier === 2 ? 'btn-active' : ''}`}
                    onClick={() => onSpeedChange(speedMultiplier === 2 ? 1 : 2)}
                    title="Fast Forward (2x)"
                >
                    2x
                </button>
                <button
                    className={`btn btn-small ${speedMultiplier === 4 ? 'btn-active' : ''}`}
                    onClick={() => onSpeedChange(speedMultiplier === 4 ? 1 : 4)}
                    title="Turbo (4x)"
                >
                    4x
                </button>
                {speedMultiplier !== 1 && (
                    <span className="speed-indicator">{getSpeedLabel(speedMultiplier)}</span>
                )}
            </div>

            {/* Save States with Slots */}
            <div className="control-group save-group">
                <div className="slot-selector">
                    {[1, 2, 3, 4, 5].map(slot => (
                        <button
                            key={slot}
                            className={`btn btn-slot ${currentSlot === slot ? 'btn-active' : ''} ${savedSlots[slot - 1] ? 'has-save' : ''}`}
                            onClick={() => onSlotChange(slot)}
                            title={savedSlots[slot - 1] ? `Slot ${slot} (saved)` : `Slot ${slot} (empty)`}
                        >
                            {slot}
                        </button>
                    ))}
                </div>
                <button className="btn btn-small" onClick={onSaveState}>Save</button>
                <button className="btn btn-small" onClick={onLoadState}>Load</button>
            </div>

            {/* Media Controls */}
            <div className="control-group">
                <button
                    className="btn btn-small"
                    onClick={onScreenshot}
                    title="Screenshot"
                >
                    Screenshot
                </button>
                <button
                    className={`btn btn-small ${isRecording ? 'btn-recording' : ''}`}
                    onClick={onRecordToggle}
                    title={isRecording ? 'Stop Recording' : 'Start Recording'}
                >
                    {isRecording ? 'Stop Rec' : 'Record'}
                </button>
                <button
                    className="btn btn-small"
                    onClick={onFullscreen}
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                    Fullscreen
                </button>
            </div>

        </div>
    );
};
