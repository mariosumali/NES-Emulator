import { useCallback, useEffect, useState } from 'react';

type FullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
};

/**
 * Fullscreen for a given element id.
 *
 * Safari still ships only the `webkit`-prefixed API, and iPhone Safari has no
 * element fullscreen at all — `requestFullscreen` is simply absent, so calling
 * it throws and leaves the button stuck. We feature-detect and report
 * availability so the UI can hide the control rather than offer a broken one.
 */
export function useFullscreen(targetId: string) {
    const [isFullscreen, setIsFullscreen] = useState(false);

    const getElement = useCallback(
        () => document.getElementById(targetId) as FullscreenElement | null,
        [targetId]
    );

    const isSupported = useCallback(() => {
        const el = getElement();
        if (!el) return false;
        return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
    }, [getElement]);

    useEffect(() => {
        const doc = document as FullscreenDocument;
        const sync = () => {
            const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
            setIsFullscreen(active !== null);
        };
        document.addEventListener('fullscreenchange', sync);
        document.addEventListener('webkitfullscreenchange', sync);
        return () => {
            document.removeEventListener('fullscreenchange', sync);
            document.removeEventListener('webkitfullscreenchange', sync);
        };
    }, []);

    const toggle = useCallback(async () => {
        const doc = document as FullscreenDocument;
        const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

        try {
            if (active) {
                await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
                return;
            }
            const el = getElement();
            if (!el) return;
            await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
        } catch {
            // Denied by the browser (not a user gesture, or iframe policy).
            // Nothing useful to do; the state listener keeps the UI honest.
        }
    }, [getElement]);

    return { isFullscreen, toggle, isSupported };
}
