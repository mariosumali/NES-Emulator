import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastKind } from '../emulator/EmulatorEngine';

export interface Toast {
    id: number;
    kind: ToastKind;
    message: string;
    detail?: string;
    leaving?: boolean;
}

const DEFAULT_TTL = 3200;
const MAX_VISIBLE = 4;

let nextId = 1;

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timers = useRef(new Map<number, number>());

    const dismiss = useCallback((id: number) => {
        // Mark leaving first so the exit animation can play, then remove.
        setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        window.setTimeout(() => {
            setToasts((current) => current.filter((t) => t.id !== id));
        }, 160);
        const timer = timers.current.get(id);
        if (timer !== undefined) {
            window.clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const push = useCallback(
        (kind: ToastKind, message: string, detail?: string, ttl = DEFAULT_TTL) => {
            const id = nextId++;
            setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, kind, message, detail }]);
            // Errors stay put until dismissed — they usually need reading.
            if (kind !== 'error') {
                timers.current.set(id, window.setTimeout(() => dismiss(id), ttl));
            }
            return id;
        },
        [dismiss]
    );

    useEffect(() => {
        const map = timers.current;
        return () => {
            for (const timer of map.values()) window.clearTimeout(timer);
            map.clear();
        };
    }, []);

    return { toasts, push, dismiss };
}
