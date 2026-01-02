import { useEffect, useRef, useState, useCallback } from 'react';
import { NesCore } from './emulator/NesCore';
import { AudioController } from './emulator/AudioController';
import { InputController } from './emulator/InputController';
import { GamepadController } from './emulator/GamepadController';
import { RecordingController } from './emulator/RecordingController';
import { Screen, type ScreenHandle } from './components/Screen';
import { Controls } from './components/Controls';
import { Settings } from './components/Settings';
import { TouchControls } from './components/TouchControls';
import './index.css';

const REWIND_BUFFER_SIZE = 600; // 10 seconds at 60fps
const SAVE_SLOTS = 5;

function App() {
  const nesRef = useRef<NesCore | null>(null);
  const audioRef = useRef<AudioController | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const gamepadRef = useRef<GamepadController | null>(null);
  const recordingRef = useRef<RecordingController | null>(null);
  const screenRef = useRef<ScreenHandle>(null);
  const screenDrawRef = useRef<((buffer: number[]) => void) | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);

  // Rewind buffer
  const rewindBufferRef = useRef<any[]>([]);
  const [canRewind, setCanRewind] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);

  // Cheats
  const cheatsRef = useRef<{ address: number; value: number; enabled: boolean }[]>([]);
  const [cheats, setCheats] = useState<{ address: number; value: number; enabled: boolean }[]>([]);

  // Display
  const [scale, setScale] = useState(2);
  const [crtFilter, setCrtFilter] = useState<'off' | 'scanlines' | 'crt'>('off');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [romLoaded, setRomLoaded] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);

  // Save slots
  const [currentSlot, setCurrentSlot] = useState(1);
  const [savedSlots, setSavedSlots] = useState<boolean[]>(new Array(SAVE_SLOTS).fill(false));

  // Recording
  const [isRecording, setIsRecording] = useState(false);

  // Touch controls
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  // Sync cheats ref
  useEffect(() => {
    cheatsRef.current = cheats;
  }, [cheats]);

  // Detect touch device
  useEffect(() => {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(isTouch);
    setShowTouchControls(isTouch);
  }, []);

  // Check saved slots on mount
  useEffect(() => {
    const slots = [];
    for (let i = 1; i <= SAVE_SLOTS; i++) {
      slots.push(localStorage.getItem(`nes_state_${i}`) !== null);
    }
    setSavedSlots(slots);
  }, []);

  // Load settings from local storage on mount
  useEffect(() => {
    const savedScale = localStorage.getItem('nes_scale');
    if (savedScale) setScale(Number(savedScale));

    const savedCrtFilter = localStorage.getItem('nes_crt_filter');
    if (savedCrtFilter) setCrtFilter(savedCrtFilter as 'off' | 'scanlines' | 'crt');
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

    const gamepad = new GamepadController(
      (p, b) => nes.buttonDown(p, b),
      (p, b) => nes.buttonUp(p, b)
    );
    gamepadRef.current = gamepad;

    recordingRef.current = new RecordingController();

    return () => {
      input.detach();
      gamepad.detach();
      audio.stop();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const runLoop = useCallback((timestamp: number) => {
    if (!nesRef.current) return;

    // Handle rewind
    if (isRewinding) {
      if (rewindBufferRef.current.length > 0) {
        const state = rewindBufferRef.current.pop();
        nesRef.current.loadState(state);
        setCanRewind(rewindBufferRef.current.length > 0);
      }
      requestRef.current = requestAnimationFrame(runLoop);
      return;
    }

    if (!isPlaying) return;

    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
    }

    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const cappedDelta = Math.min(deltaTime, 100);
    accumulatorRef.current += cappedDelta * speedMultiplier;

    const interval = 1000 / 60;
    let framesThisTick = 0;
    const maxFramesPerTick = speedMultiplier <= 1 ? 1 : Math.ceil(speedMultiplier * 2);

    while (accumulatorRef.current >= interval && framesThisTick < maxFramesPerTick) {
      // Apply cheats
      cheatsRef.current.forEach(cheat => {
        if (cheat.enabled && nesRef.current) {
          nesRef.current.writeMem(cheat.address, cheat.value);
        }
      });

      nesRef.current.frame();
      accumulatorRef.current -= interval;
      framesThisTick++;

      // Save state to rewind buffer (every frame at normal speed, less often when fast)
      if (speedMultiplier <= 1 || framesThisTick === 1) {
        const state = nesRef.current.getState();
        rewindBufferRef.current.push(state);
        if (rewindBufferRef.current.length > REWIND_BUFFER_SIZE) {
          rewindBufferRef.current.shift();
        }
        setCanRewind(true);
      }
    }

    // Cap accumulator to prevent spiral of death
    if (accumulatorRef.current > interval * 10) {
      accumulatorRef.current = 0;
    }

    requestRef.current = requestAnimationFrame(runLoop);
  }, [isPlaying, isRewinding, speedMultiplier]);

  useEffect(() => {
    if (isPlaying || isRewinding) {
      if (audioRef.current && !isRewinding) audioRef.current.start();
      lastTimeRef.current = 0;
      accumulatorRef.current = 0;
      requestRef.current = requestAnimationFrame(runLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [isPlaying, isRewinding, runLoop]);

  const handleRomLoad = (data: string) => {
    if (nesRef.current) {
      nesRef.current.loadROM(data);
      setRomLoaded(true);
      setIsPlaying(true);
      rewindBufferRef.current = [];
      setCanRewind(false);
    }
  };

  const handleReset = () => {
    if (nesRef.current) {
      nesRef.current.reset();
      rewindBufferRef.current = [];
      setCanRewind(false);
    }
  };

  const handlePause = () => setIsPlaying(false);
  const handleResume = () => setIsPlaying(true);

  const handleStep = () => {
    if (nesRef.current) {
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
      localStorage.setItem(`nes_state_${currentSlot}`, JSON.stringify(state));
      const newSavedSlots = [...savedSlots];
      newSavedSlots[currentSlot - 1] = true;
      setSavedSlots(newSavedSlots);
      // Visual feedback
      const btn = document.activeElement as HTMLButtonElement;
      if (btn) {
        btn.classList.add('save-flash');
        setTimeout(() => btn.classList.remove('save-flash'), 300);
      }
    }
  };

  const handleLoadState = () => {
    if (nesRef.current) {
      const stateStr = localStorage.getItem(`nes_state_${currentSlot}`);
      if (stateStr) {
        const state = JSON.parse(stateStr);
        nesRef.current.loadState(state);
        rewindBufferRef.current = [];
        setCanRewind(false);
      } else {
        alert(`No saved state in slot ${currentSlot}.`);
      }
    }
  };

  const handleScaleChange = (newScale: number) => {
    setScale(newScale);
    localStorage.setItem('nes_scale', String(newScale));
  };

  const handleCrtFilterChange = (filter: 'off' | 'scanlines' | 'crt') => {
    setCrtFilter(filter);
    localStorage.setItem('nes_crt_filter', filter);
  };

  const handleSpeedChange = (speed: number) => {
    setSpeedMultiplier(speed);
  };

  const handleRewindStart = () => {
    if (canRewind) {
      setIsRewinding(true);
      setIsPlaying(false);
    }
  };

  const handleRewindStop = () => {
    setIsRewinding(false);
  };

  const handleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleScreenshot = () => {
    const canvas = screenRef.current?.getCanvas();
    if (canvas) {
      RecordingController.downloadScreenshot(canvas, `nes_screenshot_${Date.now()}.png`);
    }
  };

  const handleRecordToggle = async () => {
    if (!recordingRef.current) return;

    if (isRecording) {
      const blob = await recordingRef.current.stopRecording();
      if (blob) {
        RecordingController.downloadBlob(blob, `nes_recording_${Date.now()}.webm`);
      }
      setIsRecording(false);
    } else {
      const canvas = screenRef.current?.getCanvas();
      if (canvas) {
        const started = recordingRef.current.startRecording(canvas);
        setIsRecording(started);
      }
    }
  };

  const handleTouchButtonDown = (player: 1 | 2, button: number) => {
    nesRef.current?.buttonDown(player, button);
  };

  const handleTouchButtonUp = (player: 1 | 2, button: number) => {
    nesRef.current?.buttonUp(player, button);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>NES Emulator Web</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn btn-small" onClick={() => setShowSettings(true)}>Settings</button>
          <div className="status-badge">{romLoaded ? "ROM Loaded" : "No ROM"}</div>
          {isRecording && <div className="status-badge recording">● REC</div>}
        </div>
      </header>

      <main className="main-content">
        <Screen
          ref={screenRef}
          onRef={(draw) => { screenDrawRef.current = draw; }}
          scale={scale}
          crtFilter={crtFilter}
          isFullscreen={isFullscreen}
          onFullscreenChange={setIsFullscreen}
        />
        <Controls
          onRomLoad={handleRomLoad}
          onReset={handleReset}
          onPause={handlePause}
          onResume={handleResume}
          onStep={handleStep}
          onSaveState={handleSaveState}
          onLoadState={handleLoadState}
          isPlaying={isPlaying}
          currentSlot={currentSlot}
          onSlotChange={setCurrentSlot}
          savedSlots={savedSlots}
          speedMultiplier={speedMultiplier}
          onSpeedChange={handleSpeedChange}
          isRewinding={isRewinding}
          onRewindStart={handleRewindStart}
          onRewindStop={handleRewindStop}
          canRewind={canRewind}
          onFullscreen={handleFullscreen}
          isFullscreen={isFullscreen}
          onScreenshot={handleScreenshot}
          isRecording={isRecording}
          onRecordToggle={handleRecordToggle}
        />
      </main>

      <TouchControls
        onButtonDown={handleTouchButtonDown}
        onButtonUp={handleTouchButtonUp}
        visible={showTouchControls && isTouchDevice}
      />

      {showSettings && (
        <Settings
          inputController={inputRef.current}
          gamepadController={gamepadRef.current}
          onClose={() => setShowSettings(false)}
          scale={scale}
          onScaleChange={handleScaleChange}
          crtFilter={crtFilter}
          onCrtFilterChange={handleCrtFilterChange}
          cheats={cheats}
          setCheats={setCheats}
          showTouchControls={showTouchControls}
          onTouchControlsChange={setShowTouchControls}
        />
      )}
    </div>
  );
}

export default App;
