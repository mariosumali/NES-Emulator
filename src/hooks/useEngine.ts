import { createContext, useContext, useSyncExternalStore } from 'react';
import type { EmulatorEngine, EngineSnapshot } from '../emulator/EmulatorEngine';

export const EngineContext = createContext<EmulatorEngine | null>(null);

export function useEngine(): EmulatorEngine {
    const engine = useContext(EngineContext);
    if (!engine) throw new Error('useEngine must be used inside <EngineContext.Provider>.');
    return engine;
}

/**
 * Subscribe to the engine's published snapshot.
 *
 * The run loop never calls this — it publishes on discrete events and on a 4Hz
 * timer — so the React tree does not re-render at 60Hz.
 */
export function useEngineState(): EngineSnapshot {
    const engine = useEngine();
    return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}
