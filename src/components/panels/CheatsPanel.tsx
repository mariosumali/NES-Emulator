import { useEffect, useRef, useState } from 'react';
import type { Cheat } from '../../emulator/NesCore';
import { useEngine, useEngineState } from '../../hooks/useEngine';
import { decodeGameGenie, isValidGameGenieCode, normalizeCode, parseRawCheat } from '../../utils/gameGenie';
import { Button, EmptyNote, IconButton, Panel, Section, Switch } from '../ui';
import { TrashIcon, SearchIcon } from '../icons';

const hex = (n: number, digits: number) => n.toString(16).toUpperCase().padStart(digits, '0');

type ScanOp = 'eq' | 'lt' | 'gt' | 'neq' | 'same';

interface CheatsPanelProps {
    onClose: () => void;
    cheats: Cheat[];
    setCheats: (next: Cheat[]) => void;
}

export function CheatsPanel({ onClose, cheats, setCheats }: CheatsPanelProps) {
    const state = useEngineState();
    const [tab, setTab] = useState<'list' | 'search'>('list');

    return (
        <Panel title="Cheats" onClose={onClose}>
            <div className="panel-nav" role="tablist" aria-label="Cheat sections">
                <button
                    type="button" role="tab" className="panel-nav-btn"
                    aria-selected={tab === 'list'} onClick={() => setTab('list')}
                >
                    Codes
                </button>
                <button
                    type="button" role="tab" className="panel-nav-btn"
                    aria-selected={tab === 'search'} onClick={() => setTab('search')}
                >
                    Find values
                </button>
            </div>

            <div className="panel-body">
                {!state.romId && <EmptyNote>Load a game to use cheats.</EmptyNote>}
                {state.romId && tab === 'list' && <CheatList cheats={cheats} setCheats={setCheats} />}
                {state.romId && tab === 'search' && <CheatSearch cheats={cheats} setCheats={setCheats} />}
            </div>
        </Panel>
    );
}

/* ----------------------------------------------------------------- List --- */

