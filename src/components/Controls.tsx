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

    return (
        <div className="controls-panel">
            {/* Main Actions Row */}
            <div className="controls-row controls-main">
                <label className="btn btn-primary btn-load">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Load ROM
                    <input type="file" accept=".nes" onChange={handleFileChange} hidden />
                </label>

                <div className="btn-group">
                    {isPlaying ? (
                        <button className="btn btn-icon" onClick={onPause} title="Pause">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        </button>
                    ) : (
                        <button className="btn btn-icon btn-play" onClick={onResume} title="Play">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5,3 19,12 5,21" />
                            </svg>
                        </button>
                    )}
                    <button className="btn btn-icon" onClick={onStep} title="Step Frame" disabled={isPlaying}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="4,3 14,12 4,21" />
                            <rect x="16" y="4" width="3" height="16" rx="1" />
                        </svg>
                    </button>
                    <button className="btn btn-icon" onClick={onReset} title="Reset">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                        </svg>
                    </button>
                </div>

                <button
                    className="btn btn-icon"
                    onClick={onFullscreen}
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                    {isFullscreen ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Bottom Controls */}
            <div className="controls-bottom">
                {/* Speed Section */}
                <div className="control-section">
                    <span className="section-label">Speed</span>
                    <div className="speed-buttons">
                        {[0.5, 1, 2, 4].map(speed => (
                            <button
                                key={speed}
                                className={`btn btn-speed ${speedMultiplier === speed ? 'active' : ''}`}
                                onClick={() => onSpeedChange(speed)}
                            >
                                {speed}x
                            </button>
                        ))}
                    </div>
                </div>

                {/* Save States Section */}
                <div className="control-section">
                    <span className="section-label">Save Slot</span>
                    <div className="save-controls">
                        <div className="slot-buttons">
                            {[1, 2, 3, 4, 5].map(slot => (
                                <button
                                    key={slot}
                                    className={`btn btn-slot ${currentSlot === slot ? 'active' : ''} ${savedSlots[slot - 1] ? 'has-data' : ''}`}
                                    onClick={() => onSlotChange(slot)}
                                    title={savedSlots[slot - 1] ? `Slot ${slot} (has save)` : `Slot ${slot} (empty)`}
                                >
                                    {slot}
                                </button>
                            ))}
                        </div>
                        <div className="save-actions">
                            <button className="btn btn-save" onClick={onSaveState}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                    <polyline points="17 21 17 13 7 13 7 21" />
                                    <polyline points="7 3 7 8 15 8" />
                                </svg>
                                Save
                            </button>
                            <button className="btn btn-load-state" onClick={onLoadState}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Load
                            </button>
                        </div>
                    </div>
                </div>

                {/* Media Section */}
                <div className="control-section">
                    <span className="section-label">Capture</span>
                    <div className="media-buttons">
                        <button className="btn btn-media" onClick={onScreenshot} title="Take Screenshot">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                        </button>
                        <button
                            className={`btn btn-media ${isRecording ? 'recording' : ''}`}
                            onClick={onRecordToggle}
                            title={isRecording ? 'Stop Recording' : 'Start Recording'}
                        >
                            {isRecording ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="6" y="6" width="12" height="12" rx="2" />
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <circle cx="12" cy="12" r="4" fill="currentColor" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
