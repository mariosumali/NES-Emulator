import { useState, useEffect } from 'react';
import { InputController } from '../emulator/InputController';
import { NES_BUTTONS } from '../emulator/NesCore';

interface SettingsProps {
    inputController: InputController | null;
    onClose: () => void;
}

const BUTTON_LABELS: Record<number, string> = {
    [NES_BUTTONS.A]: 'A Button',
    [NES_BUTTONS.B]: 'B Button',
    [NES_BUTTONS.SELECT]: 'Select',
    [NES_BUTTONS.START]: 'Start',
    [NES_BUTTONS.UP]: 'Up',
    [NES_BUTTONS.DOWN]: 'Down',
    [NES_BUTTONS.LEFT]: 'Left',
    [NES_BUTTONS.RIGHT]: 'Right',
};

// Order for display
const BUTTON_ORDER = [
    NES_BUTTONS.UP, NES_BUTTONS.DOWN, NES_BUTTONS.LEFT, NES_BUTTONS.RIGHT,
    NES_BUTTONS.SELECT, NES_BUTTONS.START, NES_BUTTONS.B, NES_BUTTONS.A
];

export const Settings = ({ inputController, onClose }: SettingsProps) => {
    const [activeTab, setActiveTab] = useState<'input' | 'appearance'>('input');
    const [bindings, setBindings] = useState<Map<string, number>>(new Map());
    const [listeningFor, setListeningFor] = useState<number | null>(null);
    const [bgColor, setBgColor] = useState('#121212');

    useEffect(() => {
        if (inputController) {
            setBindings(inputController.getKeyMap());
        }

        const savedBg = localStorage.getItem('nes_emulator_bg_color');
        if (savedBg) {
            setBgColor(savedBg);
            document.documentElement.style.setProperty('--bg-color', savedBg);
        }
    }, [inputController]);

    const handleBgChange = (color: string) => {
        setBgColor(color);
        document.documentElement.style.setProperty('--bg-color', color);
        localStorage.setItem('nes_emulator_bg_color', color);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (listeningFor !== null && inputController) {
            e.preventDefault();
            e.stopPropagation();

            const code = e.code;
            // Clear old bindings for this button to allow clean remapping 
            // (optional, user might want multiple keys, but single key is standard for "remap")
            inputController.clearButtonBindings(listeningFor);
            inputController.setKeyBinding(code, listeningFor);

            setBindings(inputController.getKeyMap());
            setListeningFor(null);
        }
    };

    useEffect(() => {
        if (listeningFor !== null) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [listeningFor, inputController]);

    const getKeysForButton = (btn: number) => {
        const keys: string[] = [];
        bindings.forEach((b, code) => {
            if (b === btn) keys.push(code);
        });
        return keys;
    };

    const THEMES = [
        { name: 'Dark', color: '#121212' },
        { name: 'Midnight', color: '#0f172a' },
        { name: 'Retro Gray', color: '#2c2c2c' },
        { name: 'Deep Purple', color: '#1a0b2e' },
        { name: 'Matrix', color: '#0d1117' },
    ];

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <div className="tabs">
                        <button
                            className={`tab-btn ${activeTab === 'input' ? 'active' : ''}`}
                            onClick={() => setActiveTab('input')}
                        >
                            Input
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
                            onClick={() => setActiveTab('appearance')}
                        >
                            Appearance
                        </button>
                    </div>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="settings-content">
                    {activeTab === 'input' ? (
                        <>
                            <p>Click a button to remap it. Press any key to bind.</p>

                            <div className="bindings-list">
                                {BUTTON_ORDER.map((btn) => (
                                    <div key={btn} className="binding-row">
                                        <span className="binding-label">{BUTTON_LABELS[btn]}</span>
                                        <div className="binding-keys">
                                            {getKeysForButton(btn).map((k) => (
                                                <span key={k} className="key-tag">{k}</span>
                                            ))}
                                        </div>
                                        <button
                                            className={`btn btn-small ${listeningFor === btn ? 'btn-active' : ''}`}
                                            onClick={() => setListeningFor(btn)}
                                        >
                                            {listeningFor === btn ? 'Press Key...' : 'Change'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="appearance-settings">
                            <h3>Background Color</h3>
                            <div className="theme-grid">
                                {THEMES.map(theme => (
                                    <button
                                        key={theme.name}
                                        className="theme-btn"
                                        style={{ backgroundColor: theme.color }}
                                        onClick={() => handleBgChange(theme.color)}
                                        title={theme.name}
                                    >
                                        {bgColor === theme.color && <span>✓</span>}
                                    </button>
                                ))}
                                <label className="theme-btn custom-picker" title="Custom Color">
                                    <input
                                        type="color"
                                        value={bgColor}
                                        onChange={(e) => handleBgChange(e.target.value)}
                                    />
                                    <span>+</span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
};
