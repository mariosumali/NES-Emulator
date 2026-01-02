import { useEffect, useRef } from 'react';
import { NES_BUTTONS } from '../emulator/NesCore';

interface TouchControlsProps {
    onButtonDown: (player: 1 | 2, button: number) => void;
    onButtonUp: (player: 1 | 2, button: number) => void;
    visible: boolean;
}

export const TouchControls = ({ onButtonDown, onButtonUp, visible }: TouchControlsProps) => {
    const activeButtonsRef = useRef<Set<number>>(new Set());

    const handleTouchStart = (button: number) => (e: React.TouchEvent) => {
        e.preventDefault();
        if (!activeButtonsRef.current.has(button)) {
            activeButtonsRef.current.add(button);
            onButtonDown(1, button);
        }
    };

    const handleTouchEnd = (button: number) => (e: React.TouchEvent) => {
        e.preventDefault();
        if (activeButtonsRef.current.has(button)) {
            activeButtonsRef.current.delete(button);
            onButtonUp(1, button);
        }
    };

    // Clean up any stuck buttons when visibility changes
    useEffect(() => {
        if (!visible) {
            activeButtonsRef.current.forEach(button => {
                onButtonUp(1, button);
            });
            activeButtonsRef.current.clear();
        }
    }, [visible, onButtonUp]);

    if (!visible) return null;

    return (
        <div className="touch-controls">
            {/* D-Pad */}
            <div className="touch-dpad">
                <button
                    className="touch-btn dpad-up"
                    onTouchStart={handleTouchStart(NES_BUTTONS.UP)}
                    onTouchEnd={handleTouchEnd(NES_BUTTONS.UP)}
                    onTouchCancel={handleTouchEnd(NES_BUTTONS.UP)}
                >
                    ▲
                </button>
                <div className="dpad-middle-row">
                    <button
                        className="touch-btn dpad-left"
                        onTouchStart={handleTouchStart(NES_BUTTONS.LEFT)}
                        onTouchEnd={handleTouchEnd(NES_BUTTONS.LEFT)}
                        onTouchCancel={handleTouchEnd(NES_BUTTONS.LEFT)}
                    >
                        ◀
                    </button>
                    <div className="dpad-center"></div>
                    <button
                        className="touch-btn dpad-right"
                        onTouchStart={handleTouchStart(NES_BUTTONS.RIGHT)}
                        onTouchEnd={handleTouchEnd(NES_BUTTONS.RIGHT)}
                        onTouchCancel={handleTouchEnd(NES_BUTTONS.RIGHT)}
                    >
                        ▶
                    </button>
                </div>
                <button
                    className="touch-btn dpad-down"
                    onTouchStart={handleTouchStart(NES_BUTTONS.DOWN)}
                    onTouchEnd={handleTouchEnd(NES_BUTTONS.DOWN)}
                    onTouchCancel={handleTouchEnd(NES_BUTTONS.DOWN)}
                >
                    ▼
                </button>
            </div>

            {/* Center buttons (Select/Start) */}
            <div className="touch-center">
                <button
                    className="touch-btn touch-select"
                    onTouchStart={handleTouchStart(NES_BUTTONS.SELECT)}
                    onTouchEnd={handleTouchEnd(NES_BUTTONS.SELECT)}
                    onTouchCancel={handleTouchEnd(NES_BUTTONS.SELECT)}
                >
                    SELECT
                </button>
                <button
                    className="touch-btn touch-start"
                    onTouchStart={handleTouchStart(NES_BUTTONS.START)}
                    onTouchEnd={handleTouchEnd(NES_BUTTONS.START)}
                    onTouchCancel={handleTouchEnd(NES_BUTTONS.START)}
                >
                    START
                </button>
            </div>

            {/* A/B Buttons */}
            <div className="touch-ab">
                <button
                    className="touch-btn touch-b"
                    onTouchStart={handleTouchStart(NES_BUTTONS.B)}
                    onTouchEnd={handleTouchEnd(NES_BUTTONS.B)}
                    onTouchCancel={handleTouchEnd(NES_BUTTONS.B)}
                >
                    B
                </button>
                <button
                    className="touch-btn touch-a"
                    onTouchStart={handleTouchStart(NES_BUTTONS.A)}
                    onTouchEnd={handleTouchEnd(NES_BUTTONS.A)}
                    onTouchCancel={handleTouchEnd(NES_BUTTONS.A)}
                >
                    A
                </button>
            </div>
        </div>
    );
};
