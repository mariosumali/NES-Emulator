import { useEffect, useRef } from 'react';

/**
 * Hold a screen wake lock while the game is running.
 *
 * Without it the display dims and sleeps during any quiet stretch of gameplay —
 * a boss fight where you are mostly dodging registers as idle to the OS. The
 * lock is dropped automatically when the tab is hidden, so it has to be
 * re-acquired on the way back.
 */
export function useWakeLock(active: boolean): void {
    const sentinel = useRef<WakeLockSentinel | null>(null);

    useEffect(() => {
        if (!('wakeLock' in navigator)) return;

        let cancelled = false;

        const acquire = async () => {
            if (!active || document.hidden || sentinel.current) return;
            try {
                const lock = await navigator.wakeLock.request('screen');
                if (cancelled) {
                    void lock.release();
                    return;
                }
                sentinel.current = lock;
                lock.addEventListener('release', () => { sentinel.current = null; });
            } catch {
                // Denied (battery saver, no gesture) — not worth surfacing.
            }
        };

        const release = () => {
            void sentinel.current?.release().catch(() => { /* already gone */ });
            sentinel.current = null;
        };

        const onVisibility = () => {
            if (document.hidden) release();
            else void acquire();
        };

        if (active) void acquire();
        else release();

        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisibility);
            release();
        };
    }, [active]);
}
