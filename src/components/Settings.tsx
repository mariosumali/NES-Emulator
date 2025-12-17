import { useState, useEffect } from 'react';
import { InputController } from '../emulator/InputController';
import { NES_BUTTONS } from '../emulator/NesCore';

interface Cheat {
    address: number;
    value: number;
    enabled: boolean;
}

interface SettingsProps {
    inputController: InputController | null;
    onClose: () => void;
    scale: number;
    onScaleChange: (scale: number) => void;
    cheats: Cheat[];
    setCheats: React.Dispatch<React.SetStateAction<Cheat[]>>;
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

const THEMES = [
    { name: 'Dark', color: '#121212' },
    { name: 'Midnight', color: '#0f172a' },
    { name: 'Retro Gray', color: '#2c2c2c' },
    { name: 'Deep Purple', color: '#1a0b2e' },
    { name: 'Matrix', color: '#0d1117' },
];

export const Settings = ({ inputController, onClose, scale, onScaleChange, cheats, setCheats }: SettingsProps) => {
    const [activeTab, setActiveTab] = useState<'input' | 'video' | 'appearance' | 'cheats'>('input');
    const [bindings, setBindings] = useState<Map<string, number>>(new Map());
    const [listeningFor, setListeningFor] = useState<number | null>(null);
    const [bgColor, setBgColor] = useState('#121212');

    // Cheat inputs
    const [cheatAddr, setCheatAddr] = useState('');
    const [cheatVal, setCheatVal] = useState('');

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

    const addCheat = () => {
        const addr = parseInt(cheatAddr, 16);
        const val = parseInt(cheatVal, 16);
        if (!isNaN(addr) && !isNaN(val)) {
            setCheats([...cheats, { address: addr, value: val, enabled: true }]);
            setCheatAddr('');
            setCheatVal('');
        }
    };

    const toggleCheat = (index: number) => {
        const newCheats = [...cheats];
        newCheats[index].enabled = !newCheats[index].enabled;
        setCheats(newCheats);
    };

    const removeCheat = (index: number) => {
        const newCheats = [...cheats];
        newCheats.splice(index, 1);
        setCheats(newCheats);
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <div className="tabs">
                        <button className={`tab-btn ${activeTab === 'input' ? 'active' : ''}`} onClick={() => setActiveTab('input')}>Input</button>
                        <button className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>Video</button>
                        <button className={`tab-btn ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>Appearance</button>
                        <button className={`tab-btn ${activeTab === 'cheats' ? 'active' : ''}`} onClick={() => setActiveTab('cheats')}>Cheats</button>
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
                                        <button className={`btn btn-small ${listeningFor === btn ? 'btn-active' : ''}`} onClick={() => setListeningFor(btn)}>
                                            {listeningFor === btn ? 'Press Key...' : 'Change'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : activeTab === 'video' ? (
                        <div className="video-settings">
                            <h3>Screen Size</h3>
                            <div className="scale-options">
                                {[1, 1.5, 2, 2.5, 3].map(s => (
                                    <button
                                        key={s}
                                        className={`btn ${scale === s ? 'btn-active' : ''}`}
                                        onClick={() => onScaleChange(s)}
                                    >
                                        {s}x
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : activeTab === 'appearance' ? (
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
                    ) : (
                        <div className="cheats-settings">
                            <h3>Cheats</h3>
                            <div className="cheat-input-row">
                                <input
                                    type="text"
                                    placeholder="Addr (Hex)"
                                    value={cheatAddr}
                                    onChange={e => setCheatAddr(e.target.value)}
                                    className="input-small"
                                />
                                <input
                                    type="text"
                                    placeholder="Val (Hex)"
                                    value={cheatVal}
                                    onChange={e => setCheatVal(e.target.value)}
                                    className="input-small"
                                />
                                <button className="btn btn-small" onClick={addCheat}>Add</button>
                            </div>
                            <div className="cheats-list">
                                {cheats.map((c, i) => (
                                    <div key={i} className="cheat-row">
                                        <span>0x{c.address.toString(16).toUpperCase().padStart(4, '0')} : 0x{c.value.toString(16).toUpperCase().padStart(2, '0')}</span>
                                        <input type="checkbox" checked={c.enabled} onChange={() => toggleCheat(i)} />
                                        <button className="btn btn-small btn-danger" onClick={() => removeCheat(i)}>X</button>
                                    </div>
                                ))}
                                {cheats.length === 0 && <p>No cheats added.</p>}
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
