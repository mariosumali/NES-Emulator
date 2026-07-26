import { useEffect, useMemo, useRef, useState } from 'react';
import { formatShortcut, type AppAction } from '../hooks/useHotkeys';
import { Kbd } from './ui';

/**
 * Command palette.
 *
 * Every action in the app is reachable by name, which matters here more than in
 * most apps: the emulator claims a lot of keys for gameplay, so the shortcut
 * space is small and discoverability has to come from somewhere else.
 */
export function CommandPalette({ actions, onClose }: { actions: AppAction[]; onClose: () => void }) {
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const restoreTo = useRef<HTMLElement | null>(null);

    useEffect(() => {
        restoreTo.current = document.activeElement as HTMLElement | null;
        inputRef.current?.focus();
        return () => restoreTo.current?.focus?.();
    }, []);

    const results = useMemo(() => {
        const available = actions.filter((a) => !a.hidden && !a.disabled);
        const q = query.trim().toLowerCase();
        if (!q) return available;
        // Subsequence match, so "sst" finds "Save state".
        return available.filter((action) => {
            const haystack = `${action.group} ${action.label}`.toLowerCase();
            let i = 0;
            for (const char of q) {
                i = haystack.indexOf(char, i);
                if (i === -1) return false;
                i++;
            }
            return true;
        });
    }, [actions, query]);

    // Keep the highlighted row in view when arrowing past the fold.
    useEffect(() => {
        listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' });
    }, [index]);

    const run = (action: AppAction) => {
        onClose();
        // Defer so the palette is gone before the action's own UI appears.
        window.setTimeout(() => action.run(), 0);
    };

    return (
        <div className="palette-wrap" onClick={onClose}>
            <div
                className="palette"
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                onClick={(e) => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    className="palette-input"
                    type="text"
                    placeholder="Type a command…"
                    aria-label="Search commands"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="palette-results"
                    aria-activedescendant={results[index] ? `palette-item-${results[index].id}` : undefined}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setIndex((i) => Math.min(i + 1, results.length - 1));
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setIndex((i) => Math.max(i - 1, 0));
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (results[index]) run(results[index]);
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            onClose();
                        }
                    }}
                />

                <div className="palette-list" id="palette-results" role="listbox" ref={listRef}>
                    {results.length === 0 ? (
                        <p className="palette-empty">No matching commands.</p>
                    ) : (
                        results.map((action, i) => (
                            <button
                                key={action.id}
                                id={`palette-item-${action.id}`}
                                type="button"
                                role="option"
                                aria-selected={i === index}
                                className="palette-item"
                                data-active={i === index ? 'true' : undefined}
                                onMouseEnter={() => setIndex(i)}
                                onClick={() => run(action)}
                            >
                                <span className="palette-item-group">{action.group}</span>
                                <span className="palette-item-label">{action.label}</span>
                                {action.keys && <Kbd>{formatShortcut(action.keys)}</Kbd>}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

/** A printed reference for everything the keyboard can do. */
export function ShortcutsPanel({ actions, onClose }: { actions: AppAction[]; onClose: () => void }) {
    const groups = useMemo(() => {
        const map = new Map<string, AppAction[]>();
        for (const action of actions) {
            if (!action.keys) continue;
            const list = map.get(action.group) ?? [];
            list.push(action);
            map.set(action.group, list);
        }
        return [...map.entries()];
    }, [actions]);

    return (
        <div className="palette-wrap" onClick={onClose}>
            <div
                className="palette"
                style={{ maxBlockSize: 'min(78vh, 620px)', inlineSize: 'min(640px, 100%)' }}
                role="dialog"
                aria-modal="true"
                aria-label="Keyboard shortcuts"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="panel-header">
                    <h2 className="panel-title">Keyboard shortcuts</h2>
                    <button type="button" className="btn" data-size="sm" onClick={onClose}>Close</button>
                </div>
                <div className="panel-body">
                    <div className="shortcut-grid">
                        {groups.map(([group, items]) => (
                            <div key={group}>
                                <h3 className="section-title" style={{ marginBlockEnd: 'var(--sp-2)' }}>{group}</h3>
                                <div className="shortcut-list">
                                    {items.map((action) => (
                                        <div className="shortcut-item" key={action.id}>
                                            <span>{action.label}</span>
                                            <Kbd>{formatShortcut(action.keys)}</Kbd>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="section-hint" style={{ marginBlockStart: 'var(--sp-6)' }}>
                        Game controls are remappable under Settings › Keyboard. Shortcuts are ignored while
                        you are typing in a field.
                    </p>
                </div>
            </div>
        </div>
    );
}
