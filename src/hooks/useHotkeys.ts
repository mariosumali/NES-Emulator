import { useEffect, useRef } from 'react';

export interface AppAction {
    id: string;
    label: string;
    group: string;
    /** KeyboardEvent.code that triggers this action. */
    code?: string;
    shift?: boolean;
    /** Cmd on macOS, Ctrl elsewhere. */
    mod?: boolean;
    /** Fires on keydown AND keyup, with the held state. */
    hold?: boolean;
    /** Human-readable shortcut for tooltips and the shortcut sheet. */
    keys?: string[];
    run: (held?: boolean) => void;
    disabled?: boolean;
    /** Hide from the command palette (still keyboard-triggerable). */
    hidden?: boolean;
}

function isTextEntry(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
    );
}

/**
 * Global shortcuts.
 *
 * Deliberately does not bind Tab, Enter, or Space-on-a-button: the UI has to
 * stay keyboard-navigable while the game is running, so hotkeys avoid the keys
 * that browsers and assistive technology reserve for navigation. Space is bound
 * to play/pause but only when focus is not on a control that would consume it.
 */
export function useHotkeys(actions: AppAction[], enabled = true): void {
    const ref = useRef(actions);
    // Synced in an effect rather than during render: handlers are attached once
    // and read the latest actions at event time, which is always post-commit.
    useEffect(() => { ref.current = actions; });

    useEffect(() => {
        if (!enabled) return;

        const isMac = /mac|iphone|ipad/i.test(navigator.userAgent);
        const held = new Set<string>();

        const match = (e: KeyboardEvent) =>
            ref.current.find((action) => {
                if (!action.code || action.disabled) return false;
                if (action.code !== e.code) return false;
                if (!!action.shift !== e.shiftKey) return false;
                const modPressed = isMac ? e.metaKey : e.ctrlKey;
                if (!!action.mod !== modPressed) return false;
                // Never hijack a combination we did not ask for.
                if (!action.mod && (e.metaKey || e.ctrlKey || e.altKey)) return false;
                return true;
            });

        const onKeyDown = (e: KeyboardEvent) => {
            if (isTextEntry(e.target)) return;

            // Space and Enter belong to whatever button has focus.
            if ((e.code === 'Space' || e.code === 'Enter') && e.target instanceof HTMLElement) {
                const tag = e.target.tagName;
                if (tag === 'BUTTON' || tag === 'A' || e.target.getAttribute('role') === 'switch') return;
            }

            const action = match(e);
            if (!action) return;

            e.preventDefault();
            if (action.hold) {
                if (held.has(action.id)) return;
                held.add(action.id);
                action.run(true);
            } else {
                if (e.repeat) return;
                action.run();
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            for (const action of ref.current) {
                if (!action.hold || action.code !== e.code) continue;
                if (!held.delete(action.id)) continue;
                action.run(false);
            }
        };

        // Releasing on blur avoids a stuck fast-forward when the user alt-tabs
        // mid-hold.
        const releaseAll = () => {
            for (const id of held) {
                ref.current.find((a) => a.id === id)?.run(false);
            }
            held.clear();
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', releaseAll);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', releaseAll);
            releaseAll();
        };
    }, [enabled]);
}

/** Pretty-print a shortcut for display, using the platform's modifier glyph. */
export function formatShortcut(keys: string[] | undefined): string {
    if (!keys || keys.length === 0) return '';
    const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent);
    return keys.map((k) => (k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k)).join(' ');
}
