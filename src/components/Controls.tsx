import React from 'react';

interface ControlsProps {
    onRomLoad: (data: string) => void;
    onReset: () => void;
    onPause: () => void;
    onResume: () => void;
    isPlaying: boolean;
}

export const Controls = ({ onRomLoad, onReset, onPause, onResume, isPlaying }: ControlsProps) => { // Removed isPlaying from props as it is not used in the UI for now

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
        <div className="controls">
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
                    <button className="btn" onClick={onResume}>Resume</button>
                )}
                <button className="btn btn-secondary" onClick={onReset}>Reset</button>
            </div>

        </div>
    );
};
