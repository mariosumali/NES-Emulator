import { useCallback, useEffect, useState } from 'react';
import { statesDb, type StateRecord } from '../../storage/db';
import { useEngine, useEngineState } from '../../hooks/useEngine';
import { Button, EmptyNote, Panel, Section } from '../ui';
import { CameraIcon, LoadIcon, SaveIcon, TrashIcon } from '../icons';

const MANUAL_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
/** Slot 0 is written by the periodic auto-save and never by the user. */
const AUTO_SLOT = 0;

function relativeTime(ms: number): string {
    const diff = Date.now() - ms;
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SaveStatesPanel({ onClose }: { onClose: () => void }) {
    const engine = useEngine();
    const state = useEngineState();
    const [records, setRecords] = useState<Map<number, StateRecord>>(new Map());

    const romId = state.romId;

    const reload = useCallback(async () => {
        const all = romId ? await statesDb.forRom(romId).catch(() => []) : [];
        setRecords(new Map(all.map((r) => [r.slot, r])));
    }, [romId]);

    useEffect(() => {
        let stale = false;
        void (async () => {
            const all = romId ? await statesDb.forRom(romId).catch(() => []) : [];
            if (!stale) setRecords(new Map(all.map((r) => [r.slot, r])));
        })();
        return () => { stale = true; };
    }, [romId, state.occupiedSlots]);

    if (!state.romId) {
        return (
            <Panel title="Save states" onClose={onClose}>
                <div className="panel-body">
                    <EmptyNote>Load a game to manage its save states.</EmptyNote>
                </div>
            </Panel>
        );
    }

    const renderSlot = (slot: number, label: string) => {
        const record = records.get(slot);
        return (
            <div className="state-card" key={slot}>
                <div className="state-thumb">
                    {record?.thumbnail ? (
                        <img src={record.thumbnail} alt={`Screenshot of ${label}`} />
                    ) : (
                        <CameraIcon size={20} />
                    )}
                </div>
                <div className="state-label">
                    <span>{label}</span>
                    <span className="state-time">{record ? relativeTime(record.createdAt) : 'Empty'}</span>
                </div>
                <div className="state-actions">
                    {slot !== AUTO_SLOT && (
                        <Button
                            size="sm"
                            style={{ flex: 1 }}
                            onClick={async () => { await engine.saveState(slot); void reload(); }}
                            aria-label={`Save to ${label}`}
                        >
                            <SaveIcon size={13} />
                            Save
                        </Button>
                    )}
                    <Button
                        size="sm"
                        style={{ flex: 1 }}
                        disabled={!record}
                        onClick={() => void engine.loadState(slot)}
                        aria-label={`Load ${label}`}
                    >
                        <LoadIcon size={13} />
                        Load
                    </Button>
                    {record && (
                        <Button
                            size="sm"
                            variant="danger"
                            onClick={async () => { await engine.deleteState(slot); void reload(); }}
                            aria-label={`Delete ${label}`}
                        >
                            <TrashIcon size={13} />
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Panel title="Save states" onClose={onClose} wide>
            <div className="panel-body">
                <Section
                    title={state.romName ?? 'Current game'}
                    hint="Save states capture the exact machine state. They are stored per game, so they follow the cartridge, not the slot number."
                >
                    <div className="state-grid">
                        {MANUAL_SLOTS.map((slot) => renderSlot(slot, `Slot ${slot}`))}
                    </div>
                </Section>

                <Section title="Automatic" hint="Written periodically while you play, so a crash or an accidental reload costs you very little.">
                    <div className="state-grid">{renderSlot(AUTO_SLOT, 'Auto-save')}</div>
                </Section>

                {state.hasBattery && (
                    <Section
                        title="Cartridge save"
                        hint="This game has battery-backed save RAM. Your in-game saves are written automatically and restored the next time you play — no save state needed."
                    >
                        <p className="section-hint">Export it from the Library panel to use with another emulator.</p>
                    </Section>
                )}
            </div>
        </Panel>
    );
}
