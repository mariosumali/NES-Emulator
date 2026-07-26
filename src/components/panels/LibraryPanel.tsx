import { useEffect, useMemo, useRef, useState } from 'react';
import { romsDb, sramDb, statesDb, type RomRecord } from '../../storage/db';
import { formatBytes } from '../../utils/ines';
import { Button, EmptyNote, IconButton, Panel, Section } from '../ui';
import { SearchIcon, StarIcon, TrashIcon, UploadIcon, DownloadIcon } from '../icons';
import { downloadBytes } from '../../emulator/RecordingController';

type SortKey = 'recent' | 'name' | 'added';

/**
 * Deterministic cover art.
 *
 * There is no box-art database to ship, but a grid of identical grey tiles is
 * unscannable. Deriving a hue pair from the ROM's content hash gives every game
 * a stable, distinct label colour — the same game looks the same every time,
 * which is what makes the grid navigable at a glance.
 */
function artStyle(id: string): React.CSSProperties {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    const hue2 = (hue + 40 + (h >> 8) % 60) % 360;
    return {
        background: `linear-gradient(150deg, hsl(${hue} 62% 42%), hsl(${hue2} 58% 26%))`,
    };
}

function relativeTime(ms: number): string {
    if (!ms) return 'never';
    const diff = Date.now() - ms;
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ms).toLocaleDateString();
}

function formatPlaytime(ms: number): string {
    if (!ms || ms < 60000) return '—';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

interface LibraryPanelProps {
    onClose: () => void;
    onPlay: (romId: string) => void;
    onFiles: (files: FileList | File[]) => void;
    currentRomId: string | null;
    refreshToken: number;
}

export function LibraryPanel({ onClose, onPlay, onFiles, currentRomId, refreshToken }: LibraryPanelProps) {
    const [roms, setRoms] = useState<RomRecord[]>([]);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<SortKey>('recent');
    const [loading, setLoading] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);

    const reload = async () => {
        try {
            setRoms(await romsDb.all());
        } catch {
            setRoms([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void reload(); }, [refreshToken]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q
            ? roms.filter((r) => r.name.toLowerCase().includes(q) || r.info.mapperName.toLowerCase().includes(q))
            : roms;
        const sorted = [...filtered];
        sorted.sort((a, b) => {
            // Favourites always float, then the chosen order.
            if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'added') return b.addedAt - a.addedAt;
            return b.lastPlayedAt - a.lastPlayedAt;
        });
        return sorted;
    }, [roms, query, sort]);

    const remove = async (rom: RomRecord) => {
        if (!window.confirm(`Remove "${rom.name}" from your library? Its save states and cartridge save will be deleted too.`)) {
            return;
        }
        await statesDb.deleteAllForRom(rom.id);
        await sramDb.delete(rom.id).catch(() => { /* may not exist */ });
        await romsDb.delete(rom.id);
        void reload();
    };

    return (
        <Panel
            title="Library"
            onClose={onClose}
            wide
            footer={
                <>
                    <span className="section-hint">
                        {roms.length} {roms.length === 1 ? 'game' : 'games'}
                    </span>
                    <Button variant="primary" onClick={() => inputRef.current?.click()}>
                        <UploadIcon size={16} />
                        Add games
                    </Button>
                </>
            }
        >
            <div className="panel-body">
                <div className="library-toolbar">
                    <div className="input-row" style={{ flex: 1 }}>
                        <span
                            className="row"
                            style={{ position: 'relative', flex: 1 }}
                        >
                            <span
                                aria-hidden="true"
                                style={{ position: 'absolute', insetInlineStart: 10, color: 'var(--text-3)', display: 'flex' }}
                            >
                                <SearchIcon size={15} />
                            </span>
                            <input
                                type="search"
                                className="input"
                                style={{ paddingInlineStart: 32 }}
                                placeholder="Search games"
                                aria-label="Search your library"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </span>
                    </div>
                    <select
                        className="input"
                        style={{ width: 'auto' }}
                        aria-label="Sort library"
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                    >
                        <option value="recent">Recently played</option>
                        <option value="added">Recently added</option>
                        <option value="name">Name</option>
                    </select>
                </div>

                {loading ? (
                    <EmptyNote>Loading your library…</EmptyNote>
                ) : visible.length === 0 ? (
                    <EmptyNote>
                        {roms.length === 0
                            ? 'Nothing here yet. Add a .nes or .zip file and it will be saved for next time.'
                            : 'No games match that search.'}
                    </EmptyNote>
                ) : (
                    <div className="library-grid">
                        {visible.map((rom) => (
                            <div key={rom.id} style={{ position: 'relative' }}>
                                <button
                                    type="button"
                                    className="game-card"
                                    data-current={rom.id === currentRomId ? 'true' : undefined}
                                    style={{ width: '100%' }}
                                    onClick={() => onPlay(rom.id)}
                                >
                                    <span className="game-art" style={artStyle(rom.id)}>
                                        <span className="game-art-initial" aria-hidden="true">
                                            {rom.name.charAt(0).toUpperCase()}
                                        </span>
                                    </span>
                                    <span className="game-name">{rom.name}</span>
                                    <span className="game-meta">
                                        <span>{rom.info.mapperName}</span>
                                        <span>·</span>
                                        <span>{formatBytes(rom.info.prgSize + rom.info.chrSize)}</span>
                                    </span>
                                    <span className="game-meta">
                                        <span>{relativeTime(rom.lastPlayedAt)}</span>
                                        {rom.playTimeMs > 60000 && <><span>·</span><span>{formatPlaytime(rom.playTimeMs)}</span></>}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    className="game-fav"
                                    data-on={rom.favorite ? 'true' : undefined}
                                    aria-label={rom.favorite ? `Unfavourite ${rom.name}` : `Favourite ${rom.name}`}
                                    aria-pressed={rom.favorite}
                                    onClick={async () => {
                                        await romsDb.setFavorite(rom.id, !rom.favorite);
                                        void reload();
                                    }}
                                >
                                    <StarIcon size={14} filled={rom.favorite} />
                                </button>

                                <div className="row" style={{ gap: 4, marginBlockStart: 4, justifyContent: 'center' }}>
                                    <IconButton
                                        label={`Export the cartridge save for ${rom.name}`}
                                        onClick={async () => {
                                            const record = await sramDb.get(rom.id);
                                            if (!record) {
                                                window.alert('This game has no cartridge save yet.');
                                                return;
                                            }
                                            downloadBytes(record.data, `${rom.name}.sav`);
                                        }}
                                    >
                                        <DownloadIcon size={14} />
                                    </IconButton>
                                    <IconButton label={`Remove ${rom.name}`} onClick={() => void remove(rom)}>
                                        <TrashIcon size={14} />
                                    </IconButton>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <Section title="About your library" >
                    <p className="section-hint">
                        Games are stored in this browser only — they are never uploaded. Removing a game also
                        deletes its save states and cartridge save.
                    </p>
                </Section>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".nes,.zip,application/zip"
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                        if (e.target.files?.length) onFiles(e.target.files);
                        e.target.value = '';
                    }}
                />
            </div>
        </Panel>
    );
}
