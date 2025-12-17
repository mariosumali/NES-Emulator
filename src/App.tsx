import { useEffect, useRef, useState, useCallback } from 'react';
import { NesCore } from './emulator/NesCore';
import { AudioController } from './emulator/AudioController';
import { InputController } from './emulator/InputController';
import { Screen } from './components/Screen';
import { Controls } from './components/Controls';
import { Settings } from './components/Settings';
import './index.css';

function App() {
  const nesRef = useRef<NesCore | null>(null);
  const audioRef = useRef<AudioController | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const screenDrawRef = useRef<((buffer: number[]) => void) | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);

  const cheatsRef = useRef<{ address: number; value: number; enabled: boolean }[]>([]);
  const [cheats, setCheats] = useState<{ address: number; value: number; enabled: boolean }[]>([]);
  const [scale, setScale] = useState(2);
  const [isPlaying, setIsPlaying] = useState(false);
  const [romLoaded, setRomLoaded] = useState(false);

  // Sync cheats ref
  useEffect(() => {
    cheatsRef.current = cheats;
  }, [cheats]);

  // Load state from local storage on mount
  useEffect(() => {
    const savedScale = localStorage.getItem('nes_scale');
    if (savedScale) setScale(Number(savedScale));
  }, []);

  // Initialize Emulator System (once)
  useEffect(() => {
    const audio = new AudioController();
    audioRef.current = audio;

    const nes = new NesCore(
      (buffer: number[]) => {
        if (screenDrawRef.current) {
          screenDrawRef.current(buffer);
        }
      },
      (left: number, right: number) => {
        audio.writeSample(left, right);
      }
    );
    nesRef.current = nes;

    const input = new InputController(
      (p, b) => nes.buttonDown(p, b),
      (p, b) => nes.buttonUp(p, b)
    );
    inputRef.current = input;

    return () => {
      input.detach();
      audio.stop();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const runLoop = useCallback((timestamp: number) => {
    if (!isPlaying || !nesRef.current) return;

    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
    }

    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const cappedDelta = Math.min(deltaTime, 100);
    accumulatorRef.current += cappedDelta;

    const interval = 1000 / 60;

    while (accumulatorRef.current >= interval) {
      // Apply cheats
      cheatsRef.current.forEach(cheat => {
        if (cheat.enabled && nesRef.current) {
          nesRef.current.writeMem(cheat.address, cheat.value);
        }
      });

      nesRef.current.frame();
      accumulatorRef.current -= interval;
    }

    requestRef.current = requestAnimationFrame(runLoop);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      if (audioRef.current) audioRef.current.start();
      lastTimeRef.current = 0;
      accumulatorRef.current = 0;
      requestRef.current = requestAnimationFrame(runLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [isPlaying, runLoop]);

  const handleRomLoad = (data: string) => {
    if (nesRef.current) {
      nesRef.current.loadROM(data);
      setRomLoaded(true);
      setIsPlaying(true);
    }
  };

  const handleReset = () => {
    if (nesRef.current) {
      nesRef.current.reset();
    }
  };

  const handlePause = () => setIsPlaying(false);
  const handleResume = () => setIsPlaying(true);

  const handleStep = () => {
    if (nesRef.current) {
      // Apply cheats even on step? Maybe.
      cheatsRef.current.forEach(cheat => {
        if (cheat.enabled && nesRef.current) {
          nesRef.current.writeMem(cheat.address, cheat.value);
        }
      });
      nesRef.current.frame();
    }
  };

  const handleSaveState = () => {
    if (nesRef.current) {
      const state = nesRef.current.getState();
      localStorage.setItem('nes_state', JSON.stringify(state));
      alert("State Saved!");
    }
  };

  const handleLoadState = () => {
    if (nesRef.current) {
      const stateStr = localStorage.getItem('nes_state');
      if (stateStr) {
        const state = JSON.parse(stateStr);
        nesRef.current.loadState(state);
        // Ensure we don't auto-resume if we were paused, or do?
        // The state implementation might reset some internal counters.
      } else {
        alert("No saved state found.");
      }
    }
  };

  const [showSettings, setShowSettings] = useState(false);

  const handleScaleChange = (newScale: number) => {
    setScale(newScale);
    localStorage.setItem('nes_scale', String(newScale));
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>NES Emulator Web</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn btn-small" onClick={() => setShowSettings(true)}>Settings</button>
          <div className="status-badge">{romLoaded ? "ROM Loaded" : "No ROM"}</div>
        </div>
      </header>

      <main className="main-content">
        <Screen onRef={(draw) => { screenDrawRef.current = draw; }} scale={scale} />
        <Controls
          onRomLoad={handleRomLoad}
          onReset={handleReset}
          onPause={handlePause}
          onResume={handleResume}
          onStep={handleStep}
          onSaveState={handleSaveState}
          onLoadState={handleLoadState}
          isPlaying={isPlaying}
        />
      </main>

      {showSettings && (
        <Settings
          inputController={inputRef.current}
          onClose={() => setShowSettings(false)}
          scale={scale}
          onScaleChange={handleScaleChange}
          cheats={cheats}
          setCheats={setCheats}
        />
      )}
    </div>
  );
}

export default App;
