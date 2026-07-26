/**
 * IndexedDB persistence layer.
 *
 * Everything that can be large lives here rather than in localStorage: ROM
 * files, save states (jsnes state objects are megabytes once serialised), state
 * thumbnails, and battery-backed cartridge SRAM. localStorage is capped around
 * 5MB and stores strings only — a single save state would blow it.
 */

import type { RomInfo } from '../utils/ines';

const DB_NAME = 'nes-station';
const DB_VERSION = 1;

export const STORE_ROMS = 'roms';
export const STORE_STATES = 'states';
export const STORE_SRAM = 'sram';

export interface RomRecord {
    /** Content hash — stable across renames, so saves follow the game. */
    id: string;
    name: string;
    filename: string;
    data: Uint8Array;
    info: RomInfo;
    addedAt: number;
    lastPlayedAt: number;
    playTimeMs: number;
    favorite: boolean;
}

export interface StateRecord {
    /** `${romId}:${slot}` — slot 0 is reserved for the auto-save. */
    key: string;
    romId: string;
    slot: number;
    state: unknown;
    /** PNG data URL of the frame at capture time. */
    thumbnail: string | null;
    createdAt: number;
}

export interface SramRecord {
    romId: string;
    data: Uint8Array;
    updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_ROMS)) {
                const roms = db.createObjectStore(STORE_ROMS, { keyPath: 'id' });
                roms.createIndex('lastPlayedAt', 'lastPlayedAt');
                roms.createIndex('name', 'name');
            }
            if (!db.objectStoreNames.contains(STORE_STATES)) {
                const states = db.createObjectStore(STORE_STATES, { keyPath: 'key' });
                states.createIndex('romId', 'romId');
            }
            if (!db.objectStoreNames.contains(STORE_SRAM)) {
                db.createObjectStore(STORE_SRAM, { keyPath: 'romId' });
            }
        };
        req.onsuccess = () => {
            req.result.onversionchange = () => req.result.close();
            resolve(req.result);
        };
        req.onerror = () => reject(req.error ?? new Error('Could not open the local database.'));
        req.onblocked = () => reject(new Error('The database is blocked by another open tab.'));
    });
    return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDb().then(
        (db) =>
            new Promise<T>((resolve, reject) => {
                const transaction = db.transaction(store, mode);
                const request = fn(transaction.objectStore(store));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                transaction.onabort = () => reject(transaction.error);
            })
    );
}

/** True when IndexedDB is usable at all (private-mode Firefox historically was not). */
export async function isStorageAvailable(): Promise<boolean> {
    try {
        await openDb();
        return true;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ ROMs -- */

export const romsDb = {
    put: (rom: RomRecord) => tx(STORE_ROMS, 'readwrite', (s) => s.put(rom) as IDBRequest<IDBValidKey>),
    get: (id: string) => tx<RomRecord | undefined>(STORE_ROMS, 'readonly', (s) => s.get(id)),
    all: () => tx<RomRecord[]>(STORE_ROMS, 'readonly', (s) => s.getAll()),
    delete: (id: string) => tx(STORE_ROMS, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>),
    async touch(id: string, playTimeDeltaMs = 0) {
        const rom = await romsDb.get(id);
        if (!rom) return;
        rom.lastPlayedAt = Date.now();
        rom.playTimeMs = (rom.playTimeMs || 0) + playTimeDeltaMs;
        await romsDb.put(rom);
    },
    async setFavorite(id: string, favorite: boolean) {
        const rom = await romsDb.get(id);
        if (!rom) return;
        rom.favorite = favorite;
        await romsDb.put(rom);
    },
};

/* ---------------------------------------------------------- Save states -- */

export const statesDb = {
    key: (romId: string, slot: number) => `${romId}:${slot}`,
    put: (rec: StateRecord) => tx(STORE_STATES, 'readwrite', (s) => s.put(rec) as IDBRequest<IDBValidKey>),
    get: (romId: string, slot: number) =>
        tx<StateRecord | undefined>(STORE_STATES, 'readonly', (s) => s.get(`${romId}:${slot}`)),
    delete: (romId: string, slot: number) =>
        tx(STORE_STATES, 'readwrite', (s) => s.delete(`${romId}:${slot}`) as IDBRequest<undefined>),
    forRom: (romId: string) =>
        tx<StateRecord[]>(STORE_STATES, 'readonly', (s) => s.index('romId').getAll(romId)),
    async deleteAllForRom(romId: string) {
        const all = await statesDb.forRom(romId);
        await Promise.all(all.map((r) => tx(STORE_STATES, 'readwrite', (s) => s.delete(r.key) as IDBRequest<undefined>)));
    },
};

/* ----------------------------------------------------------- Battery RAM -- */

export const sramDb = {
    put: (romId: string, data: Uint8Array) =>
        tx(STORE_SRAM, 'readwrite', (s) => s.put({ romId, data, updatedAt: Date.now() }) as IDBRequest<IDBValidKey>),
    get: (romId: string) => tx<SramRecord | undefined>(STORE_SRAM, 'readonly', (s) => s.get(romId)),
    delete: (romId: string) => tx(STORE_SRAM, 'readwrite', (s) => s.delete(romId) as IDBRequest<undefined>),
};

/* ---------------------------------------------------------------- Quota -- */

export interface StorageEstimate {
    usage: number;
    quota: number;
}

export async function estimateStorage(): Promise<StorageEstimate | null> {
    if (!navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
}

/**
 * Ask the browser to make our storage persistent so the ROM library and saves
 * survive automatic eviction under storage pressure.
 */
export async function requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    try {
        return await navigator.storage.persist();
    } catch {
        return false;
    }
}

/** Fast, non-cryptographic content hash (FNV-1a, 64-bit via two lanes). */
export function hashBytes(bytes: Uint8Array): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < bytes.length; i++) {
        h1 ^= bytes[i];
        h1 = Math.imul(h1, 0x01000193);
        h2 = Math.imul(h2 ^ bytes[i], 0x85ebca6b);
    }
    const a = (h1 >>> 0).toString(16).padStart(8, '0');
    const b = (h2 >>> 0).toString(16).padStart(8, '0');
    return `${a}${b}`;
}
