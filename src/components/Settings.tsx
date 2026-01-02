import { useState, useEffect } from 'react';
import { InputController } from '../emulator/InputController';
import { GamepadController } from '../emulator/GamepadController';
import { NES_BUTTONS } from '../emulator/NesCore';
import { decodeGameGenie, isValidGameGenieCode } from '../utils/gameGenie';

interface Cheat {
    address: number;
    value: number;
    enabled: boolean;
    label?: string; // For Game Genie codes
}

interface SettingsProps {
    inputController: InputController | null;
    gamepadController: GamepadController | null;
    onClose: () => void;
    scale: number;
    onScaleChange: (scale: number) => void;
    crtFilter: 'off' | 'scanlines' | 'crt';
    onCrtFilterChange: (filter: 'off' | 'scanlines' | 'crt') => void;
    cheats: Cheat[];
    setCheats: React.Dispatch<React.SetStateAction<Cheat[]>>;
    showTouchControls: boolean;
    onTouchControlsChange: (show: boolean) => void;
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

type TabType = 'input' | 'gamepad' | 'video' | 'appearance' | 'cheats';

export const Settings = ({
    inputController,
    gamepadController,
    onClose,
    scale,
    onScaleChange,
    crtFilter,
    onCrtFilterChange,
    cheats,
    setCheats,
    showTouchControls,
    onTouchControlsChange
}: SettingsProps) => {
    const [activeTab, setActiveTab] = useState<TabType>('input');
    const [activePlayer, setActivePlayer] = useState<1 | 2>(1);
    const [bindings, setBindings] = useState<Map<string, { player: 1 | 2; button: number }>>(new Map());
    const [listeningFor, setListeningFor] = useState<number | null>(null);
    const [bgColor, setBgColor] = useState('#121212');

    // Cheat inputs
    const [cheatAddr, setCheatAddr] = useState('');
    const [cheatVal, setCheatVal] = useState('');
    const [gameGenieCode, setGameGenieCode] = useState('');
    const [gameGenieError, setGameGenieError] = useState('');

    // Gamepad state
    const [connectedGamepads, setConnectedGamepads] = useState<Gamepad[]>([]);

    useEffect(() => {
        if (inputController) {
            setBindings(inputController.getKeyMap());
        }

        const savedBg = localStorage.getItem('nes_emulator_bg_color');
        if (savedBg) {
            setBgColor(savedBg);
            document.documentElement.style.setProperty('--bg-color', savedBg);
        }

        // Check for connected gamepads
        const checkGamepads = () => {
            if (gamepadController) {
                setConnectedGamepads(gamepadController.getConnectedGamepads());
            }
        };
        checkGamepads();
        const interval = setInterval(checkGamepads, 1000);
        return () => clearInterval(interval);
    }, [inputController, gamepadController]);

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
            inputController.clearButtonBindings(activePlayer, listeningFor);
            inputController.setKeyBinding(code, activePlayer, listeningFor);

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
    }, [listeningFor, inputController, activePlayer]);

    const getKeysForButton = (player: 1 | 2, btn: number) => {
        const keys: string[] = [];
        bindings.forEach((binding, code) => {
            if (binding.player === player && binding.button === btn) keys.push(code);
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

    const addGameGenieCode = () => {
        if (!isValidGameGenieCode(gameGenieCode)) {
            setGameGenieError('Invalid Game Genie code');
            return;
        }

        const decoded = decodeGameGenie(gameGenieCode);
        if (!decoded) {
            setGameGenieError('Failed to decode Game Genie code');
            return;
        }

        setCheats([...cheats, {
            address: decoded.address,
            value: decoded.value,
            enabled: true,
            label: gameGenieCode.toUpperCase()
        }]);
        setGameGenieCode('');
        setGameGenieError('');
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
            <div className="modal modal-wide">
                <div className="modal-header">
                    <div className="tabs">
                        <button className={`tab-btn ${activeTab === 'input' ? 'active' : ''}`} onClick={() => setActiveTab('input')}>Keyboard</button>
                        <button className={`tab-btn ${activeTab === 'gamepad' ? 'active' : ''}`} onClick={() => setActiveTab('gamepad')}>Gamepad</button>
                        <button className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>Video</button>
                        <button className={`tab-btn ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>Theme</button>
                        <button className={`tab-btn ${activeTab === 'cheats' ? 'active' : ''}`} onClick={() => setActiveTab('cheats')}>Cheats</button>
                    </div>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="settings-content">
                    {activeTab === 'input' ? (
                        <>
                            <div className="player-toggle">
                                <button
                                    className={`btn btn-small ${activePlayer === 1 ? 'btn-active' : ''}`}
                                    onClick={() => setActivePlayer(1)}
                                >
                                    Player 1
                                </button>
                                <button
                                    className={`btn btn-small ${activePlayer === 2 ? 'btn-active' : ''}`}
                                    onClick={() => setActivePlayer(2)}
                                >
                                    Player 2
                                </button>
                            </div>
                            <p>Click a button to remap it. Press any key to bind.</p>
                            <div className="bindings-list">
                                {BUTTON_ORDER.map((btn) => (
                                    <div key={btn} className="binding-row">
                                        <span className="binding-label">{BUTTON_LABELS[btn]}</span>
                                        <div className="binding-keys">
                                            {getKeysForButton(activePlayer, btn).map((k) => (
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
                    ) : activeTab === 'gamepad' ? (
                        <div className="gamepad-settings">
                            <h3>Connected Gamepads</h3>
                            {connectedGamepads.length === 0 ? (
                                <p className="text-secondary">No gamepads detected. Connect a controller and press any button.</p>
                            ) : (
                                <div className="gamepad-list">
                                    {connectedGamepads.map((gp, idx) => (
                                        <div key={gp.index} className="gamepad-item">
                                            <span className="gamepad-icon">🎮</span>
                                            <div>
                                                <div className="gamepad-name">{gp.id}</div>
                                                <div className="gamepad-player">Player {idx + 1}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="gamepad-info">
                                <h4>Default Mapping</h4>
                                <ul>
                                    <li><strong>D-Pad / Left Stick:</strong> Movement</li>
                                    <li><strong>A/Cross:</strong> B Button</li>
                                    <li><strong>B/Circle:</strong> A Button</li>
                                    <li><strong>Back/Share:</strong> Select</li>
                                    <li><strong>Start/Options:</strong> Start</li>
                                </ul>
                            </div>
                        </div>
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

                            <h3>Display Filter</h3>
                            <div className="filter-options">
                                <button
                                    className={`btn ${crtFilter === 'off' ? 'btn-active' : ''}`}
                                    onClick={() => onCrtFilterChange('off')}
                                >
                                    Sharp
                                </button>
                                <button
                                    className={`btn ${crtFilter === 'scanlines' ? 'btn-active' : ''}`}
                                    onClick={() => onCrtFilterChange('scanlines')}
                                >
                                    Scanlines
                                </button>
                                <button
                                    className={`btn ${crtFilter === 'crt' ? 'btn-active' : ''}`}
                                    onClick={() => onCrtFilterChange('crt')}
                                >
                                    CRT
                                </button>
                            </div>

                            <h3>Touch Controls</h3>
                            <label className="toggle-row">
                                <span>Show on-screen controls</span>
                                <input
                                    type="checkbox"
                                    checked={showTouchControls}
                                    onChange={(e) => onTouchControlsChange(e.target.checked)}
                                />
                            </label>
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
                            <h3>Game Genie Codes</h3>
                            <div className="cheat-input-row">
                                <input
                                    type="text"
                                    placeholder="e.g., SXIOPO"
                                    value={gameGenieCode}
                                    onChange={e => {
                                        setGameGenieCode(e.target.value);
                                        setGameGenieError('');
                                    }}
                                    className="input-medium"
                                    maxLength={8}
                                />
                                <button className="btn btn-small" onClick={addGameGenieCode}>Add</button>
                            </div>
                            {gameGenieError && <p className="error-text">{gameGenieError}</p>}

                            <h3>Raw Cheats</h3>
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

                            <h3>Active Cheats</h3>
                            <div className="cheats-list">
                                {cheats.map((c, i) => (
                                    <div key={i} className="cheat-row">
                                        <span>
                                            {c.label ? (
                                                <>{c.label} → </>
                                            ) : null}
                                            0x{c.address.toString(16).toUpperCase().padStart(4, '0')} : 0x{c.value.toString(16).toUpperCase().padStart(2, '0')}
                                        </span>
                                        <input type="checkbox" checked={c.enabled} onChange={() => toggleCheat(i)} />
                                        <button className="btn btn-small btn-danger" onClick={() => removeCheat(i)}>X</button>
                                    </div>
                                ))}
                                {cheats.length === 0 && <p className="text-secondary">No cheats added.</p>}
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