function CheatList({ cheats, setCheats }: { cheats: Cheat[]; setCheats: (n: Cheat[]) => void }) {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    const add = () => {
        const trimmed = code.trim();
        if (!trimmed) return;

        // Accept both Game Genie letters and the raw AAAA:VV / AAAA?CC:VV form.
        const decoded = isValidGameGenieCode(trimmed)
            ? decodeGameGenie(trimmed)
            : parseRawCheat(trimmed);

        if (!decoded) {
            setError('Not a valid Game Genie code or AAAA:VV address pair.');
            return;
        }

        const normalized = isValidGameGenieCode(trimmed) ? normalizeCode(trimmed) : trimmed.toUpperCase();
        if (cheats.some((c) => c.code === normalized)) {
            setError('That code is already in the list.');
            return;
        }

        setCheats([
            ...cheats,
            {
                id: crypto.randomUUID(),
                label: name.trim() || normalized,
                code: normalized,
                address: decoded.address,
                value: decoded.value,
                compare: decoded.compare,
                enabled: true,
            },
        ]);
        setCode('');
        setName('');
        setError('');
    };

    return (
        <>
            <Section
                title="Add a code"
                hint="Game Genie codes are 6 or 8 letters. Eight-letter codes carry a compare byte, which makes them safe on bank-switched games."
            >
                <input
                    className="input"
                    placeholder="Description (optional)"
                    aria-label="Cheat description"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <div className="input-row">
                    <input
                        className="input"
                        data-mono="true"
                        placeholder="SXIOPO or 91D9:AD"
                        aria-label="Game Genie code or address pair"
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? 'cheat-error' : undefined}
                        value={code}
                        maxLength={12}
                        onChange={(e) => { setCode(e.target.value); setError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                    />
                    <Button variant="primary" onClick={add}>Add</Button>
                </div>
                {error && <p className="error-text" id="cheat-error" role="alert">{error}</p>}
            </Section>

            <Section title={`Active codes (${cheats.filter((c) => c.enabled).length}/${cheats.length})`}>
                {cheats.length === 0 ? (
                    <EmptyNote>No cheats yet.</EmptyNote>
                ) : (
                    cheats.map((cheat) => (
                        <div className="cheat-row" key={cheat.id}>
                            <div className="cheat-info">
                                <div className="cheat-name truncate">{cheat.label}</div>
                                <div className="cheat-code">
                                    {cheat.code} → ${hex(cheat.address, 4)} = ${hex(cheat.value, 2)}
                                    {cheat.compare !== undefined && ` if $${hex(cheat.compare, 2)}`}
                                </div>
                            </div>
                            <Switch
                                label={`${cheat.label} enabled`}
                                checked={cheat.enabled}
                                onChange={(enabled) =>
                                    setCheats(cheats.map((c) => (c.id === cheat.id ? { ...c, enabled } : c)))
                                }
                            />
                            <IconButton
                                label={`Delete ${cheat.label}`}
                                onClick={() => setCheats(cheats.filter((c) => c.id !== cheat.id))}
                            >
                                <TrashIcon size={15} />
                            </IconButton>
                        </div>
                    ))
                )}
                {cheats.length > 0 && (
                    <Button variant="danger" onClick={() => setCheats([])}>Remove all</Button>
                )}
            </Section>
        </>
    );
}

/* --------------------------------------------------------------- Search --- */

/**
 * Memory scanner.
 *
 * The classic "I don't know the address but I know the value changed" workflow:
 * snapshot work RAM, play a bit, then filter candidates by how each byte moved.
 * A few rounds narrows 2,048 addresses down to one, which you can then freeze —
 * so a player can build their own cheat without hunting for a published code.
 */
function CheatSearch({ cheats, setCheats }: { cheats: Cheat[]; setCheats: (n: Cheat[]) => void }) {
    const engine = useEngine();
    const [candidates, setCandidates] = useState<number[] | null>(null);
    const [target, setTarget] = useState('');
    const snapshot = useRef<Uint8Array | null>(null);

    const read = () => engine.core?.readWorkRam() ?? null;

    const startScan = () => {
        const ram = read();
        if (!ram) return;
        snapshot.current = ram;
        // Every byte of work RAM is a candidate until proven otherwise.
        setCandidates(Array.from({ length: ram.length }, (_, i) => i));
    };

    const refine = (op: ScanOp) => {
        const ram = read();
        const previous = snapshot.current;
        if (!ram || !previous || !candidates) return;

        const wanted = target.trim() === '' ? null : Number.parseInt(target, 10);
        const next = candidates.filter((addr) => {
            const now = ram[addr];
            const before = previous[addr];
            switch (op) {
                case 'eq': return wanted !== null && now === wanted;
                case 'lt': return now < before;
                case 'gt': return now > before;
                case 'neq': return now !== before;
                case 'same': return now === before;
            }
        });

        snapshot.current = ram;
        setCandidates(next);
    };

    const freeze = (addr: number) => {
        const value = engine.core?.peek(addr) ?? 0;
        const code = `${hex(addr, 4)}:${hex(value, 2)}`;
        if (cheats.some((c) => c.code === code)) return;
        setCheats([
            ...cheats,
            {
                id: crypto.randomUUID(),
                label: `Freeze $${hex(addr, 4)}`,
                code,
                address: addr,
                value,
                enabled: true,
            },
        ]);
    };

    // Keep the displayed values live while the game runs.
    const [, tick] = useState(0);
    useEffect(() => {
        if (!candidates || candidates.length > 64) return;
        const timer = window.setInterval(() => tick((n) => n + 1), 250);
        return () => window.clearInterval(timer);
    }, [candidates]);

    return (
        <>
            <Section
                title="How it works"
                hint="Start a scan, play until the value you care about changes, then tell the scanner how it changed. Repeat until only a few addresses remain."
            >
                <Button variant="primary" onClick={startScan}>
                    <SearchIcon size={15} />
                    {candidates ? 'Restart scan' : 'Start a new scan'}
                </Button>
            </Section>

            {candidates && (
                <>
                    <Section title={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}>
                        <div className="input-row">
                            <input
                                className="input"
                                type="number"
                                min={0}
                                max={255}
                                placeholder="Exact value"
                                aria-label="Exact value to search for"
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                            />
                            <Button onClick={() => refine('eq')} disabled={target.trim() === ''}>Equals</Button>
                        </div>
                        <div className="input-row">
                            <Button style={{ flex: 1 }} onClick={() => refine('lt')}>Decreased</Button>
                            <Button style={{ flex: 1 }} onClick={() => refine('gt')}>Increased</Button>
                        </div>
                        <div className="input-row">
                            <Button style={{ flex: 1 }} onClick={() => refine('neq')}>Changed</Button>
                            <Button style={{ flex: 1 }} onClick={() => refine('same')}>Unchanged</Button>
                        </div>
                    </Section>

                    <Section title="Results">
                        {candidates.length === 0 ? (
                            <EmptyNote>Nothing matched. Start a new scan and try a different sequence.</EmptyNote>
                        ) : candidates.length > 64 ? (
                            <p className="section-hint">
                                Too many to list. Play a little, then refine with one of the filters above.
                            </p>
                        ) : (
                            candidates.map((addr) => (
                                <div className="cheat-row" key={addr}>
                                    <div className="cheat-info">
                                        <div className="cheat-code">
                                            ${hex(addr, 4)} = {engine.core?.peek(addr) ?? 0}
                                        </div>
                                    </div>
                                    <Button size="sm" onClick={() => freeze(addr)}>Freeze</Button>
                                </div>
                            ))
                        )}
                    </Section>
                </>
            )}
        </>
    );
}
